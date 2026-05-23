/**
 * Backtesting Runner — Main Orchestrator
 *
 * 1. 히스토리컬 데이터 수집 (data-loader)
 * 2. 시그널 추출 & outcome 측정 (signal-extractor)
 * 3. 통계 계산 (metrics)
 * 4. (선택) DB 저장
 * 5. BacktestResult 반환
 */

import type { BacktestConfig, BacktestResult, BacktestTrade, BacktestMetrics } from "./types";
import { DEFAULT_BACKTEST_CONFIG } from "./types";
import { fetchAllSymbolsHistorical } from "./data-loader";
import { extractAllSignals } from "./signal-extractor";
import {
  computeMetrics,
  computeMetricsBySymbol,
  computeMetricsByTf,
  computeMetricsBySide,
  classifySampleSufficiency,
  applyCostModel,
  DEFAULT_COST_MODEL,
} from "./metrics";
import { wilsonScoreInterval } from "./calibration";
import { auditNoLookahead, formatAuditSummary } from "./lookahead-auditor";

/**
 * Look-ahead bias 보장 (P1.G — DUAL_BACKTEST §1.3):
 *
 *   signal-extractor.ts 는 캔들 i 의 결정에 `candles[0..i]` 슬라이스만 사용.
 *   결과 측정은 `candles[i+1..i+window]` 만. 두 데이터 집합이 절대 섞이지
 *   않는다 (해당 파일 doc 참조).
 *
 *   2026-05-23 (P1-#1): `auditNoLookahead` 자동 호출 추가. Step 2 직후 모든
 *   trade 의 temporal monotonicity / candle alignment / holding consistency
 *   / partial-exits ordering 등을 검사하여 위반 시 console.error 출력 +
 *   결과에 `lookaheadAudit` 필드로 노출. strict 모드는 saveToDb 차단까지
 *   가능 (config.lookaheadAuditStrict).
 */

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

  let rawTrades: BacktestTrade[];
  if (config.strategy === "bbdx-combined") {
    // bbdx-combined (2026-05-15): LONG + SHORT 양쪽 extractor 호출하여 concat.
    //   sub-strategy 별 cooldown / signal 로직은 각자 독립 (signal-extractor
    //   의 lastSignalIdx 가 호출 단위로 분리됨 → LONG 의 cooldown 이 SHORT 진입을
    //   차단하지 않는다).
    console.log("   bbdx-combined: extracting LONG (bbdx)...");
    const longTrades = extractAllSignals(
      candleMap,
      { ...config, strategy: "bbdx" },
      (done, total, sym) => {
        process.stdout.write(`\r   [LONG ${done}/${total}] ${sym.padEnd(12)}`);
      },
    );
    console.log(`\n   bbdx-combined: extracting SHORT (bbdx-short)...`);
    const shortTrades = extractAllSignals(
      candleMap,
      { ...config, strategy: "bbdx-short" },
      (done, total, sym) => {
        process.stdout.write(`\r   [SHORT ${done}/${total}] ${sym.padEnd(12)}`);
      },
    );
    // signal-extractor 가 각 sub-call 내부에서 signalTs 기준 정렬을 보장하지만,
    // concat 후에는 LONG-block + SHORT-block 형태가 되어 시간순이 깨질 수 있다.
    // 다시 정렬하여 equity curve / MDD 계산이 정확하게 시간 순서대로 누적되도록.
    rawTrades = [...longTrades, ...shortTrades].sort(
      (a, b) => a.signalTs - b.signalTs,
    );
    console.log(
      `   bbdx-combined: LONG ${longTrades.length} + SHORT ${shortTrades.length} = ${rawTrades.length} signals`,
    );
  } else {
    rawTrades = extractAllSignals(
      candleMap,
      config,
      (done, total, sym) => {
        process.stdout.write(`\r   [${done}/${total}] ${sym.padEnd(12)}`);
      },
    );
  }
  console.log(`\n   Extracted ${rawTrades.length} signals`);

  // ── BACKTEST_DEFECT_AUDIT D1: cost-model 적용 ────────
  // signal-extractor 의 measureOutcomeTiered 가 반환하는 returnPct 는 raw —
  // 여기에서 round-trip fee + slippage 차감하여 trade.win/returnPct 갱신.
  const costModel = {
    fee_pct: config.feePct ?? DEFAULT_COST_MODEL.fee_pct,
    slippage_pct: config.slippagePct ?? DEFAULT_COST_MODEL.slippage_pct,
  };
  const trades: BacktestTrade[] = rawTrades.map((t) => {
    const adjusted = applyCostModel(t.returnPct, costModel);
    return {
      ...t,
      returnPct: adjusted,
      win: adjusted > 0,
    };
  });

  // ── Lookahead-free audit (P1-#1, 2026-05-23) ──────────
  // signal-extractor 가 구조적으로 lookahead-free 를 보장하나, 자동 검증으로
  // temporal monotonicity / candle alignment / holding consistency 확인.
  const auditResult = auditNoLookahead(trades, { endMs });
  console.log(`\n   ${formatAuditSummary(auditResult)}`);
  const lookaheadAudit = {
    passed: auditResult.passed,
    totalTrades: auditResult.totalTrades,
    violationCount: auditResult.violationCount,
    byKind: auditResult.byKind as Record<string, number>,
    sampleViolations: auditResult.violations.slice(0, 10),
  };
  if (!auditResult.passed) {
    console.error(
      `[Runner] ⚠ Lookahead audit detected ${auditResult.violationCount} violation(s). ` +
        `strict=${config.lookaheadAuditStrict ? "ON — saveToDb 차단" : "OFF — 경고만 출력"}`,
    );
  }

  // ── Step 3: 통계 계산 ────────────────────────────────
  console.log("\n▶ Step 3/3: Computing metrics...");
  const overall = computeMetrics(trades);
  const bySymbol = computeMetricsBySymbol(trades);
  const byTf = computeMetricsByTf(trades);

  // ── BACKTEST_DEFECT_AUDIT D2/D4: Wilson CI + sample sufficiency ──
  const ci = wilsonScoreInterval(overall.wins, overall.totalTrades);
  const overallCi = { lower: ci.lower, upper: ci.upper };
  const overallSampleSufficiency = classifySampleSufficiency(
    overall.totalTrades,
    overall.winRate,
  );

  const durationMs = Date.now() - wallStart;

  // ── bbdx-combined: metricsBySide 채우기 (LONG / SHORT 분리 + combined alias) ──
  // bySide.long.totalTrades === 0 이면 null 로 정규화 — 프론트가 빈 카드를 그리지
  // 않도록.
  let metricsBySide: BacktestResult["metricsBySide"] = undefined;
  if (config.strategy === "bbdx-combined") {
    const bySide = computeMetricsBySide(trades);
    const longMetrics: BacktestMetrics | null =
      bySide.long.totalTrades > 0 ? bySide.long : null;
    const shortMetrics: BacktestMetrics | null =
      bySide.short.totalTrades > 0 ? bySide.short : null;
    metricsBySide = {
      long: longMetrics,
      short: shortMetrics,
      combined: overall,
    };
  }

  const result: BacktestResult = {
    config,
    overall,
    bySymbol,
    byTf,
    trades,
    runAt: new Date().toISOString(),
    durationMs,
    overallCi,
    overallSampleSufficiency,
    appliedCostModel: {
      feePct: costModel.fee_pct,
      slippagePct: costModel.slippage_pct,
    },
    lookaheadAudit,
    ...(metricsBySide ? { metricsBySide } : {}),
  };

  // ── (옵션) DB 저장 ────────────────────────────────────
  // P1-#1: strict 모드일 때 lookahead audit 실패하면 saveToDb 차단.
  const shouldSave = config.saveToDb && (auditResult.passed || !config.lookaheadAuditStrict);
  if (config.saveToDb && !shouldSave) {
    console.warn(
      "[Runner] saveToDb 차단됨 — lookaheadAuditStrict=true 인데 audit 실패. " +
        "결과는 반환되나 DB 미저장.",
    );
  }
  if (shouldSave) {
    console.log("\n▶ Saving to database...");
    const runId = await saveRunToDb(result);
    if (runId) result.runId = runId;
  }

  const elapsed = (durationMs / 1000).toFixed(1);
  console.log(`\n✓ Backtest complete in ${elapsed}s`);
  console.log(`  Total trades: ${overall.totalTrades}`);
  console.log(
    `  Win rate: ${(overall.winRate * 100).toFixed(1)}% ` +
      `(95% CI ${(overallCi.lower * 100).toFixed(1)}~${(overallCi.upper * 100).toFixed(1)}%)`,
  );
  console.log(`  Avg return: ${overall.avgReturn.toFixed(2)}% (post fee+slippage)`);
  console.log(`  Sharpe: ${overall.sharpe.toFixed(3)}`);
  console.log(`  Max drawdown: ${overall.maxDrawdown.toFixed(2)}%`);
  console.log(`  Sample sufficiency: ${overallSampleSufficiency}`);
  console.log(
    `  Cost model: fee=${costModel.fee_pct} slippage=${costModel.slippage_pct} (round-trip)\n`,
  );

  return result;
}
