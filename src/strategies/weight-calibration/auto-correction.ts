/**
 * Auto-Correction (WEIGHT_SYSTEM §2.3).
 *
 * 3-단계 fallback:
 *   Priority 1: 자체 백테스트 → solveConstrainedLSQ + validateWeights (use)
 *   Priority 2: 외부 manifest → validateWeights (use)
 *   Priority 3: 직관값 fallback (status=review_required)
 *
 * 각 단계 성공 시 saveCalibratedWeights 호출 + 캐시 invalidate.
 *
 * 본 모듈은 cron + admin manual trigger 양쪽에서 사용.
 */

import {
  DEFAULT_WEIGHTS,
  getExternalWeights,
  weightsFromSource,
  type WeightPath,
  type WeightSide,
  type WeightVector,
} from "./external-manifest";
import {
  saveCalibratedWeights,
  saveCalibratedThreshold,
  type WeightFetchInput,
} from "./fetch";
import {
  solveConstrainedLSQ,
  computeRSquared,
  computeOOSMatch,
  computeWilsonCIWidth,
  type HistoricalSignal,
} from "./statistics";
import { validateWeights } from "./validation";
import {
  calibrateThreshold,
  type ThresholdSignal,
} from "./threshold-calibration";

export interface AutoCorrectionResult {
  symbol: string;
  tf: string;
  path: string;
  side: WeightSide;
  weights: WeightVector;
  source: "self_backtest" | "external" | "default";
  status: "production" | "review_required";
  metadata: Record<string, unknown>;
  saved: boolean;
  reason: string;
}

/**
 * autoCorrectWeights — 단일 (symbol, tf, path, side) 조합의 가중치 재calibration.
 *
 * @param input         타겟 조합
 * @param signalsFetch  자체 historical signals 공급 함수 (테스트에서 mock 가능).
 *                      undefined 시 Priority 1 건너뜀.
 */
export async function autoCorrectWeights(
  input: WeightFetchInput,
  signalsFetch?: (input: WeightFetchInput) => Promise<HistoricalSignal[]>,
): Promise<AutoCorrectionResult> {
  // === Priority 1: 자체 백테스트 ===
  if (signalsFetch) {
    try {
      const signals = await signalsFetch(input);
      if (signals.length >= 100) {
        const selfWeights = solveConstrainedLSQ(signals);
        const split = Math.floor(signals.length * 0.8);
        const training = signals.slice(0, split);
        const validation = signals.slice(split);
        const rSquared = computeRSquared(training, selfWeights);
        const oosMatch = computeOOSMatch(validation, selfWeights);
        const wilsonCiWidth = computeWilsonCIWidth(signals);

        const result = validateWeights(selfWeights, "self_backtest", { signals });
        if (result.recommendation === "use") {
          const saveRes = await saveCalibratedWeights({
            symbol: input.symbol,
            tf: input.tf,
            path: input.path,
            side: input.side,
            weights: selfWeights,
            source: "self_backtest",
            metadata: {
              note: "자체 백테스트 LSQ 도출 + 검증 통과",
              sample_size: signals.length,
            },
            rSquared,
            sampleSize: signals.length,
            oosMatch,
            wilsonCiWidth,
            status: "production",
          });
          return {
            symbol: input.symbol,
            tf: input.tf,
            path: input.path,
            side: input.side,
            weights: selfWeights,
            source: "self_backtest",
            status: "production",
            metadata: { r_squared: rSquared, sample_size: signals.length, oos_match: oosMatch },
            saved: saveRes.ok,
            reason: "자체 백테스트 적용",
          };
        }
        // self 실패 → external 시도
        console.warn(
          `[calibration] ${input.symbol} ${input.tf} ${input.path} ${input.side}: ` +
            `self_backtest 실패 (${result.validation.reason}), external 시도`,
        );
      }
    } catch (err) {
      console.warn(
        `[calibration] signalsFetch error: ${(err as Error).message}`,
      );
    }
  }

  // === Priority 2: 외부 manifest ===
  const ext = getExternalWeights(input.symbol, input.tf, input.path, input.side);
  if (ext) {
    const extWeights = weightsFromSource(ext);
    const result = validateWeights(extWeights, "external", {
      signals: [],
      metadata: {
        r_squared: ext.weights.metadata.r_squared,
        sample_size: ext.weights.metadata.sample_size,
      },
    });
    if (result.recommendation === "use") {
      const saveRes = await saveCalibratedWeights({
        symbol: input.symbol,
        tf: input.tf,
        path: input.path,
        side: input.side,
        weights: extWeights,
        source: "external",
        externalSourceId: ext.source_id,
        metadata: {
          citation: ext.citation,
          ...ext.weights.metadata,
        },
        rSquared: ext.weights.metadata.r_squared,
        sampleSize: ext.weights.metadata.sample_size,
        oosMatch: null,
        wilsonCiWidth: null,
        status: "production",
      });
      return {
        symbol: input.symbol,
        tf: input.tf,
        path: input.path,
        side: input.side,
        weights: extWeights,
        source: "external",
        status: "production",
        metadata: { citation: ext.citation, source_id: ext.source_id },
        saved: saveRes.ok,
        reason: `외부 manifest ${ext.source_id}`,
      };
    }
  }

  // === Priority 3: Default fallback ===
  const defaultW = DEFAULT_WEIGHTS[input.path as WeightPath] ?? DEFAULT_WEIGHTS.BB;
  const saveRes = await saveCalibratedWeights({
    symbol: input.symbol,
    tf: input.tf,
    path: input.path,
    side: input.side,
    weights: defaultW,
    source: "default",
    metadata: { warning: "검증된 가중치 없음 — 직관값 fallback" },
    status: "review_required",
  });
  console.warn(
    `[calibration] ${input.symbol} ${input.tf} ${input.path} ${input.side}: 직관값 fallback (review_required)`,
  );
  return {
    symbol: input.symbol,
    tf: input.tf,
    path: input.path,
    side: input.side,
    weights: defaultW,
    source: "default",
    status: "review_required",
    metadata: { warning: "검증된 가중치 없음" },
    saved: saveRes.ok,
    reason: "직관값 fallback",
  };
}

export interface ThresholdAutoCorrectionResult {
  symbol: string;
  tf: string;
  side: WeightSide;
  threshold: number;
  source: "self_backtest" | "external" | "default";
  status: "production" | "review_required";
  saved: boolean;
  reason: string;
}

/**
 * autoCorrectThreshold — F1 calibration + fallback.
 */
export async function autoCorrectThreshold(
  input: { symbol: string; tf: string; side: WeightSide },
  signalsFetch?: (input: {
    symbol: string;
    tf: string;
    side: WeightSide;
  }) => Promise<ThresholdSignal[]>,
): Promise<ThresholdAutoCorrectionResult> {
  // Priority 1: 자체 calibration
  if (signalsFetch) {
    try {
      const signals = await signalsFetch(input);
      const result = calibrateThreshold(signals);
      if (result.threshold !== null && result.oos_validation_passed) {
        const saveRes = await saveCalibratedThreshold({
          symbol: input.symbol,
          tf: input.tf,
          side: input.side,
          threshold: result.threshold,
          f1Score: result.f1_score,
          precisionScore: result.precision,
          recallScore: result.recall,
          sampleSize: result.sample_size,
          source: "self_backtest",
          status: "production",
        });
        return {
          symbol: input.symbol,
          tf: input.tf,
          side: input.side,
          threshold: result.threshold,
          source: "self_backtest",
          status: "production",
          saved: saveRes.ok,
          reason: result.reason,
        };
      }
    } catch (err) {
      console.warn(
        `[threshold-calibration] signalsFetch error: ${(err as Error).message}`,
      );
    }
  }

  // Priority 2: 외부 manifest (LONG=42 Park&Irwin, SHORT=45 mirror)
  const externalThreshold = input.side === "long" ? 42 : 45;
  const saveResExt = await saveCalibratedThreshold({
    symbol: input.symbol,
    tf: input.tf,
    side: input.side,
    threshold: externalThreshold,
    source: "external",
    status: "production",
  });
  return {
    symbol: input.symbol,
    tf: input.tf,
    side: input.side,
    threshold: externalThreshold,
    source: "external",
    status: "production",
    saved: saveResExt.ok,
    reason: `외부 manifest fallback (${input.side === "long" ? "Park&Irwin" : "SHORT mirror"})`,
  };
}
