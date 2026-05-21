/**
 * CryptoQuant API 클라이언트 — Free tier 호환.
 *
 * 무료 등록: https://www.cryptoquant.com/ → Sign up → Free plan
 * 환경변수: CRYPTOQUANT_API_KEY
 * Rate limit: 무료 tier 60 req/min (관대함)
 *
 * 사용 시리즈:
 *   - 'btc/exchange-flows/netflow' (Exchange Netflow)
 *   - 'btc/miner-flows/outflow' (Miner Outflow)
 *
 * 응답 shape 가정 (Free tier — 사용자가 키 발급 후 첫 호출 시 console.log
 * 로 검증 필요):
 *   { result: { data: [{ date: "2026-05-21", value: 1234.5 }, ...] } }
 * 또는 (대안):
 *   { result: { data: [{ timestamp: "2026-05-21T00:00:00Z",
 *                        net_flow: 1234.5 | outflow: 5678.9 }, ...] } }
 * → fetchCryptoQuant 가 두 형식 모두 best-effort 파싱.
 *
 * Graceful error:
 *   - 키 미설정 → status: "stub", data: []
 *   - 네트워크/HTTP/파싱 실패 → status: "error", data: []
 */

import axios from "axios";

// ─── 상수 ─────────────────────────────────────────────────────────────

const CQ_API_BASE = "https://api.cryptoquant.com/v1";
const REQUEST_TIMEOUT_MS = 10_000;

// ─── 타입 ─────────────────────────────────────────────────────────────

export interface CryptoQuantDataPoint {
  /** YYYY-MM-DD ISO date (UTC). */
  date: string;
  /** 시리즈별 raw value (BTC 단위 netflow/outflow). */
  value: number;
}

export type CryptoQuantSeries =
  | "btc/exchange-flows/netflow"
  | "btc/miner-flows/outflow";

export interface CryptoQuantFetchResult {
  status: "ok" | "stub" | "error";
  data: CryptoQuantDataPoint[];
  detail?: string;
}

// ─── 메인 fetcher ────────────────────────────────────────────────────

/**
 * CryptoQuant Free API 호출 — 지정된 시리즈의 day-cadence 데이터 반환.
 *
 * @param series  시리즈 식별자 (e.g., "btc/exchange-flows/netflow")
 * @param windowDays  최근 며칠치 데이터 (기본 30)
 *
 * 응답 파싱 전략 (Free tier shape 변동성 대응):
 *   - `res.data.result.data` 배열 우선
 *   - 각 행은 `date` (또는 `timestamp` 의 first 10 chars) 와
 *     `value` (또는 `net_flow` / `outflow`) 둘 다 탐색
 *   - 파싱 실패 행은 skip (예외 throw X)
 */
export async function fetchCryptoQuant(
  series: CryptoQuantSeries,
  windowDays: number = 30,
): Promise<CryptoQuantFetchResult> {
  const apiKey = process.env.CRYPTOQUANT_API_KEY;
  if (!apiKey) {
    return {
      status: "stub",
      data: [],
      detail: "CRYPTOQUANT_API_KEY 미설정",
    };
  }

  const url = `${CQ_API_BASE}/${series}`;
  try {
    const res = await axios.get(url, {
      params: {
        api_key: apiKey,
        window: "day",
        limit: windowDays,
      },
      timeout: REQUEST_TIMEOUT_MS,
      headers: { "User-Agent": "tradelab-onchain/1.0" },
    });

    // 응답 shape 변동성 대응 — 두 가지 best-effort 키 조합 모두 시도.
    // 사용자 첫 호출 시 console.log(res.data) 로 실제 shape 확인 후 조정 권고.
    const rawRows: unknown[] =
      (res.data?.result?.data as unknown[]) ??
      (res.data?.data as unknown[]) ??
      [];

    const data: CryptoQuantDataPoint[] = rawRows
      .map((row) => parseRow(row, series))
      .filter((d): d is CryptoQuantDataPoint => d !== null);

    return { status: "ok", data };
  } catch (err) {
    const msg = (err as Error)?.message ?? "fetch failed";
    return {
      status: "error",
      data: [],
      detail: `CryptoQuant ${series} 호출 실패: ${msg}`,
    };
  }
}

// ─── Helper ──────────────────────────────────────────────────────────

/**
 * 한 행을 best-effort 파싱. 다양한 필드명 변형 모두 시도.
 *
 * @internal — 테스트용 export.
 */
export function parseRow(
  row: unknown,
  series: CryptoQuantSeries,
): CryptoQuantDataPoint | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  // date 추출 — date 필드 우선, 없으면 timestamp 의 ISO 날짜부.
  const rawDate =
    (typeof r.date === "string" ? r.date : null) ??
    (typeof r.timestamp === "string"
      ? r.timestamp.slice(0, 10)
      : null) ??
    null;
  if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return null;

  // value 추출 — 시리즈에 맞는 필드명 우선, 없으면 generic `value`.
  let rawValue: unknown;
  if (series === "btc/exchange-flows/netflow") {
    rawValue = r.net_flow ?? r.netflow ?? r.value;
  } else if (series === "btc/miner-flows/outflow") {
    rawValue = r.outflow ?? r.miner_outflow ?? r.value;
  } else {
    rawValue = r.value;
  }

  const parsed =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? parseFloat(rawValue)
        : NaN;
  if (!Number.isFinite(parsed)) return null;

  return { date: rawDate, value: parsed };
}

// ─── 테스트 export ───────────────────────────────────────────────────

export const __testing = { CQ_API_BASE, REQUEST_TIMEOUT_MS, parseRow };
