/**
 * Signal Extractor — Lookahead-free Signal Replay (v6.5 Phase 1)
 *
 * 핵심 원칙: NO LOOKAHEAD BIAS
 * - 캔들 i의 시그널 판단: candles[0..i] 만 사용
 * - 캔들 i의 결과 측정: candles[i+1..i+outcomeWindow] 만 사용
 * - 두 데이터 집합이 절대 섞이지 않음
 *
 * v6.5 Phase 1 변경:
 * - measureOutcome: 단일 target 청산 → Tier 1 (50% at bbMiddle) + Tier 2 (full at bbUpper or +5%)
 * - Stop: bbLower × 0.97 → max(bbLower × 0.97, entry × 0.98)
 * - 진입 게이트 추가: Pattern Confluence (≥0.4) + Higher-TF SMA(50) 필터
 */
import type { Candle } from "@shared/types";
import type { BacktestConfig, BacktestTrade } from "./types";
/**
 * 단일 심볼의 전체 캔들에서 BBDX 시그널을 추출하고
 * 각 시그널의 outcome 을 측정한다.
 *
 * v6.5 Phase 1 진입 게이트:
 *   1. isEntrySignal (RSI 30~35, BB lower, ADX ≤ 30)
 *   2. Falling Knife (-DI > +DI && ADX > 25 → 차단)
 *   3. Pattern Confluence ≥ 0.4 (NEW)
 *   4. Higher-TF SMA(50) Bullish (NEW, BEARISH 차단)
 *
 * @param symbol   심볼 (e.g. "BTCUSDT")
 * @param candles  해당 심볼의 전체 캔들 (oldest → newest)
 * @param config   백테스트 설정
 */
export declare function extractSignalsFromCandles(symbol: string, candles: Candle[], config: BacktestConfig): BacktestTrade[];
/**
 * 여러 심볼의 캔들 맵에서 전체 트레이드를 추출한다.
 *
 * @param symbolCandles 심볼 → 캔들 배열
 * @param config        백테스트 설정
 * @param onProgress    심볼 처리 완료 시 콜백 (옵션, runner 의 progress 표시용)
 */
export declare function extractAllSignals(symbolCandles: Map<string, Candle[]>, config: BacktestConfig, onProgress?: (done: number, total: number, symbol: string) => void): BacktestTrade[];
