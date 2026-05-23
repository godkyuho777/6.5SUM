/**
 * Lookahead-free Auditor (P1-#1, 2026-05-23)
 *
 * AUDIT.md 권장: 백테스트 runner 가 lookahead-free 를 "구조적으로 보장"
 * 만 언급하던 상태 (runner.ts:26-36) 에서 **자동 검증** 으로 전환.
 *
 * 본 모듈은 BacktestResult.trades 를 받아 lookahead bias 의 흔적이 될 만한
 * 위반 조건들을 검사한다. 위반 발견 시 runner.ts 는 (1) console.error +
 * (2) 결과의 `lookaheadViolations` 필드 채움 + (3) saveToDb 호출자에게 경고.
 *
 * 검사 항목:
 *
 *   1. **Temporal monotonicity** — signalTs < exitTs (시간 역행 X)
 *   2. **Candle alignment** — signalTs 가 candle interval 의 배수 (시간 보간 X)
 *   3. **Holding consistency** — exitTs - signalTs ≈ holdingCandles × intervalMs
 *      (오차 허용: 1 candle interval 이하)
 *   4. **Partial exits ordering** — partialExits[i].candleOffset < partialExits[i+1].candleOffset
 *   5. **PartialExits within holding** — 모든 candleOffset ≤ holdingCandles
 *   6. **Non-negative holding** — holdingCandles ≥ 0
 *   7. **Future timestamp** — signalTs / exitTs 가 백테스트 endDate 이내
 *
 * 위반이 발견되어도 *백테스트 자체는 실패하지 않음* — strictMode=false 가
 * default. strict 모드는 CLI 의 `--audit-strict` 플래그로 활성화.
 *
 * 헌장: 본 audit 은 BBDX 시그널 시스템과 무관 (R3 영향 X). 시그널 결과의
 * 통계적 무결성 검증 도구.
 */

import type { BacktestTrade } from "./types";
import type { TimeframeValue } from "@shared/types";

// ─── Timeframe → ms ─────────────────────────────────────────

const TF_TO_MS: Record<TimeframeValue, number> = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000, // 30d 근사 — 1M 캔들 정렬 검증에만 사용
};

// ─── Violation types ────────────────────────────────────────

export type LookaheadViolationKind =
  | "temporal-monotonicity"
  | "candle-alignment"
  | "holding-consistency"
  | "partial-exits-ordering"
  | "partial-exits-out-of-bounds"
  | "negative-holding"
  | "future-timestamp";

export interface LookaheadViolation {
  kind: LookaheadViolationKind;
  tradeIndex: number;
  symbol: string;
  signalTs: number;
  detail: string;
}

export interface LookaheadAuditResult {
  /** 총 trade 수 */
  totalTrades: number;
  /** 위반 수 (multiple violations per trade 가능) */
  violationCount: number;
  /** 위반 종류별 개수 */
  byKind: Record<LookaheadViolationKind, number>;
  /** 상위 N 개 위반 (default 20) — 모든 위반을 로그에 출력하면 너무 많을 수 있음 */
  violations: LookaheadViolation[];
  /** 위반 0건 시 true. strict 모드에서는 이 값 기준으로 saveToDb 차단 가능. */
  passed: boolean;
}

// ─── Audit 함수 ─────────────────────────────────────────────

export interface AuditOptions {
  /** 결과에 포함할 violation 최대 개수 (default 20). 운영 로그 폭증 방지. */
  maxViolations?: number;
  /** 백테스트 endDate (ms). future-timestamp 검사용. 미지정 시 검사 생략. */
  endMs?: number;
  /** Holding consistency 의 tolerance (candle interval 배수). default 1. */
  holdingToleranceCandles?: number;
}

const DEFAULT_OPTIONS: Required<Omit<AuditOptions, "endMs">> = {
  maxViolations: 20,
  holdingToleranceCandles: 1,
};

export function auditNoLookahead(
  trades: BacktestTrade[],
  options: AuditOptions = {},
): LookaheadAuditResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const violations: LookaheadViolation[] = [];
  const byKind: Record<LookaheadViolationKind, number> = {
    "temporal-monotonicity": 0,
    "candle-alignment": 0,
    "holding-consistency": 0,
    "partial-exits-ordering": 0,
    "partial-exits-out-of-bounds": 0,
    "negative-holding": 0,
    "future-timestamp": 0,
  };

  const pushViolation = (v: LookaheadViolation) => {
    byKind[v.kind] += 1;
    if (violations.length < opts.maxViolations) {
      violations.push(v);
    }
  };

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const intervalMs = TF_TO_MS[t.tf] ?? null;

    // 1. Temporal monotonicity — signalTs < exitTs
    if (t.exitTs <= t.signalTs) {
      pushViolation({
        kind: "temporal-monotonicity",
        tradeIndex: i,
        symbol: t.symbol,
        signalTs: t.signalTs,
        detail: `exitTs (${t.exitTs}) <= signalTs (${t.signalTs}) — 시간 역행`,
      });
    }

    // 6. Non-negative holding
    if (t.holdingCandles < 0) {
      pushViolation({
        kind: "negative-holding",
        tradeIndex: i,
        symbol: t.symbol,
        signalTs: t.signalTs,
        detail: `holdingCandles=${t.holdingCandles} < 0`,
      });
    }

    if (intervalMs != null) {
      // 2. Candle alignment — signalTs % intervalMs ≈ 0 (timeframe granularity)
      // NOTE: 1M timeframe 은 30d 근사라 검사 생략 (월 길이 가변)
      if (t.tf !== "1M") {
        const remainder = t.signalTs % intervalMs;
        if (remainder !== 0) {
          pushViolation({
            kind: "candle-alignment",
            tradeIndex: i,
            symbol: t.symbol,
            signalTs: t.signalTs,
            detail: `signalTs ${t.signalTs} 가 ${t.tf} 캔들 경계 (${intervalMs}ms) 와 정렬 안 됨 (remainder=${remainder}ms)`,
          });
        }
      }

      // 3. Holding consistency — exitTs - signalTs ≈ holdingCandles × intervalMs
      const elapsedMs = t.exitTs - t.signalTs;
      const expectedMs = t.holdingCandles * intervalMs;
      const toleranceMs = opts.holdingToleranceCandles * intervalMs;
      if (Math.abs(elapsedMs - expectedMs) > toleranceMs) {
        pushViolation({
          kind: "holding-consistency",
          tradeIndex: i,
          symbol: t.symbol,
          signalTs: t.signalTs,
          detail: `holdingCandles=${t.holdingCandles} 인데 실제 경과 ${(elapsedMs / intervalMs).toFixed(2)} candles (tolerance ${opts.holdingToleranceCandles})`,
        });
      }
    }

    // 4 + 5. Partial exits
    if (t.partialExits && t.partialExits.length > 0) {
      let lastOffset = -1;
      for (let j = 0; j < t.partialExits.length; j++) {
        const pe = t.partialExits[j];

        // 4. Ordering (monotonic increasing offset)
        if (pe.candleOffset <= lastOffset) {
          pushViolation({
            kind: "partial-exits-ordering",
            tradeIndex: i,
            symbol: t.symbol,
            signalTs: t.signalTs,
            detail: `partialExits[${j}].candleOffset=${pe.candleOffset} <= 이전 ${lastOffset}`,
          });
        }
        lastOffset = pe.candleOffset;

        // 5. Out of bounds (offset > holdingCandles 이면 신호 발생 이후에 더
        //    뒤로 청산된 셈 — lookahead 의심)
        if (pe.candleOffset > t.holdingCandles) {
          pushViolation({
            kind: "partial-exits-out-of-bounds",
            tradeIndex: i,
            symbol: t.symbol,
            signalTs: t.signalTs,
            detail: `partialExits[${j}].candleOffset=${pe.candleOffset} > holdingCandles=${t.holdingCandles}`,
          });
        }
      }
    }

    // 7. Future timestamp
    if (opts.endMs != null) {
      if (t.signalTs > opts.endMs) {
        pushViolation({
          kind: "future-timestamp",
          tradeIndex: i,
          symbol: t.symbol,
          signalTs: t.signalTs,
          detail: `signalTs ${t.signalTs} > endMs ${opts.endMs} — 백테스트 범위 밖`,
        });
      }
      if (t.exitTs > opts.endMs + (intervalMs ?? 0) * 200) {
        // exit 은 outcome window 만큼은 미래로 가도 OK — 다만 무한정 미래는 의심
        pushViolation({
          kind: "future-timestamp",
          tradeIndex: i,
          symbol: t.symbol,
          signalTs: t.signalTs,
          detail: `exitTs ${t.exitTs} >> endMs ${opts.endMs} (outcome window 초과)`,
        });
      }
    }
  }

  const violationCount = Object.values(byKind).reduce((a, b) => a + b, 0);

  return {
    totalTrades: trades.length,
    violationCount,
    byKind,
    violations,
    passed: violationCount === 0,
  };
}

// ─── 인쇄 헬퍼 ──────────────────────────────────────────────

/**
 * audit 결과를 사람이 읽기 좋은 multi-line 문자열로.
 * runner.ts 가 console.log 또는 console.error 로 출력.
 */
export function formatAuditSummary(result: LookaheadAuditResult): string {
  if (result.passed) {
    return `✓ Lookahead audit PASSED (${result.totalTrades} trades, 0 violations)`;
  }
  const lines: string[] = [];
  lines.push(
    `✗ Lookahead audit FAILED — ${result.violationCount} violations / ${result.totalTrades} trades`,
  );
  for (const [kind, count] of Object.entries(result.byKind)) {
    if (count > 0) lines.push(`    · ${kind}: ${count}`);
  }
  if (result.violations.length > 0) {
    lines.push(`  Sample violations (first ${result.violations.length}):`);
    for (const v of result.violations.slice(0, 10)) {
      lines.push(`    [${v.tradeIndex}] ${v.symbol} ${v.kind}: ${v.detail}`);
    }
  }
  return lines.join("\n");
}
