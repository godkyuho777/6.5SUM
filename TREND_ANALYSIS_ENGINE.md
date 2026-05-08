# Trend Analysis Engine — 상세 기술 명세서 (v2.0)

**시스템**: Multi-Timeframe Trend Analysis with ATR Dynamic + EMA Cross + ADX + Volume Confirmed  
**버전**: v2.0  
**마지막 업데이트**: 2026년 5월 5일  
**상태**: 운영 중  
**파일**: `/home/ubuntu/binance_trading_bot/client/src/lib/trend-analysis.ts`

---

## 목차

1. [개요](#1-개요)
2. [핵심 개념](#2-핵심-개념)
3. [입력 데이터](#3-입력-데이터)
4. [단계별 계산 로직](#4-단계별-계산-로직)
5. [주요 알고리즘](#5-주요-알고리즘)
6. [출력 데이터](#6-출력-데이터)
7. [타임프레임 가중치](#7-타임프레임-가중치)
8. [신뢰도 계산](#8-신뢰도-계산)
9. [예측 생성 로직](#9-예측-생성-로직)
10. [구현 예제](#10-구현-예제)

---

## 1. 개요

### 1.1 목적

**Trend Analysis Engine**은 BTC의 4개 타임프레임(15분, 1시간, 4시간, 일봉)에서 추세를 분석하고, 다음 요소들을 종합하여 **정확한 추세 방향과 강도**를 도출합니다:

- **추세선 기울기** (고점-고점, 저점-저점 연결)
- **EMA 배열** (9/21/50 크로스 및 정렬)
- **ADX** (추세 강도 확인)
- **거래량** (추세 확인)
- **HH/HL/LH/LL 구조** (상승/하락 구조 판별)
- **브레이크아웃** (수렴 패턴 후 돌파)

### 1.2 핵심 개선 사항 (v2.0)

| 요소 | v1.0 | v2.0 |
|------|------|------|
| **스윙 포인트** | 단순 고점/저점 | 지수 가중 (최근 2.0x) |
| **임계값** | 고정 0.03% | ATR 기반 동적 |
| **EMA** | 단순 계산 | 크로스 감지 (골든/데드) |
| **ADX** | 미사용 | 추세 존재 여부 확인 |
| **거래량** | 미사용 | 추세 확인 레이어 |
| **HH/HL** | 미사용 | 구조 판별 (상승/하락) |
| **브레이크아웃** | 미사용 | 수렴 패턴 감지 |
| **추세 단계** | 3단계 (BULL/BEAR/SIDE) | 7단계 (STRONG_BULL → BULL_WEAK → SIDE 등) |

---

## 2. 핵심 개념

### 2.1 추세 방향 (Direction)

```typescript
type TrendDirection = "BULLISH" | "BEARISH" | "SIDEWAYS";
```

**정의**:
- **BULLISH** (상승): 고점↑ + 저점↑ (모두 양의 기울기)
- **BEARISH** (하락): 고점↓ + 저점↓ (모두 음의 기울기)
- **SIDEWAYS** (횡보): 기울기 미미 또는 고점↑ + 저점↓ (수렴)

### 2.2 추세 단계 (Phase)

```typescript
type TrendPhase = 
  | "STRONG_BULLISH"      // 강한 상승 (강도 70+ & EMA 정배열 & ADX > 25 & 거래량 확인)
  | "BULLISH"             // 일반 상승
  | "BULLISH_WEAKENING"   // 상승 약화 (강도 < 50 또는 EMA 혼합 또는 역행 모멘텀)
  | "SIDEWAYS"            // 횡보
  | "BEARISH_WEAKENING"   // 하락 약화
  | "BEARISH"             // 일반 하락
  | "STRONG_BEARISH";     // 강한 하락
```

### 2.3 추세선 정보 (TrendlineInfo)

```typescript
interface TrendlineInfo {
  slope: number;           // 기울기 (가격 변화 / 캔들 수)
  intercept: number;       // y절편 (회귀선 intercept)
  slopePct: number;        // 기울기 퍼센트 (%)
  startPrice: number;      // 시작 가격
  endPrice: number;        // 종료 가격
  startIdx: number;        // 시작 캔들 인덱스
  endIdx: number;          // 종료 캔들 인덱스
  touchCount: number;      // 터치 포인트 수
  durationCandles: number; // 지속 기간 (캔들 수)
}
```

**사용법**:
```
추세선 위의 가격 = intercept + slope × i
예: intercept = 100, slope = 0.5, i = 10
→ 가격 = 100 + 0.5 × 10 = 105
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
| **캔들 수** | 20 | 120+ | 20개 미만 시 데이터 부족 판정 |
| **시간 범위** | 20시간 | 120시간 (5일) | 충분한 스윙 포인트 필요 |
| **타임프레임** | 15m | 15m/1h/4h/1D | 4개 타임프레임 권장 |
| **데이터 정확도** | ±0.01% | ±0.001% | 고가/저가 정확도 중요 |

### 3.3 타임프레임 설정

```typescript
const TREND_TIMEFRAMES = [
  { tf: "15m", label: "15분", candleCount: 200 },
  { tf: "1h",  label: "1시간", candleCount: 200 },
  { tf: "4h",  label: "4시간", candleCount: 200 },
  { tf: "1D",  label: "일봉", candleCount: 120 },
];
```

---

## 4. 단계별 계산 로직

### 4.1 전체 흐름도

```
입력: Candle[] × 4 타임프레임
  ↓
[단일 타임프레임 분석]
  ├─ 1. ATR 계산 (동적 임계값)
  ├─ 2. 스윙 포인트 탐지 (지수 가중)
  ├─ 3. 추세선 피팅 (가중 최소자승법)
  ├─ 4. 가격 위치 판단
  ├─ 5. 모멘텀 계산
  ├─ 6. EMA 배열 분석
  ├─ 7. ADX 계산
  ├─ 8. 거래량 추세 분석
  ├─ 9. HH/HL 카운팅
  ├─ 10. 추세 방향 판단 (4차 확인)
  ├─ 11. 브레이크아웃 감지
  └─ 12. 추세 단계 결정
  ↓
TimeframeTrend × 4
  ↓
[멀티 타임프레임 종합]
  ├─ 타임프레임 가중치 적용
  ├─ 종합 방향 계산
  ├─ 정렬도 판단
  ├─ 신뢰도 계산
  └─ 예측 텍스트 생성
  ↓
출력: MultiTFTrendAnalysis
```

### 4.2 Step 1: ATR 계산 (동적 임계값)

**목적**: 변동성이 높은 코인은 더 높은 기울기 임계값 필요

**공식**:
```
True Range (TR) = max(
  high - low,
  |high - prev_close|,
  |low - prev_close|
)

ATR(14) = SMA of TR over 14 periods
         (이후 Wilder's smoothing 적용)

동적 임계값 = max(0.01%, min(15%, ATR% × 3%))
```

**예시**:
```
BTC 4H 캔들:
- 평균 가격: $67,500
- ATR(14): $850
- ATR%: 850 / 67,500 = 1.26%
- 동적 임계값: 1.26% × 3% = 0.0378%

→ 추세선 기울기가 ±0.0378% 이상이어야 추세 판정
```

**코드**:
```typescript
function calculateATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;

  let atr = 0;
  for (let i = 1; i <= period; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    atr += tr;
  }
  atr /= period;

  // Wilder's smoothing
  for (let i = period + 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    atr = (atr * (period - 1) + tr) / period;
  }

  return atr;
}

function getDynamicThreshold(candles: Candle[]): number {
  const atr = calculateATR(candles);
  const avgPrice = candles.slice(-20).reduce((s, c) => s + c.close, 0) / Math.min(20, candles.length);
  if (avgPrice === 0) return 0.03;
  
  const atrPct = (atr / avgPrice) * 100;
  return Math.max(0.01, Math.min(0.15, atrPct * 0.03));
}
```

### 4.3 Step 2: 스윙 포인트 탐지 (지수 가중)

**목적**: 로컬 고점/저점을 찾되, 최근 포인트에 더 높은 가중치 부여

**로직**:
```
1. 각 캔들 i에 대해, 좌우 windowSize 범위 내에서
   - isHigh: candles[i].high > 모든 이웃의 high
   - isLow: candles[i].low < 모든 이웃의 low

2. 지수 가중치 계산:
   recency = i / totalCandles  (0 ~ 1)
   weight = 0.5 + recency × 1.5  (0.5 ~ 2.0)
   
   → 초기 포인트: 0.5x, 최근 포인트: 2.0x
```

**예시**:
```
100개 캔들 중:
- 10번째 포인트: recency = 0.1, weight = 0.65
- 50번째 포인트: recency = 0.5, weight = 1.25
- 90번째 포인트: recency = 0.9, weight = 1.85

→ 최근 포인트가 회귀선 계산에 더 영향
```

**코드**:
```typescript
function findSwingPoints(candles: Candle[], windowSize: number = 5): SwingPoint[] {
  const points: SwingPoint[] = [];
  if (candles.length < windowSize * 2 + 1) return points;

  const totalCandles = candles.length;

  for (let i = windowSize; i < candles.length - windowSize; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = i - windowSize; j <= i + windowSize; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }

    const recency = i / totalCandles;
    const weight = 0.5 + recency * 1.5;

    if (isHigh) {
      points.push({
        index: i,
        price: candles[i].high,
        time: candles[i].openTime,
        type: "high",
        weight,
      });
    }
    if (isLow) {
      points.push({
        index: i,
        price: candles[i].low,
        time: candles[i].openTime,
        type: "low",
        weight,
      });
    }
  }

  return points;
}
```

### 4.4 Step 3: 추세선 피팅 (가중 최소자승법)

**목적**: 스윙 포인트들을 직선으로 연결하되, 최근 포인트에 더 높은 가중치 적용

**공식** (가중 선형 회귀):
```
최소화: Σ w_i × (y_i - (a + b×x_i))²

여기서:
  w_i = 포인트 i의 가중치
  y_i = 포인트 i의 가격
  x_i = 포인트 i의 인덱스
  a = intercept (y절편)
  b = slope (기울기)

해:
  slope = (Σw × Σwxy - Σwx × Σwy) / (Σw × Σwx² - (Σwx)²)
  intercept = (Σwy - slope × Σwx) / Σw
```

**예시**:
```
고점 스윙 포인트:
- (idx=10, price=100, weight=0.8)
- (idx=30, price=110, weight=1.2)
- (idx=50, price=125, weight=1.8)

회귀선 계산:
  slope = 0.5 (캔들당 +$0.50)
  intercept = 95

추세선 위의 가격:
  idx=10: 95 + 0.5×10 = 100 ✓
  idx=30: 95 + 0.5×30 = 110 ✓
  idx=50: 95 + 0.5×50 = 120 (실제 125, 오차 5)
```

**코드**:
```typescript
function fitTrendline(
  points: SwingPoint[],
  candles: Candle[],
  type: "high" | "low"
): TrendlineInfo | null {
  if (points.length < 2) return null;

  const maxPoints = Math.min(points.length, 10);
  const recentPoints = points.slice(-maxPoints);

  // 가중 최소자승법
  const n = recentPoints.length;
  let sumWX = 0, sumWY = 0, sumWXY = 0, sumWX2 = 0, sumW = 0;

  for (const p of recentPoints) {
    const w = p.weight;
    sumW += w;
    sumWX += w * p.index;
    sumWY += w * p.price;
    sumWXY += w * p.index * p.price;
    sumWX2 += w * p.index * p.index;
  }

  const denom = sumW * sumWX2 - sumWX * sumWX;
  if (Math.abs(denom) < 1e-10) return null;

  const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
  const intercept = (sumWY - slope * sumWX) / sumW;

  // 터치 카운트 (±0.5% 오차 범위)
  const tolerance = 0.005;
  let touchCount = 0;
  for (const p of recentPoints) {
    const expectedPrice = intercept + slope * p.index;
    if (Math.abs(p.price - expectedPrice) / expectedPrice < tolerance) {
      touchCount++;
    }
  }

  const startIdx = recentPoints[0].index;
  const endIdx = recentPoints[recentPoints.length - 1].index;
  const startPrice = intercept + slope * startIdx;
  const endPrice = intercept + slope * endIdx;

  const avgPrice = (startPrice + endPrice) / 2;
  const slopePct = avgPrice > 0 ? (slope / avgPrice) * 100 : 0;

  return {
    slope,
    intercept,
    slopePct,
    startPrice,
    endPrice,
    startIdx,
    endIdx,
    touchCount: Math.max(touchCount, 2),
    durationCandles: endIdx - startIdx,
  };
}
```

### 4.5 Step 6: EMA 배열 분석

**목적**: EMA(9/21/50) 크로스 및 정렬 상태 판단

**계산**:
```
EMA(n) = (현재가 - 이전EMA) × multiplier + 이전EMA
multiplier = 2 / (n + 1)

예: EMA(9) multiplier = 2 / 10 = 0.2
```

**상태 판단**:

| 상태 | 조건 | 의미 |
|------|------|------|
| **GOLDEN_CROSS** | EMA9 ↑ EMA21 (상향 돌파) | 상승 전환 신호 |
| **DEATH_CROSS** | EMA9 ↓ EMA21 (하향 돌파) | 하락 전환 신호 |
| **BULLISH_ALIGNED** | EMA9 > EMA21 > EMA50 | 상승 추세 확인 |
| **BEARISH_ALIGNED** | EMA9 < EMA21 < EMA50 | 하락 추세 확인 |
| **MIXED** | 기타 | 추세 불명확 |

**예시**:
```
현재 상황:
- EMA9: $67,800
- EMA21: $67,500
- EMA50: $67,200

판정: BULLISH_ALIGNED (9 > 21 > 50)
의미: 상승 추세 진행 중
```

**코드**:
```typescript
function analyzeEmaAlignment(candles: Candle[]): EmaAlignment {
  const closes = candles.map(c => c.close);
  const ema9Series = calculateEMASeries(closes, 9);
  const ema21Series = calculateEMASeries(closes, 21);
  const ema50Series = calculateEMASeries(closes, 50);

  const ema9 = ema9Series[ema9Series.length - 1] ?? 0;
  const ema21 = ema21Series[ema21Series.length - 1] ?? 0;
  const ema50 = ema50Series[ema50Series.length - 1] ?? 0;

  const prevEma9 = ema9Series[ema9Series.length - 2] ?? ema9;
  const prevEma21 = ema21Series[ema21Series.length - 2] ?? ema21;

  let state: EmaAlignment["state"];
  let description: string;

  if (prevEma9 <= prevEma21 && ema9 > ema21) {
    state = "GOLDEN_CROSS";
    description = "EMA(9)이 EMA(21)을 상향 돌파 (골든 크로스) → 상승 전환 신호";
  } else if (prevEma9 >= prevEma21 && ema9 < ema21) {
    state = "DEATH_CROSS";
    description = "EMA(9)이 EMA(21)을 하향 돌파 (데드 크로스) → 하락 전환 신호";
  } else if (ema9 > ema21 && ema21 > ema50) {
    state = "BULLISH_ALIGNED";
    description = "EMA 정배열 (9 > 21 > 50) → 상승 추세 확인";
  } else if (ema9 < ema21 && ema21 < ema50) {
    state = "BEARISH_ALIGNED";
    description = "EMA 역배열 (9 < 21 < 50) → 하락 추세 확인";
  } else {
    state = "MIXED";
    description = "EMA 혼합 배열 → 추세 불명확, 전환 구간 가능";
  }

  return { ema9, ema21, ema50, state, description };
}
```

### 4.6 Step 7: ADX 계산

**목적**: 추세 강도 측정 (0~100, 높을수록 강한 추세)

**공식**:
```
True Range (TR) = max(high - low, |high - prev_close|, |low - prev_close|)

+DM = high - prev_high (if > 0 and > -DM, else 0)
-DM = prev_low - low (if > 0 and > +DM, else 0)

+DI = (+DM / ATR) × 100
-DI = (-DM / ATR) × 100

DX = |+DI - -DI| / (+DI + -DI) × 100

ADX = SMA of DX over 14 periods
```

**해석**:
```
ADX > 25: 강한 추세 (TRENDING)
ADX 20~25: 약한 추세 (WEAK TREND)
ADX < 20: 추세 부재 (RANGING)
```

**예시**:
```
BTC 4H:
- ADX: 35 → TRENDING (강한 추세)
- 판정: 추세 존재, 추세선 신뢰도 높음

ETH 1H:
- ADX: 18 → RANGING (횡보)
- 판정: 추세 부재, 강제 SIDEWAYS 고려
```

**코드**:
```typescript
function calculateADXValue(candles: Candle[], period = 14): number {
  if (candles.length < period * 2 + 1) return 0;

  const trArr: number[] = [];
  const plusDmArr: number[] = [];
  const minusDmArr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    trArr.push(Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    ));
    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;
    plusDmArr.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDmArr.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  let smoothTR = trArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDmArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDmArr.slice(0, period).reduce((a, b) => a + b, 0);

  const dxArr: number[] = [];
  let plusDi = (smoothPlusDM / smoothTR) * 100;
  let minusDi = (smoothMinusDM / smoothTR) * 100;
  let diSum = plusDi + minusDi;
  if (diSum > 0) dxArr.push((Math.abs(plusDi - minusDi) / diSum) * 100);

  for (let i = period; i < trArr.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trArr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDmArr[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDmArr[i];
    plusDi = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    minusDi = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    diSum = plusDi + minusDi;
    if (diSum > 0) dxArr.push((Math.abs(plusDi - minusDi) / diSum) * 100);
  }

  let adx = 0;
  if (dxArr.length >= period) {
    adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxArr.length; i++) {
      adx = (adx * (period - 1) + dxArr[i]) / period;
    }
  } else if (dxArr.length > 0) {
    adx = dxArr.reduce((a, b) => a + b, 0) / dxArr.length;
  }

  return adx;
}
```

### 4.7 Step 8: 거래량 추세 분석

**목적**: 추세가 거래량으로 확인되는지 검증

**로직**:
```
1. 최근 거래량 평균 (recentLen 캔들)
2. 과거 거래량 평균 (olderLen 캔들)
3. 변화율 = (최근 - 과거) / 과거

변화율 > 15%: INCREASING (거래량 증가)
변화율 < -15%: DECREASING (거래량 감소)
-15% ≤ 변화율 ≤ 15%: FLAT (거래량 정체)

확인 조건:
  confirmed = (INCREASING || FLAT)
  → 추세 + 거래량 증가 또는 정체 = 확인됨
  → 추세 + 거래량 감소 = 미확인 (추세 약화 가능)
```

**예시**:
```
최근 10캔들 평균 거래량: 1,500,000 BTC
과거 10캔들 평균 거래량: 1,200,000 BTC
변화율: (1,500,000 - 1,200,000) / 1,200,000 = 25%

판정: INCREASING, confirmed = true
의미: 상승 추세 + 거래량 증가 = 강한 신호
```

**코드**:
```typescript
function analyzeVolumeTrend(candles: Candle[]): { confirmed: boolean; trend: "INCREASING" | "DECREASING" | "FLAT" } {
  if (candles.length < 10) return { confirmed: false, trend: "FLAT" };

  const recentLen = Math.min(10, Math.floor(candles.length / 3));
  const olderLen = recentLen;
  
  const recentVol = candles.slice(-recentLen).reduce((s, c) => s + c.volume, 0) / recentLen;
  const olderVol = candles.slice(-(recentLen + olderLen), -recentLen).reduce((s, c) => s + c.volume, 0) / olderLen;

  if (olderVol === 0) return { confirmed: false, trend: "FLAT" };

  const volChangeRatio = (recentVol - olderVol) / olderVol;

  let trend: "INCREASING" | "DECREASING" | "FLAT";
  if (volChangeRatio > 0.15) trend = "INCREASING";
  else if (volChangeRatio < -0.15) trend = "DECREASING";
  else trend = "FLAT";

  const confirmed = trend === "INCREASING" || trend === "FLAT";

  return { confirmed, trend };
}
```

### 4.8 Step 9: HH/HL/LH/LL 카운팅

**목적**: 상승/하락 구조 판별

**정의**:
- **HH** (Higher High): 최근 고점 > 이전 고점
- **HL** (Higher Low): 최근 저점 > 이전 저점
- **LH** (Lower High): 최근 고점 < 이전 고점
- **LL** (Lower Low): 최근 저점 < 이전 저점

**구조 판별**:
```
HH + HL (연속 2개 이상): 상승 구조
LH + LL (연속 2개 이상): 하락 구조
혼합: 구조 불명확
```

**예시**:
```
고점 시퀀스: 100 → 105 → 110 → 108
판정: HH×2 (105>100, 110>105) → 상승 구조

저점 시퀀스: 95 → 98 → 102 → 100
판정: HL×2 (98>95, 102>98) → 상승 구조

결론: HH×2 / HL×2 (상승 구조)
```

**코드**:
```typescript
function countHHLL(candles: Candle[], windowSize: number = 5): HHLLCount {
  const points = findSwingPoints(candles, windowSize);
  const highs = points.filter(p => p.type === "high");
  const lows = points.filter(p => p.type === "low");

  let consecutiveHH = 0, consecutiveHL = 0, consecutiveLH = 0, consecutiveLL = 0;

  // Higher Highs (최근부터 역순)
  for (let i = highs.length - 1; i > 0; i--) {
    if (highs[i].price > highs[i - 1].price) consecutiveHH++;
    else break;
  }

  // Higher Lows
  for (let i = lows.length - 1; i > 0; i--) {
    if (lows[i].price > lows[i - 1].price) consecutiveHL++;
    else break;
  }

  // Lower Highs
  for (let i = highs.length - 1; i > 0; i--) {
    if (highs[i].price < highs[i - 1].price) consecutiveLH++;
    else break;
  }

  // Lower Lows
  for (let i = lows.length - 1; i > 0; i--) {
    if (lows[i].price < lows[i - 1].price) consecutiveLL++;
    else break;
  }

  let structureLabel: string;
  if (consecutiveHH >= 2 && consecutiveHL >= 2) {
    structureLabel = `HH×${consecutiveHH} / HL×${consecutiveHL} (상승 구조)`;
  } else if (consecutiveLH >= 2 && consecutiveLL >= 2) {
    structureLabel = `LH×${consecutiveLH} / LL×${consecutiveLL} (하락 구조)`;
  } else if (consecutiveHH >= 1 && consecutiveHL >= 1) {
    structureLabel = `HH×${consecutiveHH} / HL×${consecutiveHL} (약한 상승)`;
  } else if (consecutiveLH >= 1 && consecutiveLL >= 1) {
    structureLabel = `LH×${consecutiveLH} / LL×${consecutiveLL} (약한 하락)`;
  } else {
    structureLabel = "구조 불명확 (Mixed)";
  }

  return { consecutiveHH, consecutiveHL, consecutiveLH, consecutiveLL, structureLabel };
}
```

### 4.9 Step 10: 추세 방향 판단 (4차 확인 시스템)

**목적**: 추세선, EMA, ADX, HH/HL을 종합하여 최종 방향 결정

**4차 확인 프로세스**:

#### 1차: 추세선 기울기 (동적 임계값 사용)

```typescript
const highSlope = resistanceLine?.slopePct ?? 0;
const lowSlope = supportLine?.slopePct ?? 0;
const avgSlope = (highSlope + lowSlope) / 2;

if (lowSlope > dynamicThreshold && highSlope > dynamicThreshold) {
  trendlineDirection = "BULLISH";
  trendlineStrength = min(100, round(|avgSlope| / dynamicThreshold × 30 + 40));
  // 예: avgSlope=0.08%, threshold=0.04%
  //     strength = min(100, (0.08/0.04) × 30 + 40) = min(100, 60 + 40) = 100
}
else if (lowSlope < -dynamicThreshold && highSlope < -dynamicThreshold) {
  trendlineDirection = "BEARISH";
  trendlineStrength = min(100, round(|avgSlope| / dynamicThreshold × 30 + 40));
}
else if (lowSlope > dynamicThreshold && highSlope < -dynamicThreshold) {
  trendlineDirection = "SIDEWAYS";  // 수렴 패턴
  trendlineStrength = min(50, round(|highSlope - lowSlope| / dynamicThreshold × 15));
}
else if (lowSlope < -dynamicThreshold && highSlope > dynamicThreshold) {
  trendlineDirection = "SIDEWAYS";  // 확산 패턴
  trendlineStrength = min(40, round(|highSlope - lowSlope| / dynamicThreshold × 10));
}
else if (avgSlope > dynamicThreshold × 0.5) {
  trendlineDirection = "BULLISH";  // 약한 상승
  trendlineStrength = min(50, round(|avgSlope| / dynamicThreshold × 20 + 15));
}
else if (avgSlope < -dynamicThreshold × 0.5) {
  trendlineDirection = "BEARISH";  // 약한 하락
  trendlineStrength = min(50, round(|avgSlope| / dynamicThreshold × 20 + 15));
}
else {
  trendlineDirection = "SIDEWAYS";  // 횡보
}
```

#### 2차: EMA 배열로 확인/부정

```typescript
let emaBonus = 0;

if (emaAlignment.state === "BULLISH_ALIGNED" || emaAlignment.state === "GOLDEN_CROSS") {
  if (trendlineDirection === "BULLISH") emaBonus = 15;  // 확인
  else if (trendlineDirection === "SIDEWAYS") emaBonus = 10;  // 약한 확인
}
else if (emaAlignment.state === "BEARISH_ALIGNED" || emaAlignment.state === "DEATH_CROSS") {
  if (trendlineDirection === "BEARISH") emaBonus = 15;  // 확인
  else if (trendlineDirection === "SIDEWAYS") emaBonus = 10;  // 약한 확인
}

// 예: BULLISH 추세선 + BULLISH_ALIGNED EMA
//     → emaBonus = 15 (강한 확인)
```

#### 3차: ADX로 추세 존재 여부 확인

```typescript
if (adxTrending) {  // ADX > 25
  // 추세 존재 확인
} else {
  // ADX < 20이면 강제 SIDEWAYS 고려
  if (adxValue < 20 && trendlineStrength < 60) {
    trendlineDirection = "SIDEWAYS";
    trendlineStrength = min(trendlineStrength, 40);
  }
}

// 예: BULLISH 추세선 + ADX 18 (< 20)
//     → 강제 SIDEWAYS (추세 부재)
```

#### 4차: HH/HL 구조로 보강

```typescript
let structureBonus = 0;

if (hhllCount.consecutiveHH >= 2 && hhllCount.consecutiveHL >= 2) {
  if (trendlineDirection === "BULLISH") structureBonus = 10;
}
else if (hhllCount.consecutiveLH >= 2 && hhllCount.consecutiveLL >= 2) {
  if (trendlineDirection === "BEARISH") structureBonus = 10;
}

// 예: BULLISH 추세선 + HH×2/HL×2 구조
//     → structureBonus = 10 (구조 확인)
```

#### 종합 강도 계산

```typescript
direction = trendlineDirection;
strength = min(100, trendlineStrength + emaBonus + structureBonus);

// 모멘텀 보정
if (direction === "BULLISH" && recentMomentum > 1%) {
  strength = min(100, strength + 10);  // 추세 가속
}
else if (direction === "BULLISH" && recentMomentum < -1%) {
  strength = max(10, strength - 15);  // 역행 모멘텀 (추세 약화)
}

// 거래량 미확인 시
if (!volumeConfirmed && direction !== "SIDEWAYS") {
  strength = max(10, strength - 10);  // 신뢰도 감소
}
```

### 4.10 Step 11: 브레이크아웃 감지

**목적**: 수렴 패턴 후 돌파 방향 확인

**수렴 패턴 조건**:
```
1. 저점 상승 + 고점 하락 (삼각형)
   supportLine.slopePct > 0 && resistanceLine.slopePct < 0

2. 또는 레인지 축소
   |resistance_end - support_end| < |resistance_start - support_start| × 0.7
```

**돌파 판단**:
```
최근 3캔들 중:
- 2개 이상이 저항선 위로 → BULLISH_BREAKOUT
- 2개 이상이 지지선 아래로 → BEARISH_BREAKDOWN
```

**신뢰도 계산**:
```
신뢰도 = min(90, 50 + 돌파캔들수 × 15 + 수렴패턴보너스)

예: 3캔들 돌파 + 삼각형 수렴
    신뢰도 = min(90, 50 + 3×15 + 10) = 85%
```

**코드**:
```typescript
function detectBreakout(
  candles: Candle[],
  supportLine: TrendlineInfo | null,
  resistanceLine: TrendlineInfo | null
): BreakoutInfo {
  if (!supportLine || !resistanceLine || candles.length < 5) {
    return { detected: false, type: "NONE", confidence: 0, description: "데이터 부족" };
  }

  const isConverging = supportLine.slopePct > 0 && resistanceLine.slopePct < 0;
  const rangeNarrowing = Math.abs(resistanceLine.endPrice - supportLine.endPrice) < 
    Math.abs(resistanceLine.startPrice - supportLine.startPrice) * 0.7;

  if (!isConverging && !rangeNarrowing) {
    return { detected: false, type: "NONE", confidence: 0, description: "수렴 패턴 미감지" };
  }

  const lastCandles = candles.slice(-3);
  const currentResistance = resistanceLine.endPrice;
  const currentSupport = supportLine.endPrice;

  const closesAbove = lastCandles.filter(c => c.close > currentResistance).length;
  const closesBelow = lastCandles.filter(c => c.close < currentSupport).length;

  if (closesAbove >= 2) {
    const confidence = Math.min(90, 50 + closesAbove * 15 + (isConverging ? 10 : 0));
    return {
      detected: true,
      type: "BULLISH_BREAKOUT",
      confidence,
      description: `저항선($${currentResistance.toFixed(2)}) 상향 돌파 확인.`,
    };
  }

  if (closesBelow >= 2) {
    const confidence = Math.min(90, 50 + closesBelow * 15 + (isConverging ? 10 : 0));
    return {
      detected: true,
      type: "BEARISH_BREAKDOWN",
      confidence,
      description: `지지선($${currentSupport.toFixed(2)}) 하향 이탈 확인.`,
    };
  }

  return { detected: false, type: "NONE", confidence: 0, description: "" };
}
```

### 4.11 Step 12: 추세 단계 결정 (7단계)

**목적**: 추세 강도와 방향을 종합하여 세분화된 단계 결정

**로직**:
```typescript
function determineTrendPhase(
  direction: TrendDirection,
  strength: number,
  emaState: EmaAlignment["state"],
  adxValue: number,
  recentMomentum: number,
  volumeConfirmed: boolean
): TrendPhase {
  if (direction === "BULLISH") {
    // 강한 상승: 강도 70+ & EMA 정배열 & ADX > 25 & 거래량 확인
    if (strength >= 70 && emaState === "BULLISH_ALIGNED" && adxValue > 25 && volumeConfirmed) {
      return "STRONG_BULLISH";
    }
    // 약화 중: 강도 < 50 또는 EMA 혼합 또는 모멘텀 역행
    if (strength < 50 || emaState === "MIXED" || emaState === "DEATH_CROSS" || recentMomentum < -0.5) {
      return "BULLISH_WEAKENING";
    }
    return "BULLISH";
  }

  if (direction === "BEARISH") {
    // 강한 하락: 강도 70+ & EMA 역배열 & ADX > 25 & 거래량 확인
    if (strength >= 70 && emaState === "BEARISH_ALIGNED" && adxValue > 25 && volumeConfirmed) {
      return "STRONG_BEARISH";
    }
    // 약화 중: 강도 < 50 또는 EMA 혼합 또는 모멘텀 역행
    if (strength < 50 || emaState === "MIXED" || emaState === "GOLDEN_CROSS" || recentMomentum > 0.5) {
      return "BEARISH_WEAKENING";
    }
    return "BEARISH";
  }

  return "SIDEWAYS";
}
```

---

## 5. 주요 알고리즘

### 5.1 EMA 계산 알고리즘

```typescript
function calculateEMASeries(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  if (closes.length < period) {
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
    return closes.map(() => sma);
  }

  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  const sma = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < period - 1; i++) result.push(sma);
  result.push(sma);

  let prevEma = sma;
  for (let i = period; i < closes.length; i++) {
    const ema = (closes[i] - prevEma) * multiplier + prevEma;
    result.push(ema);
    prevEma = ema;
  }

  return result;
}
```

**핵심 공식**:
```
EMA = (현재가 - 이전EMA) × multiplier + 이전EMA
multiplier = 2 / (period + 1)

예: EMA(9)
    multiplier = 2 / 10 = 0.2
    EMA = (price - prevEMA) × 0.2 + prevEMA
```

### 5.2 가중 선형 회귀 알고리즘

```typescript
// 최소화: Σ w_i × (y_i - (a + b×x_i))²

const slope = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWX2 - sumWX * sumWX);
const intercept = (sumWY - slope * sumWX) / sumW;
```

**해석**:
- `slope`: 캔들당 가격 변화 (양수 = 상승, 음수 = 하락)
- `intercept`: y절편 (회귀선이 y축과 만나는 점)
- 추세선 위의 가격 = `intercept + slope × 인덱스`

---

## 6. 출력 데이터

### 6.1 TimeframeTrend (단일 타임프레임)

```typescript
interface TimeframeTrend {
  timeframe: string;                    // "15m" | "1h" | "4h" | "1D"
  label: string;                        // "15분" | "1시간" | "4시간" | "일봉"
  direction: TrendDirection;            // "BULLISH" | "BEARISH" | "SIDEWAYS"
  phase: TrendPhase;                    // 7단계 추세 단계
  strength: number;                     // 0-100 추세 강도
  supportLine: TrendlineInfo | null;    // 지지선 정보
  resistanceLine: TrendlineInfo | null; // 저항선 정보
  pricePosition: "ABOVE_RESISTANCE" | "NEAR_RESISTANCE" | "MID_RANGE" | "NEAR_SUPPORT" | "BELOW_SUPPORT";
  recentMomentum: number;               // 최근 N캔들 모멘텀 (%)
  volumeConfirmed: boolean;             // 거래량 확인 여부
  volumeTrend: "INCREASING" | "DECREASING" | "FLAT";
  emaAlignment: EmaAlignment;           // EMA 배열 상태
  adxValue: number;                     // ADX 값
  adxTrending: boolean;                 // ADX > 25
  hhllCount: HHLLCount;                 // HH/HL 카운팅
  breakout: BreakoutInfo;               // 브레이크아웃 감지
  reason: string;                       // 판단 근거 (파이프 구분)
}
```

### 6.2 MultiTFTrendAnalysis (멀티 타임프레임)

```typescript
interface MultiTFTrendAnalysis {
  trends: TimeframeTrend[];                    // 4개 타임프레임 분석 결과
  overallDirection: TrendDirection;            // 종합 방향
  overallPhase: TrendPhase;                    // 종합 단계
  overallStrength: number;                     // 0-100 종합 강도
  prediction: string;                         // 영문 예측
  predictionKo: string;                       // 한글 예측
  confidence: number;                         // 0-100 신뢰도
  alignment: "ALIGNED_BULL" | "ALIGNED_BEAR" | "DIVERGENT" | "MIXED";
}
```

---

## 7. 타임프레임 가중치

### 7.1 가중치 테이블

| 타임프레임 | 가중치 | 의미 |
|-----------|--------|------|
| 15m | 1 | 기본 (단기) |
| 1h | 2 | 2배 (단기) |
| 4h | 3 | 3배 (중기) |
| 1D | 4 | 4배 (장기) |

### 7.2 종합 방향 계산

```typescript
let bullScore = 0, bearScore = 0, totalWeight = 0;

for (const t of trends) {
  const w = weights[t.timeframe] ?? 1;
  totalWeight += w;

  if (t.direction === "BULLISH") {
    bullScore += w * (t.strength / 100);
  } else if (t.direction === "BEARISH") {
    bearScore += w * (t.strength / 100);
  }
}

const normalizedBull = (bullScore / totalWeight) * 100;
const normalizedBear = (bearScore / totalWeight) * 100;

const diff = normalizedBull - normalizedBear;

if (diff > 15) {
  overallDirection = "BULLISH";
  overallStrength = min(100, round(normalizedBull));
} else if (diff < -15) {
  overallDirection = "BEARISH";
  overallStrength = min(100, round(normalizedBear));
} else {
  overallDirection = "SIDEWAYS";
  overallStrength = round(max(normalizedBull, normalizedBear) * 0.5);
}
```

**예시**:
```
15m: BULLISH 60% (weight=1) → 1 × 0.6 = 0.6
1h:  BULLISH 70% (weight=2) → 2 × 0.7 = 1.4
4h:  BEARISH 50% (weight=3) → 3 × (-0.5) = -1.5
1D:  BULLISH 80% (weight=4) → 4 × 0.8 = 3.2

bullScore = 0.6 + 1.4 + 3.2 = 5.2
bearScore = 1.5
totalWeight = 1 + 2 + 3 + 4 = 10

normalizedBull = (5.2 / 10) × 100 = 52%
normalizedBear = (1.5 / 10) × 100 = 15%
diff = 52 - 15 = 37 > 15

→ overallDirection = BULLISH
→ overallStrength = 52%
```

---

## 8. 신뢰도 계산

### 8.1 신뢰도 공식

```typescript
const confirmedCount = trends.filter(t => t.volumeConfirmed && t.adxTrending).length;
const maxCount = Math.max(bullCount, bearCount);
const baseConfidence = (maxCount / trends.length) * 100 * (overallStrength / 100 + 0.3);
const confirmBonus = (confirmedCount / trends.length) * 20;
const confidence = Math.min(100, Math.round(baseConfidence + confirmBonus));
```

**구성 요소**:

| 요소 | 기여도 | 설명 |
|------|--------|------|
| **정렬도** | 0~100% | 같은 방향 타임프레임 비율 |
| **강도** | 0~100% | 종합 강도 (가중치 적용) |
| **기본값** | 30% | 최소 신뢰도 보장 |
| **확인 보너스** | 0~20% | 거래량 + ADX 확인 타임프레임 비율 |

**예시**:
```
4개 타임프레임 모두 BULLISH (maxCount=4)
overallStrength = 75%
confirmedCount = 3 (거래량 + ADX 확인)

baseConfidence = (4/4) × 100 × (0.75 + 0.3) = 1 × 100 × 1.05 = 105
confirmBonus = (3/4) × 20 = 15
confidence = min(100, 105 + 15) = 100%

→ 매우 높은 신뢰도
```

---

## 9. 예측 생성 로직

### 9.1 우선순위

```
1. 브레이크아웃 감지 (🔥 BREAKOUT/BREAKDOWN)
2. 추세 약화 (⚠ WEAKENING)
3. 강한 정렬 (🚀 STRONG BULL / 📉 STRONG BEAR)
4. 약한 정렬 (Bullish/Bearish alignment)
5. 다이버전스 (Short-term bounce/pullback)
6. 혼합 신호 (Emerging bias / No clear bias)
```

### 9.2 예측 텍스트 예시

**STRONG BULLISH**:
```
🚀 STRONG BULL: All timeframes aligned bullish with 85% strength. 
All EMA arrays confirmed bullish alignment. ADX confirms trending. 
Look for EMA(9) pullback entries on support.
```

**BULLISH_WEAKENING**:
```
⚠ WEAKENING: Bullish trend losing momentum. 
EMA convergence or volume decline detected. 
Consider tightening stops or partial profit-taking. 
Wait for re-confirmation before adding positions.
```

**DIVERGENT (Short-term bounce within larger downtrend)**:
```
Short-term bounce within larger downtrend. 
15m bullish but 1D bearish. 
Short-term HH/HL structure forming. 
Potential bull trap — wait for higher TF EMA alignment.
```

---

## 10. 구현 예제

### 10.1 단일 타임프레임 분석

```typescript
import { analyzeTimeframeTrend } from '@/lib/trend-analysis';
import { fetchKlines } from '@/lib/bybit-client';

// 1. 캔들 데이터 조회
const candles = await fetchKlines('BTCUSDT', '4h', 120);

// 2. 추세 분석
const trend = analyzeTimeframeTrend(candles, '4h', '4시간');

// 3. 결과 활용
console.log(`방향: ${trend.direction}`);
console.log(`강도: ${trend.strength}%`);
console.log(`단계: ${trend.phase}`);
console.log(`이유: ${trend.reason}`);

// 4. 추세선 정보
if (trend.supportLine) {
  const priceAtIdx50 = trend.supportLine.intercept + trend.supportLine.slope * 50;
  console.log(`50번째 캔들에서의 지지선: $${priceAtIdx50.toFixed(2)}`);
}
```

### 10.2 멀티 타임프레임 분석

```typescript
import { analyzeTimeframeTrend, synthesizeMultiTFTrend } from '@/lib/trend-analysis';
import { fetchKlines } from '@/lib/bybit-client';

const timeframes = [
  { tf: '15m', label: '15분', count: 200 },
  { tf: '1h', label: '1시간', count: 200 },
  { tf: '4h', label: '4시간', count: 200 },
  { tf: '1D', label: '일봉', count: 120 },
];

// 1. 각 타임프레임 분석
const trends = await Promise.all(
  timeframes.map(async (t) => {
    const candles = await fetchKlines('BTCUSDT', t.tf, t.count);
    return analyzeTimeframeTrend(candles, t.tf, t.label);
  })
);

// 2. 멀티 타임프레임 종합
const multiTF = synthesizeMultiTFTrend(trends);

// 3. 결과 활용
console.log(`종합 방향: ${multiTF.overallDirection}`);
console.log(`종합 강도: ${multiTF.overallStrength}%`);
console.log(`정렬도: ${multiTF.alignment}`);
console.log(`신뢰도: ${multiTF.confidence}%`);
console.log(`예측: ${multiTF.predictionKo}`);

// 4. 각 타임프레임 상세
multiTF.trends.forEach((t) => {
  console.log(`\n${t.label}:`);
  console.log(`  방향: ${t.direction}`);
  console.log(`  강도: ${t.strength}%`);
  console.log(`  ADX: ${t.adxValue.toFixed(1)}`);
  console.log(`  EMA: ${t.emaAlignment.state}`);
});
```

### 10.3 차트 렌더링 (추세선)

```typescript
// 추세선 그리기 (lightweight-charts 예시)
function drawTrendline(chart, trendlineInfo, color) {
  const { intercept, slope, startIdx, endIdx } = trendlineInfo;
  
  const points = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const price = intercept + slope * i;
    points.push({ index: i, price });
  }
  
  // 차트에 라인 오버레이
  const line = {
    points: points.map(p => ({
      time: candles[p.index].openTime,
      price: p.price,
    })),
    color: color,
    width: 2,
  };
  
  chart.addSeries(line);
}

// 사용
drawTrendline(chart, trend.supportLine, 'green');
drawTrendline(chart, trend.resistanceLine, 'red');
```

---

## 11. 주의사항

### 11.1 데이터 정확도

- **고가/저가**: ±0.001% 이상 오차 시 스윙 포인트 탐지 오류 가능
- **시간**: 캔들 시간이 정렬되어 있어야 함 (역순 불가)
- **거래량**: 0 값 포함 시 거래량 분석 오류 가능

### 11.2 타임프레임 선택

- **최소 20개 캔들**: 20개 미만 시 데이터 부족 판정
- **권장 120개 캔들**: 충분한 스윙 포인트 확보
- **4개 타임프레임**: 15m/1h/4h/1D 권장 (다른 조합 시 가중치 수정 필요)

### 11.3 ADX 해석

- **ADX > 25**: 추세 존재 (신뢰도 높음)
- **ADX 20~25**: 약한 추세 (주의)
- **ADX < 20**: 추세 부재 (강제 SIDEWAYS 고려)

### 11.4 EMA 크로스

- **GOLDEN_CROSS**: 상승 전환 신호 (진입 기회)
- **DEATH_CROSS**: 하락 전환 신호 (청산 신호)
- **MIXED**: 추세 불명확 (대기)

---

**문서 버전**: v1.0  
**마지막 업데이트**: 2026년 5월 5일  
**상태**: 완성  
**작성자**: Trend Analysis 기술 팀
