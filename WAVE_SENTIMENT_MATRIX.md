# Wave Tracker — Sentiment & Matrix 상세 명세서

**시스템**: Wave Tracker의 시장 센티먼트 분석 및 Wave Matrix 종합 지표  
**버전**: v4.1 (OI+F&G+가격 복합 해석)  
**마지막 업데이트**: 2026년 5월 5일  
**상태**: 운영 중  
**파일**: `/home/ubuntu/binance_trading_bot/client/src/lib/sentiment.ts`

---

## 목차

1. [개요](#1-개요)
2. [구성 요소](#2-구성-요소)
3. [Sentiment 분석 (센티먼트 점수)](#3-sentiment-분석-센티먼트-점수)
4. [Wave Matrix (파동 매트릭스)](#4-wave-matrix-파동-매트릭스)
5. [4개 신호 시스템](#5-4개-신호-시스템)
6. [시장 단계 (Market Phase)](#6-시장-단계-market-phase)
7. [UI 표기 및 시각화](#7-ui-표기-및-시각화)
8. [예제 및 시나리오](#8-예제-및-시나리오)
9. [운영 메커니즘](#9-운영-메커니즘)

---

## 1. 개요

### 1.1 Sentiment & Matrix의 목적

**Wave Tracker의 Sentiment & Matrix**는 다음 4가지 데이터를 종합하여 **시장의 현재 상태와 미래 방향**을 판단합니다:

| 데이터 | 출처 | 의미 |
|-------|------|------|
| **Fear & Greed Index** | alternative.me | 시장 심리 (0=극도 공포, 100=극도 탐욕) |
| **OI (Open Interest)** | Bybit API | 미결제약정 (포지션 유입/유출) |
| **Funding Rate** | Bybit API | 펀딩비 (롱/숏 과열 정도) |
| **Long/Short Ratio** | Bybit API | 트레이더 포지션 편향 |

### 1.2 Sentiment vs Matrix

| 항목 | Sentiment | Matrix |
|------|-----------|--------|
| **범위** | 0~100 | 4개 신호 + 종합 편향 |
| **의미** | 시장 심리 점수 | 시장 단계 + 신호 종합 |
| **계산** | F&G + 글로벌 시장 + OI/LS | 4개 신호 종합 + 신뢰도 |
| **예시** | Composite Score: 72 | Phase: HEATING, Bias: BULLISH |

---

## 2. 구성 요소

### 2.1 입력 데이터 소스

```
┌─────────────────────────────────────────────────┐
│ 데이터 수집 (4개 API)                           │
├─────────────────────────────────────────────────┤
│ 1. Fear & Greed Index (alternative.me)         │
│    → 공포/탐욕 지수 (0-100)                    │
│                                                 │
│ 2. CoinGecko Global Market                     │
│    → BTC 도미넌스, 시총 변화율                 │
│                                                 │
│ 3. Bybit OI & Funding Rate                     │
│    → 미결제약정, 펀딩비                        │
│                                                 │
│ 4. Bybit Long/Short Ratio                      │
│    → 트레이더 포지션 비율                      │
└─────────────────────────────────────────────────┘
```

### 2.2 출력 데이터 구조

```typescript
interface SentimentSnapshot {
  // Fear & Greed 데이터
  fearGreed: FearGreedData;           // 현재 F&G 값
  fearGreedHistory: FearGreedData[];  // 30일 히스토리
  globalMarket: GlobalMarketData;     // 글로벌 시장 데이터
  
  // 종합 센티먼트
  compositeScore: number;             // 0-100 (최종 점수)
  compositeLabel: string;             // EXTREME_FEAR ~ EXTREME_GREED
  marketPhase: string;                // ACCUMULATION ~ PANIC
  marketPhaseKo: string;              // 한글 단계명
  reasons: string[];                  // 분석 근거 (5~8개)
}

interface WaveMatrixState {
  // 4개 신호
  oiSignal: "bullish" | "bearish" | "neutral";
  sentimentSignal: "bullish" | "bearish" | "neutral";
  fundingSignal: "bullish" | "bearish" | "neutral";
  lsSignal: "bullish" | "bearish" | "neutral";
  
  // 종합 판단
  overallBias: "bullish" | "bearish" | "neutral";
  confidence: number;                 // 0-100 신뢰도
  prediction: string;                 // 영문 예측
  predictionKo: string;               // 한글 예측
  
  // 수치 표기 (v4.1)
  oiChangeRate: number;               // OI 변화율 %
  fearGreedValue: number;             // F&G 점수
  fundingRateAvg: number;             // 펀딩비 %
  longRatio: number;                  // 롱 비율 %
  shortRatio: number;                 // 숏 비율 %
  
  // 복합 해석 (v4.1)
  oiInterpretation: string;           // OI+F&G+가격 종합 해석
  oiInterpretationSignal: string;     // 복합 해석 신호
}
```

---

## 3. Sentiment 분석 (센티먼트 점수)

### 3.1 Composite Score 계산

**최종 센티먼트 점수 = 4가지 요소의 가중 합산**

```
시작점: 50 (중립)

+ Fear & Greed Index (가중치 40%)
+ 글로벌 시장 데이터 (가중치 20%)
+ OI 변화율 (가중치 15%)
+ Long/Short + Funding (가중치 25%)

= Composite Score (0~100)
```

### 3.2 요소별 계산 상세

#### 3.2.1 Fear & Greed Index (40% 가중치)

**공식**:
```
F&G 기여도 = (현재 F&G 값 - 50) × 0.4

예시:
F&G = 25 (극도 공포)
기여도 = (25 - 50) × 0.4 = -10점
→ Composite Score에서 10점 감소

F&G = 80 (탐욕)
기여도 = (80 - 50) × 0.4 = +12점
→ Composite Score에서 12점 증가
```

**F&G 값 해석**:

| F&G 값 | 분류 | 의미 |
|-------|------|------|
| 0~20 | EXTREME_FEAR | 극도의 공포 (매집 기회) |
| 21~40 | FEAR | 공포 구간 (바닥 탐색) |
| 41~60 | NEUTRAL | 중립 (방향성 약함) |
| 61~80 | GREED | 탐욕 (과열 주의) |
| 81~100 | EXTREME_GREED | 극도의 탐욕 (분산 매도) |

**F&G 추세 (7일 변화)**:
```
7일 전 F&G 값과 비교
변화 > 10pt → 심리 회복 (+점수)
변화 < -10pt → 심리 악화 (-점수)
```

#### 3.2.2 글로벌 시장 데이터 (20% 가중치)

**시총 24시간 변화율**:
```
기여도 = 시총 변화율 × 1.5

예시:
시총 +3% → 기여도 = +4.5점
시총 -2% → 기여도 = -3점
```

**BTC 도미넌스 분석**:
```
BTC 도미넌스 > 60% → 알트코인 약세 (비관적)
BTC 도미넌스 < 45% → 알트코인 강세 (낙관적) - 알트 시즌
```

#### 3.2.3 OI 변화율 (15% 가중치)

**공식**:
```
기여도 = OI 변화율 × 1.0

예시:
OI +5% → 기여도 = +5점 (새 포지션 유입)
OI -4% → 기여도 = -4점 (포지션 청산)
```

**의미**:
- OI 증가 = 새로운 포지션 진입 (추세 강화)
- OI 감소 = 기존 포지션 청산 (추세 약화)

#### 3.2.4 Long/Short + Funding (25% 가중치)

**Long/Short 비율**:
```
롱 우세 (롱 > 숏) → +5점
숏 우세 (숏 > 롱) → -5점
중립 → 0점
```

**Funding Rate**:
```
양수 (롱 과열) → +3점
음수 (숏 과열) → -3점
중립 → 0점
```

### 3.3 Composite Score 해석

| Score | 라벨 | 의미 |
|-------|------|------|
| 0~20 | EXTREME_FEAR | 극도의 공포 (매수 신호) |
| 21~40 | FEAR | 공포 구간 (매수 고려) |
| 41~60 | NEUTRAL | 중립 (방향성 약함) |
| 61~80 | GREED | 탐욕 (매도 고려) |
| 81~100 | EXTREME_GREED | 극도의 탐욕 (매도 신호) |

### 3.4 분석 근거 (Reasons)

최대 8개의 분석 근거 생성:

```
1. Fear & Greed 현재값 + 분류
2. F&G 7일 추세 (변화 > 10pt인 경우)
3. 글로벌 시총 24h 변화율
4. BTC 도미넌스 분석
5. OI 변화율 해석
6. Long/Short 비율 편향
7. Funding Rate 편향
8. 추가 시장 신호
```

**예시**:
```
- Fear & Greed: 28 (Fear) → 공포 구간, 바닥 탐색 중
- 글로벌 시총 24h: +2.3% → 소폭 상승
- BTC 도미넌스: 48.2% → 알트코인 강세 (알트 시즌)
- OI 변화율: +4.5% → 새 포지션 대량 유입
- 롱/숏 비율: 롱 우세 → 시장 낙관적이나 하방 청산 리스크
- 펀딩비: 양수 (롱 과열) → 프리미엄 지불 중
```

---

## 4. Wave Matrix (파동 매트릭스)

### 4.1 Wave Matrix의 목적

**4개의 독립적인 신호를 종합하여 시장의 종합 편향을 판단**

```
┌──────────────────────────────────────┐
│ 4개 신호 종합 분석                   │
├──────────────────────────────────────┤
│ 1. OI Signal (미결제약정)            │
│ 2. Sentiment Signal (시장 심리)      │
│ 3. Funding Signal (펀딩비)           │
│ 4. L/S Signal (포지션 비율)          │
├──────────────────────────────────────┤
│ → 종합 편향 (Bullish/Bearish)       │
│ → 신뢰도 (0-100)                    │
│ → 예측 메시지                        │
└──────────────────────────────────────┘
```

### 4.2 4개 신호 상세

#### 4.2.1 OI Signal (복합 해석 기반)

**v4.1 복합 해석**: OI + F&G + 가격방향 3가지 결합

| 조건 | 해석 | 신호 |
|------|------|------|
| OI ↑ + 가격 ↑ + F&G 탐욕 | 새로운 롱 포지션 대량 유입 + 상승 가속 | 🟢 BULLISH |
| OI ↑ + 가격 ↑ + F&G 공포 | 스마트머니 매집 (초기 상승) | 🟢 BULLISH |
| OI ↑ + 가격 ↓ | 새로운 숏 포지션 또는 롱 물타기 | 🔴 BEARISH |
| OI ↓ + 가격 ↓ + F&G 공포 | 롱 강제 청산 (바닥 탐색) | 🟡 NEUTRAL |
| OI ↓ + 가격 ↓ + F&G 중립 | 롱 청산 진행 (추가 하락 가능) | 🔴 BEARISH |
| OI ↓ + 가격 ↑ + F&G 탐욕 | 숏 스퀘즈 (숏 강제 청산) | 🟢 BULLISH |
| OI ↓ + 가격 ↑ + F&G 중립 | 숏 청산 진행 (반등 강도 확인 필요) | 🟡 NEUTRAL |
| OI 변동 미미 + 가격 ↑ | 기존 포지션 유지 속 상승 (약한 반등) | 🟡 NEUTRAL |
| OI 변동 미미 + 가격 ↓ | 기존 포지션 유지 속 하락 (약한 하락) | 🟡 NEUTRAL |

**공식**:
```
oiRising = OI 변화율 > 2%
oiFalling = OI 변화율 < -2%
priceUp = 24h 가격 변화 > 1%
priceDown = 24h 가격 변화 < -1%
fearful = F&G < 35
greedy = F&G > 65
```

#### 4.2.2 Sentiment Signal

**공식**:
```
sentimentScore > 60 → BULLISH (탐욕)
sentimentScore < 40 → BEARISH (공포)
sentimentScore 40~60 → NEUTRAL (중립)
```

#### 4.2.3 Funding Signal

**공식**:
```
fundingBias = "long_heavy" → BULLISH (롱 과열)
fundingBias = "short_heavy" → BEARISH (숏 과열)
fundingBias = "neutral" → NEUTRAL
```

#### 4.2.4 L/S Signal (Long/Short Ratio)

**공식**:
```
lsBias = "long_heavy" → BULLISH (롱 우세)
lsBias = "short_heavy" → BEARISH (숏 우세)
lsBias = "neutral" → NEUTRAL
```

### 4.3 종합 편향 (Overall Bias) 계산

**4개 신호 투표 시스템**:

```
bullishCount = BULLISH 신호 개수
bearishCount = BEARISH 신호 개수

overallBias = {
  "bullish",   if bullishCount >= 3
  "bearish",   if bearishCount >= 3
  "bullish",   if bullishCount > bearishCount
  "bearish",   if bearishCount > bullishCount
  "neutral",   otherwise
}
```

**예시**:
```
4개 신호: OI(BULLISH) + Sentiment(BULLISH) + Funding(NEUTRAL) + L/S(BULLISH)
→ bullishCount = 3, bearishCount = 0
→ overallBias = BULLISH ✓

4개 신호: OI(BULLISH) + Sentiment(NEUTRAL) + Funding(BEARISH) + L/S(BEARISH)
→ bullishCount = 1, bearishCount = 2
→ overallBias = BEARISH ✓

4개 신호: OI(NEUTRAL) + Sentiment(NEUTRAL) + Funding(NEUTRAL) + L/S(NEUTRAL)
→ bullishCount = 0, bearishCount = 0
→ overallBias = NEUTRAL ✓
```

### 4.4 신뢰도 (Confidence) 계산

**공식**:
```
maxCount = max(bullishCount, bearishCount)
confidence = (maxCount / 4) × 100 × (waveScore / 100 + 0.5)

범위: 0~100
```

**해석**:
- 4개 신호 모두 일치 (maxCount=4) → 신뢰도 높음
- 3개 신호 일치 (maxCount=3) → 신뢰도 중간
- 2개 신호 일치 (maxCount=2) → 신뢰도 낮음
- 모두 다름 (maxCount=1) → 신뢰도 매우 낮음

**예시**:
```
4개 신호 모두 BULLISH + waveScore 80
confidence = (4/4) × 100 × (80/100 + 0.5)
           = 1.0 × 100 × 1.3
           = 130 → 상한 100

3개 신호 BULLISH + waveScore 60
confidence = (3/4) × 100 × (60/100 + 0.5)
           = 0.75 × 100 × 1.1
           = 82.5 → 약 83
```

---

## 5. 4개 신호 시스템

### 5.1 신호 표시 방식

```
┌─────────────────────────────────────────────────┐
│ Wave Matrix Panel (UI)                          │
├─────────────────────────────────────────────────┤
│ OI 변화      🟢 +4.52%  [BULLISH]              │
│ F&G         🟡 52/100  [NEUTRAL]              │
│ Funding     🟢 +0.0234% [BULLISH]             │
│ L/S Ratio   🟢 1.45    [BULLISH]              │
├─────────────────────────────────────────────────┤
│ 종합 편향: BULLISH (신뢰도: 85%)               │
│ 예측: 상승 모멘텀 강화 중이나 리스크 관리 필수 │
└─────────────────────────────────────────────────┘
```

### 5.2 신호 색상 코드

| 신호 | 색상 | 의미 |
|------|------|------|
| BULLISH | 🟢 녹색 | 상승 신호 |
| BEARISH | 🔴 빨강 | 하락 신호 |
| NEUTRAL | 🟡 노랑 | 중립 신호 |

---

## 6. 시장 단계 (Market Phase)

### 6.1 4가지 시장 단계

**Wave Matrix는 시장을 4가지 단계로 분류**

```
┌──────────────────────────────────────────────────┐
│ 시장 단계 결정 (Sentiment + OI)                 │
├──────────────────────────────────────────────────┤
│ 공포 + OI ↑ → ACCUMULATION (축적)              │
│ 탐욕 + OI ↑ → HEATING (가열)                   │
│ 탐욕 + OI ↓ → DISTRIBUTION (분산)              │
│ 공포 + OI ↓ → PANIC (공포)                     │
└──────────────────────────────────────────────────┘
```

### 6.2 단계별 상세

#### 6.2.1 ACCUMULATION (축적 단계)

**조건**:
```
Sentiment Score < 40 (공포)
OI 변화율 > 1% (증가)
```

**의미**:
```
시장이 공포 속에서 미결제약정이 증가하고 있습니다.
스마트머니가 매집 중일 가능성이 높으며,
바닥 근처에서 포지션을 구축하는 단계입니다.
```

**거래 전략**:
- 분할 매수 시작
- 장기 포지션 구축
- 바닥 확인 대기

#### 6.2.2 HEATING (가열 단계)

**조건**:
```
Sentiment Score > 60 (탐욕)
OI 변화율 > 1% (증가)
```

**의미**:
```
시장 심리가 낙관적이며 미결제약정이 증가하고 있습니다.
상승 모멘텀이 가속화되고 있으나,
과열 징후를 주시해야 합니다.
```

**거래 전략**:
- 추세 추종 (롱)
- 리스크 관리 강화
- 익절 계획 수립

#### 6.2.3 DISTRIBUTION (분산 단계)

**조건**:
```
Sentiment Score > 60 (탐욕)
OI 변화율 < -1% (감소)
```

**의미**:
```
시장 심리는 탐욕적이나 미결제약정이 감소하고 있습니다.
고점 부근에서 이익 실현이 진행 중이며,
추세 전환 가능성이 있습니다.
```

**거래 전략**:
- 롱 포지션 정리
- 숏 진입 탐색
- 고점 분산 매도

#### 6.2.4 PANIC (공포 단계)

**조건**:
```
Sentiment Score < 40 (공포)
OI 변화율 < -1% (감소)
```

**의미**:
```
시장이 공포에 빠져 있으며 미결제약정이 감소하고 있습니다.
패닉셀이 진행 중이며,
급격한 하락 후 반등 가능성을 주시해야 합니다.
```

**거래 전략**:
- 관망 (바닥 확인 대기)
- 분할 매수 준비
- 반등 신호 대기

---

## 7. UI 표기 및 시각화

### 7.1 Fear & Greed Gauge

```
┌─────────────────────────────────────────────┐
│ Fear & Greed Index                          │
│ ALTERNATIVE.ME · 24시간(일봉) 기준         │
├─────────────────────────────────────────────┤
│                                             │
│  ◄─── 공포 ────────── 중립 ────── 탐욕 ──► │
│  0    20     40     50     60     80    100 │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│       ↑                                      │
│      28 (FEAR)                              │
│                                             │
│  분류: Fear                                 │
│  추세: 7일 +5pt (심리 회복 중)             │
│                                             │
└─────────────────────────────────────────────┘
```

### 7.2 Wave Matrix Panel

```
┌──────────────────────────────────────────────┐
│ Wave Matrix                                  │
│ 4-SIGNAL CONFLUENCE · 24시간(일봉) 기준     │
├──────────────────────────────────────────────┤
│                                              │
│ OI 변화      🟢 +4.52%      [BULLISH]      │
│ F&G         🟡 52/100      [NEUTRAL]      │
│ Funding     🟢 +0.0234%    [BULLISH]      │
│ L/S Ratio   🟢 1.45        [BULLISH]      │
│                                              │
├──────────────────────────────────────────────┤
│ 종합 편향: 🟢 BULLISH                       │
│ 신뢰도: ████████░░ 85%                     │
│ 시장 단계: HEATING (가열)                   │
│                                              │
│ 예측:                                       │
│ 상승 모멘텀 강화 중이나 리스크 관리 필수.   │
│ 전 타임프레임 상승 정렬 + 과열 진행.        │
│ 추세 추종하되 익절 계획 필수.               │
│                                              │
└──────────────────────────────────────────────┘
```

### 7.3 Sentiment Detail

```
┌──────────────────────────────────────────────┐
│ Sentiment Detail                             │
│ COMPOSITE ANALYSIS BREAKDOWN                │
├──────────────────────────────────────────────┤
│                                              │
│ 🧠 Fear & Greed: 28 (Fear)                 │
│    공포 구간, 바닥 탐색 중                  │
│                                              │
│ 🧠 글로벌 시총 24h: +2.3%                  │
│    소폭 상승                                │
│                                              │
│ 🧠 BTC 도미넌스: 48.2%                     │
│    알트코인 강세 (알트 시즌)                │
│                                              │
│ 🧠 OI 변화율: +4.5%                        │
│    새 포지션 대량 유입                      │
│                                              │
│ 🧠 롱/숏 비율: 롱 우세                     │
│    시장 낙관적이나 하방 청산 리스크         │
│                                              │
│ 🧠 펀딩비: 양수 (롱 과열)                  │
│    프리미엄 지불 중                        │
│                                              │
└──────────────────────────────────────────────┘
```

### 7.4 수치 표기 (v4.1)

```
┌──────────────────────────────────────────────┐
│ 수치 데이터 표기                             │
├──────────────────────────────────────────────┤
│ OI 변화율: +4.52%        (24시간 기준)      │
│ F&G 점수: 52/100         (일봉 기준)        │
│ 펀딩비: +0.0234%         (8시간 평균)       │
│ 롱 비율: 54.2%           (선택 구간)        │
│ 숏 비율: 45.8%           (선택 구간)        │
│ 24h 가격 변화: +2.3%     (24시간)           │
└──────────────────────────────────────────────┘
```

---

## 8. 예제 및 시나리오

### 8.1 강한 상승 신호 (BULLISH)

```
상황:
- Sentiment Score: 72 (GREED)
- OI 변화율: +5.2%
- F&G: 72 (탐욕)
- 가격 24h: +3.5%
- Funding: 양수 (롱 과열)
- L/S Ratio: 롱 우세 (1.6)

4개 신호:
1. OI Signal: OI ↑ + 가격 ↑ + F&G 탐욕 → BULLISH ✓
2. Sentiment Signal: 72 > 60 → BULLISH ✓
3. Funding Signal: 양수 → BULLISH ✓
4. L/S Signal: 롱 우세 → BULLISH ✓

종합 편향:
bullishCount = 4, bearishCount = 0
→ overallBias = BULLISH ✓

신뢰도:
confidence = (4/4) × 100 × (85/100 + 0.5) = 130 → 100

시장 단계:
탐욕 + OI ↑ → HEATING (가열)

예측:
"전 타임프레임 상승 정렬 + 과열 진행. 
 추세 추종하되 리스크 관리 필수."

결론: 매우 강한 상승 신호 🟢
```

### 8.2 강한 하락 신호 (BEARISH)

```
상황:
- Sentiment Score: 28 (FEAR)
- OI 변화율: -6.3%
- F&G: 25 (극도 공포)
- 가격 24h: -4.2%
- Funding: 음수 (숏 과열)
- L/S Ratio: 숏 우세 (0.7)

4개 신호:
1. OI Signal: OI ↓ + 가격 ↓ + F&G 공포 → NEUTRAL (청산 후 반등 가능)
2. Sentiment Signal: 28 < 40 → BEARISH ✓
3. Funding Signal: 음수 → BEARISH ✓
4. L/S Signal: 숏 우세 → BEARISH ✓

종합 편향:
bullishCount = 0, bearishCount = 3
→ overallBias = BEARISH ✓

신뢰도:
confidence = (3/4) × 100 × (60/100 + 0.5) = 82.5 → 약 83

시장 단계:
공포 + OI ↓ → PANIC (공포)

예측:
"패닉셀 진행 중이나 추세선 반등 가능. 
 분할 매수 검토."

결론: 강한 하락 신호 🔴
```

### 8.3 중립 신호 (NEUTRAL)

```
상황:
- Sentiment Score: 50 (NEUTRAL)
- OI 변화율: +0.5% (변동 미미)
- F&G: 50 (중립)
- 가격 24h: +0.2%
- Funding: 중립
- L/S Ratio: 중립 (1.0)

4개 신호:
1. OI Signal: OI 변동 미미 + 가격 변동 미미 → NEUTRAL
2. Sentiment Signal: 50 (중립) → NEUTRAL
3. Funding Signal: 중립 → NEUTRAL
4. L/S Signal: 중립 → NEUTRAL

종합 편향:
bullishCount = 0, bearishCount = 0
→ overallBias = NEUTRAL

신뢰도:
confidence = (0/4) × 100 × (50/100 + 0.5) = 0 → 매우 낮음

시장 단계:
중립 + OI 변동 미미 → HEATING (기본값)

예측:
"방향성 불확실. 추가 데이터 확인 후 판단 권장."

결론: 신호 없음 🟡 (관망 권장)
```

### 8.4 복합 해석 예제 (OI + F&G + 가격)

```
시나리오: OI ↑ + 가격 ↓ + F&G 공포

OI 변화율: +3.2%
가격 24h: -2.1%
F&G: 32 (공포)

복합 해석:
"OI +3.2% ↑ + 가격 -2.1% ↓ → 
 새로운 숏 포지션 유입 또는 롱 물타기. 
 하방 압력 지속 가능."

OI Signal: BEARISH ✓

의미:
- 새로운 숏 포지션이 대량 진입 중
- 또는 기존 롱 포지션이 물리고 있음
- 하락 압력이 계속될 가능성 높음
- 숏 진입 고려 가능
```

---

## 9. 운영 메커니즘

### 9.1 데이터 갱신 주기

| 데이터 | 갱신 주기 | 기준 시간 |
|-------|---------|---------|
| Fear & Greed | 1일 1회 | 24시간(일봉) |
| 글로벌 시장 | 실시간 | 24시간 |
| OI & Funding | 1시간 | 24시간 |
| L/S Ratio | 선택 가능 | 선택 구간 |
| Wave Matrix | 1시간 | 24시간(일봉) |
| Trend Analysis | 1시간 | 멀티 TF (15M/1H/4H/1D) |

### 9.2 계산 순서

```
1. 데이터 수집
   ├─ Fear & Greed Index (alternative.me)
   ├─ 글로벌 시장 데이터 (CoinGecko)
   ├─ OI & Funding Rate (Bybit)
   └─ L/S Ratio (Bybit)

2. Sentiment 분석
   ├─ Composite Score 계산 (4가지 요소 가중 합산)
   ├─ 라벨 결정 (EXTREME_FEAR ~ EXTREME_GREED)
   ├─ 시장 단계 결정 (ACCUMULATION ~ PANIC)
   └─ 분석 근거 생성 (5~8개)

3. Wave Matrix 구축
   ├─ 4개 신호 계산
   │  ├─ OI Signal (복합 해석)
   │  ├─ Sentiment Signal
   │  ├─ Funding Signal
   │  └─ L/S Signal
   ├─ 종합 편향 결정 (투표 시스템)
   ├─ 신뢰도 계산
   └─ 예측 메시지 생성

4. UI 표시
   ├─ Fear & Greed Gauge
   ├─ Wave Matrix Panel
   ├─ Sentiment Detail
   └─ 수치 표기
```

### 9.3 에러 처리

```
API 실패 시:
- Fear & Greed 미수집 → 이전 값 유지
- 글로벌 시장 미수집 → 가중치 재조정
- OI/Funding 미수집 → 신호 생략
- L/S Ratio 미수집 → 신호 생략

결과:
- 부분 데이터로도 분석 계속 진행
- 신뢰도 자동 감소
- 사용자에게 데이터 부족 알림
```

### 9.4 성능 최적화

```
캐싱 전략:
- Fear & Greed 히스토리: 30일 캐시
- 글로벌 시장: 1시간 캐시
- OI/Funding: 1시간 캐시
- 계산 결과: 1시간 캐시

메모리 관리:
- 히스토리 데이터 최대 30일만 유지
- 실시간 업데이트 시 이전 값 제거
```

---

## 10. 주의사항

### 10.1 Sentiment & Matrix 해석 시 주의

- **단일 지표 신뢰 금지**: 4개 신호 모두 확인 필수
- **시간 기준 다름**: 각 지표의 기준 시간 확인 필수
- **과거 데이터 한계**: 현재 상황만 반영, 미래 예측 불가
- **시장 구조 변화**: 갭 발생 시 신뢰도 급감

### 10.2 신뢰도가 낮은 경우

- 신호 개수 < 3개 (일부 신호만 일치)
- 신뢰도 < 50 (신호 불일치)
- 데이터 수집 실패 (부분 데이터)
- 시장 변동성 극도로 높음

### 10.3 활용 팁

- **신뢰도 80 이상**: 적극 거래
- **신뢰도 60~79**: 신중히 거래
- **신뢰도 40~59**: 추가 확인 후 거래
- **신뢰도 < 40**: 관망 권장

---

**문서 버전**: v1.0  
**마지막 업데이트**: 2026년 5월 5일  
**상태**: 완성  
**작성자**: Wave Tracker 시스템 팀
