/**
 * Coin Valuation — 코인별 밸류에이션 지표 (where possible).
 *
 * 목적: "이 코인을 어떻게/얼마로 평가할 수 있나?" 를 CoinDetail "밸류에이션" 탭에
 * 보여준다. 핵심은 *모든 코인을 같은 잣대로 보지 않는 것* — 현금흐름이 있는
 * 프로토콜은 P/F·TVL 배수로, BTC 는 가치저장 관점으로, 밈은 "밸류에이션 부적합"
 * 으로 정직하게 분류한다.
 *
 * 데이터:
 *   - 신뢰 코어 = CoinGecko (getCoinInfo 재사용): 시총·FDV·공급·거래량.
 *     → FDV/MC, 유통비율, NVT 근사(시총/24h거래량) 항상 계산 가능(23-coin).
 *   - 펀더멘털 enrichment = DefiLlama 무료 API (best-effort, 실패 시 null):
 *     체인 TVL(/v2/chains, gecko_id 매칭) · 프로토콜 TVL(/tvl/{slug}) ·
 *     수수료(/overview/fees, geckoId 매칭) → MC/TVL, P/F.
 *
 * 헌장:
 *   - 외부 API 키 필수화 금지 (CoinGecko·DefiLlama 모두 무료·키 없음).
 *   - 모든 외부 호출 try/catch, throw 금지 → 실패 지표는 null, status 로 신호.
 *   - 밸류에이션은 *리서치/교육* 표시용. BBDX 시그널과 무관, 단독 매매 신호 X.
 */

import axios from "axios";
import { getCoinInfo } from "./coin-info";

const DEFILLAMA = "https://api.llama.fi";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const REQUEST_TIMEOUT_MS = 10_000;
const DAYS_PER_YEAR = 365;

// ── 분류 ────────────────────────────────────────────────────────────
export type ValuationKind =
  | "fundamental" // 수수료·TVL 등 현금흐름성 펀더멘털 → 배수 평가 가능
  | "store-of-value" // BTC 류 — 전통 밸류에이션 부적합, 수급/희소성 관점
  | "not-applicable" // 밈 — 펀더멘털 부재, 내재가치 산정 불가
  | "limited"; // 시총·FDV·유통량 상대비교만 (온체인 데이터 없음)

export interface CoinValuation {
  symbol: string; // "ETHUSDT"
  baseSymbol: string; // "ETH"
  name: string;
  /** "ok" = 코어 데이터 있음, "stub" = 화이트리스트 외, "error" = 호출 실패 */
  status: "ok" | "stub" | "error";

  kind: ValuationKind;
  kindLabel: string; // 한국어 분류 라벨
  kindNote: string; // 분류 설명 한 줄

  // ── raw (CoinGecko)
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;

  // ── 배수/지표 (각각 null 가능 — 데이터 없으면 null)
  /** FDV / 시총 — 미래 희석 배수 (1=완전유통, ↑일수록 언락 부담) */
  fdvMcRatio: number | null;
  /** 유통 공급 / (max 또는 total) — 유통 비율 0~1 */
  circulatingPct: number | null;
  /** 시총 / 24h 거래량 — NVT 근사(거래소 거래량 기반, 참고용) */
  nvtApprox: number | null;
  /** 온체인 TVL (DeFi 프로토콜/체인) */
  tvlUsd: number | null;
  /** 시총 / TVL — P/TVL (낮을수록 TVL 대비 저평가) */
  mcTvlRatio: number | null;
  /** 연환산 프로토콜 수수료 */
  annualizedFeesUsd: number | null;
  /** 시총 / 연환산 수수료 — P/F (전통 P/S 의 크립토판) */
  priceToFees: number | null;

  /** 데이터 가용성/주의 노트 (UI 에 그대로 노출) */
  notes: string[];
  asOf: number;
  errorDetail?: string;
}

// ── DefiLlama 매핑 ──────────────────────────────────────────────────
// 심볼 → DefiLlama slug. 수수료(/overview/fees 는 slug 키, geckoId 없음)와
// 프로토콜 TVL(/tvl/{slug}, 체인 TVL 이 없을 때 fallback)에 함께 쓴다.
// 체인 TVL 은 /v2/chains 의 gecko_id 로 별도 매칭(getChainTvlMap).
const DL_SLUG: Record<string, string> = {
  ETH: "ethereum",
  SOL: "solana",
  UNI: "uniswap",
  AAVE: "aave",
  LINK: "chainlink",
  AVAX: "avalanche",
  MATIC: "polygon",
  ARB: "arbitrum",
  OP: "optimism",
  TRX: "tron",
  BNB: "bsc",
  NEAR: "near",
  APT: "aptos",
  SUI: "sui",
  ATOM: "cosmos",
  ADA: "cardano",
  DOT: "polkadot",
  TON: "ton",
  LTC: "litecoin",
};

// 밈 코인 (category 가 비어도 강제 분류) — 화이트리스트 기준.
const MEME_SET = new Set(["DOGE", "SHIB", "PEPE"]);

// ── DefiLlama 캐시 ──────────────────────────────────────────────────
interface Cached<T> {
  data: T;
  ts: number;
}
let chainTvlCache: Cached<Map<string, number>> | null = null; // gecko_id → tvl
let feesCache: Cached<Map<string, number>> | null = null; // slug → 연환산 수수료
const protocolTvlCache = new Map<string, Cached<number>>(); // slug → tvl

function fresh<T>(c: Cached<T> | null | undefined): c is Cached<T> {
  return !!c && Date.now() - c.ts < CACHE_TTL_MS;
}

/** /v2/chains → Map(gecko_id → 현재 TVL). 실패 시 빈 Map. */
async function getChainTvlMap(): Promise<Map<string, number>> {
  if (fresh(chainTvlCache)) return chainTvlCache.data;
  const map = new Map<string, number>();
  try {
    const res = await axios.get<
      Array<{ gecko_id: string | null; tvl: number | null; name: string }>
    >(`${DEFILLAMA}/v2/chains`, { timeout: REQUEST_TIMEOUT_MS });
    for (const c of res.data ?? []) {
      if (c.gecko_id && typeof c.tvl === "number" && c.tvl > 0) {
        map.set(c.gecko_id, c.tvl);
      }
    }
    chainTvlCache = { data: map, ts: Date.now() };
  } catch (err) {
    console.warn("[valuation] DefiLlama chains fetch 실패:", (err as Error)?.message);
    // 실패해도 빈 Map 캐시(짧게) — 매 호출 재시도 폭주 방지
    chainTvlCache = { data: map, ts: Date.now() - CACHE_TTL_MS + 60_000 };
  }
  return map;
}

/** /overview/fees → Map(slug → 연환산 수수료 USD). 실패 시 빈 Map.
 *  fees 응답엔 geckoId 가 없고 slug 키만 있음. annualized1y 우선,
 *  없으면 total1y, 없으면 total30d 를 연환산. */
async function getFeesMap(): Promise<Map<string, number>> {
  if (fresh(feesCache)) return feesCache.data;
  const map = new Map<string, number>();
  try {
    const res = await axios.get<{
      protocols?: Array<{
        slug?: string | null;
        annualized1y?: number | null;
        total1y?: number | null;
        total30d?: number | null;
      }>;
    }>(
      `${DEFILLAMA}/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`,
      { timeout: REQUEST_TIMEOUT_MS },
    );
    for (const p of res.data?.protocols ?? []) {
      if (!p.slug) continue;
      const annual =
        (typeof p.annualized1y === "number" && p.annualized1y > 0
          ? p.annualized1y
          : null) ??
        (typeof p.total1y === "number" && p.total1y > 0 ? p.total1y : null) ??
        (typeof p.total30d === "number" && p.total30d > 0
          ? (p.total30d / 30) * DAYS_PER_YEAR
          : null);
      if (annual !== null) map.set(p.slug, annual);
    }
    feesCache = { data: map, ts: Date.now() };
  } catch (err) {
    console.warn("[valuation] DefiLlama fees fetch 실패:", (err as Error)?.message);
    feesCache = { data: map, ts: Date.now() - CACHE_TTL_MS + 60_000 };
  }
  return map;
}

/** /tvl/{slug} → 프로토콜 현재 TVL(number). 실패 시 null. */
async function getProtocolTvl(slug: string): Promise<number | null> {
  const cached = protocolTvlCache.get(slug);
  if (fresh(cached)) return cached.data;
  try {
    const res = await axios.get<number>(`${DEFILLAMA}/tvl/${slug}`, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    const tvl = typeof res.data === "number" && res.data > 0 ? res.data : null;
    if (tvl !== null) protocolTvlCache.set(slug, { data: tvl, ts: Date.now() });
    return tvl;
  } catch (err) {
    console.warn(
      `[valuation] DefiLlama tvl/${slug} 실패:`,
      (err as Error)?.message,
    );
    return null;
  }
}

// ── 분류 결정 ───────────────────────────────────────────────────────
function classify(
  base: string,
  category: string[],
  hasFundamentals: boolean,
): { kind: ValuationKind; label: string; note: string } {
  const cat = category.map((c) => c.toLowerCase());
  if (MEME_SET.has(base) || cat.includes("meme")) {
    return {
      kind: "not-applicable",
      label: "밸류에이션 부적합",
      note: "밈 코인 — 수수료·매출 같은 펀더멘털이 없어 내재가치 산정 불가. 순수 sentiment·유동성 주도이므로 시총·유통량만 참고하라.",
    };
  }
  if (base === "BTC" || cat.includes("store of value")) {
    return {
      kind: "store-of-value",
      label: "가치 저장 자산",
      note: "현금흐름이 없어 P/F 등 전통 배수가 부적합. 희소성(21M)·채택률·수급(ETF·온체인)으로 평가한다.",
    };
  }
  if (hasFundamentals) {
    return {
      kind: "fundamental",
      label: "펀더멘털 평가 가능",
      note: "온체인 수수료·TVL 등 현금흐름성 지표로 상대 밸류에이션(P/F·MC/TVL)이 가능하다.",
    };
  }
  return {
    kind: "limited",
    label: "제한적 평가",
    note: "시총·FDV·유통량 기반 상대 비교만 가능(온체인 수수료·TVL 데이터 없음).",
  };
}

function ratio(num?: number | null, den?: number | null): number | null {
  if (typeof num !== "number" || typeof den !== "number") return null;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

// ── main ────────────────────────────────────────────────────────────
/**
 * 단일 코인의 밸류에이션 패키지 반환. 외부 호출 실패해도 throw 하지 않고
 * 가능한 지표만 채워 반환한다(나머지는 null).
 */
export async function getCoinValuation(symbol: string): Promise<CoinValuation> {
  const base = symbol.replace(/USDT$/i, "").toUpperCase();
  const asOf = Date.now();

  let info;
  try {
    info = await getCoinInfo(symbol);
  } catch (err) {
    return {
      symbol,
      baseSymbol: base,
      name: base,
      status: "error",
      kind: "limited",
      kindLabel: "평가 불가",
      kindNote: "코인 메타데이터를 불러오지 못했습니다.",
      priceUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      volume24hUsd: null,
      circulatingSupply: null,
      totalSupply: null,
      maxSupply: null,
      fdvMcRatio: null,
      circulatingPct: null,
      nvtApprox: null,
      tvlUsd: null,
      mcTvlRatio: null,
      annualizedFeesUsd: null,
      priceToFees: null,
      notes: ["데이터 소스 호출 실패 — 잠시 후 다시 시도해주세요."],
      asOf,
      errorDetail: (err as Error)?.message,
    };
  }

  // 화이트리스트 외(stub) → 코어 데이터 없음
  if (info.status !== "real") {
    const cls = classify(base, info.category ?? [], false);
    return {
      symbol,
      baseSymbol: base,
      name: info.name ?? base,
      status: info.status === "stub" ? "stub" : "error",
      kind: cls.kind,
      kindLabel: cls.label,
      kindNote: cls.note,
      priceUsd: info.currentPrice ?? null,
      marketCapUsd: info.marketCapUsd ?? null,
      fdvUsd: info.fdvUsd ?? null,
      volume24hUsd: info.volume24hUsd ?? null,
      circulatingSupply: info.circulatingSupply ?? null,
      totalSupply: info.totalSupply ?? null,
      maxSupply: info.maxSupply ?? null,
      fdvMcRatio: ratio(info.fdvUsd, info.marketCapUsd),
      circulatingPct: ratio(
        info.circulatingSupply,
        info.maxSupply ?? info.totalSupply,
      ),
      nvtApprox: ratio(info.marketCapUsd, info.volume24hUsd),
      tvlUsd: null,
      mcTvlRatio: null,
      annualizedFeesUsd: null,
      priceToFees: null,
      notes: [
        "온체인 펀더멘털(수수료·TVL) 데이터는 주요 23개 코인에만 제공됩니다.",
      ],
      asOf,
      errorDetail: info.errorDetail,
    };
  }

  // ── DefiLlama enrichment (best-effort) ──────────────────────────
  const cgId = info.coingeckoId;
  const notes: string[] = [];

  const slug = DL_SLUG[base];

  let tvlUsd: number | null = null;
  // 1) 체인 TVL (ETH/SOL/… — gecko_id 매칭)
  try {
    const chains = await getChainTvlMap();
    tvlUsd = chains.get(cgId) ?? null;
  } catch {
    /* graceful */
  }
  // 2) 프로토콜 TVL (UNI 등 — slug, 체인 TVL 없을 때 fallback)
  if (tvlUsd === null && slug) {
    tvlUsd = await getProtocolTvl(slug);
  }

  // 수수료 → 연환산 (slug 매칭, annualized1y 우선)
  let annualizedFeesUsd: number | null = null;
  if (slug) {
    try {
      const fees = await getFeesMap();
      annualizedFeesUsd = fees.get(slug) ?? null;
    } catch {
      /* graceful */
    }
  }

  const hasFundamentals = tvlUsd !== null || annualizedFeesUsd !== null;
  const cls = classify(base, info.category ?? [], hasFundamentals);

  if (cls.kind === "fundamental") {
    if (tvlUsd === null) notes.push("TVL 데이터 없음 — MC/TVL 미산출.");
    if (annualizedFeesUsd === null) {
      notes.push("수수료 데이터 없음 — P/F 미산출.");
    } else {
      notes.push(
        "P/F 는 DefiLlama 연환산 수수료 기준 — 집계 범위(체인 vs 프로토콜)에 따라 차이날 수 있음(참고용).",
      );
    }
  }
  if (info.maxSupply == null && info.totalSupply == null) {
    notes.push("최대 공급량 미정 — 유통비율은 참고용.");
  }
  notes.push("NVT 근사는 거래소 24h 거래량 기반 — 온체인 NVT 와 다름(참고용).");

  return {
    symbol,
    baseSymbol: base,
    name: info.name ?? base,
    status: "ok",
    kind: cls.kind,
    kindLabel: cls.label,
    kindNote: cls.note,
    priceUsd: info.currentPrice ?? null,
    marketCapUsd: info.marketCapUsd ?? null,
    fdvUsd: info.fdvUsd ?? null,
    volume24hUsd: info.volume24hUsd ?? null,
    circulatingSupply: info.circulatingSupply ?? null,
    totalSupply: info.totalSupply ?? null,
    maxSupply: info.maxSupply ?? null,
    fdvMcRatio: ratio(info.fdvUsd, info.marketCapUsd),
    circulatingPct: ratio(
      info.circulatingSupply,
      info.maxSupply ?? info.totalSupply,
    ),
    nvtApprox: ratio(info.marketCapUsd, info.volume24hUsd),
    tvlUsd,
    mcTvlRatio: ratio(info.marketCapUsd, tvlUsd),
    annualizedFeesUsd,
    priceToFees: ratio(info.marketCapUsd, annualizedFeesUsd),
    notes,
    asOf,
  };
}
