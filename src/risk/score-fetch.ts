/**
 * Risk Score — async fetch 래퍼 (DISPLAY-ONLY).
 *
 * 순수 compute (`score.ts`) 에 넣을 raw 입력을 외부 소스에서 수집한다.
 * onchain/score-fetch.ts 의 stub-first 정신을 그대로 미러:
 *   - 모든 소스 호출은 try/catch (또는 Promise.allSettled) 로 격리.
 *   - 실패/미가용 소스 → 해당 입력 undefined → 그 차원만 graceful skip.
 *   - 절대 throw 로 라우터 체인을 깨지 않는다.
 *   - 실패 로그는 `[risk]` prefix 로 console.warn.
 *
 * ⚠ 헌장 규칙 3 보존 — 결과는 UI 표시 전용. BBDX 시그널/strength/포지션
 * 어디에도 사용되지 않는다.
 *
 * 데이터 소스:
 *   - 일봉 캔들 (Bybit): ATR% / 30일 낙폭 / falling-knife (ADX)
 *   - coin-meta (CoinGecko): 시총 / 24h USD 거래량
 *   - bybit-derivatives: funding rate / OI 24h 변화
 *   - bybit-long-short: long/short ratio
 *   - fear-greed (alternative.me): F&G 0-100
 *   - macro/layer-builder (FRED): 유동성 regime 라벨 (key 없으면 미가용)
 *
 * market-wide 입력(F&G + macro regime)은 짧게 캐시 → per-coin 호출이 싸도록.
 */

import { fetchKlines } from "../bybit";
import { calculateATR, calculateADX, isFallingKnife } from "../indicators";
import { getCoinMeta } from "../coin-meta";
import { fetchBybitDerivatives } from "../sentiment/bybit-derivatives";
import { fetchLongShortRatio } from "../sentiment/bybit-long-short";
import { fetchFearGreed } from "../sentiment/fear-greed";
import { buildMacroLayer } from "../macro/layer-builder";
import { computeRiskScore, computeMarketRisk, type RiskInputs } from "./score";
import type { RiskScoreResult, MarketRiskResult } from "./types";

/** 일봉 캔들 fetch 개수 — ADX(14) 워밍업 + 30일 낙폭 윈도우 여유. */
const DAILY_CANDLE_FETCH = 90;
/** 30일 고점 윈도우 (일봉 캔들 수). */
const DRAWDOWN_WINDOW_DAYS = 30;

// ─────────────────────────────────────────────────────────
// market-wide 입력 캐시 (F&G + macro regime)
// ─────────────────────────────────────────────────────────

interface MarketInputs {
  fearGreed?: number;
  fearGreedLabel?: string;
  macroRegime?: string;
}

const MARKET_CACHE_TTL_MS = 5 * 60 * 1000; // 5분 — per-coin 스캔이 싸도록.
let marketCache: { ts: number; data: MarketInputs } | null = null;
let marketInflight: Promise<MarketInputs> | null = null;

/** F&G 분류 enum-style → 사람이 읽을 라벨(한글). */
function fearGreedLabelKo(value: number): string {
  if (value < 21) return "극단적 공포";
  if (value < 41) return "공포";
  if (value < 61) return "중립";
  if (value < 81) return "탐욕";
  return "극단적 탐욕";
}

/**
 * market-wide 입력 수집 (5분 캐시). F&G + macro 유동성 regime.
 *
 * 각 소스 독립 try/catch — 하나 실패해도 나머지는 채워진다.
 * macro 는 FRED_API_KEY 없으면 buildMacroLayer 가 [] 반환 → regime undefined.
 */
async function getMarketInputs(): Promise<MarketInputs> {
  if (marketCache && Date.now() - marketCache.ts < MARKET_CACHE_TTL_MS) {
    return marketCache.data;
  }
  if (marketInflight) return marketInflight;

  marketInflight = (async () => {
    const out: MarketInputs = {};

    // Fear & Greed (alternative.me) — 무료, 키 불필요.
    try {
      const points = await fetchFearGreed(1);
      const latest = points[0];
      if (latest && Number.isFinite(latest.value)) {
        out.fearGreed = latest.value;
        out.fearGreedLabel = fearGreedLabelKo(latest.value);
      }
    } catch (err) {
      console.warn(
        `[risk] fear & greed fetch failed: ${(err as Error)?.message ?? err}`,
      );
    }

    // Macro 유동성 regime (FRED) — key 없으면 [] → regime 미가용 (graceful).
    try {
      const now = Date.now();
      // 90일 룩백이면 충분 (단일 latest layer 만 필요).
      const layers = await buildMacroLayer(
        now - 120 * 86_400_000,
        now,
        "realtime",
      );
      const latest = layers[layers.length - 1];
      if (latest?.regime) {
        out.macroRegime = latest.regime;
      }
    } catch (err) {
      console.warn(
        `[risk] macro regime fetch failed: ${(err as Error)?.message ?? err}`,
      );
    }

    marketCache = { ts: Date.now(), data: out };
    marketInflight = null;
    return out;
  })();

  return marketInflight;
}

// ─────────────────────────────────────────────────────────
// per-coin 캔들 파생 입력 (ATR% / 낙폭 / falling-knife)
// ─────────────────────────────────────────────────────────

interface CandleDerived {
  atrPct?: number;
  drawdownFromHigh30?: number;
  fallingKnife?: boolean;
}

/**
 * 일봉 캔들에서 ATR% / 30일 낙폭 / falling-knife 산출.
 *
 * fetchKlines 실패 → 빈 객체 (세 입력 모두 undefined → 차원 skip).
 * falling-knife 정의: isFallingKnife OR (ADX>=25 && minusDI>plusDI)
 *   — isFallingKnife 가 (minusDI>plusDI && adx>25) 이므로 사실상 동치이나
 *     스펙대로 ADX>=25 경계까지 포함.
 */
async function getCandleDerived(symbol: string): Promise<CandleDerived> {
  try {
    const candles = await fetchKlines(symbol, "1d", DAILY_CANDLE_FETCH);
    if (!candles.length) return {};

    const lastClose = candles[candles.length - 1].close;
    const out: CandleDerived = {};

    // ATR% = 일봉 ATR / price × 100.
    const atr = calculateATR(candles, 14);
    if (atr > 0 && lastClose > 0) {
      out.atrPct = (atr / lastClose) * 100;
    }

    // 30일 고점 대비 낙폭(%) = (high30 - close) / high30 × 100.
    const window = candles.slice(-DRAWDOWN_WINDOW_DAYS);
    const high30 = window.reduce((m, c) => Math.max(m, c.high), 0);
    if (high30 > 0) {
      out.drawdownFromHigh30 = clampNonNeg(((high30 - lastClose) / high30) * 100);
    }

    // falling-knife — ADX 기반.
    const { adx, plusDi, minusDi } = calculateADX(candles, 14);
    out.fallingKnife =
      isFallingKnife(plusDi, minusDi, adx) || (adx >= 25 && minusDi > plusDi);

    return out;
  } catch (err) {
    console.warn(
      `[risk] daily candle derive failed for ${symbol}: ${(err as Error)?.message ?? err}`,
    );
    return {};
  }
}

function clampNonNeg(x: number): number {
  return x < 0 ? 0 : x;
}

// ─────────────────────────────────────────────────────────
// public — fetchRiskScore / fetchMarketRisk
// ─────────────────────────────────────────────────────────

/**
 * 단일 심볼의 5-차원 위험 점수를 외부 소스에서 수집해 산출.
 *
 * 모든 소스를 병렬 + 격리 수집 → computeRiskScore. 어떤 소스가 빠져도
 * 해당 차원만 skip 되고 나머지로 재정규화된다. ⚠ DISPLAY-ONLY.
 */
export async function fetchRiskScore(symbol: string): Promise<RiskScoreResult> {
  const sym = symbol.toUpperCase();

  const [candleRes, metaRes, derivRes, lsRes, marketRes] = await Promise.allSettled([
    getCandleDerived(sym),
    getCoinMeta(sym),
    fetchBybitDerivatives(sym),
    fetchLongShortRatio(sym, "1h"),
    getMarketInputs(),
  ]);

  const candle = candleRes.status === "fulfilled" ? candleRes.value : {};

  // coin-meta — status "real" 일 때만 시총/거래량 신뢰 (stub/error 는 0 → skip).
  let volumeUsd: number | undefined;
  let marketCapUsd: number | undefined;
  if (metaRes.status === "fulfilled" && metaRes.value.status === "real") {
    if (metaRes.value.volume24h > 0) volumeUsd = metaRes.value.volume24h;
    if (metaRes.value.mcap > 0) marketCapUsd = metaRes.value.mcap;
  } else if (metaRes.status === "rejected") {
    console.warn(
      `[risk] coin-meta fetch failed for ${sym}: ${metaRes.reason?.message ?? metaRes.reason}`,
    );
  }

  // derivatives — fundingRateAvg/oiChangeRate 는 % 단위(× 100). funding 은
  // compute 가 per-8h decimal 을 기대하므로 % → decimal 환원(÷ 100).
  let fundingRate: number | undefined;
  let oiChange24hPct: number | undefined;
  if (derivRes.status === "fulfilled") {
    const d = derivRes.value;
    if (Number.isFinite(d.fundingRateAvg) && d.fundingRateAvg !== 0) {
      fundingRate = d.fundingRateAvg / 100;
    }
    if (Number.isFinite(d.oiChangeRate) && d.oiChangeRate !== 0) {
      oiChange24hPct = d.oiChangeRate;
    }
  } else {
    console.warn(
      `[risk] derivatives fetch failed for ${sym}: ${derivRes.reason?.message ?? derivRes.reason}`,
    );
  }

  // long/short ratio — fallback(50/50 → ratio 1) 은 ln(1)=0 → leverage 기여 0.
  let longShortRatio: number | undefined;
  if (lsRes.status === "fulfilled") {
    const r = lsRes.value.ratio;
    if (Number.isFinite(r) && r > 0) longShortRatio = r;
  } else {
    console.warn(
      `[risk] long/short fetch failed for ${sym}: ${lsRes.reason?.message ?? lsRes.reason}`,
    );
  }

  const market = marketRes.status === "fulfilled" ? marketRes.value : {};

  const inputs: RiskInputs = {
    atrPct: candle.atrPct,
    volumeUsd,
    marketCapUsd,
    fundingRate,
    longShortRatio,
    oiChange24hPct,
    drawdownFromHigh30: candle.drawdownFromHigh30,
    fallingKnife: candle.fallingKnife,
    fearGreed: market.fearGreed,
    macroRegime: market.macroRegime,
  };

  return computeRiskScore(sym, inputs);
}

/**
 * 시장 전체(systemic) 위험 — F&G + macro 유동성 regime.
 * ⚠ DISPLAY-ONLY.
 */
export async function fetchMarketRisk(): Promise<MarketRiskResult> {
  const market = await getMarketInputs();
  return computeMarketRisk({
    fearGreed: market.fearGreed,
    fearGreedLabel: market.fearGreedLabel,
    macroRegime: market.macroRegime,
  });
}
