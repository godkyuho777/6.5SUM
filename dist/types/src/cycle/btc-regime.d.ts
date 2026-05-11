/**
 * BTC Cycle Regime Detection — P1-④ (2026-05-11).
 *
 * 전체 시장의 cycle 상태를 BTC 200d SMA 기준으로 분류 (bull / bear / range).
 * 각 strategy 가 cycle-aware 로 활성/비활성 결정.
 *
 *   bull:     BTC > 200d MA × 1.05  → mean reversion 약화, trend follow 강화
 *   bear:     BTC < 200d MA × 0.95  → mean reversion 정상, SHORT trend 활성
 *   neutral:  ±5% range             → 양쪽 모두 정상 운영
 *
 * 헌장 R3 (단독 시그널 X): 본 regime 은 BBDX/Trend strategy 의 *gate* 로만
 * 사용. 단독 시그널 발행 X.
 *
 * 캐시: 1시간 단위 캐시. BTC 200d MA 는 빠르게 변하지 않음.
 */
export type BtcCycleRegime = "bull" | "bear" | "neutral";
export interface BtcCycleResult {
    regime: BtcCycleRegime;
    /** BTC 현재가. */
    btcPrice: number;
    /** BTC 200d SMA. */
    ma200: number;
    /** (현재가 - ma200) / ma200 — bull threshold +0.05, bear -0.05. */
    distance: number;
    /** 데이터 fetch 시각 (ms). */
    computedAt: number;
}
/**
 * BTC cycle regime 산출. 1시간 캐시 적용.
 *
 * 외부 API 실패 시 'neutral' fallback (가장 안전한 default — 양쪽 strategy 운영).
 */
export declare function detectBtcCycleRegime(): Promise<BtcCycleResult>;
/**
 * Strategy 별 cycle-aware activation 정책 (sync — backtest 호출용).
 *
 *   BBDX (mean reversion LONG): bull 약화 (skip), bear/neutral 정상
 *   BBDX-SHORT:                  bull 차단 (skip), bear 강화, neutral 약화
 *   Trend-Follow:               bull 강화, bear/neutral 약화
 *
 * @returns true = strategy 활성화 (entry 허용), false = 차단
 */
export declare function isStrategyActiveInRegime(strategy: "bbdx" | "bbdx-short" | "trend-follow", regime: BtcCycleRegime): boolean;
