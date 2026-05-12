#!/usr/bin/env tsx
/**
 * v6.5 vs v6.6 백테스트 비교 CLI.
 *
 * 실행:
 *   pnpm tsx src/backtest/cli-compare-v65-v66.ts
 *   또는 package.json script: `pnpm backtest:compare`
 *
 * 절차:
 *   1. 각 (symbol, tf) 별 Bybit kline fetch
 *   2. v6.5 default weights (BBDX strategy) 로 백테스트 (기존 runner)
 *   3. v6.6 calibrated weights 로 가설적 비교:
 *      - 같은 trade list 의 base_strength 를 calibrated weights 로 재계산
 *      - threshold 기반 filter 가 winRate 에 미친 영향 추정
 *   4. SHORT 도 같이 백테스트 (bbdx-short strategy)
 *   5. 결과를 reports/v65-vs-v66-{symbol}-{tf}.json 저장 + 콘솔 표 출력
 *
 * 실제 데이터 fetch + 백테스트 결과는 사용자가 직접 실행 (Bybit rate limit 분산).
 * 본 스크립트는 인프라만 제공.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runBacktest } from "./runner";
import { wilsonScoreInterval } from "./calibration";
import {
  getWeightsForSignal,
  getThresholdForSignal,
} from "../strategies/weight-calibration";
import type { BacktestTrade } from "./types";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const TFS = ["4h", "1d"] as const;
const DAYS = 365;

interface ComparisonRow {
  symbol: string;
  tf: string;
  side: "long" | "short";
  version: "v6.5" | "v6.6";
  totalTrades: number;
  winRate: number;
  winRateCi: { lower: number; upper: number };
  avgReturn: number;
  mdd: number;
  sharpe: number;
  profitFactor: number;
  thresholdUsed: number | null;
  thresholdSource: string | null;
  weightsSource: string | null;
}

interface ComparisonReport {
  generatedAt: string;
  symbol: string;
  tf: string;
  rows: ComparisonRow[];
  notes: string[];
}

function ensureReportsDir(): string {
  const dir = join(process.cwd(), "reports");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * v6.5 trade list 를 v6.6 calibrated weights 로 재평가.
 *
 * 가설적 비교 — trade 의 raw indicators (rsi, adx, bb*, patternConfluenceScore)
 * 가 있으므로 5 카테고리 점수 재계산 → calibrated weights 로 base_strength
 * 재산출 → threshold 적용 → 통과한 trades 만 retain.
 */
async function reevaluateWithCalibratedWeights(
  trades: BacktestTrade[],
  symbol: string,
  tf: string,
  side: "long" | "short",
): Promise<{
  filtered: BacktestTrade[];
  thresholdUsed: number;
  thresholdSource: string;
  weightsSource: string;
}> {
  const threshold = await getThresholdForSignal({ symbol, tf, side });

  const filtered: BacktestTrade[] = [];
  let weightsSourceSeen = "default";

  for (const t of trades) {
    // path 추론 (entryReasons 의 첫 줄에 "path: NUM/PTN/BB")
    let path: "NUM" | "PTN" | "BB" = "BB";
    const pathReason = t.entryReasons?.find((r) => /path[:\s]+(NUM|PTN|BB)/i.test(r));
    if (pathReason) {
      const m = pathReason.match(/(NUM|PTN|BB)/i);
      if (m) path = m[1].toUpperCase() as typeof path;
    }

    const weights = await getWeightsForSignal({ symbol, tf, path, side });
    weightsSourceSeen = weights.source;

    // 5 카테고리 점수 추정 (간이 — trade 의 raw indicators 기반)
    const rsiNorm = side === "long" ? (38 - t.rsi) / 13 : (t.rsi - 62) / 13;
    const momentum = Math.max(0, Math.min(1, rsiNorm));
    const bbRange = t.bbUpper - t.bbLower;
    const position =
      bbRange > 0
        ? side === "long"
          ? Math.max(0, Math.min(1, 1 - (t.entryPrice - t.bbLower) / bbRange))
          : Math.max(0, Math.min(1, (t.entryPrice - t.bbLower) / bbRange))
        : 0;
    const trend = Math.max(0, Math.min(1, 1 - t.adx / 40));
    const volume = 0.5; // raw trade 에 volRatio 미저장 — 중립
    const action = t.patternConfluenceScore ?? 0;

    const baseStrength =
      (weights.weights.momentum * momentum +
        weights.weights.position * position +
        weights.weights.trend * trend +
        weights.weights.volume * volume +
        weights.weights.action * action) *
      100;

    if (baseStrength >= threshold.threshold) {
      filtered.push(t);
    }
  }

  return {
    filtered,
    thresholdUsed: threshold.threshold,
    thresholdSource: threshold.source,
    weightsSource: weightsSourceSeen,
  };
}

function computeRowMetrics(
  trades: BacktestTrade[],
  symbol: string,
  tf: string,
  side: "long" | "short",
  version: "v6.5" | "v6.6",
  thresholdUsed: number | null,
  thresholdSource: string | null,
  weightsSource: string | null,
): ComparisonRow {
  if (trades.length === 0) {
    return {
      symbol,
      tf,
      side,
      version,
      totalTrades: 0,
      winRate: 0,
      winRateCi: { lower: 0, upper: 0 },
      avgReturn: 0,
      mdd: 0,
      sharpe: 0,
      profitFactor: 0,
      thresholdUsed,
      thresholdSource,
      weightsSource,
    };
  }
  const wins = trades.filter((t) => t.win).length;
  const ci = wilsonScoreInterval(wins, trades.length);
  const returns = trades.map((t) => t.returnPct);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(
    returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length,
  );
  const sharpe = stdReturn > 0 ? avgReturn / stdReturn : 0;

  // equity-curve MDD
  let equity = 100;
  let peak = 100;
  let mdd = 0;
  for (const r of returns) {
    equity *= 1 + r / 100;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > mdd) mdd = dd;
  }

  const grossWin = trades.filter((t) => t.win).reduce((a, t) => a + t.returnPct, 0);
  const grossLoss = trades.filter((t) => !t.win).reduce((a, t) => a - t.returnPct, 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  return {
    symbol,
    tf,
    side,
    version,
    totalTrades: trades.length,
    winRate: wins / trades.length,
    winRateCi: { lower: ci.lower, upper: ci.upper },
    avgReturn,
    mdd,
    sharpe,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : 999,
    thresholdUsed,
    thresholdSource,
    weightsSource,
  };
}

async function runOneCombo(symbol: string, tf: "4h" | "1d") {
  const reportsDir = ensureReportsDir();
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - DAYS * 86400_000);

  const rows: ComparisonRow[] = [];
  const notes: string[] = [];

  // === LONG v6.5 ===
  console.log(`\n=== ${symbol} ${tf} — LONG v6.5 ===`);
  const longResult = await runBacktest({
    symbols: [symbol],
    startDate,
    endDate,
    tf,
    strategy: "bbdx",
  });
  rows.push(
    computeRowMetrics(longResult.trades, symbol, tf, "long", "v6.5", null, null, "default(v6.5)"),
  );

  // === LONG v6.6 (calibrated 가설적 filter) ===
  console.log(`=== ${symbol} ${tf} — LONG v6.6 (calibrated) ===`);
  try {
    const reeval = await reevaluateWithCalibratedWeights(longResult.trades, symbol, tf, "long");
    rows.push(
      computeRowMetrics(
        reeval.filtered,
        symbol,
        tf,
        "long",
        "v6.6",
        reeval.thresholdUsed,
        reeval.thresholdSource,
        reeval.weightsSource,
      ),
    );
  } catch (err) {
    notes.push(`v6.6 LONG reevaluate error: ${(err as Error).message}`);
  }

  // === SHORT v6.5 ===
  console.log(`=== ${symbol} ${tf} — SHORT v6.5 ===`);
  const shortResult = await runBacktest({
    symbols: [symbol],
    startDate,
    endDate,
    tf,
    strategy: "bbdx-short",
  });
  rows.push(
    computeRowMetrics(shortResult.trades, symbol, tf, "short", "v6.5", null, null, "default(v6.5)"),
  );

  // === SHORT v6.6 (calibrated) ===
  console.log(`=== ${symbol} ${tf} — SHORT v6.6 (calibrated) ===`);
  try {
    const reeval = await reevaluateWithCalibratedWeights(shortResult.trades, symbol, tf, "short");
    rows.push(
      computeRowMetrics(
        reeval.filtered,
        symbol,
        tf,
        "short",
        "v6.6",
        reeval.thresholdUsed,
        reeval.thresholdSource,
        reeval.weightsSource,
      ),
    );
  } catch (err) {
    notes.push(`v6.6 SHORT reevaluate error: ${(err as Error).message}`);
  }

  const report: ComparisonReport = {
    generatedAt: new Date().toISOString(),
    symbol,
    tf,
    rows,
    notes,
  };
  const reportPath = join(reportsDir, `v65-vs-v66-${symbol}-${tf}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  // 콘솔 표
  console.log(`\n[${symbol} ${tf}] 비교 결과 — saved to ${reportPath}`);
  console.log("side | ver  | n    | winRate (95% CI)       | avgRet | MDD    | Sharpe | PF");
  console.log("-----|------|------|------------------------|--------|--------|--------|------");
  for (const r of rows) {
    console.log(
      `${r.side.padEnd(4)} | ${r.version.padEnd(4)} | ${String(r.totalTrades).padStart(4)} | ` +
        `${(r.winRate * 100).toFixed(1)}% (${(r.winRateCi.lower * 100).toFixed(1)}~${(r.winRateCi.upper * 100).toFixed(1)}%) | ` +
        `${r.avgReturn.toFixed(2)}% | ${r.mdd.toFixed(2)}% | ${r.sharpe.toFixed(2)} | ${r.profitFactor.toFixed(2)}`,
    );
  }

  return report;
}

async function main() {
  console.log("v6.5 vs v6.6 백테스트 비교 시작");
  console.log(`Symbols: ${SYMBOLS.join(", ")}, TFs: ${TFS.join(", ")}, Days: ${DAYS}`);
  console.log("Bybit rate limit 고려 — 각 조합마다 ~30s 소요");
  console.log("");

  const all: ComparisonReport[] = [];
  for (const symbol of SYMBOLS) {
    for (const tf of TFS) {
      try {
        const r = await runOneCombo(symbol, tf);
        all.push(r);
      } catch (err) {
        console.error(`${symbol} ${tf} 실패: ${(err as Error).message}`);
      }
    }
  }

  const summaryPath = join(ensureReportsDir(), "v65-vs-v66-summary.json");
  writeFileSync(summaryPath, JSON.stringify(all, null, 2), "utf8");
  console.log(`\n전체 요약 → ${summaryPath}`);
}

// CLI entry — always run when invoked as script (works cross-platform incl. Windows)
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
