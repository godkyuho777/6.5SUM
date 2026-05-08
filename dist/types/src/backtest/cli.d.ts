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
