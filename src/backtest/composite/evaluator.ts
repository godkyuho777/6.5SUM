/**
 * Composite Layer Evaluator — Phase A-2 (2026-05-11).
 *
 * 3 Layer (Signal/Macro/Wave) 의 LayerCondition 배열을 LayerSnapshot 시점에
 * 평가. AND/OR 결합 정책 적용 후 entry 결정.
 *
 * 헌장 R3 (단독 시그널 X): 본 evaluator 는 *측정 도구* — 단독 진입 발행 X.
 * 반드시 backtest engine 의 진입 게이트 안에서 호출됨.
 */

import type {
  CompositeEvaluation,
  CompositeStrategyConfig,
  LayerCondition,
  LayerEvaluation,
  LayerName,
  LayerSnapshot,
  Operator,
} from "./types";

// ─────────────────────────────────────────────────────────
// Indicator value 추출
// ─────────────────────────────────────────────────────────

function extractValue(
  snapshot: LayerSnapshot,
  indicator: string,
): number | string | null {
  switch (indicator) {
    // Signal layer
    case "rsi":
      return snapshot.rsi;
    case "bbLowerProximity": {
      const range = snapshot.bbUpper - snapshot.bbLower;
      if (range <= 0) return null;
      return (snapshot.price - snapshot.bbLower) / range;
    }
    case "bbUpperProximity": {
      const range = snapshot.bbUpper - snapshot.bbLower;
      if (range <= 0) return null;
      return (snapshot.bbUpper - snapshot.price) / range;
    }
    case "adx":
      return snapshot.adx;
    case "plusDi":
      return snapshot.plusDi;
    case "minusDi":
      return snapshot.minusDi;
    case "patternConfluence":
      return snapshot.patternConfluence;
    case "volumeRatio":
      return snapshot.volumeRatio;
    case "signalStrength":
      return snapshot.signalStrength;

    // Macro layer
    case "macroRegime":
      return snapshot.macroRegime ?? null;
    case "macroScore":
      return snapshot.macroScore ?? null;
    case "macroMult":
      return snapshot.macroMult ?? null;
    case "koreaModifier":
      return snapshot.koreaModifier ?? null;

    // Wave layer
    case "waveAlignment":
      return snapshot.waveAlignment ?? null;
    case "waveMult":
      return snapshot.waveMult ?? null;
    case "btcCycleRegime":
      return snapshot.btcCycleRegime ?? null;
    case "trendDirection":
      return snapshot.trendDirection ?? null;
    case "trendAdx":
      return snapshot.trendAdx ?? null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// Operator 평가
// ─────────────────────────────────────────────────────────

function evaluateOperator(
  actual: number | string | null,
  operator: Operator,
  value: number | string | (number | string)[],
  range?: [number, number],
): { passed: boolean; reason: string } {
  if (actual === null) {
    return { passed: false, reason: "지표 값 없음 (snapshot null)" };
  }

  const actualStr = String(actual);
  const valueStr = String(value);

  switch (operator) {
    case "lt":
      if (typeof actual !== "number" || typeof value !== "number") {
        return { passed: false, reason: "lt 는 number 만 지원" };
      }
      return {
        passed: actual < value,
        reason: `${actual.toFixed(2)} < ${value}`,
      };
    case "lte":
      if (typeof actual !== "number" || typeof value !== "number") {
        return { passed: false, reason: "lte 는 number 만 지원" };
      }
      return {
        passed: actual <= value,
        reason: `${actual.toFixed(2)} ≤ ${value}`,
      };
    case "gt":
      if (typeof actual !== "number" || typeof value !== "number") {
        return { passed: false, reason: "gt 는 number 만 지원" };
      }
      return {
        passed: actual > value,
        reason: `${actual.toFixed(2)} > ${value}`,
      };
    case "gte":
      if (typeof actual !== "number" || typeof value !== "number") {
        return { passed: false, reason: "gte 는 number 만 지원" };
      }
      return {
        passed: actual >= value,
        reason: `${actual.toFixed(2)} ≥ ${value}`,
      };
    case "eq":
      return {
        passed: actualStr === valueStr,
        reason: `${actualStr} === ${valueStr}`,
      };
    case "neq":
      return {
        passed: actualStr !== valueStr,
        reason: `${actualStr} ≠ ${valueStr}`,
      };
    case "in":
      if (!Array.isArray(value)) {
        return { passed: false, reason: "in 은 array value 필요" };
      }
      const hit = value.some((v) => String(v) === actualStr);
      return {
        passed: hit,
        reason: `${actualStr} ${hit ? "∈" : "∉"} {${value.join(", ")}}`,
      };
    case "between":
      if (typeof actual !== "number" || !range) {
        return { passed: false, reason: "between 은 number + range 필요" };
      }
      const [lo, hi] = range;
      return {
        passed: actual >= lo && actual <= hi,
        reason: `${actual.toFixed(2)} ∈ [${lo}, ${hi}]`,
      };
  }
  return { passed: false, reason: "unknown operator" };
}

// ─────────────────────────────────────────────────────────
// Layer 평가
// ─────────────────────────────────────────────────────────

function evaluateLayer(
  layer: LayerName,
  conditions: LayerCondition[],
  snapshot: LayerSnapshot,
): LayerEvaluation {
  // 비활성 layer (conditions = []) → 자동 통과
  if (conditions.length === 0) {
    return {
      layer,
      passed: true,
      conditionResults: [],
    };
  }

  const conditionResults = conditions.map((cond) => {
    const actualValue = extractValue(snapshot, cond.indicator);
    const { passed, reason } = evaluateOperator(
      actualValue,
      cond.operator,
      cond.value,
      cond.range,
    );
    return {
      condition: cond,
      actualValue,
      passed,
      reason: `[${cond.indicator}] ${reason}`,
    };
  });

  // Layer 내부는 AND 게이트
  const allPassed = conditionResults.every((r) => r.passed);

  return {
    layer,
    passed: allPassed,
    conditionResults,
  };
}

// ─────────────────────────────────────────────────────────
// Composite 평가
// ─────────────────────────────────────────────────────────

export function evaluateComposite(
  config: CompositeStrategyConfig,
  snapshot: LayerSnapshot,
): CompositeEvaluation {
  const signalEval = evaluateLayer("signal", config.signalConditions, snapshot);
  const macroEval = evaluateLayer("macro", config.macroConditions, snapshot);
  const waveEval = evaluateLayer("wave", config.waveConditions, snapshot);

  const layers = [signalEval, macroEval, waveEval];
  const mode = config.layerCombineMode ?? "all";

  let entry: boolean;
  if (mode === "all") {
    entry = layers.every((l) => l.passed);
  } else {
    // "any" — 최소 1개 layer 가 통과 (단 conditions 가 있는 layer 만 카운트)
    const activeLayers = layers.filter((l, idx) => {
      const conds =
        idx === 0
          ? config.signalConditions
          : idx === 1
            ? config.macroConditions
            : config.waveConditions;
      return conds.length > 0;
    });
    entry = activeLayers.length > 0 && activeLayers.some((l) => l.passed);
  }

  // 진입 사유 (UI surface — TradeDetailCard 의 entryReasons 에 매핑)
  const reasons: string[] = [];
  if (entry) {
    for (const layerEval of layers) {
      if (!layerEval.passed) continue;
      const passedConditions = layerEval.conditionResults.filter((r) => r.passed);
      for (const r of passedConditions) {
        reasons.push(`[${layerEval.layer}] ${r.reason}`);
      }
    }
  }

  return {
    entry,
    layers,
    reasons,
  };
}

/**
 * Layer 통계 — 전체 백테스트 후 각 layer 의 pass rate 계산.
 *
 * Frontend 디버깅용: 어느 layer 가 가장 많은 trade 를 거르는지 파악.
 */
export function computeLayerStats(
  evaluations: CompositeEvaluation[],
): {
  signalPassRate: number;
  macroPassRate: number;
  wavePassRate: number;
  allPassRate: number;
} {
  if (evaluations.length === 0) {
    return {
      signalPassRate: 0,
      macroPassRate: 0,
      wavePassRate: 0,
      allPassRate: 0,
    };
  }

  let signalPassed = 0;
  let macroPassed = 0;
  let wavePassed = 0;
  let allPassed = 0;

  for (const e of evaluations) {
    if (e.layers[0].passed) signalPassed++;
    if (e.layers[1].passed) macroPassed++;
    if (e.layers[2].passed) wavePassed++;
    if (e.entry) allPassed++;
  }

  const n = evaluations.length;
  return {
    signalPassRate: signalPassed / n,
    macroPassRate: macroPassed / n,
    wavePassRate: wavePassed / n,
    allPassRate: allPassed / n,
  };
}
