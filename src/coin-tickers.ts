/**
 * Coin Tickers — CoinGecko Free 기반 거래소 상장 정보 (tickers) 모듈
 *
 * CoinDetail 페이지의 "코인 정보" 탭에서 사용자가 "이 코인 어디서 사지?"
 * 를 즉시 알 수 있도록 거래소 + 거래 쌍 + 24h 거래량 + 신뢰도 (trust score)
 * 를 제공한다.
 *
 * 데이터 소스:
 *   - CoinGecko Free: /coins/{id}/tickers?include_exchange_logo=false
 *   - 키 불필요, ~10-30 req/min
 *
 * 헌장 규칙:
 *   - 외부 API 키 필수화 금지 (CoinGecko Free, 키 없음)
 *   - 호출 실패는 ok: false + code 반환, throw 금지
 *   - 화이트리스트 (23 coin) 외 → NOT_FOUND
 *   - modifier-only: 정보 표시만, 단독 시그널 발행 X
 *
 * 캐시:
 *   - in-memory 1h TTL (거래소 분포는 빠르게 변하지 않음)
 *   - 429 rate limit 응답 시 RATE_LIMITED code 반환 (호출측 재시도 책임)
 *
 * 정렬:
 *   - trust_score: green (3) > yellow (2) > red (1) > unknown (0)
 *   - 동일 trust 안에서는 converted_volume.usd DESC
 *
 * 호환성:
 *   - coin-meta.ts / coin-info.ts 의 23-coin 화이트리스트와 동일
 *   - Bybit 심볼 (BTCUSDT 등) 입력 → 내부에서 base symbol (BTC) 추출
 */

import axios from "axios";

const COINGECKO_TICKERS_BASE = "https://api.coingecko.com/api/v3/coins";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const REQUEST_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────────
// 심볼 → CoinGecko id 매핑 (coin-meta.ts / coin-info.ts 와 동일)
// ─────────────────────────────────────────────────────────────
const SYMBOL_TO_GECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  MATIC: "matic-network",
  UNI: "uniswap",
  ATOM: "cosmos",
  LTC: "litecoin",
  TRX: "tron",
  BNB: "binancecoin",
  TON: "the-open-network",
  SHIB: "shiba-inu",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  PEPE: "pepe",
};

// ─────────────────────────────────────────────────────────────
// 출력 타입 — 프론트가 import 해서 그대로 표시에 쓸 수 있는 형태
// ─────────────────────────────────────────────────────────────
export type TrustScore = "green" | "yellow" | "red" | "unknown";

export interface CoinTickerExchange {
  /** 거래소 표시 이름 — "Binance", "Coinbase Exchange", "Bybit" 등. */
  name: string;
  /** CoinGecko 표준 식별자 — 소문자, "binance" / "gdax" / "bybit_spot". */
  identifier: string;
  /** CoinGecko 의 거래소 신뢰도. green=A, yellow=B, red=C, unknown=정보없음. */
  trustScore: TrustScore;
}

export interface CoinTicker {
  /** 베이스 심볼 (예: "BTC"). CoinGecko 응답을 그대로 전달. */
  base: string;
  /** 타깃 심볼 (예: "USDT", "USDC", "USD", "KRW"). */
  target: string;
  /** 상장 거래소 정보. */
  exchange: CoinTickerExchange;
  /** 현재가 (USD 환산). converted_last.usd 가 없으면 raw last 사용. */
  price: number;
  /** 24h 거래대금 (USD 환산). converted_volume.usd 가 기준. */
  volume24hUsd: number;
  /** 호가 스프레드 (%) — 작을수록 유동성 양호. CoinGecko 미제공 시 null. */
  bidAskSpreadPct: number | null;
  /** 거래소 외부 거래 페이지 deeplink. 사용자가 클릭해서 구매하러 갈 수 있음. */
  tradeUrl: string | null;
  /** 마지막 체결로부터 일정 시간 경과 시 true — UI 에서 회색 처리. */
  isStale: boolean;
  /** 마지막 체결 시각 (ISO). */
  lastTradedAt: string;
}

export type CoinTickersResult =
  | {
      ok: true;
      /** 입력으로 들어온 베이스 심볼 (예: "BTC"). */
      symbol: string;
      /** CoinGecko id (예: "bitcoin"). */
      coinGeckoId: string;
      /** 정렬 + limit 적용된 ticker 목록. */
      tickers: CoinTicker[];
      /** limit 적용 전 전체 ticker 개수 (= "총 N개 거래소에 상장" 표시용). */
      totalCount: number;
      /** 캐시에서 가져왔는지 여부 (디버그/UI 표시용). */
      cached: boolean;
      /** 계산 시각 (ISO). */
      computedAt: string;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "STUB" | "RATE_LIMITED" | "INTERNAL";
      message: string;
    };

// ─────────────────────────────────────────────────────────────
// In-memory 캐시 — key = `${coinGeckoId}|${limit}`
// 테스트에서는 clearCoinTickersCache() 로 리셋.
// ─────────────────────────────────────────────────────────────
interface CacheEntry {
  data: Extract<CoinTickersResult, { ok: true }>;
  expiresAt: number;
}
const _cache = new Map<string, CacheEntry>();

export function clearCoinTickersCache(): void {
  _cache.clear();
}

// ─────────────────────────────────────────────────────────────
// 정규화 — "BTCUSDT" / "btcusdc" / "ETHKRW" → "BTC" / "ETH"
// ─────────────────────────────────────────────────────────────
export function normalizeBaseSymbol(symbol: string): string {
  return symbol.replace(/USDT$|USDC$|KRW$|USD$/i, "").toUpperCase();
}

// ─────────────────────────────────────────────────────────────
// trust_score → 정렬용 정수
// ─────────────────────────────────────────────────────────────
function trustScoreRank(score: string | null | undefined): number {
  if (score === "green") return 3;
  if (score === "yellow") return 2;
  if (score === "red") return 1;
  return 0;
}

// ─────────────────────────────────────────────────────────────
// 메인 fetcher
// ─────────────────────────────────────────────────────────────
export async function fetchCoinTickers(input: {
  symbol: string;
  limit: number;
}): Promise<CoinTickersResult> {
  const baseSymbol = normalizeBaseSymbol(input.symbol);
  const coinGeckoId = SYMBOL_TO_GECKO_ID[baseSymbol];

  if (!coinGeckoId) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: `Unknown symbol ${baseSymbol} — 23-coin whitelist 외`,
    };
  }

  const cacheKey = `${coinGeckoId}|${input.limit}`;
  const cached = _cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, cached: true };
  }

  try {
    const url = `${COINGECKO_TICKERS_BASE}/${coinGeckoId}/tickers?include_exchange_logo=false`;
    const res = await axios.get(url, { timeout: REQUEST_TIMEOUT_MS });
    const raw: any[] = Array.isArray(res.data?.tickers) ? res.data.tickers : [];

    // 정렬: trust_score DESC, 그 다음 USD volume DESC
    const sorted = [...raw].sort((a, b) => {
      const aScore = trustScoreRank(a?.trust_score);
      const bScore = trustScoreRank(b?.trust_score);
      if (aScore !== bScore) return bScore - aScore;
      const aVol = Number(a?.converted_volume?.usd ?? 0);
      const bVol = Number(b?.converted_volume?.usd ?? 0);
      return bVol - aVol;
    });

    const tickers: CoinTicker[] = sorted.slice(0, input.limit).map((t) => ({
      base: typeof t?.base === "string" ? t.base : baseSymbol,
      target: typeof t?.target === "string" ? t.target : "",
      exchange: {
        name: typeof t?.market?.name === "string" ? t.market.name : "Unknown",
        identifier:
          typeof t?.market?.identifier === "string" ? t.market.identifier : "",
        trustScore: normalizeTrustScore(t?.trust_score),
      },
      price: Number(t?.converted_last?.usd ?? t?.last ?? 0),
      volume24hUsd: Number(t?.converted_volume?.usd ?? 0),
      bidAskSpreadPct:
        typeof t?.bid_ask_spread_percentage === "number"
          ? t.bid_ask_spread_percentage
          : null,
      tradeUrl: typeof t?.trade_url === "string" ? t.trade_url : null,
      isStale: Boolean(t?.is_stale),
      lastTradedAt:
        typeof t?.last_traded_at === "string" ? t.last_traded_at : "",
    }));

    const result: Extract<CoinTickersResult, { ok: true }> = {
      ok: true,
      symbol: baseSymbol,
      coinGeckoId,
      tickers,
      totalCount: raw.length,
      cached: false,
      computedAt: new Date().toISOString(),
    };
    _cache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return result;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 429) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        message: "CoinGecko rate limit — 1분 후 재시도",
      };
    }
    return {
      ok: false,
      code: "INTERNAL",
      message: err?.message ?? "fetch failed",
    };
  }
}

function normalizeTrustScore(score: unknown): TrustScore {
  if (score === "green" || score === "yellow" || score === "red") return score;
  return "unknown";
}
