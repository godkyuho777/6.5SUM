# VWAP Strategy — 상세 기술 명세서

**시스템**: VWAP + EMA(9) + Volume Profile 매매 전략  
**스타일**: Parker Brooks 방식  
**버전**: v1.0  
**마지막 업데이트**: 2026년 5월 5일  
**상태**: 운영 중  
**파일**: `/home/ubuntu/binance_trading_bot/client/src/lib/vwap-engine.ts`

---

## 목차

1. [개요](#1-개요)
2. [핵심 개념](#2-핵심-개념)
3. [입력 데이터](#3-입력-데이터)
4. [VWAP 계산](#4-vwap-계산)
5. [EMA(9) 계산](#5-ema9-계산)
6. [Volume Profile 계산](#6-volume-profile-계산)
7. [신호 감지 로직](#7-신호-감지-로직)
8. [EMA 되돌림 감지](#8-ema-되돌림-감지)
9. [매매 신호 점수 시스템](#9-매매-신호-점수-시스템)
10. [출력 데이터](#10-출력-데이터)
11. [UI 구성](#11-ui-구성)
12. [구현 예제](#12-구현-예제)

---

## 1. 개요

### 1.1 목적

**VWAP Strategy**는 다음 3가지 지표를 종합하여 **롱/숏 매매 신호**를 생성합니다:

| 지표 | 역할 | 의미 |
|------|------|------|
| **VWAP** | 기관 투자자 방향 판단 | 가격 > VWAP = 매수 압력, 가격 < VWAP = 매도 압력 |
| **EMA(9)** | 단기 모멘텀 + 되돌림 진입 | 가격이 EMA에 터치 후 반등 = 진입 신호 |
| **Volume Profile** | 매물대 지지/저항 | HVN(고거래량) = 저항, LVN(저거래량) = 상승 여력 |

### 1.2 매매 로직

**롱 조건** (모두 충족):
```
1. 가격 > VWAP (기관 매수 압력)
2. EMA(9) > VWAP (단기 모멘텀 상승)
3. EMA(9) 되돌림 반등 감지 (진입 타이밍)
4. 현재가 아래 HVN 또는 POC 지지 (손실 제한)
5. 현재가 위 LVN 빈 구간 (상승 여력)
```

**숏 조건** (반대):
```
1. 가격 < VWAP (기관 매도 압력)
2. EMA(9) < VWAP (단기 모멘텀 하락)
3. EMA(9) 되돌림 거부 감지 (진입 타이밍)
4. 현재가 위 HVN 또는 POC 저항 (손실 제한)
5. 현재가 아래 LVN 빈 구간 (하락 여력)
```

---

## 2. 핵심 개념

### 2.1 VWAP (Volume Weighted Average Price)

**정의**: 거래량을 가중치로 한 평균 가격

```
VWAP = Σ(대표가격 × 거래량) / Σ거래량

대표가격 = (고가 + 저가 + 종가) / 3
```

**해석**:
- **가격 > VWAP**: 현재 거래가 평균보다 높음 → 기관 매수 압력
- **가격 < VWAP**: 현재 거래가 평균보다 낮음 → 기관 매도 압력
- **가격 = VWAP**: 공정 가격 (중립)

**예시**:
```
캔들 1: 고=100, 저=99, 종=99.5, 거래량=1000
  대표가격 = (100+99+99.5)/3 = 99.5
  누적(대표×거래) = 99.5 × 1000 = 99,500
  누적거래량 = 1000
  VWAP = 99,500 / 1000 = 99.5

캔들 2: 고=101, 저=99.5, 종=100.5, 거래량=2000
  대표가격 = (101+99.5+100.5)/3 = 100.33
  누적(대표×거래) = 99,500 + (100.33 × 2000) = 299,160
  누적거래량 = 1000 + 2000 = 3000
  VWAP = 299,160 / 3000 = 99.72
```

### 2.2 EMA(9) (Exponential Moving Average)

**정의**: 최근 데이터에 더 높은 가중치를 부여한 이동평균

```
multiplier = 2 / (period + 1) = 2 / 10 = 0.2 (for EMA(9))
EMA = (현재가 - 이전EMA) × multiplier + 이전EMA
    = (현재가 - 이전EMA) × 0.2 + 이전EMA
```

**초기값**: 첫 9개 캔들의 SMA(단순이동평균)

**예시**:
```
종가 시퀀스: 100, 101, 99, 102, 100.5, 103, 101, 102.5, 100, 101.5

첫 9개의 SMA = (100+101+99+102+100.5+103+101+102.5+100) / 9 = 101.17

EMA(10) = (101.5 - 101.17) × 0.2 + 101.17 = 101.23
```

**역할**:
- 단기 모멘텀 추적
- 가격 되돌림 시 지지/저항 역할
- VWAP와의 관계로 추세 강도 판단

### 2.3 Volume Profile (거래량 프로필)

**정의**: 가격 범위별 거래량 분포

**주요 개념**:

| 용어 | 정의 | 의미 |
|------|------|------|
| **POC** | Point of Control | 가장 거래량이 많은 가격 (매물대 중심) |
| **HVN** | High Volume Node | 평균 거래량의 1.5배 이상 (강한 저항/지지) |
| **LVN** | Low Volume Node | 평균 거래량의 0.5배 이하 (빈 구간 = 상승/하락 여력) |
| **VA** | Value Area | 전체 거래량의 70%가 집중된 가격 범위 |

**계산 프로세스**:

1. **가격 범위 분할**: 최고가 ~ 최저가를 24개 구간(bin)으로 분할
2. **거래량 분배**: 각 캔들의 거래량을 해당 가격 범위에 비례 분배
3. **POC 찾기**: 거래량이 가장 많은 구간의 중앙값
4. **HVN/LVN 판별**: 평균 거래량 대비 비율로 판별
5. **Value Area**: POC부터 시작하여 위/아래로 확장하며 70% 도달 시 종료

**예시**:
```
가격 범위: $99 ~ $101 (구간 크기 = 2/24 = 0.083)

Bin 0: $99.00~$99.08, 거래량 500 (평균 1000의 50% = LVN)
Bin 1: $99.08~$99.17, 거래량 1500 (평균의 150% = HVN)
Bin 2: $99.17~$99.25, 거래량 2000 (평균의 200% = HVN, POC)
...
Bin 23: $100.92~$101.00, 거래량 400 (평균의 40% = LVN)

POC = $99.25 (거래량 2000)
VA = $99.08 ~ $99.92 (전체 거래량의 70% 포함)
```

---

## 3. 입력 데이터

### 3.1 Candle 구조

```typescript
interface Candle {
  openTime: number;   // 캔들 시작 시간 (ms)
  open: number;       // 시가
  high: number;       // 고가
  low: number;        // 저가
  close: number;      // 종가
  volume: number;     // 거래량
  closeTime: number;  // 캔들 종료 시간 (ms)
}
```

### 3.2 데이터 요구사항

| 항목 | 최소값 | 권장값 | 설명 |
|------|--------|--------|------|
| **캔들 수** | 20 | 200 | 20개 미만 시 신호 생성 불가 |
| **시간 범위** | 20시간 | 200시간 (8일) | 충분한 거래량 프로필 필요 |
| **타임프레임** | 15m | 15m/30m/1h/4h/1d | 스캔 시 모든 TF 지원 |
| **거래량** | 0 이상 | 평균 이상 | 0 값 포함 시 프로필 왜곡 가능 |

### 3.3 스캔 설정

```typescript
// VWAP Strategy 스캔 설정
const VWAP_SCAN_CONFIG = {
  timeframes: ["15m", "30m", "1h", "4h", "1d"],  // 지원 타임프레임
  candleCount: 200,                               // 각 타임프레임 200개 캔들
  minCandleCount: 20,                             // 최소 20개 이상 필요
  volumeBins: 24,                                 // Volume Profile 구간 수
  batchSize: 3,                                   // 동시 스캔 코인 수
  universe: TOP_COINS,                            // 스캔 대상 (약 100개 주요 코인)
};
```

---

## 4. VWAP 계산

### 4.1 계산 공식

```typescript
function calculateVWAP(candles: Candle[]): VwapDataPoint[] {
  const result: VwapDataPoint[] = [];
  let cumulativeTPV = 0;    // cumulative (typical price × volume)
  let cumulativeVolume = 0;

  for (const candle of candles) {
    // 1. 대표가격 계산
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    
    // 2. 누적값 업데이트
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;

    // 3. VWAP 계산
    const vwap = cumulativeVolume > 0 
      ? cumulativeTPV / cumulativeVolume 
      : candle.close;

    result.push({
      time: Math.floor(candle.openTime / 1000),
      vwap,
    });
  }

  return result;
}
```

### 4.2 특징

- **누적 계산**: 처음부터 현재까지의 모든 데이터 포함
- **거래량 가중**: 거래량 많은 캔들이 VWAP에 더 영향
- **비트코인 특성**: 암호화폐는 24시간 거래이므로 세션 리셋 없음
- **차트 오버레이**: 파란색 선으로 표시

---

## 5. EMA(9) 계산

### 5.1 계산 공식

```typescript
function calculateEMA(closes: number[], period = 9): number[] {
  if (closes.length === 0) return [];
  if (closes.length < period) {
    // 데이터 부족 시 SMA로 대체
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
    return closes.map(() => sma);
  }

  const result: number[] = [];
  const multiplier = 2 / (period + 1);  // = 0.2 for EMA(9)

  // 첫 period 개의 SMA를 초기값으로
  const sma = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // period 이전은 SMA로 채움
  for (let i = 0; i < period - 1; i++) {
    result.push(sma);
  }
  result.push(sma);

  // EMA 계산
  let prevEma = sma;
  for (let i = period; i < closes.length; i++) {
    const ema = (closes[i] - prevEma) * multiplier + prevEma;
    result.push(ema);
    prevEma = ema;
  }

  return result;
}
```

### 5.2 특징

- **multiplier = 0.2**: 최근 데이터에 20% 가중치
- **초기값**: 첫 9개 캔들의 SMA
- **반응성**: SMA보다 빠르게 가격 변화에 반응
- **차트 오버레이**: 주황색 선으로 표시

---

## 6. Volume Profile 계산

### 6.1 계산 프로세스

```typescript
function calculateVolumeProfile(
  candles: Candle[],
  numBins = 24
): VolumeProfileResult {
  // 1. 가격 범위 계산
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }

  // 2. 가격 범위가 너무 좁으면 ±1% 확장
  if (maxPrice - minPrice < minPrice * 0.001) {
    const mid = (maxPrice + minPrice) / 2;
    minPrice = mid * 0.99;
    maxPrice = mid * 1.01;
  }

  // 3. 구간 크기 계산
  const binSize = (maxPrice - minPrice) / numBins;
  const binVolumes: number[] = new Array(numBins).fill(0);
  let totalVolume = 0;

  // 4. 각 캔들의 거래량을 해당 가격 범위에 분배
  for (const candle of candles) {
    const candleRange = candle.high - candle.low;
    
    if (candleRange === 0) {
      // 가격 변동 없는 캔들 → 종가 위치에 전체 거래량 할당
      const binIdx = Math.min(
        Math.floor((candle.close - minPrice) / binSize),
        numBins - 1
      );
      if (binIdx >= 0) {
        binVolumes[binIdx] += candle.volume;
      }
    } else {
      // 캔들의 가격 범위에 걸친 빈들에 비례 분배
      const startBin = Math.max(0, Math.floor((candle.low - minPrice) / binSize));
      const endBin = Math.min(numBins - 1, Math.floor((candle.high - minPrice) / binSize));

      for (let b = startBin; b <= endBin; b++) {
        const binLow = minPrice + b * binSize;
        const binHigh = binLow + binSize;
        const overlap = Math.min(candle.high, binHigh) - Math.max(candle.low, binLow);
        const fraction = Math.max(0, overlap / candleRange);
        binVolumes[b] += candle.volume * fraction;
      }
    }
    totalVolume += candle.volume;
  }

  // 5. POC (Point of Control) 찾기
  let pocIdx = 0;
  let maxVol = 0;
  for (let i = 0; i < numBins; i++) {
    if (binVolumes[i] > maxVol) {
      maxVol = binVolumes[i];
      pocIdx = i;
    }
  }
  const pocPrice = minPrice + (pocIdx + 0.5) * binSize;

  // 6. HVN/LVN 판별
  const avgVolume = totalVolume / numBins;
  const hvnThreshold = avgVolume * 1.5;  // 평균의 1.5배 이상
  const lvnThreshold = avgVolume * 0.5;  // 평균의 0.5배 이하

  // 7. Value Area (70% 거래량) 계산
  const targetVolume = totalVolume * 0.7;
  let vaVolume = binVolumes[pocIdx];
  let vaLow = pocIdx;
  let vaHigh = pocIdx;

  while (vaVolume < targetVolume && (vaLow > 0 || vaHigh < numBins - 1)) {
    const lowerVol = vaLow > 0 ? binVolumes[vaLow - 1] : 0;
    const upperVol = vaHigh < numBins - 1 ? binVolumes[vaHigh + 1] : 0;

    if (lowerVol >= upperVol && vaLow > 0) {
      vaLow--;
      vaVolume += binVolumes[vaLow];
    } else if (vaHigh < numBins - 1) {
      vaHigh++;
      vaVolume += binVolumes[vaHigh];
    } else if (vaLow > 0) {
      vaLow--;
      vaVolume += binVolumes[vaLow];
    } else {
      break;
    }
  }

  const valueAreaLow = minPrice + vaLow * binSize;
  const valueAreaHigh = minPrice + (vaHigh + 1) * binSize;

  // 8. 빈 데이터 구성
  const bins: VolumeProfileBin[] = binVolumes.map((vol, i) => {
    const priceLow = minPrice + i * binSize;
    const priceHigh = priceLow + binSize;
    const priceLevel = (priceLow + priceHigh) / 2;
    const isHVN = vol >= hvnThreshold;
    const isLVN = vol <= lvnThreshold;
    const isPOC = i === pocIdx;

    return {
      priceLevel,
      priceLow,
      priceHigh,
      volume: vol,
      percentage: totalVolume > 0 ? (vol / totalVolume) * 100 : 0,
      isHVN,
      isLVN,
      isPOC,
    };
  });

  return {
    bins,
    poc: pocPrice,
    pocVolume: maxVol,
    valueAreaHigh,
    valueAreaLow,
    hvnLevels: bins.filter(b => b.isHVN).map(b => b.priceLevel),
    lvnLevels: bins.filter(b => b.isLVN).map(b => b.priceLevel),
  };
}
```

### 6.2 예시

```
BTC 4H 캔들 200개 분석:

가격 범위: $67,000 ~ $68,000
구간 크기: 1000 / 24 = 41.67

Bin 0: $67,000~$67,041, 거래량 50M BTC (평균 100M의 50% = LVN)
Bin 1: $67,041~$67,083, 거래량 150M BTC (평균의 150% = HVN)
...
Bin 12: $67,500~$67,541, 거래량 250M BTC (평균의 250% = HVN, POC)
...
Bin 23: $67,958~$68,000, 거래량 40M BTC (평균의 40% = LVN)

결과:
- POC: $67,520 (거래량 250M)
- VA: $67,250 ~ $67,750 (전체 거래량의 70%)
- HVN 레벨: $67,041, $67,083, ..., $67,500 (5개)
- LVN 레벨: $67,000, $67,958 (2개)
```

---

## 7. 신호 감지 로직

### 7.1 신호 생성 프로세스

```typescript
export function detectVwapSignal(candles: Candle[]): VwapSignal {
  if (candles.length < 20) {
    return { direction: "NEUTRAL", strength: 0, ... };
  }

  const currentPrice = candles[candles.length - 1].close;
  const closes = candles.map((c) => c.close);

  // 1. 지표 계산
  const vwapValues = calculateVWAPSeries(candles);
  const currentVwap = vwapValues[vwapValues.length - 1];
  const emaValues = calculateEMA(closes, 9);
  const currentEma = emaValues[emaValues.length - 1];
  const vp = calculateVolumeProfile(candles, 24);

  // 2. 가격 위치 판단 (±0.1% 허용)
  const vwapTolerance = currentVwap * 0.001;
  const priceVsVwap: "ABOVE" | "BELOW" | "AT" =
    currentPrice > currentVwap + vwapTolerance ? "ABOVE" :
    currentPrice < currentVwap - vwapTolerance ? "BELOW" :
    "AT";

  const emaVsVwap: "ABOVE" | "BELOW" | "AT" =
    currentEma > currentVwap + vwapTolerance ? "ABOVE" :
    currentEma < currentVwap - vwapTolerance ? "BELOW" :
    "AT";

  // 3. 롱/숏 점수 계산 (아래 섹션 참조)
  let longScore = 0, shortScore = 0;
  
  // ... 점수 계산 로직 ...

  // 4. 최종 방향 결정
  let direction: SignalDirection = "NEUTRAL";
  if (longScore > shortScore && longScore >= 25) {
    direction = "LONG";
  } else if (shortScore > longScore && shortScore >= 25) {
    direction = "SHORT";
  }

  return {
    direction,
    strength: Math.min(100, direction === "LONG" ? longScore : shortScore),
    ...
  };
}
```

---

## 8. EMA 되돌림 감지

### 8.1 되돌림 패턴

**롱 되돌림**:
```
1. 최근 5캔들 중 저가가 EMA의 ±0.3% 이내 터치
2. 또는 캔들이 EMA를 살짝 관통 (저가 < EMA, 종가 > EMA)
3. 마지막 캔들이 EMA 위에서 양봉 (종가 > 시가)
```

**숏 되돌림**:
```
1. 최근 5캔들 중 고가가 EMA의 ±0.3% 이내 터치
2. 또는 캔들이 EMA를 살짝 관통 (고가 > EMA, 종가 < EMA)
3. 마지막 캔들이 EMA 아래에서 음봉 (종가 < 시가)
```

### 8.2 계산 코드

```typescript
function detectPullback(
  candles: Candle[],
  emaValues: number[],
  direction: "LONG" | "SHORT",
  lookback = 5
): { detected: boolean; strength: number } {
  if (candles.length < lookback + 2 || emaValues.length < lookback + 2) {
    return { detected: false, strength: 0 };
  }

  const recentCandles = candles.slice(-lookback);
  const recentEma = emaValues.slice(-lookback);
  const lastCandle = candles[candles.length - 1];
  const lastEma = emaValues[emaValues.length - 1];

  if (direction === "LONG") {
    // 롱: 가격이 EMA 근처까지 내려왔다가 반등
    let touchedEma = false;
    let bounced = false;

    for (let i = 0; i < recentCandles.length - 1; i++) {
      const c = recentCandles[i];
      const ema = recentEma[i];
      const tolerance = ema * 0.003;  // ±0.3%
      
      // EMA 터치
      if (c.low <= ema + tolerance && c.low >= ema - tolerance * 3) {
        touchedEma = true;
      }
      // 또는 캔들이 EMA 관통
      if (c.low < ema && c.close > ema) {
        touchedEma = true;
      }
    }

    // 마지막 캔들이 EMA 위에서 양봉
    if (lastCandle.close > lastEma && lastCandle.close > lastCandle.open) {
      bounced = true;
    }

    if (touchedEma && bounced) {
      // 되돌림 강도: EMA와의 거리 비율
      const distRatio = Math.abs(lastCandle.close - lastEma) / lastEma;
      const strength = Math.min(1, distRatio * 100);  // 0-1
      return { detected: true, strength };
    }
  } else {
    // 숏: 가격이 EMA 근처까지 올라갔다가 하락
    let touchedEma = false;
    let bounced = false;

    for (let i = 0; i < recentCandles.length - 1; i++) {
      const c = recentCandles[i];
      const ema = recentEma[i];
      const tolerance = ema * 0.003;
      
      if (c.high >= ema - tolerance && c.high <= ema + tolerance * 3) {
        touchedEma = true;
      }
      if (c.high > ema && c.close < ema) {
        touchedEma = true;
      }
    }

    if (lastCandle.close < lastEma && lastCandle.close < lastCandle.open) {
      bounced = true;
    }

    if (touchedEma && bounced) {
      const distRatio = Math.abs(lastCandle.close - lastEma) / lastEma;
      const strength = Math.min(1, distRatio * 100);
      return { detected: true, strength };
    }
  }

  return { detected: false, strength: 0 };
}
```

---

## 9. 매매 신호 점수 시스템

### 9.1 점수 구성 (총 100점)

| 요소 | 점수 | 롱 조건 | 숏 조건 |
|------|------|--------|--------|
| **VWAP 방향** | 25 | 가격 > VWAP | 가격 < VWAP |
| **EMA 위치** | 20 | EMA > VWAP | EMA < VWAP |
| **EMA 되돌림** | 25 | 반등 감지 | 거부 감지 |
| **VP 지지/저항** | 15 | 아래 HVN/POC | 위 HVN/POC |
| **VP 구조** | 15 | 위 LVN 빈 | 아래 LVN 빈 |

### 9.2 신호 결정 기준

```typescript
// 최종 방향 결정
let direction: SignalDirection = "NEUTRAL";
let strength = 0;

if (longScore > shortScore && longScore >= 25) {
  direction = "LONG";
  strength = Math.min(100, longScore);
} else if (shortScore > longScore && shortScore >= 25) {
  direction = "SHORT";
  strength = Math.min(100, shortScore);
}
```

**최소 임계값**: 25점 이상이어야 신호 생성

### 9.3 강도 해석

| 강도 | 의미 | 신뢰도 |
|------|------|--------|
| **60~100** | 강한 신호 | 높음 (진입 권장) |
| **30~59** | 중간 신호 | 중간 (주의 필요) |
| **25~29** | 약한 신호 | 낮음 (대기 권장) |
| **0~24** | 신호 없음 | 없음 (중립) |

---

## 10. 출력 데이터

### 10.1 VwapSignal 구조

```typescript
interface VwapSignal {
  direction: "LONG" | "SHORT" | "NEUTRAL";
  strength: number;                    // 0-100
  reasons: string[];                   // 신호 근거
  vwapScore: number;                   // 0-25
  emaPositionScore: number;            // 0-20
  emaPullbackScore: number;            // 0-25
  vpSupportScore: number;              // 0-15
  vpStructureScore: number;            // 0-15
  vwapPrice: number;                   // 현재 VWAP
  emaPrice: number;                    // 현재 EMA(9)
  pocPrice: number;                    // POC 가격
  priceVsVwap: "ABOVE" | "BELOW" | "AT";
  emaVsVwap: "ABOVE" | "BELOW" | "AT";
  pullbackDetected: boolean;
}
```

### 10.2 VwapAnalysis 구조

```typescript
interface VwapAnalysis {
  vwapData: VwapDataPoint[];           // VWAP 시계열
  emaData: EmaDataPoint[];             // EMA(9) 시계열
  volumeProfile: VolumeProfileResult;  // Volume Profile
  signal: VwapSignal;                  // 최종 신호
  currentPrice: number;                // 현재 가격
}
```

---

## 11. UI 구성

### 11.1 메인 페이지 (스캔 결과 테이블)

**레이아웃**:
```
┌─────────────────────────────────────────────────────────────────┐
│ VWAP STRATEGY                                      [TF] [RESCAN] │
│ VWAP + EMA(9) + VOLUME PROFILE // PARKER BROOKS STYLE           │
├─────────────────────────────────────────────────────────────────┤
│ Stats: Total Coins | Long Signals | Short Signals | Avg Strength│
├─────────────────────────────────────────────────────────────────┤
│ VWAP Analysis                                      [Search]      │
├─────────────────────────────────────────────────────────────────┤
│ Symbol │ Price │ 24h │ VWAP Pos │ EMA Pos │ Pullback │ Strength │
├─────────────────────────────────────────────────────────────────┤
│ BTC    │ 67.5k │ +2% │ ABOVE    │ ABOVE   │ YES      │ 75%      │
│ ETH    │ 3.2k  │ -1% │ BELOW    │ BELOW   │ NO       │ 35%      │
└─────────────────────────────────────────────────────────────────┘
```

**테이블 컬럼**:

| 컬럼 | 내용 | 색상 |
|------|------|------|
| **Symbol** | 코인 심볼 | 흰색 |
| **Price** | 현재 가격 | 흰색 |
| **24h** | 24시간 변화율 | 녹색/빨강 |
| **VWAP Pos** | 가격 vs VWAP | 녹색/빨강/회색 |
| **EMA Pos** | EMA vs VWAP | 녹색/빨강/회색 |
| **Pullback** | 되돌림 감지 | 노랑/회색 |
| **Strength** | 신호 강도 | 진행바 |
| **Signal** | 롱/숏/중립 | 녹색/빨강/회색 |

### 11.2 상세 페이지 (차트 + 분석)

**레이아웃**:
```
┌─────────────────────────────────────────────────────────────────┐
│ [← Back] BTC/USDT                              [TF] [REFRESH]   │
│ VWAP + EMA(9) + VOLUME PROFILE ANALYSIS                         │
├─────────────────────────────────────────────────────────────────┤
│ [Signal]         [Key Levels]        [Score Breakdown]          │
│ LONG             VWAP: $67,500       VWAP Direction: 25/25      │
│ 75/100           EMA(9): $67,480     EMA Position: 20/20        │
│                  POC: $67,450        EMA Pullback: 25/25        │
│                  Price: $67,520      VP Support: 15/15          │
│                                      VP Structure: 15/15        │
├─────────────────────────────────────────────────────────────────┤
│ VWAP Chart (Candlestick + VWAP + EMA + Volume Profile)          │
│                                                                  │
│  [차트 영역]                                                     │
│  - 촛대 (초록/빨강)                                              │
│  - VWAP 라인 (파란색)                                            │
│  - EMA(9) 라인 (주황색)                                          │
│  - POC 라인 (빨간 점선)                                          │
│  - Value Area 라인 (노랑 점선)                                   │
│  - HVN 존 (노랑 배경)                                            │
│  - 매수/매도 신호 (삼각형 마커)                                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Analysis Reasons                                                │
│ ◆ Price above VWAP (bullish bias)                              │
│ ◆ EMA(9) above VWAP confirms bullish momentum                  │
│ ◆ EMA(9) pullback bounce detected (long entry signal)          │
│ ◆ Volume support below: POC + 2 HVN                            │
│ ◆ 1 LVN gap above - room for upward movement                   │
├─────────────────────────────────────────────────────────────────┤
│ Volume Profile                                                  │
│ POC: $67,450 · VA: $67,200 - $67,700                           │
│ Price Level │ Volume │ % Total │ Type                          │
│ $67,500     │ 2.5M   │ 12.5%   │ HVN                           │
│ $67,450     │ 3.2M   │ 16.0%   │ POC                           │
│ $67,400     │ 2.1M   │ 10.5%   │ HVN                           │
└─────────────────────────────────────────────────────────────────┘
```

### 11.3 차트 오버레이

**요소**:

| 요소 | 색상 | 스타일 | 의미 |
|------|------|--------|------|
| **촛대** | 녹색/빨강 | 실선 | 양봉/음봉 |
| **VWAP** | 파란색 | 실선 | 기관 방향 |
| **EMA(9)** | 주황색 | 실선 | 단기 모멘텀 |
| **POC** | 빨간색 | 점선 | 매물대 중심 |
| **Value Area** | 노란색 | 점선 | 70% 거래량 범위 |
| **HVN 존** | 노란색 | 배경 | 강한 저항/지지 |
| **매수 신호** | 녹색 | 삼각형 ▲ | 롱 진입 |
| **매도 신호** | 빨간색 | 삼각형 ▼ | 숏 진입 |

### 11.4 Score Bar 컴포넌트

```typescript
function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-muted-foreground w-24">{label}</span>
      <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full",
          pct >= 80 ? "bg-neon-green" : pct >= 40 ? "bg-neon-yellow" : "bg-muted-foreground/30"
        )} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground w-8 text-right">{score}/{max}</span>
    </div>
  );
}
```

---

## 12. 구현 예제

### 12.1 단일 코인 분석

```typescript
import { analyzeVwapStrategy } from '@/lib/vwap-engine';
import { fetchKlines } from '@/lib/bybit-client';

// 1. 캔들 데이터 조회
const candles = await fetchKlines('BTCUSDT', '4h', 200);

// 2. VWAP 전략 분석
const analysis = analyzeVwapStrategy(candles);

if (!analysis) {
  console.log("데이터 부족 (최소 20개 캔들 필요)");
  return;
}

// 3. 결과 활용
console.log(`신호: ${analysis.signal.direction}`);
console.log(`강도: ${analysis.signal.strength}%`);
console.log(`이유: ${analysis.signal.reasons.join(" | ")}`);

// 4. 주요 레벨
console.log(`VWAP: $${analysis.signal.vwapPrice.toFixed(2)}`);
console.log(`EMA(9): $${analysis.signal.emaPrice.toFixed(2)}`);
console.log(`POC: $${analysis.signal.pocPrice.toFixed(2)}`);

// 5. 점수 분석
console.log(`VWAP 방향: ${analysis.signal.vwapScore}/25`);
console.log(`EMA 위치: ${analysis.signal.emaPositionScore}/20`);
console.log(`EMA 되돌림: ${analysis.signal.emaPullbackScore}/25`);
console.log(`VP 지지: ${analysis.signal.vpSupportScore}/15`);
console.log(`VP 구조: ${analysis.signal.vpStructureScore}/15`);
```

### 12.2 멀티 코인 스캔

```typescript
import { analyzeVwapStrategy } from '@/lib/vwap-engine';
import { fetchKlines, fetchAll24hTickers } from '@/lib/bybit-client';
import { TOP_COINS } from '@shared/types';

// 1. 24시간 가격 데이터 조회
const tickers = await fetchAll24hTickers();

// 2. 코인별 분석
const results = [];
for (const coin of TOP_COINS.slice(0, 50)) {
  try {
    const candles = await fetchKlines(coin, '4h', 200);
    const analysis = analyzeVwapStrategy(candles);
    
    if (analysis && analysis.signal.direction !== "NEUTRAL") {
      const ticker = tickers[coin];
      results.push({
        symbol: coin,
        price: ticker.lastPrice,
        change24h: ticker.priceChangePercent,
        signal: analysis.signal,
      });
    }
  } catch (error) {
    console.error(`Error analyzing ${coin}:`, error);
  }
}

// 3. 결과 정렬 (강도 내림차순)
results.sort((a, b) => b.signal.strength - a.signal.strength);

// 4. 상위 10개 출력
console.log("Top 10 VWAP Signals:");
results.slice(0, 10).forEach((r, i) => {
  console.log(`${i+1}. ${r.symbol}: ${r.signal.direction} (${r.signal.strength}%)`);
});
```

### 12.3 차트 렌더링 (lightweight-charts)

```typescript
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';

const chart = createChart(container, {
  width: 800,
  height: 600,
  layout: { background: { color: '#000' } },
});

// 1. 촛대 시리즈
const candleSeries = chart.addSeries(CandlestickSeries, {
  upColor: '#00e676',
  downColor: '#ff1744',
});
candleSeries.setData(candleData);

// 2. VWAP 라인
const vwapSeries = chart.addSeries(LineSeries, {
  color: '#2196F3',
  lineWidth: 2,
  title: 'VWAP',
});
vwapSeries.setData(vwapData);

// 3. EMA(9) 라인
const emaSeries = chart.addSeries(LineSeries, {
  color: '#FF9800',
  lineWidth: 2,
  title: 'EMA(9)',
});
emaSeries.setData(emaData);

// 4. POC 가격선
candleSeries.createPriceLine({
  price: analysis.volumeProfile.poc,
  color: '#ff0066',
  lineWidth: 1,
  lineStyle: 2,  // Dashed
  title: `POC ($${analysis.volumeProfile.poc.toFixed(2)})`,
});

chart.timeScale().fitContent();
```

---

## 13. 주의사항

### 13.1 데이터 정확도

- **고가/저가**: ±0.01% 이상 오차 시 Volume Profile 왜곡
- **거래량**: 0 값 포함 시 VWAP/프로필 계산 오류 가능
- **시간**: 캔들이 시간 순서대로 정렬되어야 함

### 13.2 신호 신뢰도

| 신호 강도 | 신뢰도 | 권장 조치 |
|----------|--------|----------|
| **75~100** | 매우 높음 | 적극 진입 |
| **50~74** | 높음 | 진입 고려 |
| **25~49** | 중간 | 추가 확인 후 진입 |
| **0~24** | 낮음 | 관망 |

### 13.3 타임프레임별 특성

| TF | 특성 | 용도 |
|----|------|------|
| **15m** | 높은 노이즈 | 단기 스캘핑 |
| **1h** | 중간 | 데이트레이딩 |
| **4h** | 낮은 노이즈 | 스윙 트레이딩 |
| **1D** | 장기 추세 | 포지션 트레이딩 |

### 13.4 시장 상황별 주의

- **고변동성**: 신호 강도 감소 가능 (ADX 확인 필요)
- **저거래량**: Volume Profile 신뢰도 낮음
- **갭 발생**: VWAP 급변 가능 (재계산 필요)

---

**문서 버전**: v1.0  
**마지막 업데이트**: 2026년 5월 5일  
**상태**: 완성  
**작성자**: VWAP Strategy 기술 팀
