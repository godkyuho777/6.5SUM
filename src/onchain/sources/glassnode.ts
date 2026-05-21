/**
 * Glassnode API 클라이언트 — Free tier 호환.
 *
 * 무료 등록: https://glassnode.com/ → Sign up → Free tier
 * 환경변수: GLASSNODE_API_KEY
 * Rate limit: 무료 tier 분 단위 제한 (관대함, BTC/ETH 한정 metric).
 *
 * 사용 metric:
 *   - 'supply/lth_sum' (Long-Term Holder Supply, 누적 코인 수)
 *   - 'supply/lth_net_change' (LTH 30d 변화, 비교용)
 *
 * 응답 shape (Glassnode 공식 — 안정적):
 *   [{ t: 1716163200, v: 14523456.78 }, ...]
 *   - t = Unix seconds
 *   - v = metric value (float)
 *
 * Graceful error:
 *   - 키 미설정 → status: "stub", data: []
 *   - 네트워크/HTTP/파싱 실패 → status: "error", data: []
 */

import axios from "axios";

// ─── 상수 ─────────────────────────────────────────────────────────────

const GLASSNODE_API_BASE = "https://api.glassnode.com/v1/metrics";
const REQUEST_TIMEOUT_MS = 10_000;

// ─── 타입 ─────────────────────────────────────────────────────────────

export interface GlassnodeDataPoint {
  /** Unix timestamp (seconds). */
  t: number;
  /** Metric value. */
  v: number;
}

export type GlassnodeMetric =
  | "supply/lth_sum"
  | "supply/lth_net_change";

export type GlassnodeAsset = "BTC" | "ETH";

export interface GlassnodeFetchResult {
  status: "ok" | "stub" | "error";
  data: GlassnodeDataPoint[];
  detail?: string;
}

// ─── 메인 fetcher ────────────────────────────────────────────────────

/**
 * Glassnode Free API 호출 — 24h cadence metric 시계열.
 *
 * @param metric  metric 경로 (e.g., "supply/lth_sum")
 * @param asset   "BTC" 또는 "ETH" (Free tier 대응 자산)
 * @param windowDays  최근 며칠치 데이터 (기본 30)
 *
 * 키 미설정 시 graceful stub. 네트워크/파싱 실패도 graceful (throw X).
 */
export async function fetchGlassnode(
  metric: GlassnodeMetric,
  asset: GlassnodeAsset = "BTC",
  windowDays: number = 30,
): Promise<GlassnodeFetchResult> {
  const apiKey = process.env.GLASSNODE_API_KEY;
  if (!apiKey) {
    return {
      status: "stub",
      data: [],
      detail: "GLASSNODE_API_KEY 미설정",
    };
  }

  const since = Math.floor(Date.now() / 1000) - windowDays * 86_400;
  const url = `${GLASSNODE_API_BASE}/${metric}`;
  try {
    const res = await axios.get(url, {
      params: {
        api_key: apiKey,
        a: asset,
        s: since,
        i: "24h",
      },
      timeout: REQUEST_TIMEOUT_MS,
      headers: { "User-Agent": "tradelab-onchain/1.0" },
    });

    // Glassnode 응답은 top-level array.
    const rawRows: unknown[] = Array.isArray(res.data) ? res.data : [];
    const data: GlassnodeDataPoint[] = rawRows
      .map(parseRow)
      .filter((d): d is GlassnodeDataPoint => d !== null);

    return { status: "ok", data };
  } catch (err) {
    const msg = (err as Error)?.message ?? "fetch failed";
    return {
      status: "error",
      data: [],
      detail: `Glassnode ${metric}/${asset} 호출 실패: ${msg}`,
    };
  }
}

// ─── Helper ──────────────────────────────────────────────────────────

/**
 * 한 행을 best-effort 파싱. Glassnode 표준 shape `{ t, v }`.
 *
 * @internal — 테스트용 export.
 */
export function parseRow(row: unknown): GlassnodeDataPoint | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  const t =
    typeof r.t === "number"
      ? r.t
      : typeof r.t === "string"
        ? parseInt(r.t, 10)
        : NaN;
  if (!Number.isFinite(t)) return null;

  const v =
    typeof r.v === "number"
      ? r.v
      : typeof r.v === "string"
        ? parseFloat(r.v)
        : NaN;
  if (!Number.isFinite(v)) return null;

  return { t, v };
}

// ─── 테스트 export ───────────────────────────────────────────────────

export const __testing = { GLASSNODE_API_BASE, REQUEST_TIMEOUT_MS, parseRow };
