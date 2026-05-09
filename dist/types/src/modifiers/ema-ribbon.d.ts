/**
 * EMA Ribbon Modifier — 명세서 03_ADDITIONAL_STRATEGIES.md §2.
 *
 * EMA(9, 21, 50, 100, 200) 정렬 + ribbon expansion 으로 추세 건강도 측정.
 * BBDX ADX/DI 와 같은 3차원 (trend) 이지만 측정 각도가 다르다 (강도 vs 정렬).
 * 헌장 규칙 3 준수: standalone 시그널 X, BBDX confidence multiplier 로만 사용.
 *
 * 룩어헤드 안전: 마지막 캔들까지의 EMA 만 사용, i+N 미래 참조 X.
 */
import type { Candle } from "@shared/types";
import type { ModifierResult } from "./types";
export type EmaRibbonAlignment = "strong_bull" | "weak_bull" | "neutral" | "weak_bear" | "strong_bear";
export interface EmaRibbonResult extends ModifierResult {
    alignment: EmaRibbonAlignment;
    emas: {
        ema9: number;
        ema21: number;
        ema50: number;
        ema100: number;
        ema200: number;
    };
    /**
     * Ribbon expansion = (width_now - width_5_candles_ago) / |width_5_ago|.
     * 양수 = ribbon 이 벌어짐 (추세 강화), 음수 = 좁아짐 (추세 약화).
     */
    expansion: number;
}
/**
 * EMA Ribbon 산출.
 *
 * @param candles 시간순 정렬 (오래된 것 → 최신). 최소 200 권장.
 * @returns ModifierResult + alignment + emas + expansion.
 *
 * 데이터 부족 (< 50 캔들) 시 status="stub", multiplier=1.0 반환.
 */
export declare function computeEmaRibbon(candles: Candle[]): EmaRibbonResult;
