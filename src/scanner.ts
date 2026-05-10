import { TOP_COINS } from "@shared/types";
import type {
  CoinScanResult,
  TechnicalIndicators,
  Candle,
  TimeframeValue,
  PatternConfluenceSummary,
  PatternContextDetail,
} from "@shared/types";
import { fetchKlines, fetchAll24hTickers } from "./bybit";
import {
  calculateAllIndicators,
  calculateBollingerBandsSeries,
  calculateRSISeries,
  calculateADXSeries,
  calculateSignalStrengthV2,
  calculateShortSignalStrength,
  decideEntry,
  decideExit,
  decideShortEntry,
  decideVwapSignal,
  detectAllCandlePatterns,
  detectBBStructure,
  detectBBStructureShort,
  detectPullback,
  emaPosition,
  isFallingKnife,
  isRisingKnife,
  isInFibZone,
  pressureLabel,
  reversalProbability,
  volumeConfirmationFromRatio,
  volumeRatio,
  vwapPosition,
  vwapToMultiplier,
} from "./indicators";
import { aggregatePatternScore } from "./patterns/aggregator";
import {
  combineAdditionalModifiers,
  computeEmaRibbon,
  detectMacdDivergence,
  detectOrderBlock,
} from "./modifiers";
import { analyzeTrend } from "./trend/analyze";

/**
 * Aggregator 결과 → CoinScanResult 의 PatternConfluenceSummary.
 *
 * dev 머지 후: dev 의 modular 구조 (definitions/context/aggregator) 채택.
 * `aggregatePatternScore(detected): number` 의 simple 시그니처 사용.
 * 컨텍스트 분해 (volume/trend multiplier 등) 는 patternStrengthWithContext
 * 가 이미 strength 필드 안에 합산해서 반환하므로 PatternContextDetail 의
 * 분해 필드는 null 로 두고, frontend 가 strength 기반으로 시각화.
 *
 * 헌장 규칙 3 준수 — BBDX multiplier 로만 사용, 단독 시그널 X.
 */

/**
 * LONG modifier 의 multiplier 를 SHORT 의 부호 반전 multiplier 로 변환.
 *
 *   LONG 1.20 → SHORT 0.80
 *   LONG 0.85 → SHORT 1.15
 *   LONG 1.00 → SHORT 1.00 (중립 보존)
 *
 * 공식: 2 - x  (단, [0, 2] clamp 후 [0.30, 2.00] 운영 범위 가정)
 *
 * P1-#1 (2026-05-10): EMA Ribbon / MACD / OrderBlock 의 LONG multiplier 가
 * SHORT 에서도 그대로 곱해지면 추세-반대 약세 시그널이 SHORT 를 잘못 약화.
 * 부호 반전으로 헌장 규칙 3 (modifier-only) 유지하면서 SHORT 알파 측정 가능.
 */
function invertMultiplier(longMult: number): number {
  if (!Number.isFinite(longMult)) return 1.0;
  const inverted = 2 - longMult;
  return Math.max(0.30, Math.min(2.0, inverted));
}

function buildPatternConfluence(
  candlePatterns: ReturnType<typeof detectAllCandlePatterns>,
  _candles: Candle[],
  interval: TimeframeValue,
): PatternConfluenceSummary {
  const bullishMatches = candlePatterns.filter((p) => p.bias === "bullish");
  const bearishMatches = candlePatterns.filter((p) => p.bias === "bearish");

  const bullishScore = aggregatePatternScore(bullishMatches);
  const bearishScore = aggregatePatternScore(bearishMatches);

  const bullishBonus = Math.min(0.20, Math.max(0, bullishMatches.length - 1) * 0.10);
  const bearishBonus = Math.min(0.20, Math.max(0, bearishMatches.length - 1) * 0.10);

  // primary = strength × ageDiscount 가 가장 큰 매치
  const pickPrimary = (matches: typeof candlePatterns) => {
    if (matches.length === 0) return null;
    return matches.reduce((best, m) => {
      const score = (m.strength / 100) * Math.exp(-m.candlesAgo / 3);
      const bestScore = (best.strength / 100) * Math.exp(-best.candlesAgo / 3);
      return score > bestScore ? m : best;
    }, matches[0]);
  };
  const bullishPrimary = pickPrimary(bullishMatches);
  const bearishPrimary = pickPrimary(bearishMatches);

  // contextDetail: dev 의 patternStrengthWithContext 가 이미 base × multipliers
  // 를 합산해서 strength 에 반영함. 분해 필드는 후속 머지로 노출 (현재는 null).
  const toContextDetail = (
    primary: typeof bullishPrimary,
  ): PatternContextDetail | null =>
    primary == null
      ? null
      : {
          base: primary.strength / 100,
          volumeMultiplier: 1,
          volumeLabel: "normal",
          volumeRatio: 1,
          trendMultiplier: 1,
          trendLabel: "sideways",
          trendCumulativeReturn: 0,
          ageDiscount: Math.exp(-primary.candlesAgo / 3),
          contextualStrength: primary.strength / 100,
        };

  return {
    bullishScore,
    bearishScore,
    bullishCount: bullishMatches.length,
    bearishCount: bearishMatches.length,
    bullishBonus,
    bearishBonus,
    bullishPrimaryName: bullishPrimary?.name ?? null,
    bearishPrimaryName: bearishPrimary?.name ?? null,
    bullishContext: toContextDetail(bullishPrimary),
    bearishContext: toContextDetail(bearishPrimary),
    tf: interval,
  };
}

/** 캐시 구조 */
interface CacheEntry {
  data: CoinScanResult;
  timestamp: number;
}

interface KlinesCacheEntry {
  candles: Candle[];
  indicators: TechnicalIndicators;
  timestamp: number;
}

// 인메모리 캐시 - 키에 interval 포함
const scanCache = new Map<string, CacheEntry>();
const klinesCache = new Map<string, KlinesCacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10분

// 티커 캐시 (전체 심볼 가격 - 1분 TTL)
let tickerCache: { data: Map<string, { price: number; change24h: number; volume24h: number }>; timestamp: number } | null = null;
const TICKER_CACHE_TTL = 60 * 1000; // 1분

// 스캔 진행 상태 추적
interface ScanProgress {
  total: number;
  completed: number;
  isRunning: boolean;
  interval: TimeframeValue;
}

const scanProgressMap = new Map<TimeframeValue, ScanProgress>();

function cacheKey(symbol: string, interval: TimeframeValue): string {
  return `${symbol}:${interval}`;
}

/**
 * 캐시된 티커 데이터 가져오기 (1분 캐시)
 */
async function getCachedTickers() {
  if (tickerCache && Date.now() - tickerCache.timestamp < TICKER_CACHE_TTL) {
    return tickerCache.data;
  }
  const tickers = await fetchAll24hTickers();
  tickerCache = { data: tickers, timestamp: Date.now() };
  return tickers;
}

/**
 * 단일 코인 스캔 (ticker 데이터를 외부에서 주입 가능)
 */
export async function scanCoin(
  symbol: string,
  interval: TimeframeValue = "4h",
  tickerData?: { price: number; change24h: number; volume24h: number }
): Promise<CoinScanResult | null> {
  const key = cacheKey(symbol, interval);
  const cached = scanCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (tickerData) {
      // Refresh price-derived fields without recomputing patterns / strength.
      cached.data.price = tickerData.price;
      cached.data.change24h = tickerData.change24h;
      cached.data.volume24h = tickerData.volume24h;
      cached.data.isStopLossHit =
        tickerData.price <= cached.data.stopLossPrice;
      // VWAP/EMA positions are price-relative — recompute cheaply.
      cached.data.vwapPosition = vwapPosition(tickerData.price, cached.data.vwap);
      cached.data.emaPosition = emaPosition(tickerData.price, cached.data.ema9);
    }
    return cached.data;
  }

  try {
    const candles = await fetchKlines(symbol, interval, 100);
    if (!candles.length) return null;

    const indicators = calculateAllIndicators(candles);
    const price = tickerData?.price ?? candles[candles.length - 1].close;
    const change24h = tickerData?.change24h ?? 0;
    const volume24h = tickerData?.volume24h ?? 0;

    // 피보나치 및 빗각 시그널 추가 판단
    let fibSignal: CoinScanResult["fibSignal"];
    if (indicators.fibLevels) {
      for (const f of indicators.fibLevels) {
        if (f.isGoldenZone && isInFibZone(price, f.price)) {
          fibSignal = { level: f.level, price: f.price, type: f.level >= 0.5 ? "buy" : "sell" };
          break;
        }
      }
    }

    // BBDX-PATTERN v6.1 ──
    const closes = candles.map((c) => c.close);
    const bbSeries = calculateBollingerBandsSeries(closes);
    const candlePatterns = detectAllCandlePatterns(candles);
    const bbStructure = detectBBStructure(candles, bbSeries);
    const ratio = volumeRatio(candles);
    const volConfirmation = volumeConfirmationFromRatio(ratio);
    const reversalProb = reversalProbability(indicators.adx);
    const pressure = pressureLabel(indicators.plusDi, indicators.minusDi);
    const pressureStrong =
      Math.abs(indicators.plusDi - indicators.minusDi) > 5;
    const fallingKnife = isFallingKnife(
      indicators.plusDi,
      indicators.minusDi,
      indicators.adx
    );
    const entryDecision = fallingKnife
      ? null
      : decideEntry(candles, indicators, candlePatterns, bbStructure, ratio);
    const bearishPatterns = candlePatterns.filter(
      (p) => p.bias === "bearish"
    );
    const exitDecision = decideExit(price, indicators, bearishPatterns);
    const stopLossPrice = indicators.bbLower * 0.97;
    const isStopLossHit = price <= stopLossPrice;

    // ── SHORT path (LONG 미러, 헌장 규칙 3 준수) ──
    // SHORT 도 isRisingKnife 차단 (강한 상승 추세 중 평균회귀 SHORT 위험).
    // lowerRiding (추세 추종 SHORT) 만 isRisingKnife 예외.
    const bbStructureShort = detectBBStructureShort(candles, bbSeries);
    const risingKnife = isRisingKnife(
      indicators.plusDi,
      indicators.minusDi,
      indicators.adx
    );
    // RisingKnife 차단: lowerRiding 외 SHORT path 막음. lowerRiding 은 추세 추종이라 허용.
    const shortAllowed = !risingKnife || bbStructureShort === "lowerRiding";
    const shortDecision = shortAllowed
      ? decideShortEntry(candles, indicators, candlePatterns, bbStructureShort, ratio)
      : null;
    const shortStopLossPrice = indicators.bbUpper * 1.03;
    const shortSignalStrength = shortDecision
      ? calculateShortSignalStrength(price, indicators, volConfirmation)
      : 0;

    // Audit-권고 적용 패턴 합산 (multi-pattern + 거래량 + 추세 + TF 차등).
    const patternConfluence = buildPatternConfluence(
      candlePatterns,
      candles,
      interval,
    );

    // VWAP Strategy ──
    const vwap = indicators.vwap ?? 0;
    const ema9 = indicators.ema9 ?? 0;
    const vwapPos = vwapPosition(price, vwap);
    const emaPos = emaPosition(price, ema9);
    const pullbackDetected = detectPullback(candles, vwap, ema9);
    const vwapSignal = decideVwapSignal(price, vwap, ema9, pullbackDetected, ratio);

    // 헌장 규칙 3 — VwapSignal 을 BBDX EntryDecision 의 multiplier 로 통합.
    // entryDecision 이 null 이면 multiplier 도 의미 없음 → skip.
    if (entryDecision) {
      entryDecision.vwapMult = vwapToMultiplier(vwapSignal);
    }

    // 03_ADDITIONAL_STRATEGIES.md — 추가 modifier 통합 (헌장 규칙 3, multiplier-only).
    // 외부 호출 없이 candles 만으로 산출 가능한 modifier 만 인라인:
    //   emaRibbon (3rd dim, trend), macdDivergence (1st dim, momentum, rule1Exempt),
    //   orderBlock (5th dim, structure, rule1Exempt).
    //
    // 비용 큰 modifier (marketBreadth = 30 코인 일괄 fetch, fundingExtreme = perp API 호출)
    // 는 scanner hot path 에서 제외 → routers `modifiers.all` / `modifiers.fundingExtreme`
    // endpoint 로 별도 호출.
    //
    // ✅ DONE (P1-#1, 2026-05-10): combineAdditionalModifiers() 결과 +
    // wave/vwap multiplier 가 result 객체 생성 시점에 signalStrength 곱셈
    // 체인에 통합됨 (line ~317 finalLongStrength). signals/confidence.ts 의
    // computeFinalConfidence 도 `additional` 인자를 받도록 확장됨.
    if (entryDecision || shortDecision) {
      try {
        const ribbon = computeEmaRibbon(candles);
        const macd = detectMacdDivergence(candles);
        const ob = detectOrderBlock(candles);
        // LONG modifier 부착 — bullish 정렬 / divergence 가 LONG 강화.
        if (entryDecision) {
          entryDecision.emaRibbonMult = ribbon.multiplier;
          entryDecision.macdDivergenceMult = macd.multiplier;
          entryDecision.orderBlockMult = ob.multiplier;
        }
        // SHORT modifier 부착 — multiplier 부호 반전 (LONG 의 1.10 = SHORT 의 0.90).
        // P1-#1 (2026-05-10): SHORT path 도 additional modifier 적용 받도록.
        if (shortDecision) {
          shortDecision.emaRibbonMult = invertMultiplier(ribbon.multiplier);
          shortDecision.macdDivergenceMult = invertMultiplier(macd.multiplier);
          shortDecision.orderBlockMult = invertMultiplier(ob.multiplier);
        }
      } catch (err: any) {
        // graceful — 추가 modifier 실패가 BBDX 시그널을 깨지 않도록.
        console.warn(
          `[Scanner] Additional modifiers failed for ${symbol}: ${String(err?.message ?? err)}`
        );
      }
    }

    // ── Trend Analysis Wave Alignment 통합 (헌장 규칙 3, modifier-only). ──
    // analyzeTrend 는 5-min 캐시 → scanner hot path 에서 매번 호출해도 안전.
    // 외부 fetchKlines 실패는 SIDEWAYS fallback 으로 흡수 → throw 안 함.
    // 단, scanner 가 너무 무거워질 위험 → 1h/4h/1d 3 TF 만 사용 (15m 제외).
    if (entryDecision) {
      try {
        const trend = await analyzeTrend(symbol, ["1h", "4h", "1d"]);
        entryDecision.waveMult = trend.waveMult;
      } catch (err: any) {
        // graceful — 실패 시 multiplier 미설정 (= 1.0 동치).
        console.warn(
          `[Scanner] Trend analysis failed for ${symbol}: ${String(err?.message ?? err)}`
        );
      }
    }

    // ── v6.5 multiplier 통합 (P1-#1 fix, 2026-05-10) ──
    // base BBDX strength × Additional Strategies 6 modifier × wave × vwap.
    // entryDecision 이 있을 때만 modifier 적용 (없으면 base 그대로).
    // 헌장 규칙 3 준수: modifier 단독 시그널 X — entry path 가 trigger 한 후의
    // *가중치* 로만 작동. 결과는 [0, 100] clamp.
    const baseLongStrength = calculateSignalStrengthV2(price, indicators, volConfirmation);
    let finalLongStrength = baseLongStrength;
    if (entryDecision) {
      const addMult = combineAdditionalModifiers({
        emaRibbonMult: entryDecision.emaRibbonMult,
        macdDivergenceMult: entryDecision.macdDivergenceMult,
        orderBlockMult: entryDecision.orderBlockMult,
        // marketBreadth / fundingExtreme / cvdDivergence 는 scanner hot path
        // 외부에서 별도 endpoint 로 산출 → 여기서는 1.0 (skip).
      });
      const waveMult = entryDecision.waveMult ?? 1.0;
      const vwapMult = entryDecision.vwapMult ?? 1.0;
      finalLongStrength = Math.min(
        100,
        Math.max(0, baseLongStrength * addMult * waveMult * vwapMult)
      );
    }

    // SHORT 도 동일 multiplier chain 적용 (LONG 미러).
    let finalShortStrength = shortSignalStrength;
    if (shortDecision && shortSignalStrength > 0) {
      const addMult = combineAdditionalModifiers({
        emaRibbonMult: shortDecision.emaRibbonMult,
        macdDivergenceMult: shortDecision.macdDivergenceMult,
        orderBlockMult: shortDecision.orderBlockMult,
      });
      const waveMult = shortDecision.waveMult ?? 1.0;
      const vwapMult = shortDecision.vwapMult ?? 1.0;
      finalShortStrength = Math.min(
        100,
        Math.max(0, shortSignalStrength * addMult * waveMult * vwapMult)
      );
    }

    const result: CoinScanResult = {
      symbol,
      price,
      change24h,
      volume24h,
      indicators,
      // Legacy boolean fields — derived from the rich decisions for backward
      // compatibility with the current frontend.
      //
      // P1-#2 fix (2026-05-10, audit `04-VWAP-AUDIT.md` §3 / `05-FIBONACCI-AUDIT.md`):
      // `isEntrySignal` 은 BBDX core (`entryDecision`) 에만 의존. Fibonacci
      // standalone 트리거 제거 (헌장 R3 violation). fibSignal 은 display
      // 정보로 보존되지만 standalone 진입 시그널로 사용 X.
      isEntrySignal: entryDecision != null,
      isExitSignal: exitDecision != null,
      signalStrength: finalLongStrength,
      fibSignal,
      // BBDX-PATTERN v6.1 fields
      pressure,
      pressureStrong,
      reversalProb,
      volumeRatio: ratio,
      volumeConfirmation: volConfirmation,
      candlePatterns,
      patternConfluence,
      bbStructure,
      bbStructureShort,
      entryDecision,
      shortDecision,
      shortStopLossPrice,
      shortSignalStrength: finalShortStrength,
      exitDecision,
      stopLossPrice,
      isStopLossHit,
      isFallingKnife: fallingKnife,
      isRisingKnife: risingKnife,
      // VWAP Strategy fields
      vwap,
      ema9,
      vwapPosition: vwapPos,
      emaPosition: emaPos,
      pullbackDetected,
      vwapSignal,
    };

    scanCache.set(key, { data: result, timestamp: Date.now() });
    klinesCache.set(key, { candles, indicators, timestamp: Date.now() });

    return result;
  } catch (error: any) {
    console.error(`[Scanner] Failed to scan ${symbol}:`, error.message);
    return null;
  }
}

/**
 * 페이지 단위 코인 스캔 (10개씩)
 * - 먼저 전체 티커를 한번에 가져옴 (1 API call, 캐시됨)
 * - 요청된 페이지의 10개 코인만 klines 호출
 * - 캐시된 코인은 스킵하여 빠르게 반환
 */
export async function scanCoinsPage(
  page: number = 1,
  pageSize: number = 10,
  interval: TimeframeValue = "4h",
  symbols: string[] = TOP_COINS
): Promise<{ coins: CoinScanResult[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const total = symbols.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIdx = (page - 1) * pageSize;
  const pageSymbols = symbols.slice(startIdx, startIdx + pageSize);

  if (pageSymbols.length === 0) {
    return { coins: [], total, page, pageSize, totalPages };
  }

  // Step 1: 전체 티커 가져오기 (캐시됨, 1분 TTL)
  const tickers = await getCachedTickers();

  // Step 2: 이 페이지의 코인들만 klines 가져오기 (병렬)
  const results = await Promise.allSettled(
    pageSymbols.map((symbol) => {
      const ticker = tickers.get(symbol);
      return scanCoin(symbol, interval, ticker || undefined);
    })
  );

  const coins: CoinScanResult[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      coins.push(result.value);
    } else {
      // 실패한 코인은 티커 데이터라도 표시 (지표 없음)
      const symbol = pageSymbols[i];
      const ticker = tickers.get(symbol);
      if (ticker) {
        coins.push({
          symbol,
          price: ticker.price,
          change24h: ticker.change24h,
          volume24h: ticker.volume24h,
          indicators: { rsi: 0, bbUpper: 0, bbMiddle: 0, bbLower: 0, adx: 0, plusDi: 0, minusDi: 0 },
          isEntrySignal: false,
          isExitSignal: false,
          signalStrength: 0,
          // BBDX-PATTERN v6.1 — empty defaults so the response shape stays
          // consistent for the frontend even when klines fetch fails.
          pressure: "NEUTRAL",
          pressureStrong: false,
          reversalProb: 0,
          volumeRatio: 1,
          volumeConfirmation: 0,
          candlePatterns: [],
          patternConfluence: null,
          bbStructure: null,
          bbStructureShort: null,
          entryDecision: null,
          shortDecision: null,
          shortStopLossPrice: 0,
          shortSignalStrength: 0,
          exitDecision: null,
          stopLossPrice: 0,
          isStopLossHit: false,
          isFallingKnife: false,
          isRisingKnife: false,
          // VWAP Strategy — empty defaults
          vwap: 0,
          ema9: 0,
          vwapPosition: "AT",
          emaPosition: "AT",
          pullbackDetected: false,
          vwapSignal: null,
        });
      }
    }
  }

  return { coins, total, page, pageSize, totalPages };
}

/**
 * 전체 코인 스캔 (백그라운드 워밍업용)
 */
export async function scanAllCoins(
  symbols: string[] = TOP_COINS,
  interval: TimeframeValue = "4h"
): Promise<CoinScanResult[]> {
  const progress = scanProgressMap.get(interval);
  if (progress?.isRunning) {
    // 이미 진행 중이면 캐시된 결과 반환
    const cached: CoinScanResult[] = [];
    for (const symbol of symbols) {
      const key = cacheKey(symbol, interval);
      const c = scanCache.get(key);
      if (c) cached.push(c.data);
    }
    return cached;
  }

  const scanProgress: ScanProgress = {
    total: symbols.length,
    completed: 0,
    isRunning: true,
    interval,
  };
  scanProgressMap.set(interval, scanProgress);

  const allResults: CoinScanResult[] = [];

  try {
    const tickers = await getCachedTickers();
    console.log(`[Scanner] Got ${tickers.size} tickers, scanning ${symbols.length} coins on ${interval}...`);

    // 10개씩 배치 처리
    const batchSize = 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((symbol) => {
          const ticker = tickers.get(symbol);
          return scanCoin(symbol, interval, ticker || undefined);
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value) {
          allResults.push(result.value);
        }
        scanProgress.completed++;
      }

      // 배치 간 딜레이
      if (i + batchSize < symbols.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    console.log(`[Scanner] Full scan complete: ${allResults.length}/${symbols.length} coins on ${interval}`);
  } catch (error: any) {
    console.error(`[Scanner] Scan failed:`, error.message);
  } finally {
    scanProgress.isRunning = false;
  }

  return allResults;
}

/**
 * 스캔 진행 상태 조회
 */
export function getScanProgress(interval: TimeframeValue = "4h"): {
  total: number;
  completed: number;
  isRunning: boolean;
} {
  const progress = scanProgressMap.get(interval);
  if (!progress) {
    return { total: TOP_COINS.length, completed: 0, isRunning: false };
  }
  return {
    total: progress.total,
    completed: progress.completed,
    isRunning: progress.isRunning,
  };
}

/**
 * 시그널이 있는 코인만 필터링
 */
export async function scanForSignals(
  symbols: string[] = TOP_COINS,
  interval: TimeframeValue = "4h"
): Promise<CoinScanResult[]> {
  const allResults = await scanAllCoins(symbols, interval);
  return allResults
    .filter((r) => r.isEntrySignal)
    .sort((a, b) => b.signalStrength - a.signalStrength);
}

/**
 * 개별 코인의 캔들 + 지표 데이터 조회 (차트용)
 */
export async function getCoinDetail(
  symbol: string,
  interval: TimeframeValue = "4h",
  limit = 100
) {
  const key = cacheKey(symbol, interval);
  const cached = klinesCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const closes = cached.candles.map((c) => c.close);
    const rsiSeries = calculateRSISeries(closes);
    const adxSeries = calculateADXSeries(cached.candles);
    return { candles: cached.candles, indicators: cached.indicators, rsiSeries, adxSeries };
  }

  const candles = await fetchKlines(symbol, interval, limit);
  if (!candles.length) return null;

  const indicators = calculateAllIndicators(candles);
  klinesCache.set(key, { candles, indicators, timestamp: Date.now() });

  const closes = candles.map((c) => c.close);
  const rsiSeries = calculateRSISeries(closes);
  const adxSeries = calculateADXSeries(candles);

  return { candles, indicators, rsiSeries, adxSeries };
}

/**
 * 캐시 초기화
 */
export function clearCache() {
  scanCache.clear();
  klinesCache.clear();
  scanProgressMap.clear();
  tickerCache = null;
}

/**
 * 서버 시작 시 백그라운드 워밍업
 * 첫 페이지(10개) 데이터를 미리 로드하여 즉시 응답 가능하게 함
 */
export function startBackgroundWarmup() {
  console.log("[Scanner] Starting background warmup...");
  // 첫 페이지 10개만 빠르게 로드
  scanCoinsPage(1, 10, "4h").then((result) => {
    console.log(`[Scanner] Quick warmup complete: ${result.coins.length} coins loaded`);
    // 나머지는 천천히 백그라운드에서
    scanAllCoins(TOP_COINS, "4h").then((results) => {
      console.log(`[Scanner] Full background warmup complete: ${results.length} coins`);
    }).catch(() => {});
  }).catch((err) => {
    console.error("[Scanner] Background warmup failed:", err.message);
  });
}
