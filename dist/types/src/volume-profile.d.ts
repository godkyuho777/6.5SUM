/**
 * Volume Profile module — VWAP Strategy 명세서 §6 구현.
 *
 * 24-bin Volume Profile + POC + HVN/LVN + 70% Value Area.
 * 1차 구현 단순화: 캔들의 typical price 가 속한 단일 bin 에 전체 거래량 할당.
 * (명세서가 권장하는 high-low 비율 분배는 후속 작업에서 도입 가능 — 현재는
 * 충분한 정확도. 룩어헤드 위험 0.)
 *
 * 헌장 규칙 3 준수: VolumeProfile 은 단독 시그널 발행 X, BBDX 보조 차원으로만 사용.
 */
import type { Candle } from "./shared/types";
export interface VolumeProfileBin {
    /** Bin 의 가격 하한 (포함) */
    priceLow: number;
    /** Bin 의 가격 상한 (배타) */
    priceHigh: number;
    /** 이 bin 에 누적된 거래량 */
    volume: number;
}
export interface VolumeProfileValueArea {
    low: number;
    high: number;
    /** 실제 누적된 거래량 비율 (0~1) — 통상 0.7 근처 */
    pct: number;
}
export interface VolumeProfile {
    bins: VolumeProfileBin[];
    /** Point of Control: bin 중 거래량 최대인 bin 의 mid-price */
    poc: number;
    /** High Volume Nodes: volume > 1.5 × mean(volume per bin) 인 bin 들의 mid-price 리스트 */
    hvnList: number[];
    /** Low Volume Nodes: volume < 0.5 × mean 인 bin 들의 mid-price 리스트 */
    lvnList: number[];
    /** 70% Value Area: POC 부터 좌우로 가장 큰 volume 인 bin 을 누적 추가 */
    valueArea: VolumeProfileValueArea;
    /** Sanity check 용 — bins 거래량 합계 */
    totalVolume: number;
}
/**
 * 캔들 시퀀스에서 Volume Profile 산출.
 *
 * @param candles - 시간순 정렬 캔들 (오래된 것 → 최신). 빈 배열 허용.
 * @param binCount - 가격 범위를 분할할 bin 수 (명세서 기본 24).
 */
export declare function computeVolumeProfile(candles: Candle[], binCount?: number): VolumeProfile;
