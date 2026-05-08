/**
 * 멀티 TF (1H / 4H / 1D) VWAP 정합 헬퍼 — VWAP_STRATEGY.md §3.2.
 *
 * 단일 TF 결정의 false positive 를 줄이기 위해 1H / 4H / 1D 의 VWAP 시그널
 * 방향 일치도를 측정. aligned/partial/mixed/neutral 4 단계 + multiplier 제안.
 *
 * 헌장 규칙 3 준수: 단독 시그널 발행 X, BBDX 보조 입력으로만 사용.
 *
 * fetchKlines 실패 시 graceful fallback (alignmentLevel: "neutral", multiplier 1.0).
 * throw 절대 X — modifier 계열 호출 체인 보호.
 */
import type {
  AlignmentLevel,
  MultiTfAlignment,
  MultiTfAlignmentPerTf,
} from "./shared/types";
import { fetchKlines } from "./bybit";
import {
  calculateVWAP,
  calculateEMA,
  decideVwapSignal,
  detectPullback,
  volumeRatio,
} from "./indicators";

const TF_LIST: ("1h" | "4h" | "1d")[] = ["1h", "4h", "1d"];

function levelToMultiplier(level: AlignmentLevel): number {
  switch (level) {
    case "aligned":
      return 1.15;
    case "partial":
      return 1.05;
    case "mixed":
      return 0.95;
    case "neutral":
    default:
      return 1.0;
  }
}

/**
 * 단일 TF 의 VWAP 시그널 방향/강도 도출.
 * fetchKlines/calc 실패 시 null/0.
 */
async function evalSingleTf(
  symbol: string,
  tf: "1h" | "4h" | "1d"
): Promise<MultiTfAlignmentPerTf> {
  try {
    const candles = await fetchKlines(symbol, tf, 100);
    if (!candles || candles.length < 20) {
      return { side: null, strength: 0 };
    }
    const closes = candles.map((c) => c.close);
    const vwap = calculateVWAP(candles);
    const ema9 = calculateEMA(closes, 9);
    const last = candles[candles.length - 1];
    const pullback = detectPullback(candles, vwap, ema9);
    const ratio = volumeRatio(candles);
    const sig = decideVwapSignal(last.close, vwap, ema9, pullback, ratio);
    if (!sig) return { side: null, strength: 0 };
    return { side: sig.side, strength: sig.strength };
  } catch (err: any) {
    console.warn(
      `[vwap-multi-tf] ${symbol}@${tf} eval failed: ${err?.message ?? err}`
    );
    return { side: null, strength: 0 };
  }
}

/**
 * 1H / 4H / 1D VWAP 시그널의 정합도 평가.
 *
 * @param symbol - Bybit 심볼 (예: "BTCUSDT")
 * @param signalSide - BBDX 진입 path 의 side (LONG / SHORT)
 *
 * @returns alignmentLevel + multiplier (헌장 규칙 3 — multiplier 로만 사용)
 */
export async function checkVwapMultiTfAlignment(
  symbol: string,
  signalSide: "LONG" | "SHORT"
): Promise<MultiTfAlignment> {
  try {
    const results = await Promise.all(
      TF_LIST.map((tf) => evalSingleTf(symbol, tf))
    );
    const perTf: Record<string, MultiTfAlignmentPerTf> = {};
    let matchCount = 0;
    for (let i = 0; i < TF_LIST.length; i++) {
      const tf = TF_LIST[i];
      const r = results[i];
      perTf[tf] = r;
      if (r.side === signalSide) matchCount++;
    }
    let level: AlignmentLevel;
    if (matchCount === 3) level = "aligned";
    else if (matchCount === 2) level = "partial";
    else if (matchCount === 1) level = "mixed";
    else level = "neutral";

    return {
      tfs: TF_LIST,
      alignmentLevel: level,
      perTf,
      multiplier: levelToMultiplier(level),
    };
  } catch (err: any) {
    console.warn(
      `[vwap-multi-tf] ${symbol} alignment failed: ${err?.message ?? err}`
    );
    return {
      tfs: TF_LIST,
      alignmentLevel: "neutral",
      perTf: {},
      multiplier: 1.0,
    };
  }
}
