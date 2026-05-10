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

// ─────────────────────────────────────────────────────────
// Wilson Score Interval (95% CI)
// ─────────────────────────────────────────────────────────

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
export function wilsonScoreInterval(
  wins: number,
  total: number,
  z: number = 1.96, // 95% CI = z=1.96
): { lower: number; upper: number; point: number } {
  if (total <= 0) return { lower: 0, upper: 0, point: 0 };
  const p = wins / total;
  const denom = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return {
    lower: Math.max(0, (center - margin) / denom),
    upper: Math.min(1, (center + margin) / denom),
    point: p,
  };
}

// ─────────────────────────────────────────────────────────
// Bucket statistics
// ─────────────────────────────────────────────────────────

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
export function bucketByValue<T = number>(
  trades: BacktestTrade[],
  valueOf: (t: BacktestTrade) => number | undefined | null,
  edges: number[],
  skipUndef: boolean = true,
): BucketStat[] {
  const out: BucketStat[] = [];

  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const isLast = i === edges.length - 2;
    const inBucket = trades.filter((t) => {
      const v = valueOf(t);
      if (v == null) return !skipUndef;
      return v >= lo && (isLast ? v <= hi : v < hi);
    });
    const n = inBucket.length;
    const wins = inBucket.filter((t) => t.win).length;
    const ci = wilsonScoreInterval(wins, n);
    const totalReturn = inBucket.reduce((sum, t) => sum + t.returnPct, 0);
    const avgReturn = n > 0 ? totalReturn / n : 0;

    out.push({
      label: `${lo.toFixed(2)}~${hi.toFixed(2)}`,
      lower: lo,
      upper: hi,
      n,
      wins,
      winRate: ci.point,
      ciLower: ci.lower,
      ciUpper: ci.upper,
      avgReturnPct: avgReturn,
      sufficient: n >= 20,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// Calibration: 임계값 자동 도출
// ─────────────────────────────────────────────────────────

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
export function calibrate(
  trades: BacktestTrade[],
  param: CalibrationParam,
): CalibrationResult {
  const validTrades = trades.filter((t) => param.valueOf(t) != null);
  const baselineWins = validTrades.filter((t) => t.win).length;
  const baselineWinRate = validTrades.length > 0 ? baselineWins / validTrades.length : 0;

  const buckets = bucketByValue(trades, param.valueOf, param.edges);

  const sampleSufficient = validTrades.length >= 100;

  // 권고 임계값 탐색
  let recommendedThreshold: number | null = null;
  let expectedWinRate: number | null = null;

  const sortedBuckets =
    param.direction === "min"
      ? [...buckets].sort((a, b) => a.lower - b.lower)
      : [...buckets].sort((a, b) => b.upper - a.upper);

  for (const b of sortedBuckets) {
    if (!b.sufficient) continue;
    // CI 하한이 baseline + 5%p 이상이면 채택
    if (b.ciLower >= baselineWinRate + 0.05) {
      recommendedThreshold = param.direction === "min" ? b.lower : b.upper;
      expectedWinRate = b.ciLower;
      break;
    }
  }

  const threshold_delta =
    recommendedThreshold != null
      ? Math.abs(recommendedThreshold - param.currentThreshold)
      : null;

  // 의미 있는 변화: 절대 차이 / current 의 20% 초과
  const significantChange =
    threshold_delta != null && param.currentThreshold !== 0
      ? threshold_delta / Math.abs(param.currentThreshold) >= 0.2
      : threshold_delta != null && threshold_delta >= 0.05;

  return {
    param,
    buckets,
    recommendedThreshold,
    expectedWinRate,
    threshold_delta,
    significantChange,
    sampleSufficient,
    baselineWinRate,
  };
}

/**
 * v6.5 Phase 3 의 표준 calibration 파라미터 세트.
 * 백테스트 결과를 입력하면 7개 핵심 임계값을 모두 검증.
 */
export const STANDARD_CALIBRATION_PARAMS: CalibrationParam[] = [
  {
    name: "patternConfluenceScore",
    label: "Pattern Confluence (Phase 1 게이트, 현재 0.4 ≥)",
    valueOf: (t) => t.patternConfluenceScore,
    edges: [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0],
    currentThreshold: 0.4,
    direction: "min",
    dimension: 5,
  },
  {
    name: "rsi",
    label: "RSI (현재 30~35 진입 영역)",
    valueOf: (t) => t.rsi,
    edges: [25, 28, 30, 32, 35, 38, 42],
    currentThreshold: 35,
    direction: "max",
    dimension: 1,
  },
  {
    name: "adx",
    label: "ADX (현재 ≤ 30 진입 영역)",
    valueOf: (t) => t.adx,
    edges: [0, 10, 15, 20, 25, 30, 40],
    currentThreshold: 30,
    direction: "max",
    dimension: 3,
  },
  {
    name: "signalStrength",
    label: "Signal Strength (현재 임계 없음)",
    valueOf: (t) => t.signalStrength,
    edges: [0, 30, 50, 70, 85, 100],
    currentThreshold: 50,
    direction: "min",
    dimension: 5,
  },
  {
    name: "emaRibbonMult",
    label: "EMA Ribbon Mult (Phase 2, 현재 임계 없음)",
    valueOf: (t) => t.emaRibbonMult,
    edges: [0.30, 0.70, 0.90, 1.0, 1.05, 1.15],
    currentThreshold: 1.0,
    direction: "min",
    dimension: 3,
  },
  {
    name: "macdDivergenceMult",
    label: "MACD Divergence Mult (Phase 2, 현재 임계 없음)",
    valueOf: (t) => t.macdDivergenceMult,
    edges: [0.80, 0.95, 1.0, 1.05, 1.10, 1.20],
    currentThreshold: 1.0,
    direction: "min",
    dimension: 1,
  },
  {
    name: "modifiersProduct",
    label: "Modifiers Product (EMA × MACD × OB)",
    valueOf: (t) => t.modifiersProduct,
    edges: [0.50, 0.85, 0.95, 1.0, 1.05, 1.20, 1.45],
    currentThreshold: 1.0,
    direction: "min",
    dimension: 5,
  },
];

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
export const SHORT_CALIBRATION_PARAMS: CalibrationParam[] = [
  {
    name: "rsi-short",
    label: "SHORT RSI (현재 65~75 진입 영역, alpha 튜닝 2026-05-10)",
    valueOf: (t) => t.rsi,
    edges: [55, 60, 65, 68, 70, 75, 85],
    currentThreshold: 65,
    direction: "min",
    dimension: 1,
  },
  {
    name: "adx-short",
    label: "SHORT ADX (현재 ≤ 25 진입 영역)",
    valueOf: (t) => t.adx,
    edges: [0, 10, 15, 20, 25, 30, 40],
    currentThreshold: 25,
    direction: "max",
    dimension: 3,
  },
  {
    name: "patternConfluenceScore-short",
    label: "SHORT Pattern Confluence (bearish, 현재 0.4 ≥)",
    valueOf: (t) => t.patternConfluenceScore,
    edges: [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0],
    currentThreshold: 0.4,
    direction: "min",
    dimension: 5,
  },
  {
    name: "signalStrength-short",
    label: "SHORT Signal Strength",
    valueOf: (t) => t.signalStrength,
    edges: [0, 30, 50, 70, 85, 100],
    currentThreshold: 50,
    direction: "min",
    dimension: 5,
  },
  {
    name: "modifiersProduct-short",
    label: "SHORT Modifiers Product (부호 반전된 EMA × MACD × OB)",
    valueOf: (t) => t.modifiersProduct,
    edges: [0.50, 0.85, 0.95, 1.0, 1.05, 1.20, 1.45],
    currentThreshold: 1.0,
    direction: "min",
    dimension: 5,
  },
];

/**
 * Phase 3 SHORT calibration — SHORT trades 만 추출 후 5 파라미터 검증.
 *
 * Audit S2 (01-BBDX-AUDIT.md) 의 헌장 R2 위반 시정 — SHORT path 알파 측정.
 *
 * @param trades 백테스트 trade 배열 (`side: "short"` 필터 자동 적용)
 * @returns 5개 CalibrationResult (SHORT 전용)
 */
export function runShortCalibration(
  trades: BacktestTrade[],
): CalibrationResult[] {
  const shortTrades = trades.filter((t) => t.side === "short");
  return SHORT_CALIBRATION_PARAMS.map((param) => calibrate(shortTrades, param));
}

// ─────────────────────────────────────────────────────────
// Report formatter
// ─────────────────────────────────────────────────────────

/**
 * Calibration 결과를 markdown 표로 포맷.
 */
export function formatCalibrationReport(results: CalibrationResult[]): string {
  const lines: string[] = [];
  lines.push("# Backtest Calibration Report (v6.5 Phase 3)");
  lines.push("");
  lines.push("> Wilson 95% CI 기반 임계값 자동 도출. 헌장 규칙 2 (백테스트 알파 검증).");
  lines.push("");

  for (const r of results) {
    lines.push(`## ${r.param.name} — ${r.param.label}`);
    lines.push("");
    lines.push(
      `**Baseline winRate**: ${(r.baselineWinRate * 100).toFixed(1)}% ` +
        `(전체 trade 평균 — 권고 임계의 비교 기준)`,
    );
    lines.push(
      `**표본 충분**: ${r.sampleSufficient ? "✓" : "❌"} (≥ 100 trades 필요)`,
    );
    lines.push("");
    lines.push("| Bucket | n | wins | winRate | CI 95% | avg return | 충분 |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const b of r.buckets) {
      lines.push(
        `| ${b.label} | ${b.n} | ${b.wins} | ` +
          `${(b.winRate * 100).toFixed(1)}% | ` +
          `${(b.ciLower * 100).toFixed(1)}~${(b.ciUpper * 100).toFixed(1)}% | ` +
          `${b.avgReturnPct >= 0 ? "+" : ""}${b.avgReturnPct.toFixed(2)}% | ` +
          `${b.sufficient ? "✓" : "❌"} |`,
      );
    }
    lines.push("");

    if (r.recommendedThreshold != null) {
      lines.push(
        `### ✓ 권고 임계: **${r.recommendedThreshold.toFixed(3)}** ` +
          `(${r.param.direction === "min" ? "이 값 이상 진입" : "이 값 이하 진입"})`,
      );
      lines.push("");
      lines.push(
        `- 예상 winRate (CI 하한): **${((r.expectedWinRate ?? 0) * 100).toFixed(1)}%** ` +
          `(baseline ${(r.baselineWinRate * 100).toFixed(1)}% 대비 +${
            (((r.expectedWinRate ?? 0) - r.baselineWinRate) * 100).toFixed(1)
          }%p)`,
      );
      lines.push(
        `- 현재 임계 (${r.param.currentThreshold.toFixed(3)}) → 권고 임계 ` +
          `(${r.recommendedThreshold.toFixed(3)}): ` +
          `${r.significantChange ? "🚨 **유의미한 변화**" : "유사 — 현 임계 유지 가능"}`,
      );
    } else {
      lines.push(`### ⚠ 권고 임계 없음`);
      lines.push("");
      lines.push(
        "어떤 bucket 의 CI 하한도 baseline + 5%p 를 넘지 못함. " +
          "이 파라미터는 currently 통계적으로 유의미한 separator 가 아님 — " +
          "표본 부족 또는 진짜 noise 일 가능성.",
      );
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Phase 3 통합 calibration 실행 — 표준 7개 파라미터 모두 검증.
 *
 * @param trades 백테스트 trade 배열 (Phase 1+2 결과)
 * @returns 7개 CalibrationResult (각 파라미터별)
 */
export function runStandardCalibration(
  trades: BacktestTrade[],
): CalibrationResult[] {
  return STANDARD_CALIBRATION_PARAMS.map((param) => calibrate(trades, param));
}
