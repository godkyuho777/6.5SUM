/**
 * RS-MeanRevert — BTC 대비 상대 평균회귀 modifier — docs/2026-06-04-RS-MEANREVERT/00-DESIGN.md.
 *
 * BBDX 가 알트에 롱 진입할 때, 그 알트가 BTC 벤치마크 대비 *과도하게 뒤처졌으면*
 * (weak_laggard: rs30<−5% AND rs7<0) BB 하단에서의 mean-reversion 탄성이 강하다는
 * 백테스트 발견에 따라 신뢰도를 ×1.12 증폭. 그 외 모든 국면은 1.00 (영향 없음).
 *
 * RS-Rotation("리더를 사라" momentum)의 부호 반전형 — RS-Rotation 백테스트가
 * FAIL(leader 33.3% < laggard 36.5%)한 뒤, weak_laggard 40.1%(Wilson [37.5,42.8] >
 * baseline 34.8%, CI 비중첩)에서 유의 알파가 발견되어 이 modifier 로 승계되었다.
 * BBDX 는 구조적으로 mean-reversion(BB 하단 바운스)이라 momentum RS 와 충돌하고,
 * "BTC 에 가장 뒤진 알트"가 BB 하단에서 가장 강하게 반등하는 방향이 BBDX 와 맞는다.
 *
 * 차원 1 (Momentum 슬롯 유지, 라벨 "relative mean-reversion"). MACD div(같은 차원1,
 * 절대 다이버전스)와 측정 각도 직교 — 가격 자기평균 이탈 vs BTC 대비 상대 이탈.
 *
 * ── P1 = spot-only ①RS레벨(30d) + ②RS추세(7d) ─────────────────────────────
 * 두 지표 모두 spot 캔들(coin + BTC 벤치)만으로 산출 → lookahead-free 백테스트
 * 즉시 가능. (③도미넌스/BTC.D regime 게이트는 BTC.D 시계열 필요 → P2 보류.)
 *
 * 헌장 준수:
 *   - 벤치마크 자기자신(BTCUSDT) → multiplier 1.0 (RS=0 정의상 중립).
 *   - 데이터 부족 / NaN / 조인 실패 / 예외 → neutralModifier (multiplier 1.0, throw X).
 *   - 비대칭 설계 — 증폭(1.12)만, 억제(<1.0) 전면 금지. leader/strong_leader 는
 *     baseline 과 Wilson CI 중첩(유의하게 나쁘지 않음)이라 억제 시 역최적화
 *     (RS-Rotation 이 실패한 바로 그 함정)이 되므로 전부 1.0 으로 둔다.
 *   - 1.12 단독은 clampMultiplier 상한 1.40 안쪽 — combine 결과를 clamp 로 감싸 회귀 가드.
 *
 * Lookahead-free: i 시점 RS 는 coin.close[i−w..i] + btc.close[i−w..i] 만 참조.
 * coin↔BTC 캔들은 인덱스가 아닌 openTime 타임스탬프로 조인(코인별 상장일 차이로
 * 인덱스 어긋남 방지). 평가 시점 t 이전 데이터만 사용.
 */
import type { Candle } from "@shared/types";
import type { ModifierResult } from "./types";
export type RsMeanRevertRegime = "strong_leader" | "leader" | "neutral" | "laggard" | "weak_laggard" | "benchmark";
export interface RsMeanRevertResult extends ModifierResult {
    /** RS 레벨 (30d) — log(coin/btc)[t] − log(coin/btc)[t−30d]. <0 = BTC 언더퍼폼. */
    rs30: number;
    /** RS 추세 (7d) — RS 의 단기 기울기. <0 = 여전히 뒤지는 중. */
    rs7: number;
    regime: RsMeanRevertRegime;
}
/**
 * RS-MeanRevert multiplier 산출.
 *
 * @param coinCandles 대상 코인의 시간순 정렬 spot 캔들. 마지막 = 평가 시점 t.
 * @param btcCandles  BTC 벤치마크 spot 캔들 (openTime 조인용).
 * @param symbol      대상 코인 심볼. BTCUSDT(벤치) → 1.0 중립.
 *
 * 데이터 부족 / 조인 실패 / NaN / 예외 → multiplier 1.0 (기존 동작 불변, throw X).
 */
export declare function computeRsMeanRevert(coinCandles: Candle[], btcCandles: Candle[], symbol: string): RsMeanRevertResult;
