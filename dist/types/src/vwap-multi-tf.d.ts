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
import type { MultiTfAlignment } from "./shared/types";
/**
 * 1H / 4H / 1D VWAP 시그널의 정합도 평가.
 *
 * @param symbol - Bybit 심볼 (예: "BTCUSDT")
 * @param signalSide - BBDX 진입 path 의 side (LONG / SHORT)
 *
 * @returns alignmentLevel + multiplier (헌장 규칙 3 — multiplier 로만 사용)
 */
export declare function checkVwapMultiTfAlignment(symbol: string, signalSide: "LONG" | "SHORT"): Promise<MultiTfAlignment>;
