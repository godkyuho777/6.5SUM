/**
 * BOK ECOS API client — MACRO_LIQUIDITY_TRACKER_v2 §2.3.
 *
 * Base URL: `https://ecos.bok.or.kr/api/`
 *
 * Supported series:
 *   - 722Y001: BOK 기준금리 (월별)
 *   - 731Y004: 원-달러 환율 (일별)
 *   - 901Y009: 한국 CPI (월별)
 *
 * Fallback policy (BOK_API_KEY 미설정 시):
 *   - 환율 (731Y004) → Yahoo Finance KRW=X (free, no key)
 *   - 나머지 (722Y001, 901Y009) → `{ status: "stub", values: [] }`
 *
 * Stub-first (CLAUDE.md):
 *   - 절대 throw X. 네트워크/API 실패 시 status="error" 반환.
 *   - 캐시: `.macro-cache/bok-{statCode}-{startDate}-{endDate}.json`, TTL 12h.
 */

import axios from "axios";
import { promises as fs } from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type BokStatCode = "722Y001" | "731Y004" | "901Y009";

export interface BokDataPoint {
  /** Observation date — ISO YYYY-MM-DD. */
  date: string;
  /** Observed value. NaN if BOK returned null/blank. */
  value: number;
}

export type BokFetchStatus = "ok" | "stub" | "fallback" | "error";

export interface BokFetchResult {
  status: BokFetchStatus;
  values: BokDataPoint[];
  /** "yahoo" | "bok" | undefined */
  source?: string;
  detail?: string;
  cacheHit?: boolean;
}

export interface BokFetchOpts {
  statCode: BokStatCode;
  /** ISO YYYY-MM-DD. */
  startDate: string;
  /** ISO YYYY-MM-DD. */
  endDate: string;
  disableCache?: boolean;
}

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const BOK_BASE = "https://ecos.bok.or.kr/api/StatisticSearch";
const CACHE_DIR = ".macro-cache";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

/** BOK 통계마다 cycle code (월/일) 가 다름 — API 가 의존. */
const STAT_CYCLE: Record<BokStatCode, "M" | "D"> = {
  "722Y001": "M",
  "731Y004": "D",
  "901Y009": "M",
};

// ─────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────

function cacheKey(opts: BokFetchOpts): string {
  return `bok-${opts.statCode}-${opts.startDate}-${opts.endDate}`.replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );
}

async function readCache(opts: BokFetchOpts): Promise<BokFetchResult | null> {
  try {
    const file = path.join(CACHE_DIR, `${cacheKey(opts)}.json`);
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    const raw = await fs.readFile(file, "utf-8");
    return { ...(JSON.parse(raw) as BokFetchResult), cacheHit: true };
  } catch {
    return null;
  }
}

async function writeCache(
  opts: BokFetchOpts,
  result: BokFetchResult,
): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, `${cacheKey(opts)}.json`);
    await fs.writeFile(file, JSON.stringify(result), "utf-8");
  } catch (err) {
    console.warn(`[bok] cache write failed: ${(err as Error).message}`);
  }
}

// ─────────────────────────────────────────────────────────
// Date conversion helpers
// ─────────────────────────────────────────────────────────

/** ISO YYYY-MM-DD → BOK 형식: 일별="YYYYMMDD", 월별="YYYYMM". */
function toBokDateFormat(iso: string, cycle: "M" | "D"): string {
  const clean = iso.replace(/-/g, "");
  return cycle === "M" ? clean.slice(0, 6) : clean;
}

/** BOK 응답 날짜 → ISO YYYY-MM-DD. */
function fromBokDate(bokDate: string, cycle: "M" | "D"): string {
  if (cycle === "M") {
    return `${bokDate.slice(0, 4)}-${bokDate.slice(4, 6)}-01`;
  }
  return `${bokDate.slice(0, 4)}-${bokDate.slice(4, 6)}-${bokDate.slice(6, 8)}`;
}

// ─────────────────────────────────────────────────────────
// Yahoo Finance KRW=X fallback
// ─────────────────────────────────────────────────────────

/**
 * KRW/USD 일별 데이터 — Yahoo Finance (key 불필요).
 * BOK_API_KEY 미설정 시 731Y004 대체용.
 */
async function fetchYahooKrwUsd(
  startDate: string,
  endDate: string,
): Promise<BokFetchResult> {
  try {
    const p1 = Math.floor(new Date(startDate).getTime() / 1000);
    const p2 = Math.floor(new Date(endDate).getTime() / 1000);
    // chart endpoint 는 key 불필요, JSON
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/KRW=X`;
    const res = await axios.get(url, {
      params: {
        period1: p1,
        period2: p2,
        interval: "1d",
      },
      timeout: REQUEST_TIMEOUT_MS,
    });
    const result = res.data?.chart?.result?.[0];
    if (!result) {
      return { status: "error", values: [], detail: "no chart result" };
    }
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] =
      result.indicators?.quote?.[0]?.close ?? [];
    const values: BokDataPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i] * 1000;
      const close = closes[i];
      if (close == null) continue;
      values.push({
        date: new Date(ts).toISOString().slice(0, 10),
        value: close,
      });
    }
    return { status: "fallback", source: "yahoo", values };
  } catch (err) {
    const detail = (err as Error).message ?? "unknown";
    console.warn(`[bok/yahoo-fallback] failed: ${detail}`);
    return { status: "error", values: [], detail };
  }
}

// ─────────────────────────────────────────────────────────
// Main fetcher
// ─────────────────────────────────────────────────────────

/**
 * BOK ECOS 통계 fetch. graceful — 절대 throw X.
 *
 * @returns
 *   - `{ status: "ok",     values: [...] }`           — BOK API 정상
 *   - `{ status: "fallback", source: "yahoo", values: [...] }` — KRW=X 대체
 *   - `{ status: "stub",   values: [] }`              — key 없고 fallback 도 없음
 *   - `{ status: "error",  values: [], detail }`      — 네트워크/파싱 실패
 */
export async function fetchBOK(opts: BokFetchOpts): Promise<BokFetchResult> {
  if (!opts.disableCache) {
    const cached = await readCache(opts);
    if (cached) return cached;
  }

  const apiKey = process.env.BOK_API_KEY;

  // ── API key 없음 → fallback ──────────────────────────
  if (!apiKey) {
    if (opts.statCode === "731Y004") {
      const r = await fetchYahooKrwUsd(opts.startDate, opts.endDate);
      if (!opts.disableCache && r.status !== "error") await writeCache(opts, r);
      return r;
    }
    return { status: "stub", values: [] };
  }

  // ── BOK API 호출 ─────────────────────────────────────
  try {
    const cycle = STAT_CYCLE[opts.statCode];
    const start = toBokDateFormat(opts.startDate, cycle);
    const end = toBokDateFormat(opts.endDate, cycle);
    // BOK URL 형식: /StatisticSearch/{api_key}/json/kr/1/1000/{statCode}/{cycle}/{start}/{end}
    const url = `${BOK_BASE}/${apiKey}/json/kr/1/10000/${opts.statCode}/${cycle}/${start}/${end}`;
    const res = await axios.get(url, { timeout: REQUEST_TIMEOUT_MS });

    // BOK 응답 형식: { StatisticSearch: { row: [...], ... } } 또는 에러 시 { RESULT: { CODE, MESSAGE } }
    const body = res.data;
    if (body?.RESULT?.CODE && body.RESULT.CODE !== "INFO-000") {
      return {
        status: "error",
        values: [],
        detail: `BOK ${body.RESULT.CODE}: ${body.RESULT.MESSAGE}`,
      };
    }
    const rows: Array<{ TIME: string; DATA_VALUE: string }> =
      body?.StatisticSearch?.row ?? [];
    const values: BokDataPoint[] = rows.map((r) => ({
      date: fromBokDate(r.TIME, cycle),
      value: r.DATA_VALUE === "" ? Number.NaN : parseFloat(r.DATA_VALUE),
    }));
    const result: BokFetchResult = { status: "ok", source: "bok", values };
    if (!opts.disableCache) await writeCache(opts, result);
    return result;
  } catch (err) {
    const detail = (err as Error).message ?? "unknown";
    console.warn(`[bok] fetch failed (${opts.statCode}): ${detail}`);
    return { status: "error", values: [], detail };
  }
}

// ─────────────────────────────────────────────────────────
// Convenience: legacy alias matching prompt naming
// ─────────────────────────────────────────────────────────

/**
 * Prompt 명세 호환 alias.
 * 호출자는 `fetchBOK` 또는 본 함수 둘 다 사용 가능.
 */
export async function fetchBOKSeries(
  statCode: BokStatCode,
  startDate: string,
  endDate: string,
): Promise<BokDataPoint[]> {
  const r = await fetchBOK({ statCode, startDate, endDate });
  return r.values;
}
