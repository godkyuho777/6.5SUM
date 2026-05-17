/**
 * ETF Flow modifier (Farside Investors HTML 스크래핑)
 *
 * Phase 1 (무료) 구현 — BTC/ETH spot ETF 의 일별 net flow 를 Farside 페이지에서
 * 추출, 가장 최근 3 거래일 누적값으로 BBDX modifier 산출.
 *
 *   ETF 3-day cumulative net flow ($USD millions)
 *     > +$1.5B  → +0.20   (강한 기관 매수)
 *     > +$750M  → 선형 보간 ( +0.10 ~ +0.20 )
 *     > +0M     → 선형 보간 ( 0 ~ +0.10 )
 *     < -$1B    → -0.25   (강한 기관 매도)
 *     < -$500M  → 선형 보간 ( -0.125 ~ -0.25 )
 *     < 0M      → 선형 보간 ( 0 ~ -0.125 )
 *
 *   가이드 명세 (체크리스트):
 *     - 3d > +$1.5B → +0.20
 *     - 3d < -$1B   → -0.25
 *     - 사이는 선형 보간
 *
 * 데이터 소스:
 *   - https://farside.co.uk/btc/  (Bitcoin Spot ETF)
 *   - https://farside.co.uk/eth/  (Ethereum Spot ETF)
 *   - 무료, 키 불필요, 일 1회 (장 마감 후) 업데이트.
 *   - 응답: HTML 페이지에 `<table class="etf">` 1개 — 일별 행 + Total/Average/...
 *     요약 행으로 끝남.
 *
 * 파싱 전략:
 *   - cheerio 미사용 (의존성 추가 회피) — 정규식 기반 단순 파서.
 *   - 행 식별: 첫 `<td>` 셀에 "DD MMM YYYY" 형식 날짜 → 데이터 행.
 *   - 값 추출: 행의 마지막 `<td>` 가 Total ($M).
 *   - 음수 표기: `<span class="redFont">(123.4)</span>` → -123.4
 *   - 0 표기: `0.0`, `-`, 빈 셀 모두 0 처리.
 *
 * 캐싱:
 *   - `.macro-cache/etf-flow-<symbol>-<YYYYMMDD>.json`  (24h 기준 — 일자 stamp 로
 *     자동 invalidate). 동일 일자 내 재호출은 cache hit.
 *
 * Graceful error:
 *   - 네트워크 실패 / HTML 구조 변경 / 파싱 실패 → status="error", value=0.
 *   - BTC/ETH 외 symbol → status="stub", value=0.
 */

import axios from "axios";
import fs from "fs/promises";
import path from "path";
import type { OnchainModifierResult } from "./types";

// ─── 상수 ─────────────────────────────────────────────────────────────

const FARSIDE_URLS = {
  BTCUSDT: "https://farside.co.uk/btc/",
  ETHUSDT: "https://farside.co.uk/eth/",
} as const;

const CACHE_DIR = ".macro-cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const REQUEST_TIMEOUT_MS = 10_000;
const MIN_RESPONSE_BYTES = 1_000; // sanity check

/** 임계값 ($ millions). 가이드: $1.5B = 1500M, -$1B = -1000M. */
const THRESHOLD_HIGH_M = 1_500;
const THRESHOLD_LOW_M = -1_000;
const MAX_POSITIVE = +0.2;
const MAX_NEGATIVE = -0.25;

// ─── 타입 ─────────────────────────────────────────────────────────────

export interface FarsideDailyFlow {
  /** YYYY-MM-DD ISO date (UTC, Farside 표기를 그대로 변환). */
  date: string;
  /** 일별 net flow in USD millions (음수 = 순유출). */
  netFlow: number;
}

export interface FarsideFetchResult {
  status: "ok" | "stub" | "error";
  /** 가장 최근 3 거래일 누적 net flow ($USD millions). */
  netFlow3d: number;
  /** 최근 5 거래일 (parse 가능했던) 일별 flow. */
  dailyFlows: FarsideDailyFlow[];
  detail?: string;
}

// ─── 파싱: 값 ─────────────────────────────────────────────────────────

/**
 * Farside cell 의 raw 값 문자열 → 숫자 (USD millions).
 *
 * 처리:
 *   - "123.4" → 123.4
 *   - "(123.4)" → -123.4
 *   - "0.0" → 0
 *   - "-" / "" → 0
 *   - "1,234.5" → 1234.5  (천 단위 콤마, Total row 등에서 출현)
 *   - 그 외 (e.g. "n/a") → 0
 *
 * @internal — 테스트용 export.
 */
export function parseFarsideValue(raw: string): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") return 0;

  // 음수 검사: (123.4) 형식
  const negParen = trimmed.match(/^\(([\d,.]+)\)$/);
  if (negParen) {
    const n = Number(negParen[1].replace(/,/g, ""));
    return Number.isFinite(n) ? -n : 0;
  }

  // - prefix 형식 (예: "-123.4")
  if (/^-?[\d,.]+$/.test(trimmed)) {
    const n = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

// ─── 파싱: 날짜 ───────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/**
 * "27 Apr 2026" → "2026-04-27" (ISO YYYY-MM-DD).
 *
 * @internal — 테스트용 export.
 */
export function parseFarsideDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = MONTH_MAP[m[2]];
  const year = m[3];
  return `${year}-${month}-${day}`;
}

// ─── 파싱: HTML ──────────────────────────────────────────────────────

/**
 * Farside HTML 문자열에서 일별 net flow 추출.
 *
 * 알고리즘:
 *   1. `<tr>...</tr>` 단위로 분리.
 *   2. 각 `<tr>` 의 모든 `<td>...</td>` 추출.
 *   3. 첫 `<td>` 의 텍스트가 "DD MMM YYYY" 매치 → 데이터 행.
 *   4. 마지막 `<td>` 의 텍스트를 Total 로 파싱 ($M).
 *   5. parse 가능한 모든 데이터 행을 ISO date 순서 (오래 → 최신) 로 반환.
 *
 * 안정성 가설:
 *   - Farside 가 매일 새 행을 *추가* 하고 column 구조를 바꾸지 않는 한 동작.
 *   - "Total" / "Average" / "Maximum" / "Minimum" 행은 첫 `<td>` 가 단어이므로
 *     날짜 정규식에서 자동 배제.
 *   - 행 사이 `<tr>` 가 비어있어도 (e.g. <tr> 가 닫히기 전 새 <tr> 시작) 다음
 *     <tr> 들이 잘 잡힘 — split 기반이라 robust.
 *
 * @internal — 테스트용 export.
 */
export function parseFarsideHtml(html: string): FarsideDailyFlow[] {
  if (!html || html.length < MIN_RESPONSE_BYTES) return [];

  // <tr> 단위로 잘라서 검사 (대소문자 무시).
  // 정규식: <tr 로 시작하고 다음 <tr 가 오기 전까지.
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/tbody|<\/table)/gi;
  const rows: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(html)) !== null) {
    rows.push(match[1]);
  }

  const flows: FarsideDailyFlow[] = [];
  const seenDates = new Set<string>();

  for (const rowHtml of rows) {
    // 행 내 모든 <td>...</td> 추출.
    const cellRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(stripHtml(cellMatch[1]));
    }

    if (cells.length < 2) continue;

    const date = parseFarsideDate(cells[0]);
    if (!date) continue;
    if (seenDates.has(date)) continue;

    const totalRaw = cells[cells.length - 1];
    const total = parseFarsideValue(totalRaw);
    if (!Number.isFinite(total)) continue;

    seenDates.add(date);
    flows.push({ date, netFlow: total });
  }

  // 날짜 오름차순 정렬 (오래 → 최신).
  flows.sort((a, b) => a.date.localeCompare(b.date));
  return flows;
}

/** `<span class="redFont">(123)</span>` 같은 내부 태그를 제거하고 텍스트만 남긴다. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

// ─── 임계값 매핑 ──────────────────────────────────────────────────────

/**
 * 3일 누적 net flow ($M) → modifier value (-0.25 ~ +0.20).
 *
 * 매핑:
 *   - >= +1500M → +0.20
 *   - 0 ~ +1500M → 선형 보간 (0 → 0, 1500 → 0.20)
 *   - 0 ~ -1000M → 선형 보간 (0 → 0, -1000 → -0.25)
 *   - <= -1000M → -0.25
 *
 * @internal — 테스트용 export.
 */
export function applyEtfFlowThreshold(netFlow3dM: number): number {
  if (!Number.isFinite(netFlow3dM)) return 0;
  if (netFlow3dM >= THRESHOLD_HIGH_M) return MAX_POSITIVE;
  if (netFlow3dM <= THRESHOLD_LOW_M) return MAX_NEGATIVE;
  if (netFlow3dM > 0) {
    return MAX_POSITIVE * (netFlow3dM / THRESHOLD_HIGH_M);
  }
  if (netFlow3dM < 0) {
    return MAX_NEGATIVE * (Math.abs(netFlow3dM) / Math.abs(THRESHOLD_LOW_M));
  }
  return 0;
}

// ─── 캐시 ─────────────────────────────────────────────────────────────

function cacheFilePath(symbol: string): string {
  // YYYYMMDD 일자 stamp — 자정 지나면 새 파일 사용 (자동 invalidation).
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return path.join(CACHE_DIR, `etf-flow-${symbol.toLowerCase()}-${stamp}.json`);
}

async function readCache(symbol: string): Promise<FarsideFetchResult | null> {
  try {
    const file = cacheFilePath(symbol);
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as FarsideFetchResult;
  } catch {
    return null;
  }
}

async function writeCache(symbol: string, result: FarsideFetchResult): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const file = cacheFilePath(symbol);
    await fs.writeFile(file, JSON.stringify(result), "utf-8");
  } catch (err) {
    console.warn(`[etf-flow] cache write failed: ${(err as Error).message ?? "unknown"}`);
  }
}

// ─── 메인 fetcher ────────────────────────────────────────────────────

/**
 * Farside 페이지에서 ETF flow 를 fetch + parse + 3d 누적.
 *
 * 캐시 우선 (24h). 실패는 throw 하지 않고 `status: "error"` 반환.
 */
export async function fetchFarsideEtfFlow(
  symbol: "BTCUSDT" | "ETHUSDT",
): Promise<FarsideFetchResult> {
  // 캐시 hit
  const cached = await readCache(symbol);
  if (cached) return cached;

  const url = FARSIDE_URLS[symbol];
  try {
    const resp = await axios.get<string>(url, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { "User-Agent": "tradelab-onchain/1.0" },
      responseType: "text",
      transformResponse: [(d) => d], // axios 의 자동 JSON parse 차단 (HTML 페이지).
    });

    const html = typeof resp.data === "string" ? resp.data : String(resp.data);
    if (html.length < MIN_RESPONSE_BYTES) {
      return {
        status: "error",
        netFlow3d: 0,
        dailyFlows: [],
        detail: `Farside ${symbol} 응답 비정상 (${html.length} bytes)`,
      };
    }

    const flows = parseFarsideHtml(html);
    if (flows.length === 0) {
      return {
        status: "error",
        netFlow3d: 0,
        dailyFlows: [],
        detail: `Farside ${symbol} 파싱 결과 0행 (HTML 구조 변경 가능성)`,
      };
    }

    // 최신 3 거래일 합산.
    const last3 = flows.slice(-3);
    const netFlow3d = last3.reduce((sum, f) => sum + f.netFlow, 0);

    // 최근 5 거래일 (또는 가용한 만큼) 으로 dailyFlows 슬라이스.
    const last5 = flows.slice(-5);

    const result: FarsideFetchResult = {
      status: "ok",
      netFlow3d,
      dailyFlows: last5,
    };
    await writeCache(symbol, result);
    return result;
  } catch (err) {
    return {
      status: "error",
      netFlow3d: 0,
      dailyFlows: [],
      detail: `Farside ${symbol} 호출 실패: ${(err as Error).message ?? err}`,
    };
  }
}

// ─── ModifierResult 생성 ─────────────────────────────────────────────

/**
 * `OnchainModifierResult` 로 변환된 ETF Flow modifier.
 *
 * 호출 흐름:
 *   - BTC/ETH 외 → status="stub" (이 함수 호출 전 stub-modifiers 가 거름).
 *   - fetch error / parse 실패 → status="error", value=0.
 *   - 정상 → 임계값 적용된 value (-0.25 ~ +0.20).
 */
export async function computeFarsideEtfFlow(
  symbol: "BTCUSDT" | "ETHUSDT",
): Promise<OnchainModifierResult> {
  const data = await fetchFarsideEtfFlow(symbol);

  if (data.status === "error") {
    return {
      key: "etf_flow",
      value: 0,
      status: "error",
      detail: data.detail ?? `Farside ${symbol} 데이터 미가용`,
    };
  }

  const value = applyEtfFlowThreshold(data.netFlow3d);
  const sign3d = data.netFlow3d >= 0 ? "+" : "";
  const signV = value >= 0 ? "+" : "";

  return {
    key: "etf_flow",
    value,
    status: "ok",
    detail: `${symbol} 3d ETF flow ${sign3d}$${data.netFlow3d.toFixed(0)}M (${signV}${value.toFixed(2)})`,
    raw: {
      netFlow3dM: data.netFlow3d,
      dailyFlows: data.dailyFlows,
      provider: "farside",
    },
  };
}

// ─── 내부 export (테스트용) ──────────────────────────────────────────

export const __testing = {
  THRESHOLD_HIGH_M,
  THRESHOLD_LOW_M,
  MAX_POSITIVE,
  MAX_NEGATIVE,
  stripHtml,
  cacheFilePath,
};
