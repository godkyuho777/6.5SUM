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

const EMPTY_PROFILE: VolumeProfile = {
  bins: [],
  poc: 0,
  hvnList: [],
  lvnList: [],
  valueArea: { low: 0, high: 0, pct: 0 },
  totalVolume: 0,
};

/**
 * 캔들 시퀀스에서 Volume Profile 산출.
 *
 * @param candles - 시간순 정렬 캔들 (오래된 것 → 최신). 빈 배열 허용.
 * @param binCount - 가격 범위를 분할할 bin 수 (명세서 기본 24).
 */
export function computeVolumeProfile(
  candles: Candle[],
  binCount: number = 24
): VolumeProfile {
  if (!candles || candles.length === 0 || binCount <= 0) {
    return { ...EMPTY_PROFILE, bins: [] };
  }

  // 1. 가격 범위
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }

  // 모든 캔들이 같은 가격인 엣지: 1 bin 에 전부, HVN = 그 가격, LVN = []
  if (!isFinite(minPrice) || !isFinite(maxPrice) || maxPrice <= minPrice) {
    let totalVol = 0;
    for (const c of candles) totalVol += c.volume;
    const mid = isFinite(minPrice) ? minPrice : 0;
    const bin: VolumeProfileBin = {
      priceLow: mid,
      priceHigh: mid,
      volume: totalVol,
    };
    return {
      bins: [bin],
      poc: mid,
      hvnList: totalVol > 0 ? [mid] : [],
      lvnList: [],
      valueArea: {
        low: mid,
        high: mid,
        pct: totalVol > 0 ? 1 : 0,
      },
      totalVolume: totalVol,
    };
  }

  // 2. binCount 등분
  const binSize = (maxPrice - minPrice) / binCount;
  const bins: VolumeProfileBin[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({
      priceLow: minPrice + i * binSize,
      priceHigh: minPrice + (i + 1) * binSize,
      volume: 0,
    });
  }

  // 3. typical price 가 속한 bin 에 거래량 누적
  let totalVolume = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    let idx = Math.floor((typical - minPrice) / binSize);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].volume += c.volume;
    totalVolume += c.volume;
  }

  // 4. POC = 거래량 max bin 의 mid-price
  let pocIdx = 0;
  let pocVol = bins[0].volume;
  for (let i = 1; i < binCount; i++) {
    if (bins[i].volume > pocVol) {
      pocVol = bins[i].volume;
      pocIdx = i;
    }
  }
  const pocBin = bins[pocIdx];
  const pocMid = (pocBin.priceLow + pocBin.priceHigh) / 2;

  // 5. avg volume per bin
  const avgVolPerBin = totalVolume / binCount;

  // 6. HVN / LVN
  const hvnThreshold = avgVolPerBin * 1.5;
  const lvnThreshold = avgVolPerBin * 0.5;
  const hvnList: number[] = [];
  const lvnList: number[] = [];
  for (const b of bins) {
    const mid = (b.priceLow + b.priceHigh) / 2;
    if (b.volume > hvnThreshold) hvnList.push(mid);
    else if (b.volume < lvnThreshold) lvnList.push(mid);
  }

  // 7. 70% Value Area: POC 시작 → 좌우로 큰 bin 부터 누적, 70% 도달 시 정지
  const targetVol = totalVolume * 0.7;
  let vaLowIdx = pocIdx;
  let vaHighIdx = pocIdx;
  let vaVol = bins[pocIdx].volume;
  while (
    vaVol < targetVol &&
    (vaLowIdx > 0 || vaHighIdx < binCount - 1)
  ) {
    const lowerCandidate = vaLowIdx > 0 ? bins[vaLowIdx - 1].volume : -1;
    const upperCandidate =
      vaHighIdx < binCount - 1 ? bins[vaHighIdx + 1].volume : -1;
    if (lowerCandidate < 0 && upperCandidate < 0) break;
    if (lowerCandidate >= upperCandidate && vaLowIdx > 0) {
      vaLowIdx--;
      vaVol += bins[vaLowIdx].volume;
    } else if (upperCandidate >= 0 && vaHighIdx < binCount - 1) {
      vaHighIdx++;
      vaVol += bins[vaHighIdx].volume;
    } else if (vaLowIdx > 0) {
      vaLowIdx--;
      vaVol += bins[vaLowIdx].volume;
    } else {
      break;
    }
  }
  const valueArea: VolumeProfileValueArea = {
    low: bins[vaLowIdx].priceLow,
    high: bins[vaHighIdx].priceHigh,
    pct: totalVolume > 0 ? vaVol / totalVolume : 0,
  };

  return {
    bins,
    poc: pocMid,
    hvnList,
    lvnList,
    valueArea,
    totalVolume,
  };
}
