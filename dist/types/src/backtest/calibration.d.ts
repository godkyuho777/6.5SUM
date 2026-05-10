/**
 * Backtest Calibration — Wilson CI 기반 임계값 자동 도출 (v6.5 Phase 3)
 *
 * 목적:
 *   Phase 1, 2 가 도입한 임시 임계값 (Pattern Confluence ≥ 0.4, ADX ≤ 30 등)
 *   을 백테스트 trade 데이터로 검증하고, Wilson 95% CI 로 통계적으로
 *   유의미한 새 임계값을 자동 도출한다.
 *
 * 헌장 규칙 2 (백테스트 알파 검증) 의 정확한 사례:
 *   "지표·전략 추가는 직관 X, 백테스트로 알파 입증 후에만."
 *   → calibration 결과를 임계값으로 채택. 직관값과 차이 ≥ 20% 면 사용자 알림.
 *
 * 사용법:
 *   1. Phase 1+2 백테스트로 BacktestTrade[] 수집 (≥ 100 trades 권장)
 *   2. calibrate() 호출 → 각 parameter 의 bucket 별 winRate + Wilson CI
 *   3. 가장 좁은 CI + 가장 높은 winRate bucket 의 임계값을 새 룰로 채택
 *
 * 학술 근거:
 *   - Wilson Score Interval (1927): 작은 표본에서 정확한 binomial CI
 *   - 일반 normal approximation 보다 robust
 *   - 0% 또는 100% winRate 같은 edge case 도 정상 작동
 */
import type { BacktestTrade } from "./types";
/**
 * Wilson 95% confidence interval for binomial proportion.
 *
 * @param wins  성공 횟수
 * @param total 전체 시도 횟수
 * @returns { lower, upper, point } CI 하한, 상한, 점추정값
 *
 * 예: wins=64, total=100 → { lower: 0.541, upper: 0.730, point: 0.640 }
 *     "승률 64% (CI 95% 하한 54.1% ~ 상한 73.0%)"
 */
export declare function wilsonScoreInterval(wins: number, total: number, z?: number): {
    lower: number;
    upper: number;
    point: number;
};
export interface BucketStat {
    /** 버킷 라벨 (e.g. "0.4~0.6", "RSI 30~33") */
    label: string;
    /** 버킷 lower bound (inclusive) */
    lower: number;
    /** 버킷 upper bound (exclusive) — 마지막 버킷은 inclusive */
    upper: number;
    /** 버킷 내 trade 개수 */
    n: number;
    /** 승 수 */
    wins: number;
    /** 점추정 winRate */
    winRate: number;
    /** Wilson 95% CI 하한 */
    ciLower: number;
    /** Wilson 95% CI 상한 */
    ciUpper: number;
    /** 평균 returnPct (가중 평균) */
    avgReturnPct: number;
    /** 표본 충분 여부 (n ≥ 20) */
    sufficient: boolean;
}
/**
 * trades 를 specific 한 numeric field 의 값으로 bucket 화 +
 * 각 bucket 의 winRate + Wilson CI 산출.
 *
 * @param trades       백테스트 trade 배열
 * @param valueOf      trade → 평가 값 (e.g. t => t.patternConfluenceScore)
 * @param edges        bucket 경계값 배열 (e.g. [0, 0.2, 0.4, 0.6, 0.8, 1.0])
 * @param skipUndef    undefined/null 값 trade 는 제외 (default true)
 */
export declare function bucketByValue<T = number>(trades: BacktestTrade[], valueOf: (t: BacktestTrade) => number | undefined | null, edges: number[], skipUndef?: boolean): BucketStat[];
export interface CalibrationParam {
    /** 파라미터 이름 (e.g. "patternConfluenceScore", "adx") */
    name: string;
    /** 사람이 읽을 수 있는 라벨 */
    label: string;
    /** trade → 값 추출 함수 */
    valueOf: (t: BacktestTrade) => number | undefined | null;
    /** bucket 경계값 */
    edges: number[];
    /** 현재 임계값 (직관/임시) — 비교용 */
    currentThreshold: number;
    /** 임계값 의미 — "min" (이 값 이상이 진입) 또는 "max" (이 값 이하가 진입) */
    direction: "min" | "max";
    /** 차원 (1~7) — 헌장 검증용 */
    dimension: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}
export interface CalibrationResult {
    param: CalibrationParam;
    /** 모든 bucket 의 통계 */
    buckets: BucketStat[];
    /** 권고 임계값 (CI 하한이 baseline 보다 유의미하게 높은 첫 bucket) */
    recommendedThreshold: number | null;
    /** 권고 채택 시 예상 winRate (CI 하한 기준, 보수적) */
    expectedWinRate: number | null;
    /** 현재 vs 권고 차이 (절대값) */
    threshold_delta: number | null;
    /** 큰 차이 (≥ 20% 절대 차이) 면 사용자 알림 권고 */
    significantChange: boolean;
    /** 표본 충분 여부 (총 trade ≥ 100) */
    sampleSufficient: boolean;
    /** baseline winRate (전체 trade 의 평균) */
    baselineWinRate: number;
}
/**
 * 단일 파라미터의 임계값 자동 도출.
 *
 * 알고리즘:
 *   1. 각 bucket 의 winRate + Wilson CI 계산
 *   2. baseline = 전체 trade 의 winRate
 *   3. direction="min" 인 경우:
 *        가장 낮은 bucket lower bound 부터 검사
 *        CI 하한이 baseline + 5%p 이상이면 그 lower 가 권고 임계
 *   4. direction="max" 인 경우 반대 (가장 높은 bucket upper bound 부터)
 *
 * 권고 없음: 어떤 bucket 도 baseline 보다 유의미하게 높지 않음
 */
export declare function calibrate(trades: BacktestTrade[], param: CalibrationParam): CalibrationResult;
/**
 * v6.5 Phase 3 의 표준 calibration 파라미터 세트.
 * 백테스트 결과를 입력하면 7개 핵심 임계값을 모두 검증.
 */
export declare const STANDARD_CALIBRATION_PARAMS: CalibrationParam[];
/**
 * SHORT-specific calibration params (P1-#3, 2026-05-10).
 *
 * Audit `01-BBDX-AUDIT.md` S1 권고: SHORT RSI 비대칭 미러 회복.
 * SHORT path 의 RSI [62, 75], BB upper proximity, ADX 영역을 측정.
 *
 * 사용법:
 *   const shortTrades = trades.filter((t) => t.side === "short");
 *   const results = SHORT_CALIBRATION_PARAMS.map((p) => calibrate(shortTrades, p));
 */
export declare const SHORT_CALIBRATION_PARAMS: CalibrationParam[];
/**
 * Phase 3 SHORT calibration — SHORT trades 만 추출 후 5 파라미터 검증.
 *
 * Audit S2 (01-BBDX-AUDIT.md) 의 헌장 R2 위반 시정 — SHORT path 알파 측정.
 *
 * @param trades 백테스트 trade 배열 (`side: "short"` 필터 자동 적용)
 * @returns 5개 CalibrationResult (SHORT 전용)
 */
export declare function runShortCalibration(trades: BacktestTrade[]): CalibrationResult[];
/**
 * Calibration 결과를 markdown 표로 포맷.
 */
export declare function formatCalibrationReport(results: CalibrationResult[]): string;
/**
 * Phase 3 통합 calibration 실행 — 표준 7개 파라미터 모두 검증.
 *
 * @param trades 백테스트 trade 배열 (Phase 1+2 결과)
 * @returns 7개 CalibrationResult (각 파라미터별)
 */
export declare function runStandardCalibration(trades: BacktestTrade[]): CalibrationResult[];
