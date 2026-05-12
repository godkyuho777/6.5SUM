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
export {};
