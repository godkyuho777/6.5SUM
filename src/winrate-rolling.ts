/**
 * Rolling Win-Rate — backtest 결과 기반 N일 윈도우 + Wilson 95% CI
 *
 * CoinDetail 워크스테이션의 우상단 패널 ("최근 30/90/365일 승률") 백엔드.
 *
 * 데이터 소스:
 *   - 첫 호출 시: 즉석 backtest 실행 (max(windows)일 만큼 과거 데이터)
 *   - 결과 1시간 in-memory 캐시 (lru-cache 미사용 — 단순 Map + ttl)
 *
 * Wilson 95% CI 공식:
 *   center = (p + z²/(2n)) / (1 + z²/n)
 *   margin = (z × sqrt(p(1-p)/n + z²/(4n²))) / (1 + z²/n)
 *   z      = 1.96
 *   low    = clamp(center - margin, 0, 1)
 *   high   = clamp(center + margin, 0, 1)
 */

import type { TimeframeValue } from "./shared/types";
import type { BacktestTrade } from "./backtest/types";

const Z_95 = 1.96;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

export interface WindowStat {
  days: number;
  trades: number;
  winRate: number; // 0~1
  wilsonLow: number; // 0~1
  wilsonHigh: number; // 0~1
}

export interface RollingWinRateResult {
  symbol: string;
  tf: TimeframeValue;
  windows: WindowStat[];
  computedAt: string;
  /** "real" = backtest 결과 기반, "stub" = backtest 데이터 없음 */
  status: "real" | "stub" | "error";
  detail?: string;
}

interface CacheEntry {
  result: RollingWinRateResult;
  ts: number;
}

const CACHE = new Map<string, CacheEntry>();

function cacheKey(symbol: string, tf: TimeframeValue, windows: number[]): string {
  return `${symbol}|${tf}|${windows.slice().sort((a, b) => a - b).join(",")}`;
}

/** Wilson 95% CI 양 끝값 반환. n=0 이면 [0, 1]. */
export function wilsonInterval(wins: number, n: number): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const p = wins / n;
  const z = Z_95;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    low: Math.max(0, Math.min(1, center - margin)),
    high: Math.max(0, Math.min(1, center + margin)),
  };
}

function summarizeWindow(trades: BacktestTrade[], days: number, nowMs: number): WindowStat {
  const cutoff = nowMs - days * 86400 * 1000;
  const inWindow = trades.filter((t) => t.signalTs >= cutoff);
  const wins = inWindow.filter((t) => t.win).length;
  const n = inWindow.length;
  const winRate = n > 0 ? wins / n : 0;
  const { low, high } = wilsonInterval(wins, n);
  return {
    days,
    trades: n,
    winRate,
    wilsonLow: low,
    wilsonHigh: high,
  };
}

/**
 * 단일 symbol 의 rolling win-rate 계산.
 * 캐시 미스 시 즉석 backtest 실행 (max(windows)일 만큼 과거).
 *
 * 외부 데이터 의존이 있으므로 try/catch 격리. 실패 시 status="error" 반환.
 */
export async function computeRollingWinRate(input: {
  symbol: string;
  tf: TimeframeValue;
  windows: number[];
}): Promise<RollingWinRateResult> {
  const symbol = input.symbol.toUpperCase();
  const windows = input.windows.slice().sort((a, b) => a - b);
  const key = cacheKey(symbol, input.tf, windows);
  const computedAt = new Date().toISOString();

  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached.result, computedAt };
  }

  const maxDays = Math.max(...windows);
  const now = Date.now();
  const startDate = new Date(now - maxDays * 86400 * 1000);
  const endDate = new Date(now);

  try {
    const { runBacktest } = await import("./backtest/runner");
    const result = await runBacktest({
      symbols: [symbol],
      tf: input.tf,
      startDate,
      endDate,
      saveToDb: false,
    });

    if (result.trades.length === 0) {
      const stub: RollingWinRateResult = {
        symbol,
        tf: input.tf,
        windows: windows.map((d) => ({
          days: d,
          trades: 0,
          winRate: 0,
          wilsonLow: 0,
          wilsonHigh: 1,
        })),
        computedAt,
        status: "stub",
        detail: "backtest 결과 없음 (데이터 부족 또는 시그널 미발생)",
      };
      CACHE.set(key, { result: stub, ts: Date.now() });
      return stub;
    }

    const stats = windows.map((d) => summarizeWindow(result.trades, d, now));
    const realResult: RollingWinRateResult = {
      symbol,
      tf: input.tf,
      windows: stats,
      computedAt,
      status: "real",
    };
    CACHE.set(key, { result: realResult, ts: Date.now() });
    return realResult;
  } catch (err: any) {
    return {
      symbol,
      tf: input.tf,
      windows: windows.map((d) => ({
        days: d,
        trades: 0,
        winRate: 0,
        wilsonLow: 0,
        wilsonHigh: 1,
      })),
      computedAt,
      status: "error",
      detail: `Rolling win-rate 계산 실패: ${err?.message ?? err}`,
    };
  }
}

/** 테스트용 — Wilson 공식 단독 검증. */
export const __testing = { wilsonInterval, summarizeWindow };
