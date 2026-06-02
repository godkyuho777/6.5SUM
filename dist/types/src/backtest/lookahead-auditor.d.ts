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
export type LookaheadViolationKind = "temporal-monotonicity" | "candle-alignment" | "holding-consistency" | "partial-exits-ordering" | "partial-exits-out-of-bounds" | "negative-holding" | "future-timestamp";
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
export interface AuditOptions {
    /** 결과에 포함할 violation 최대 개수 (default 20). 운영 로그 폭증 방지. */
    maxViolations?: number;
    /** 백테스트 endDate (ms). future-timestamp 검사용. 미지정 시 검사 생략. */
    endMs?: number;
    /** Holding consistency 의 tolerance (candle interval 배수). default 1. */
    holdingToleranceCandles?: number;
}
export declare function auditNoLookahead(trades: BacktestTrade[], options?: AuditOptions): LookaheadAuditResult;
/**
 * audit 결과를 사람이 읽기 좋은 multi-line 문자열로.
 * runner.ts 가 console.log 또는 console.error 로 출력.
 */
export declare function formatAuditSummary(result: LookaheadAuditResult): string;
