/**
 * FRED API client — dual-mode (realtime + ALFRED for backtest).
 *
 * MACRO_LIQUIDITY_TRACKER_v2 §2.1-2.2:
 *   - `mode="realtime"` → 일반 FRED endpoint, 현재 시점 데이터.
 *   - `mode="backtest"` → ALFRED 강제. `realtime_start/end` 파라미터로
 *     "그 시점에 알려졌던 값" (vintage) 만 조회. Look-ahead bias 차단의
 *     근거. realtimeStart 누락 시 throw.
 *
 * Stub-first 정책 (CLAUDE.md):
 *   - `FRED_API_KEY` 미설정 → `{ status: "stub", observations: [] }` 반환.
 *     절대 throw 하지 않음 — 호출자 (liquidity, timeline-builder) 가
 *     graceful fallback 으로 처리.
 *
 * 캐시:
 *   - 디스크: `.macro-cache/{seriesId}-{mode}-{start}-{end}.json`
 *   - TTL 차등: realtime 12h, backtest 영구 (vintage 는 변하지 않음)
 *
 * Rate limit: 분당 100 (FRED 무료 tier 한도) — 본 모듈은 호출 횟수만
 * 카운트, 외부 limiter 와 결합 가능.
 */

import axios from "axios";
import { promises as fs } from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type FredMode = "realtime" | "backtest";

export interface FredObservation {
  /** Observation date (ISO YYYY-MM-DD). */
  date: string;
  /** Observed value (NaN if FRED returns "."). */
  value: number;
  /**
   * Realtime period start (ALFRED 만 채워짐). 백테스트 모드에서
   * release_ts 계산에 사용.
   */
  realtimeStart?: string;
  /** Realtime period end (ALFRED 만 채워짐). */
  realtimeEnd?: string;
}

export interface FredFetchOpts {
  seriesId: string;
  mode: FredMode;
  /** ALFRED 필수. "YYYY-MM-DD". */
  realtimeStart?: string;
  /** ALFRED 필수. "YYYY-MM-DD". */
  realtimeEnd?: string;
  /** observation 범위 (옵션). */
  observationStart?: string;
  observationEnd?: string;
  /** 캐시 비활성화 (테스트용). */
  disableCache?: boolean;
}

export type FredFetchStatus = "ok" | "stub" | "error";

export interface FredFetchResult {
  status: FredFetchStatus;
  /** ok 시 채워짐. stub/error 시 빈 배열. */
  observations: FredObservation[];
  /** error 시 메시지. */
  detail?: string;
  /** 캐시 hit 여부 (관측용). */
  cacheHit?: boolean;
}

// ─────────────────────────────────────────────────────────
// Legacy compatibility — keep old `fetchFredSeries` shape
// ─────────────────────────────────────────────────────────

export interface FredSeriesSnapshot {
  seriesId: string;
  value: number;
  date: string;
}

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_DIR = ".macro-cache";
const REALTIME_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const REQUEST_TIMEOUT_MS = 15_000;

// ─────────────────────────────────────────────────────────
// Cache helpers (disk-based, mode-aware TTL)
// ─────────────────────────────────────────────────────────

function cacheKey(opts: FredFetchOpts): string {
  const parts = [
    opts.seriesId,
    opts.mode,
    opts.realtimeStart ?? "",
    opts.realtimeEnd ?? "",
    opts.observationStart ?? "",
    opts.observationEnd ?? "",
  ];
  // sanitize for filesystem
  return parts.join("_").replace(/[^a-zA-Z0-9_-]/g, "");
}

async function readCache(opts: FredFetchOpts): Promise<FredFetchResult | null> {
  try {
    const file = path.join(CACHE_DIR, `${cacheKey(opts)}.json`);
    const stat = await fs.stat(file);
    // realtime TTL 검사 — backtest 는 무기한 (vintage 데이터 불변)
    if (opts.mode === "realtime") {
      const age = Date.now() - stat.mtimeMs;
      if (age > REALTIME_TTL_MS) return null;
    }
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as FredFetchResult;
    return { ...parsed, cacheHit: true };
  } catch {
    return null;
  }
}

async function writeCache(
  opts: FredFetchOpts,
  result: FredFetchResult,
): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, `${cacheKey(opts)}.json`);
    await fs.writeFile(file, JSON.stringify(result), "utf-8");
  } catch (err) {
    // cache write 실패는 silent — 정상 흐름 유지
    console.warn(
      `[fred] cache write failed: ${(err as Error).message ?? "unknown"}`,
    );
  }
}

// ─────────────────────────────────────────────────────────
// Main fetcher
// ─────────────────────────────────────────────────────────

/**
 * FRED / ALFRED observations 호출.
 *
 * @throws ALFRED 모드에서 `realtimeStart` 누락 시 → look-ahead 차단 강제.
 * @returns graceful `FredFetchResult` (API key 없거나 네트워크 실패해도 throw X).
 */
export async function fetchFred(opts: FredFetchOpts): Promise<FredFetchResult> {
  // ── ALFRED look-ahead 차단 강제 ──────────────────────
  if (opts.mode === "backtest" && !opts.realtimeStart) {
    throw new Error(
      "[fred] ALFRED mode requires realtimeStart (YYYY-MM-DD) to prevent look-ahead bias",
    );
  }

  // ── API key 검사 (graceful stub) ─────────────────────
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return { status: "stub", observations: [] };
  }

  // ── 캐시 조회 ─────────────────────────────────────────
  if (!opts.disableCache) {
    const cached = await readCache(opts);
    if (cached) return cached;
  }

  // ── 파라미터 구성 ─────────────────────────────────────
  const params: Record<string, string> = {
    series_id: opts.seriesId,
    api_key: apiKey,
    file_type: "json",
  };
  if (opts.mode === "backtest") {
    params.realtime_start = opts.realtimeStart!;
    params.realtime_end = opts.realtimeEnd ?? opts.realtimeStart!;
  }
  if (opts.observationStart) params.observation_start = opts.observationStart;
  if (opts.observationEnd) params.observation_end = opts.observationEnd;

  // ── HTTP 호출 with try/catch (graceful error) ────────
  try {
    const res = await axios.get(FRED_API_BASE, {
      params,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const raw = res.data?.observations ?? [];
    const observations: FredObservation[] = raw.map((o: any) => ({
      date: o.date,
      value: o.value === "." ? Number.NaN : parseFloat(o.value),
      realtimeStart: o.realtime_start,
      realtimeEnd: o.realtime_end,
    }));
    const result: FredFetchResult = { status: "ok", observations };
    if (!opts.disableCache) await writeCache(opts, result);
    return result;
  } catch (err: any) {
    const detail = err?.message ?? "unknown error";
    console.warn(`[fred] fetch failed (${opts.seriesId}): ${detail}`);
    return { status: "error", observations: [], detail };
  }
}

// ─────────────────────────────────────────────────────────
// Legacy convenience wrapper (kept for backwards compat)
// ─────────────────────────────────────────────────────────

/**
 * @deprecated Use `fetchFred({ seriesId, mode: "realtime" })` directly.
 * 본 wrapper 는 기존 (sources/fred.ts → liquidity.ts) 호출 시그니처를 위해 유지.
 */
export async function fetchFredSeries(
  seriesId: string,
): Promise<FredSeriesSnapshot | null> {
  const r = await fetchFred({ seriesId, mode: "realtime" });
  if (r.status !== "ok" || r.observations.length === 0) return null;
  // 가장 최신 valid observation
  const valid = r.observations.filter((o) => !Number.isNaN(o.value));
  if (valid.length === 0) return null;
  const latest = valid[valid.length - 1];
  return { seriesId, value: latest.value, date: latest.date };
}
