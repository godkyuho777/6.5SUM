/**
 * Report Generator
 *
 * BacktestResult → Markdown 리포트 + JSON 요약
 * CLI 실행 후 reports/ 디렉토리에 저장.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { BacktestResult, BacktestMetrics } from "./types";

// ─── 포맷 헬퍼 ───────────────────────────────────────────

function pct(v: number, decimals = 2): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

function num(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

function bar(value: number, max: number, width = 20): string {
  const filled = Math.round((Math.min(value, max) / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// ─── 지표 테이블 행 ──────────────────────────────────────

function metricsTable(m: BacktestMetrics): string {
  const winRatePct = (m.winRate * 100).toFixed(1);
  const profitFactorStr = isFinite(m.profitFactor)
    ? m.profitFactor.toFixed(2)
    : "∞";

  return `
| 지표 | 값 |
|------|----|
| 총 트레이드 수 | ${m.totalTrades} |
| 승리 / 패배 | ${m.wins} / ${m.losses} |
| **승률** | **${winRatePct}%** |
| 평균 수익률 | ${num(m.avgReturn)}% |
| 수익률 표준편차 | ${num(m.stdReturn)}% |
| **Sharpe** | **${num(m.sharpe, 3)}** |
| 최대 낙폭(MDD) | ${num(m.maxDrawdown)}% |
| **Profit Factor** | **${profitFactorStr}** |
| 평균 승리 수익 | +${num(m.avgWin)}% |
| 평균 패배 손실 | ${num(m.avgLoss)}% |
| **기댓값** | **${num(m.expectancy)}%** |
| 평균 보유 캔들 | ${m.avgHoldingCandles} |
| 평균 MFE | +${num(m.avgMaxFavorable)}% |
| 평균 MAE | -${num(m.avgMaxAdverse)}% |
`.trim();
}

// ─── 심볼별 요약 테이블 ──────────────────────────────────

function symbolTable(bySymbol: Record<string, BacktestMetrics>): string {
  const sorted = Object.entries(bySymbol)
    .filter(([, m]) => m.totalTrades > 0)
    .sort(([, a], [, b]) => b.winRate - a.winRate);

  if (sorted.length === 0) return "_데이터 없음_";

  const header =
    "| 심볼 | 트레이드 | 승률 | 평균수익 | Sharpe | MDD | 기댓값 |\n" +
    "|------|---------|------|---------|--------|-----|-------|\n";

  const rows = sorted
    .map(([sym, m]) => {
      const winPct = (m.winRate * 100).toFixed(1);
      const avgR = num(m.avgReturn);
      const sh = num(m.sharpe, 3);
      const mdd = num(m.maxDrawdown);
      const exp = num(m.expectancy);
      return `| ${sym} | ${m.totalTrades} | ${winPct}% | ${avgR}% | ${sh} | ${mdd}% | ${exp}% |`;
    })
    .join("\n");

  return header + rows;
}

// ─── Exit reason 분포 ────────────────────────────────────

function exitReasonSummary(result: BacktestResult): string {
  const counts: Record<string, number> = {
    target_hit: 0,
    stop_loss: 0,
    window_expired: 0,
    tier1_then_window: 0,
    tier2_full: 0,
    tier1_then_stop: 0,
  };
  for (const t of result.trades) {
    counts[t.exitReason] = (counts[t.exitReason] ?? 0) + 1;
  }
  const n = result.trades.length || 1;
  const pct = (k: string) => ((counts[k] / n) * 100).toFixed(1);
  return [
    `- Tier 2 도달 (tier2_full, 50%+50% 둘 다): **${counts.tier2_full}** (${pct("tier2_full")}%)`,
    `- 목표가 단독 도달 (target_hit, Tier 1 only): **${counts.target_hit}** (${pct("target_hit")}%)`,
    `- Tier 1 → 만료 (tier1_then_window, 50% 청산 + 잔여 close): **${counts.tier1_then_window}** (${pct("tier1_then_window")}%)`,
    `- Tier 1 → 손절 (tier1_then_stop, 50% 청산 + 잔여 stop): **${counts.tier1_then_stop}** (${pct("tier1_then_stop")}%)`,
    `- 손절 (stop_loss, Tier 1 못 도달): **${counts.stop_loss}** (${pct("stop_loss")}%)`,
    `- 윈도우 만료 (window_expired, Tier 1 못 도달): **${counts.window_expired}** (${pct("window_expired")}%)`,
  ].join("\n");
}

// ─── 메인 마크다운 생성 ───────────────────────────────────

export function generateMarkdownReport(result: BacktestResult): string {
  const { config, overall } = result;
  const elapsed = (result.durationMs / 1000).toFixed(1);
  const runDate = new Date(result.runAt).toLocaleString("ko-KR");

  const interpretation = (() => {
    if (overall.totalTrades < 30) return "⚠️ 표본 수가 30개 미만입니다. 통계적 신뢰도가 낮습니다.";
    if (overall.winRate >= 0.6 && overall.sharpe >= 1.0)
      return "✅ 승률과 Sharpe 모두 양호. 전략이 유효할 가능성 높음.";
    if (overall.winRate >= 0.5 && overall.expectancy > 0)
      return "🟡 승률은 보통이나 기댓값 양수. 운영 가능한 전략.";
    if (overall.expectancy <= 0)
      return "🔴 기댓값 음수. 현재 파라미터로는 수익 불가능. 시그널 조건 재검토 필요.";
    return "🟡 결과 혼재. 심볼별 세부 분석 권장.";
  })();

  return `# Tradelab — BBDX Signal Backtesting Report

> **실행 시각:** ${runDate}
> **소요 시간:** ${elapsed}초
> **Run ID:** ${result.runId ?? "미저장 (saveToDb=false)"}

---

## 백테스트 설정

| 항목 | 값 |
|------|----|
| 심볼 수 | ${config.symbols.length}개 |
| 타임프레임 | ${config.tf} |
| 기간 | ${config.startDate.toISOString().slice(0, 10)} ~ ${config.endDate.toISOString().slice(0, 10)} |
| 결과 측정 윈도우 | ${config.outcomeWindowCandles} 캔들 |
| 쿨다운 | ${config.cooldownCandles} 캔들 |
| 워밍업 최소 캔들 | ${config.minWarmupCandles} |

---

## 전체 통계

${metricsTable(overall)}

### 해석

${interpretation}

---

## Exit 사유 분포

${exitReasonSummary(result)}

---

## 심볼별 성과

${symbolTable(result.bySymbol)}

---

## 핵심 인사이트 (MD 프레임워크 기반)

### 베이스라인 승률
- **${(overall.winRate * 100).toFixed(1)}%** (총 ${overall.totalTrades} 시그널)
- 이 수치가 Phase 2 캘리브레이션의 \`baselineWinRate\` 가 됩니다.

### 다음 단계 (MD 04 Phase 1)
추세 컴포지트(TrendComposite) 점수를 추가하면:
- 각 시그널 발생 시점의 추세 상태를 5단계 regime으로 분류
- regime별 승률을 이 베이스라인과 비교 → calibration weight 도출
- \`strong_uptrend\` regime에서의 승률이 ${(overall.winRate * 100 + 15).toFixed(0)}%+ 예상

### 권장 조치
${overall.expectancy > 0
    ? `기댓값이 양수(+${overall.expectancy.toFixed(2)}%)이므로 **Phase 1 (Trend Composite) 추가**를 통해 성능 개선 가능.`
    : "기댓값이 음수입니다. **시그널 파라미터(RSI 범위, BB tolerance, ADX 임계값)** 재조정 후 재백테스트를 권장합니다."
  }

---

> ⚠️ 이 리포트는 과거 데이터 기반 통계입니다. 미래 수익을 보장하지 않습니다.
> 생성: Tradelab Backtesting Engine v1.0
`;
}

// ─── 파일 저장 ───────────────────────────────────────────

export function saveReport(result: BacktestResult, outputDir = "reports"): {
  mdPath: string;
  jsonPath: string;
} {
  mkdirSync(outputDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = result.config.runName
    ? result.config.runName.replace(/\s+/g, "_")
    : "backtest";

  const mdPath = join(outputDir, `${name}_${ts}.md`);
  const jsonPath = join(outputDir, `${name}_${ts}.json`);

  const md = generateMarkdownReport(result);
  writeFileSync(mdPath, md, "utf-8");

  // JSON은 trade 목록 제외 (용량 절약), 필요 시 .trades 추가
  const summary = {
    ...result,
    trades: result.trades.slice(0, 1000), // 최대 1000건만 저장
  };
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf-8");

  console.log(`\n📄 Report saved:`);
  console.log(`   Markdown: ${mdPath}`);
  console.log(`   JSON:     ${jsonPath}`);

  return { mdPath, jsonPath };
}
