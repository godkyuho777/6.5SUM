/**
 * VWAP Detail bundler — VWAP_STRATEGY.md §6~§9 통합 출력.
 *
 * 신규 VWAP 모듈 (Volume Profile, std-dev bands, Pullback v2, multi-TF, 5-component
 * signal) 의 결과를 한 라우트에서 일괄 반환. 헌장 규칙 3 준수: 단독 시그널 X,
 * BBDX 보조 multiplier 로만 사용 (vwapToMultiplier 출력 포함).
 *
 * 외부 호출 (fetchKlines, checkVwapMultiTfAlignment) 은 try/catch 후 graceful
 * fallback. throw 절대 X — 라우트 측 catch 가 다시 한 번 보호.
 */
import type {
  Candle,
  MultiTfAlignment,
  PullbackQuality,
  VwapBands,
  VwapSignal,
} from "./shared/types";
import { fetchKlines } from "./bybit";
import {
  calculateVWAP,
  calculateEMA,
  calculateVwapBands,
  vwapPosition,
  emaPosition,
  detectPullback,
  detectPullbackV2,
  decideVwapSignal,
  vwapToMultiplier,
  volumeRatio,
} from "./indicators";
import {
  computeVolumeProfile,
  type VolumeProfile,
} from "./volume-profile";
import { checkVwapMultiTfAlignment } from "./vwap-multi-tf";

const EMPTY_BANDS: VwapBands = {
  vwap: 0,
  sigma: 0,
  upper1: 0,
  upper2: 0,
  upper3: 0,
  lower1: 0,
  lower2: 0,
  lower3: 0,
};

const EMPTY_PROFILE: VolumeProfile = {
  bins: [],
  poc: 0,
  hvnList: [],
  lvnList: [],
  valueArea: { low: 0, high: 0, pct: 0 },
  totalVolume: 0,
};

const EMPTY_PULLBACK_V2: PullbackQuality = {
  detected: false,
  touchCandleIdx: null,
  bounceConfirmed: false,
  proximityRatio: 1,
  touchedLine: null,
};

const NEUTRAL_ALIGNMENT: MultiTfAlignment = {
  tfs: ["1h", "4h", "1d"],
  alignmentLevel: "neutral",
  perTf: {},
  multiplier: 1.0,
};

export interface VwapDetail {
  symbol: string;
  tf: "1h" | "4h" | "1d";
  /** 마지막 100 개 캔들 (혹은 fetch 가능했던 만큼) */
  candles: Candle[];
  vwap: number;
  ema9: number;
  bands: VwapBands;
  volumeProfile: VolumeProfile;
  /** Pullback v2 — VWAP_STRATEGY.md §8 의 "터치 + 반등" 검증 */
  pullbackV2: PullbackQuality;
  /** legacy 4-component VwapSignal (호환 유지) */
  signal: VwapSignal | null;
  /** 5-component VwapSignal (Pullback v2 + Volume Profile 보조 점수) */
  signalV2: VwapSignal | null;
  /** vwapToMultiplier(signalV2 ?? signal) — 헌장 규칙 3 multiplier */
  vwapMult: number;
  multiTfAlignment: MultiTfAlignment;
  /** unix ms */
  computedAt: number;
}

/**
 * 단일 심볼 + TF 의 VWAP 신규 모듈 결과를 한 번에 묶어 반환.
 *
 * fetchKlines 실패 / 빈 캔들 → 모든 필드 zero/empty 로 graceful 응답.
 */
export async function getVwapDetail(
  symbol: string,
  tf: "1h" | "4h" | "1d" = "4h"
): Promise<VwapDetail> {
  const computedAt = Date.now();
  const upper = symbol.toUpperCase();

  // 1. 캔들 로딩 — 실패해도 throw X
  let candles: Candle[] = [];
  try {
    candles = await fetchKlines(upper, tf, 100);
  } catch (err: any) {
    console.warn(
      `[vwap-detail] fetchKlines failed ${upper}@${tf}: ${err?.message ?? err}`
    );
    candles = [];
  }

  if (!candles || candles.length === 0) {
    return {
      symbol: upper,
      tf,
      candles: [],
      vwap: 0,
      ema9: 0,
      bands: { ...EMPTY_BANDS },
      volumeProfile: { ...EMPTY_PROFILE, bins: [] },
      pullbackV2: { ...EMPTY_PULLBACK_V2 },
      signal: null,
      signalV2: null,
      vwapMult: 1.0,
      multiTfAlignment: { ...NEUTRAL_ALIGNMENT, perTf: {} },
      computedAt,
    };
  }

  // 2. 핵심 지표 — sync 계산
  const vwap = calculateVWAP(candles);
  const typicals = candles.map((c) => (c.high + c.low + c.close) / 3);
  const ema9 = calculateEMA(typicals, 9);
  const bands = calculateVwapBands(candles);
  const volumeProfile = computeVolumeProfile(candles, 24);

  // 3. Pullback (legacy bool) — Pullback v2 의 fallback / signalV1 용
  const pullback = detectPullback(candles, vwap, ema9);

  // 4. Side 추정 — 마지막 캔들 종가 기준
  const last = candles[candles.length - 1];
  const price = last.close;
  const vPos = vwapPosition(price, vwap);
  const ePos = emaPosition(price, ema9);
  let side: "LONG" | "SHORT" | null = null;
  if (vPos === "ABOVE" && ePos !== "BELOW") side = "LONG";
  else if (vPos === "BELOW" && ePos !== "ABOVE") side = "SHORT";

  // 5. Pullback v2 — side 가 정해진 경우만
  const pullbackV2: PullbackQuality = side
    ? detectPullbackV2(candles, vwap, ema9, side)
    : { ...EMPTY_PULLBACK_V2 };

  // 6. Signals (legacy + V2)
  const volRatio = volumeRatio(candles);
  const signal = decideVwapSignal(price, vwap, ema9, pullback, volRatio);
  const signalV2 = decideVwapSignal(price, vwap, ema9, pullback, volRatio, {
    pullbackQuality: pullbackV2,
    volumeProfile,
  });

  // 7. vwapMult — V2 우선, 없으면 legacy fallback
  const vwapMult = vwapToMultiplier(signalV2 ?? signal);

  // 8. Multi-TF alignment — side 미정 시 neutral fallback (외부 호출 절약)
  let multiTfAlignment: MultiTfAlignment;
  if (side) {
    try {
      multiTfAlignment = await checkVwapMultiTfAlignment(upper, side);
    } catch (err: any) {
      console.warn(
        `[vwap-detail] multi-TF alignment failed ${upper}: ${err?.message ?? err}`
      );
      multiTfAlignment = { ...NEUTRAL_ALIGNMENT, perTf: {} };
    }
  } else {
    multiTfAlignment = { ...NEUTRAL_ALIGNMENT, perTf: {} };
  }

  return {
    symbol: upper,
    tf,
    candles,
    vwap,
    ema9,
    bands,
    volumeProfile,
    pullbackV2,
    signal,
    signalV2,
    vwapMult,
    multiTfAlignment,
    computedAt,
  };
}
