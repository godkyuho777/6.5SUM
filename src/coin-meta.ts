/**
 * Coin Meta — CoinGecko Free 기반 시총/거래량/도미넌스/SSR 메타 데이터
 *
 * 헌장 규칙: 외부 API 실패는 항상 graceful → status: "stub"/"error" 반환,
 * 절대 throw 로 라우터 체인을 깨지 않는다.
 *
 * 데이터 소스:
 *   - CoinGecko Free: /coins/markets?ids={...}  (키 불필요, ~30 req/min)
 *   - In-memory 5분 캐시 (rate limit 회피)
 *
 * SSR z-score 는 onchain/ssr.ts 의 90일 rolling buffer 와 별도 — 여기서는
 * 가장 최근 SSR 만 노출 (UI 표시 용). z-score 가 필요한 modifier 합산은
 * 그대로 onchain/ssr.ts 가 담당.
 */

import axios from "axios";

const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets";
const STABLE_IDS = ["tether", "usd-coin", "dai"];

// Bybit 심볼 (BTCUSDT 등) → CoinGecko id 매핑.
// 화이트리스트 외 심볼은 stub 처리 (등록되지 않은 alt coin 회피).
const SYMBOL_TO_CG_ID: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
  ADAUSDT: "cardano",
  XRPUSDT: "ripple",
  DOGEUSDT: "dogecoin",
  AVAXUSDT: "avalanche-2",
  DOTUSDT: "polkadot",
  LINKUSDT: "chainlink",
  MATICUSDT: "matic-network",
  UNIUSDT: "uniswap",
  ATOMUSDT: "cosmos",
  LTCUSDT: "litecoin",
  TRXUSDT: "tron",
  BNBUSDT: "binancecoin",
  TONUSDT: "the-open-network",
  SHIBUSDT: "shiba-inu",
  NEARUSDT: "near",
  APTUSDT: "aptos",
  ARBUSDT: "arbitrum",
  OPUSDT: "optimism",
  SUIUSDT: "sui",
  PEPEUSDT: "pepe",
};

interface CGMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number | null;
  total_volume: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  price_change_percentage_24h: number | null;
}

interface MetaCacheEntry {
  data: CoinMeta;
  ts: number;
}

const META_CACHE = new Map<string, MetaCacheEntry>();
const META_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export interface CoinMeta {
  symbol: string;
  base: string;
  /** "real" = CoinGecko 응답, "stub" = 화이트리스트 외 / 응답 없음, "error" = 호출 실패 */
  status: "real" | "stub" | "error";
  detail?: string;
  /** USD 시가총액 */
  mcap: number;
  /** 24h USD 거래량 */
  volume24h: number;
  /** 유통 공급량 (코인 갯수). 알 수 없으면 0 */
  circulatingSupply: number;
  totalSupply: number | null;
  maxSupply: number | null;
  marketCapRank: number | null;
  /** BTC 도미넌스 비율 (0~1). 본 코인이 BTC 일 때만 의미. 그 외 코인은 BTC 시총 / 전체 시총 추정 X. */
  dominance: number | null;
  /** 최신 SSR (BTC 시총 / 스테이블 시총). 모든 코인에서 같은 값. */
  ssr: number | null;
  /** SSR 90일 rolling buffer 가 충분히 누적된 경우의 z-score. 없으면 null. */
  ssrZScore: number | null;
  /** ISO timestamp */
  computedAt: string;
}

// 단일 글로벌 요약 (BTC 도미넌스 + SSR 산출 용) — 5분 캐시 공유.
interface GlobalCacheEntry {
  btcMcap: number;
  totalMcap: number;
  stableMcap: number;
  ts: number;
}
let GLOBAL_CACHE: GlobalCacheEntry | null = null;
let GLOBAL_FETCH_INFLIGHT: Promise<GlobalCacheEntry | null> | null = null;

async function fetchGlobalMcap(): Promise<GlobalCacheEntry | null> {
  if (GLOBAL_CACHE && Date.now() - GLOBAL_CACHE.ts < META_CACHE_TTL_MS) {
    return GLOBAL_CACHE;
  }
  if (GLOBAL_FETCH_INFLIGHT) return GLOBAL_FETCH_INFLIGHT;

  GLOBAL_FETCH_INFLIGHT = (async () => {
    try {
      const ids = ["bitcoin", ...STABLE_IDS].join(",");
      const resp = await axios.get<CGMarket[]>(COINGECKO_URL, {
        params: { vs_currency: "usd", ids, per_page: 10, page: 1 },
        timeout: 8000,
        headers: { "User-Agent": "tradelab-backend/1.0" },
      });
      const map = new Map(resp.data.map((m) => [m.id, m.market_cap ?? 0]));
      const btcMcap = map.get("bitcoin") ?? 0;
      const stableMcap = STABLE_IDS.reduce((s, id) => s + (map.get(id) ?? 0), 0);

      // 전체 시총은 CoinGecko /global 에서 직접 가져옴.
      let totalMcap = 0;
      try {
        const g = await axios.get<{ data: { total_market_cap: { usd: number } } }>(
          "https://api.coingecko.com/api/v3/global",
          { timeout: 8000, headers: { "User-Agent": "tradelab-backend/1.0" } }
        );
        totalMcap = g.data?.data?.total_market_cap?.usd ?? 0;
      } catch {
        // /global 실패해도 나머지 데이터는 유효 — totalMcap=0 으로 두면 dominance=null.
      }

      const entry: GlobalCacheEntry = {
        btcMcap,
        totalMcap,
        stableMcap,
        ts: Date.now(),
      };
      GLOBAL_CACHE = entry;
      return entry;
    } catch {
      return null;
    } finally {
      GLOBAL_FETCH_INFLIGHT = null;
    }
  })();

  return GLOBAL_FETCH_INFLIGHT;
}

/** SSR z-score 를 onchain 모듈에서 가져오기 (있다면). */
async function getSsrZScore(): Promise<number | null> {
  try {
    // Lazy import — 순환 의존 회피.
    const onchainSsr = await import("./onchain/ssr");
    const r = await onchainSsr.computeSSR();
    if (r.status !== "ok") return null;
    const z = (r.raw as Record<string, unknown> | undefined)?.z;
    return typeof z === "number" ? z : null;
  } catch {
    return null;
  }
}

export async function getCoinMeta(rawSymbol: string): Promise<CoinMeta> {
  const symbol = rawSymbol.toUpperCase();
  const base = symbol.replace(/USDT$/, "");
  const computedAt = new Date().toISOString();

  // 캐시 검사
  const cached = META_CACHE.get(symbol);
  if (cached && Date.now() - cached.ts < META_CACHE_TTL_MS) {
    return { ...cached.data, computedAt };
  }

  const cgId = SYMBOL_TO_CG_ID[symbol];
  if (!cgId) {
    const stub: CoinMeta = {
      symbol,
      base,
      status: "stub",
      detail: `${symbol} CoinGecko 매핑 미등록 — meta 미가용`,
      mcap: 0,
      volume24h: 0,
      circulatingSupply: 0,
      totalSupply: null,
      maxSupply: null,
      marketCapRank: null,
      dominance: null,
      ssr: null,
      ssrZScore: null,
      computedAt,
    };
    META_CACHE.set(symbol, { data: stub, ts: Date.now() });
    return stub;
  }

  try {
    const [resp, global, ssrZ] = await Promise.all([
      axios.get<CGMarket[]>(COINGECKO_URL, {
        params: { vs_currency: "usd", ids: cgId, per_page: 1, page: 1 },
        timeout: 8000,
        headers: { "User-Agent": "tradelab-backend/1.0" },
      }),
      fetchGlobalMcap(),
      getSsrZScore(),
    ]);

    const m = resp.data[0];
    if (!m) {
      const stub: CoinMeta = {
        symbol,
        base,
        status: "stub",
        detail: `${symbol} CoinGecko 응답 비어있음`,
        mcap: 0,
        volume24h: 0,
        circulatingSupply: 0,
        totalSupply: null,
        maxSupply: null,
        marketCapRank: null,
        dominance: null,
        ssr: null,
        ssrZScore: null,
        computedAt,
      };
      META_CACHE.set(symbol, { data: stub, ts: Date.now() });
      return stub;
    }

    const ssr =
      global && global.stableMcap > 0 ? global.btcMcap / global.stableMcap : null;
    const dominance =
      symbol === "BTCUSDT" && global && global.totalMcap > 0
        ? global.btcMcap / global.totalMcap
        : null;

    const meta: CoinMeta = {
      symbol,
      base,
      status: "real",
      mcap: m.market_cap ?? 0,
      volume24h: m.total_volume ?? 0,
      circulatingSupply: m.circulating_supply ?? 0,
      totalSupply: m.total_supply,
      maxSupply: m.max_supply,
      marketCapRank: m.market_cap_rank,
      dominance,
      ssr,
      ssrZScore: ssrZ,
      computedAt,
    };

    META_CACHE.set(symbol, { data: meta, ts: Date.now() });
    return meta;
  } catch (err: any) {
    return {
      symbol,
      base,
      status: "error",
      detail: `CoinGecko 호출 실패: ${err?.message ?? err}`,
      mcap: 0,
      volume24h: 0,
      circulatingSupply: 0,
      totalSupply: null,
      maxSupply: null,
      marketCapRank: null,
      dominance: null,
      ssr: null,
      ssrZScore: null,
      computedAt,
    };
  }
}
