/**
 * Backtesting Runner — Main Orchestrator
 *
 * 1. 히스토리컬 데이터 수집 (data-loader)
 * 2. 시그널 추출 & outcome 측정 (signal-extractor)
 * 3. 통계 계산 (metrics)
 * 4. (선택) DB 저장
 * 5. BacktestResult 반환
 */

import type { BacktestConfig, BacktestResult, BacktestTrade } from "./types";
import { DEFAULT_BACKTEST_CONFIG } from "./types";
import { fetchAllSymbolsHistorical } from "./data-loader";
import { extractAllSignals } from "./signal-extractor";
import {
  computeMetrics,
  computeMetricsBySymbol,
  computeMetricsByTf,
} from "./metrics";

// ─── DB 저장 (옵션) ──────────────────────────────────────

async function saveRunToDb(
  result: BacktestResult
): Promise<number | undefined> {
  try {
    const { getDb } = await import("../db");
    const { backtestRuns, backtestTrades } = await import("../../drizzle/schema");
    const db = await getDb();
    if (!db) {
      console.warn("[Runner] DB not available, skipping save");
      return undefined;
    }

    const [run] = await db
      .insert(backtestRuns)
      .values({
        runName: result.config.runName ?? null,
        symbols: JSON.stringify(result.config.symbols),
        tf: result.config.tf,
        startDate: result.config.startDate,
        endDate: result.config.endDate,
        totalTrades: result.overall.totalTrades,
        winRate: result.overall.winRate,
        avgReturn: result.overall.avgReturn,
        sharpe: result.overall.sharpe,
        maxDrawdown: result.overall.maxDrawdown,
        profitFactor: result.overall.profitFactor,
        status: "complete",
        completedAt: new Date(),
      })
      .returning({ id: backtestRuns.id });

    const runId = run.id;

    // 개별 trade 저장 (배치 100개씩)
    if (result.trades.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < result.trades.length; i += BATCH) {
        const batch = result.trades.slice(i, i + BATCH);
        await db.insert(backtestTrades).values(
          batch.map((t) => ({
            runId,
            symbol: t.symbol,
            tf: t.tf,
            signalTs: t.signalTs,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            stopLoss: t.stopLoss,
            target: t.target,
            rsi: t.rsi,
            bbLower: t.bbLower,
            bbMiddle: t.bbMiddle,
            bbUpper: t.bbUpper,
            adx: t.adx,
            plusDi: t.plusDi,
            minusDi: t.minusDi,
            signalStrength: t.signalStrength,
            exitReason: t.exitReason,
            returnPct: t.returnPct,
            maxFavorable: t.maxFavorable,
            maxAdverse: t.maxAdverse,
            win: t.win,
            holdingCandles: t.holdingCandles,
          }))
        );
      }
    }

    console.log(`[Runner] Saved to DB: run_id=${runId}, trades=${result.trades.length}`);
    return runId;
  } catch (err: any) {
    console.error(`[Runner] DB save failed: ${err.message}`);
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────
// Main run function
// ─────────────────────────────────────────────────────────

export async function runBacktest(
  partialConfig: Partial<BacktestConfig> & {
    symbols: string[];
    startDate: Date;
    endDate: Date;
  }
): Promise<BacktestResult> {
  const config: BacktestConfig = {
    ...DEFAULT_BACKTEST_CONFIG,
    ...partialConfig,
  };

  const startMs = config.startDate.getTime();
  const endMs = config.endDate.getTime();
  const wallStart = Date.now();

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Tradelab Backtesting Engine");
  console.log(`  Run: ${config.runName ?? "unnamed"}`);
  console.log(`  Symbols: ${config.symbols.length}`);
  console.log(`  TF: ${config.tf}  |  Window: ${config.outcomeWindowCandles} candles`);
  console.log(`  Period: ${config.startDate.toISOString().slice(0, 10)} ~ ${config.endDate.toISOString().slice(0, 10)}`);
  console.log("═══════════════════════════════════════════════════\n");

  // ── Step 1: 데이터 수집 ──────────────────────────────
  console.log("▶ Step 1/3: Historical data loading...");
  const candleMap = await fetchAllSymbolsHistorical(
    config.symbols,
    config.tf,
    startMs,
    endMs,
    (done, total, sym) => {
      process.stdout.write(`\r   [${done}/${total}] ${sym.padEnd(12)}`);
    }
  );
  console.log(`\n   Loaded ${candleMap.size}/${config.symbols.length} symbols`);

  // ── Step 2: 시그널 추출 & 결과 측정 ─────────────────
  console.log("\n▶ Step 2/3: Signal extraction & outcome measurement...");
  const trades: BacktestTrade[] = extractAllSignals(
    candleMap,
    config,
    (done, total, sym) => {
      process.stdout.write(`\r   [${done}/${total}] ${sym.padEnd(12)}`);
    }
  );
  console.log(`\n   Extracted ${trades.length} signals`);

  // ── Step 3: 통계 계산 ────────────────────────────────
  console.log("\n▶ Step 3/3: Computing metrics...");
  const overall = computeMetrics(trades);
  const bySymbol = computeMetricsBySymbol(trades);
  const byTf = computeMetricsByTf(trades);

  const durationMs = Date.now() - wallStart;

  const result: BacktestResult = {
    config,
    overall,
    bySymbol,
    byTf,
    trades,
    runAt: new Date().toISOString(),
    durationMs,
  };

  // ── (옵션) DB 저장 ────────────────────────────────────
  if (config.saveToDb) {
    console.log("\n▶ Saving to database...");
    const runId = await saveRunToDb(result);
    if (runId) result.runId = runId;
  }

  const elapsed = (durationMs / 1000).toFixed(1);
  console.log(`\n✓ Backtest complete in ${elapsed}s`);
  console.log(`  Total trades: ${overall.totalTrades}`);
  console.log(`  Win rate: ${(overall.winRate * 100).toFixed(1)}%`);
  console.log(`  Avg return: ${overall.avgReturn.toFixed(2)}%`);
  console.log(`  Sharpe: ${overall.sharpe.toFixed(3)}`);
  console.log(`  Max drawdown: ${overall.maxDrawdown.toFixed(2)}%\n`);

  return result;
}
