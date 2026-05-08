#!/usr/bin/env tsx
/**
 * Backtest CLI Entry Point
 *
 * 사용법:
 *   pnpm backtest                     # 기본: top-10 코인, 4h, 최근 1년
 *   pnpm backtest --quick             # quick mode: top-5, 3개월
 *   pnpm backtest --symbols BTCUSDT,ETHUSDT --tf 4h --start 2024-01-01 --end 2025-01-01
 *   pnpm backtest --save              # DB에 결과 저장
 *   pnpm backtest --name "MY_RUN"     # 실행 이름 지정
 */

import "dotenv/config";
import { runBacktest } from "./runner";
import { saveReport } from "./report-generator";
import type { BacktestCliArgs } from "./types";
import { TOP_COINS } from "@shared/types";

// ─── 인자 파싱 ───────────────────────────────────────────

function parseArgs(argv: string[]): BacktestCliArgs {
  const args: BacktestCliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--quick":
        args.quickMode = true;
        break;
      case "--save":
        args.saveToDb = true;
        break;
      case "--symbols":
        args.symbols = argv[++i].split(",").map((s) => s.trim());
        break;
      case "--tf":
        args.tf = argv[++i] as any;
        break;
      case "--start":
        args.start = argv[++i];
        break;
      case "--end":
        args.end = argv[++i];
        break;
      case "--window":
        args.outcomeWindow = parseInt(argv[++i], 10);
        break;
      case "--cooldown":
        args.cooldown = parseInt(argv[++i], 10);
        break;
      case "--name":
        args.runName = argv[++i];
        break;
    }
  }
  return args;
}

// ─── 메인 ────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Quick mode 기본값
  if (args.quickMode) {
    args.symbols ??= TOP_COINS.slice(0, 5);
    args.start ??= new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    args.end ??= new Date().toISOString().slice(0, 10);
    args.runName ??= "quick_test";
  }

  // 기본값
  const symbols = args.symbols ?? TOP_COINS.slice(0, 10);
  const tf = args.tf ?? "4h";
  const end = args.end ? new Date(args.end) : new Date();
  const start = args.start
    ? new Date(args.start)
    : new Date(end.getTime() - 365 * 86400_000); // 1년

  // outcomeWindow: TF에 따라 자동 조정
  const defaultWindow: Record<string, number> = {
    "1h": 168,  // 7 days
    "4h": 42,   // 7 days
    "6h": 28,   // 7 days
    "1d": 14,   // 14 days
    "1w": 4,    // 4 weeks
    "1M": 2,
  };
  const outcomeWindowCandles = args.outcomeWindow ?? defaultWindow[tf] ?? 42;

  console.log("🚀 Tradelab Backtesting Engine Starting...\n");

  const result = await runBacktest({
    symbols,
    tf,
    startDate: start,
    endDate: end,
    outcomeWindowCandles,
    cooldownCandles: args.cooldown ?? 5,
    saveToDb: args.saveToDb ?? false,
    runName: args.runName ?? `${tf}_${symbols.length}coins`,
  });

  // 리포트 저장
  saveReport(result);

  // 프로세스 종료
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Backtest failed:", err);
  process.exit(1);
});
