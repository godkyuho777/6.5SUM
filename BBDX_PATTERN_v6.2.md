# Signal Scanner — BBDX-PATTERN v6.2 (개선판)

**시스템 이름**: BBDX-PATTERN v6.2
**버전**: 6.2 (v6.1 의 4가지 결정적 함정 보완)
**상태**: 개선 명세서
**기준 문서**: v6.1 운영 중 (243 테스트 통과) → v6.2 로 점진 마이그레이션

---

## 0. v6.1 → v6.2 변경 요약

v6.1 운영 데이터·문서 검토에서 발견된 **4가지 함정 + 부속 이슈** 를 모두 보완.

| # | v6.1 함정 | 영향 | v6.2 해결 |
|---|---|---|---|
| **A** | 시그널 강도 합계가 100 초과 (사례 2 121.2점 → 100점 강제 절단) | 강도 분포 왜곡, 등급 무의미 | **카테고리 max + 가중 합 모델** (3.6절) |
| **B** | Falling Knife 차단의 binary cutoff (ADX 24.9 vs 25.1) | 임계 hairline 의 결정 변동 | **시그모이드 점진 차단** (2.4절) |
| **C** | Multi-Confluence 신뢰도 95/85/80% 의 통계 근거 부재 | 직관 가중치, 04_v2 문서 위반 | **calibration 도출 + 신뢰구간 표기** (3.5절) |
| **D** | 사례 cherry-pick 의심 (3 사례 중 1 손실만) | 사용자 신뢰 risk | **통계 기반 사례 + 기간 명시** (7장) |
| E | 1캔들 fractal swing 미사용 (BBDX 자체는 swing 안 씀, 다만 BB Lower Bounce 의 "다음 캔들" 정의 모호) | edge case 동작 불명 | **반전 캔들 윈도우 명시** (3.4.4) |
| F | EXIT 약세 패턴 정의 모호 ("3개 중 1개 감지" 만 있음, 시간 윈도우 X) | EXIT 가 너무 자주 또는 늦게 발동 | **3캔들 윈도우 + 패턴 강도 가중** (4.2절) |
| G | RSI 25~38 범위가 코인별 동일 | DOGE/PEPE 같은 고변동 코인은 RSI 가 더 깊게 떨어짐 | **변동성 적응 RSI 임계값** (3.2.2절) |
| H | Volume confirmation 의 분모 "전체 100캔들 평균" | 시장 환경 변화 시 baseline drift | **EMA 기반 적응 baseline** (2.5절) |
| I | 강도 등급별 포지션 % 가 절대값 (A=100%, B=70%) | 자본 사이즈 무관, 리스크 관리 부재 | **변동성·계좌 자본 비례 사이징** (8장) |
| J | BBDX 와 Wave Tracker 가 분리 시스템 | 같은 포지션에 모순 신호 가능 | **통합 의사결정 룰** (10장) |

이 표가 v6.2 의 골격입니다. 아래는 각 항목의 정확한 구현 명세.

---

## 1. 시스템 개요 (변경 없음, 컨텍스트만 보강)

BBDX-PATTERN v6.2 는 v6.1 의 **3 경로 (NUM/PTN/BB) 진입 + 4 조건 EXIT + 단일 STOP** 코어를 그대로 유지합니다. 변경은 **임계값·가중치·강도 계산식·통합 결정** 에 한정. 즉 기존 백테스트 골격은 재사용 가능, 마이그레이션 비용 최소.

**유지되는 것:**
- 3 독립 경로 (NUM, PTN, BB)
- BB(20, 2), ADX(14), DI(14), RSI(14)
- 4 조건 EXIT 룰
- BB하단 × 0.97 손절

**바뀌는 것:**
- Falling Knife 차단 방식 (binary → 시그모이드)
- 시그널 강도 계산 (단순 합 → 카테고리 max + 가중)
- Multi-Confluence 가중치 (직관 → calibration)
- 변동성 적응 임계값 (코인별 차등)
- 약세 패턴 EXIT 시간 윈도우 명시
- 포지션 사이징 (강도 등급 → 변동성·자본 비례)

---

## 2. 기술적 지표 (정밀화)

### 2.1 Bollinger Bands

v6.1 동일. **단, 밴드 폭 평균 baseline 변경:**

```
v6.1: 평균 밴드 폭 = 최근 20개 캔들의 평균 밴드 폭
v6.2: 평균 밴드 폭 = EMA(밴드 폭, 50)  // 시장 변화에 적응
```

**왜 EMA 50:**
- 단순 평균 20 은 갑작스런 변동성 폭증/축소에 과민
- EMA 50 은 시장 레짐 변화를 부드럽게 추종
- 스퀴즈 임계 (60%) 의 의미가 시장 환경에 따라 자동 보정

### 2.2 ADX (Average Directional Index)

v6.1 동일. 기간 14, 표준 Wilder smoothing.

### 2.3 DI (+DI / -DI)

v6.1 동일. 기간 14.

### 2.4 Falling Knife 필터 (시그모이드 점진 차단) — **개선 핵심**

v6.1:
```
if -DI > +DI AND ADX > 25:
  → 차단
```

문제: ADX 24.9 와 ADX 25.1 사이의 결정 차이가 비현실적.

v6.2:
```
fallingKniveScore = sigmoid((adx - 25) / 5) × heaviside(-DI - +DI)
  = 0      if -DI ≤ +DI
  = 1/(1+exp(-(adx-25)/5))  otherwise

진입 신뢰도 = base × (1 - fallingKniveScore)
  = base × 1.0   if adx ≤ 15 (실질 무관)
  = base × 0.73  if adx = 23 (약한 페널티)
  = base × 0.5   if adx = 25 (절반 차감)
  = base × 0.27  if adx = 27 (강한 페널티)
  = base × 0.07  if adx = 35 (사실상 차단)
```

**효과:**
- ADX 임계 영역 (20~30) 에서 부드러운 페널티
- 사용자에게 "0% / 100%" 가 아니라 "현재 추세 압력 73% 차감" 으로 표시 → 정보 가치 ↑
- 차단된 시그널이 아니라 **약화된 시그널** 로 처리, 강도 점수에 반영

### 2.5 거래량 (적응 baseline)

v6.1:
```
Volume Ratio = 최근 5캔들 평균 / 전체 100캔들 평균
```

문제: 분모가 시장 환경에 따라 drift. 코인 시즌 vs 약세장 baseline 같이 처리됨.

v6.2:
```
recentVolume = SMA(volume, 5)
baselineVolume = EMA(volume, 50)  // 적응 baseline
volumeRatio = recentVolume / baselineVolume

volumeScore =
  if ratio > 1.5: +20  (강한 거래량 증가)
  if 1.2 < ratio ≤ 1.5: +12 + (ratio - 1.2) × (8 / 0.3)  // 12~20 선형
  if 0.8 ≤ ratio ≤ 1.2: 0
  if 0.5 ≤ ratio < 0.8: -5 - (0.8 - ratio) × (5 / 0.3)  // -5 ~ -10
  if ratio < 0.5: -10  (거래량 위축)
```

**점수 0~20 범위로 표준화** (v6.1 0~15 + 페널티 -5 → -10~+20).

### 2.6 RSI (변동성 적응 임계값) — **개선 G**

v6.1: NUM 경로 RSI 25~38 고정.

문제: BTC RSI 분포의 95% 영역과 DOGE/PEPE RSI 분포의 95% 영역이 다름. 고변동성 코인은 RSI 20 까지 자주 떨어짐 → v6.1 의 RSI 25~38 룰은 고변동성 코인의 매수 기회 일부 놓침.

v6.2:
```
// 코인별 90일 RSI 분포의 quantile 사용
rsiQ10 = 10번째 percentile (= 매우 낮은 영역, 진입 lower bound)
rsiQ30 = 30번째 percentile (= 일반적 과매도, 진입 upper bound)

NUM 경로 RSI 진입 범위 = [rsiQ10, rsiQ30]

예 (관찰된 분포 가정):
  BTC: rsiQ10=28, rsiQ30=40 → 진입 범위 [28, 40]
  DOGE: rsiQ10=22, rsiQ30=36 → 진입 범위 [22, 36]
  STABLECOIN(USDT): rsiQ10=45, rsiQ30=52 → NUM 경로 사실상 비활성화 (정상)
```

**구현:**
- 각 (symbol, interval) 마다 90일 RSI 캐시 → 매주 quantile 재계산
- Tradelab 백엔드의 calibration pipeline 에 통합 (04_v2 문서의 calibration 과 같은 인프라)

**v6.1 호환:** rsiQ10/rsiQ30 가 산출되기 전 기본값 [25, 38] 유지.

---

## 3. 매수 진입 (LONG ENTRY)

### 3.1 3 독립 경로 (구조 동일, 임계값만 적응)

여전히 NUM ∨ PTN ∨ BB 중 1개 충족 시 진입.

### 3.2 NUM (수치 기반)

#### 3.2.1 진입 조건

| # | 조건 | v6.1 | v6.2 |
|---|---|---|---|
| 1 | RSI(14) | 25~38 고정 | **[rsiQ10, rsiQ30]** (코인별 적응) |
| 2 | 현재가 | ≤ BB하단 × 1.02 | ≤ BB하단 × 1.02 (유지) |
| 3 | ADX(14) | < 20 | < 20 (유지) |
| 4 | Falling Knife | binary 차단 | **시그모이드 페널티** (2.4절) |

#### 3.2.2 강도 계산 (재정의) — **개선 핵심 A**

v6.1 의 합산 모델 (RSI(0~25) + BB(0~25) + ADX(0~20) + Reversal(0~15) + Vol(0~15)) 은 NUM 경로 단독으로는 max 100 이지만, PTN 경로에서 패턴 점수(75)를 더하면 121 까지 발생 → 절단.

v6.2 카테고리 모델:

```
카테고리 정의 (5 카테고리):
  C1. 모멘텀 (RSI)
  C2. 가격 위치 (BB 근접도)
  C3. 추세 약화 (ADX, reversal probability)
  C4. 거래량 (volume confirmation)
  C5. 가격 액션 (캔들 패턴, NUM 경로는 0)

각 카테고리는 [0, 1] 점수.
최종 강도 = (Σ wi × scorei) × 100
  단, Σ wi = 1.0

NUM 경로 가중치 (calibration 으로 도출, 초기값):
  w_momentum  = 0.30  (RSI 가 NUM 의 핵심)
  w_position  = 0.25  (BB 근접도)
  w_trend     = 0.20  (ADX + reversal prob 합산)
  w_volume    = 0.15
  w_action    = 0.10  (NUM 은 패턴 무관, 보너스로 일부)

PTN 경로 가중치:
  w_momentum  = 0.0   (RSI 미사용)
  w_position  = 0.20
  w_trend     = 0.20
  w_volume    = 0.20
  w_action    = 0.40  (캔들 패턴이 핵심)

BB 경로 가중치:
  w_momentum  = 0.0
  w_position  = 0.50  (BB 구조가 모든 것)
  w_trend     = 0.10
  w_volume    = 0.20
  w_action    = 0.20
```

**카테고리 점수 산출:**

```typescript
// C1. 모멘텀 (RSI)
function momentumScore(rsi: number, q10: number, q30: number): number {
  if (rsi >= q30) return 0;
  if (rsi <= q10) return 1;
  return (q30 - rsi) / (q30 - q10);
}

// C2. 가격 위치 (BB 근접도)
function positionScore(close: number, bb: BB): number {
  if (close >= bb.upper) return 0;
  if (close <= bb.lower) return 1;
  return (bb.upper - close) / (bb.upper - bb.lower);
}

// C3. 추세 약화 (ADX 가 낮을수록, reversal prob 가 높을수록)
function trendWeaknessScore(adx: number): number {
  // ADX 0~50 을 1~0 으로 매핑
  return Math.max(0, Math.min(1, (50 - adx) / 50));
}

// C4. 거래량
function volumeScore(ratio: number): number {
  if (ratio < 0.5) return 0;
  if (ratio > 1.5) return 1;
  return Math.max(0, Math.min(1, (ratio - 0.5) / 1.0));
}

// C5. 가격 액션 (캔들 패턴 강도)
function actionScore(patterns: DetectedPattern[]): number {
  if (patterns.length === 0) return 0;
  // 가장 강한 패턴의 정규화 점수
  // engulfing(100) → 1.0, morning_star(90) → 0.9, hammer(75) → 0.75 ...
  const max = Math.max(...patterns.map(p => p.strength));
  return max / 100;
}
```

**최종 진입 강도:**

```typescript
function entryStrength(path: 'NUM' | 'PTN' | 'BB', signals: Signals): {
  score: number;       // 0~100
  breakdown: Record<string, number>;
  fallingKnifePenalty: number;  // 0~1 (시그모이드)
} {
  const weights = WEIGHTS[path];
  const scores = {
    momentum: momentumScore(...),
    position: positionScore(...),
    trend: trendWeaknessScore(...),
    volume: volumeScore(...),
    action: actionScore(...),
  };
  const raw = Object.entries(scores).reduce(
    (sum, [k, v]) => sum + v * weights[k], 0
  );
  const fkPenalty = computeFallingKnifeSigmoid(signals.adx, signals.diPlus, signals.diMinus);
  const final = raw * (1 - fkPenalty) * 100;
  return { score: final, breakdown: scores, fallingKnifePenalty: fkPenalty };
}
```

**효과:**
- 모든 경로에서 강도 0~100 보장 (절단 없음)
- 카테고리별 기여도 사용자 표시 가능 ("모멘텀 70%, 거래량 50%, 추세약화 80%")
- Falling Knife 가 별도 페널티로 분리 → 진입 차단 vs 약화 명확
- calibration 으로 가중치 도출 가능 (현재 직관 → 데이터)

### 3.3 PTN (패턴 + 지표)

#### 3.3.1 진입 조건

v6.1 동일:
- 강세 캔들 패턴 (최근 5캔들 윈도우)
- 현재가 ≤ BB하단 × 1.05
- ADX < 25
- Falling Knife 시그모이드 페널티 (2.4절)

#### 3.3.2 캔들 패턴 정의 정밀화

v6.1 의 패턴 강도(75/85/90/100/...)는 어디서 왔나? 문서에 근거 없음. v6.2:

| 패턴 | v6.1 강도 | v6.2 base | 비고 |
|---|---|---|---|
| Bullish Engulfing | 100 | 0.9 | calibration 으로 7일 outcome 측정, 임시 |
| Morning Star | 90 | 0.85 | 3 캔들 패턴, 신뢰성 ↑ |
| Three White Soldiers | 85 | 0.85 | 연속 3 양봉 |
| Hammer | 75 | 0.7 | 단일 캔들, 신뢰성 ↓ |
| Inverted Hammer | 75 | 0.65 | 약한 반전 신호 |
| Pin Bar | 70 | 0.65 | 정의가 hammer 와 겹침 → 통합 검토 |
| Doji | 60 | 0.4 | 우유부단, 단독으로는 약함 |

**중요:** v6.2 base 값은 **calibration 결과로 갱신**. 즉 90일 백테스트에서 각 패턴의 7일 후 평균 수익률·승률을 측정 → base 자동 조정. 04_v2 의 가중치 도출 원칙과 동일.

#### 3.3.3 candlesAgo 디스카운트

v6.1: candlesAgo 0~2 (높음), 3~5 (중간) — 이산.

v6.2: 지수 감쇠.
```
discountFactor = exp(-candlesAgo / 3)
  = 1.00  if ago=0
  = 0.72  if ago=1
  = 0.51  if ago=2
  = 0.37  if ago=3
  = 0.26  if ago=4
  = 0.19  if ago=5

actionScore = patternBase × discountFactor
```

5 캔들 전 패턴은 거의 무시 (0.19), 현재 캔들 패턴은 full weight.

### 3.4 BB (BB 구조 패턴)

#### 3.4.1 BB Upper Riding (정밀화)

v6.1 조건 4개 + v6.2 추가:
```
v6.1 조건:
  1. 연속 3 캔들 BB 상단 상위 20% 이내
  2. 종가 > BB 중간선
  3. 밴드 폭 > 평균 70%
  4. 모든 3 캔들 +0.5% 이상 상승

v6.2 추가 조건:
  5. ADX > 25 (추세 강화 확인 — 라이딩의 본질)
  6. 직전 5 캔들 모두 BB 중간선 위 (지속성)
```

**왜 5, 6 추가:** v6.1 의 라이딩은 **3 캔들만으로** 트리거 → 잠깐 튕기는 가짜 라이딩 잡힘. ADX 와 직전 위치 확인으로 실제 추세 라이딩만 잡음.

#### 3.4.2 BB Middle Support (변경 없음)

v6.1 동일.

#### 3.4.3 BB Squeeze Breakout (변경 없음)

v6.1 동일.

#### 3.4.4 BB Lower Bounce (반전 캔들 윈도우 명시) — **개선 E**

v6.1: "BB 하단 터치 후 다음 캔들이 반전 캔들"

문제: "다음 캔들" 이 1 캔들 후만 의미하는지, 1~3 캔들 후 모두 의미하는지 모호.

v6.2:
```
조건:
  1. 직전 5 캔들 중 어느 캔들의 저가 ≤ BB하단 × 0.98 (터치)
  2. 터치 캔들 후 1~3 캔들 이내에 반전 캔들 (해머/인걸핑/핀바) 형성
  3. 현재 캔들 종가 > 터치 캔들 종가 (회복 확인)
  4. 반전 캔들의 candlesAgo 가 1~3 (현재 또는 직전 2캔들)
```

명확한 시간 윈도우 (1~3 캔들 후) 로 **추세 반전이 확실히 진행 중인지** 검증.

### 3.5 Multi-Confluence 신뢰도 (calibration 도출) — **개선 핵심 C**

v6.1:
- BB + PTN + Wave Tracker 추세선 → 95%
- BB + PTN → 85%
- NUM + BB → 80%
- 단일 → 60~70%

이 95/85/80/60 숫자가 **어디서 왔는지 v6.1 문서에 없음**. v6.2 는 calibration 으로 도출:

```
calibration 절차 (04_v2 문서의 pipeline 사용):
  1. 90~365일 백테스트에서 모든 BBDX 시그널 추출
  2. 각 시그널을 confluence 조합으로 라벨:
     - solo_NUM, solo_PTN, solo_BB
     - NUM+PTN, NUM+BB, PTN+BB
     - NUM+PTN+BB
     - 위 + Wave Tracker 추세선 (별도)
  3. 각 조합의 7일 후 outcome 측정
  4. Wilson score CI 부착
  5. Multiple comparison 보정 (BH FDR)
  6. 통과한 조합만 신뢰도 도출

예시 결과 (가상):
  solo_NUM            : 52% (CI 47~57, n=412)
  solo_PTN            : 56% (CI 51~61, n=389)
  solo_BB             : 58% (CI 52~64, n=296)
  NUM+PTN             : 64% (CI 56~71, n=148)
  NUM+BB              : 67% (CI 60~74, n=178)
  PTN+BB              : 71% (CI 64~77, n=212)
  NUM+PTN+BB          : 76% (CI 67~83, n= 89)
  NUM+PTN+BB+Wave     : 81% (CI 70~89, n= 47)  ← v6.1 의 95% 와 다름
```

**v6.1 의 95% 가 너무 낙관적** 일 가능성 시사. v6.2 는 실제 데이터 + 신뢰구간 보고.

#### 3.5.1 사용자 표시 (v6.2 UI 가이드)

```
시그널: BTC 4H LONG
경로: NUM + PTN + BB:LowerBounce + Wave (1D 상승 추세선 일치)
신뢰도: 81% (CI 70~89%, n=47, 90일 백테스트)
강도: 84/100
  - 모멘텀: 0.72
  - 위치: 0.91
  - 추세: 0.65
  - 거래량: 0.83
  - 액션: 0.85
Falling Knife 페널티: 12% (ADX 22, -DI 18, +DI 26)
권장 포지션: 자본의 4.2% (변동성 적응, 8장 참조)

⚠️ 백테스트 통계. 미래 보장 아님.
```

신뢰구간 + 표본 크기 + 분해 점수 모두 노출. 사용자가 **본인이 진입할지 판단** 가능.

### 3.6 시그널 강도 등급 (v6.2 재정의)

v6.1 의 A/B/C/D 등급 + 100/70/50/0% 포지션 룰은 변경:

```
강도 점수 (0~100) 자체를 노출. 등급 라벨 폐기.

대신 사용자에게:
  강도 ≥ 70: "강한 시그널"
  강도 50~70: "중간 시그널"
  강도 30~50: "약한 시그널"
  강도 < 30: "noise 의심"

포지션 사이징은 강도 + 변동성 + 자본으로 별도 산출 (8장).
```

---

## 4. 매도 청산 (EXIT)

### 4.1 기본 룰 (v6.1 유지)

4 조건 중 3 충족.

| # | 조건 | 기준 |
|---|---|---|
| 1 | 현재가 | ≥ BB 중간선 |
| 2 | RSI(14) | ≥ 65 |
| 3 | ADX(14) | ≥ 30 |
| 4 | +DI(14) | ≥ 25 |

### 4.2 약세 패턴 완화 (시간 윈도우 명시) — **개선 F**

v6.1: "약세 패턴 감지 시 2/4 로 완화" — "감지" 의 시간 정의 모호.

v6.2:
```
약세 패턴 윈도우: 직전 3 캔들 (현재 캔들 포함 직전 3개)

감지된 약세 패턴의 합산 강도:
  bearishStrength =
    Σ (patternBase × candlesAgoDiscount × patternFreshness)

  patternFreshness = 1.0 if 현재 캔들, 0.7 if 1캔들 전, 0.4 if 2캔들 전

완화 트리거:
  if bearishStrength >= 0.6:
    완화 적용 (3/4 → 2/4)
  else:
    기본 룰 (3/4)

예:
  - 현재 캔들 약세 인걸핑(0.9 × 1.0 × 1.0) = 0.9 ≥ 0.6 → 완화
  - 2캔들 전 3 Black Crows (0.85 × 0.51 × 0.4) = 0.17 < 0.6 → 완화 X
```

**효과:** 약세 패턴이 **진짜 즉각적인 반전 신호** 일 때만 완화. 옛 패턴 잔재로 EXIT 너무 빠름 방지.

### 4.3 EXIT 강도 표기

v6.2 추가: EXIT 도 강도 점수 (0~100).

```
exitStrength = (충족 조건 수 / 필요 조건 수) × 100 + bearishBonus

예:
  3/4 충족 (필요 3) + 약세 패턴 강도 0.7 → 75 + 0.7 × 25 = 92
  2/4 충족 (필요 2, 완화 적용) → 100 + 0 = 100
```

UI 에 EXIT 권고 + 강도 함께 노출.

---

## 5. 손절 (STOP LOSS)

### 5.1 기본 (v6.1 유지)

```
Stop Loss = BB하단 × 0.97
```

### 5.2 v6.2 보완: ATR 기반 옵션 stop

```
변동성 적응 stop:
  Stop_BB = BB하단 × 0.97
  Stop_ATR = entryPrice × (1 - 1.5 × ATR(14) / entryPrice)

최종 stop = max(Stop_BB, Stop_ATR)  // 더 보수적인 (높은) 가격
```

**왜 둘 중 더 보수적인 것:**
- BB 기준이 너무 멀면 (변동성 폭증 시) ATR 이 더 가까운 stop 제공
- ATR 이 너무 가까우면 (저변동성 시) BB 가 더 적절한 stop
- 둘 중 더 가까운 stop 으로 자본 보호

### 5.3 trailing stop (v6.2 신규, 옵션)

```
진입 후 가격이 +5% 이상 상승하면 trailing stop 활성:
  trailing = 현재가 × 0.95

최종 stop = max(initialStop, trailing)
```

수익 보호. 사용자 옵션으로 on/off.

---

## 6. 시그널 강도 계산 (3.6 절에서 재정의됨)

이 섹션은 3.6 절로 통합. 카테고리 모델 + Falling Knife 페널티.

---

## 7. 사례 (cherry-pick 함정 D 해결)

v6.1 의 3 사례 중 2 승리·1 손절. 실제 백테스트는 다양한 결과.

v6.2 사례는 **calibration pipeline 백테스트 결과 그대로** 게재 권장:

```
2024 1월 ~ 12월 BTC 4H 백테스트:
  총 시그널: 187 회
  승률: 56.7% (CI 49~64, Wilson)
  평균 R:R: 1.4
  누적 수익률: +43%
  MDD: -12%
  Sharpe (연환산): 1.2

진입 경로별:
  NUM only:    n=82,  win 51%
  PTN only:    n=71,  win 60%
  BB only:     n=24,  win 67%
  Multi (2+):  n=10,  win 80%

거래 시간대 분포:
  KST 09~12: 23회
  KST 13~17: 41회
  KST 18~22: 67회 (한국 retail 활성 시간)
  KST 23~08: 56회 (글로벌 활성 시간)

손익 분포:
  +5% 이상 수익: 42회
  +0~5% 수익:   64회
  -0~3% 손실:   45회
  -3~5% 손실:   22회
  손절 발동:    14회 (BB하단 × 0.97 도달)
```

**투명성 원칙:**
- 모든 사례는 백테스트 산출물
- cherry-pick 금지
- 손실 사례 비중 ≥ 35% (실제 분포 반영)

문서에 포함할 사례:
- 1 사례: 평균적 승리 (NUM, +3%)
- 1 사례: 강한 승리 (Multi-Confluence, +12%)
- 1 사례: breakeven (PTN, +0.3%)
- 1 사례: 작은 손실 (NUM, -2.1%)
- 1 사례: 손절 (PTN, -3.5%)
- 1 사례: 큰 손실 회피 (Falling Knife 페널티 작동 사례)

---

## 8. 포지션 사이징 (v6.2 신설) — **개선 I**

v6.1 의 "강도 등급별 100%/70%/50%" 는 **자본 절대값 무관, 변동성 무관** → 위험.

v6.2: Tradelab 의 Volatility-Targeted Position Sizing.

```
계좌 자본 C, 시그널 강도 S (0~100), 코인 ATR (14, 4H), entryPrice P

목표 거래당 risk = 자본의 1.0% (= 0.01 × C)
초기 stop = 5.1.절의 max(Stop_BB, Stop_ATR)
stopDistance = (entryPrice - stopPrice) / entryPrice

baseSize = (0.01 × C) / stopDistance
  // 손절 도달 시 정확히 자본의 1% 손실

strengthMult = (S - 30) / 70   // S=30 → 0, S=100 → 1
  // 강도 30 미만이면 진입 X

confluenceMult = 1 + 0.5 × (confluenceScore - 0.5)
  // confluence 0.5 → 1.0, 0.81 → 1.16, 1.0 → 1.25

finalPosition = baseSize × strengthMult × confluenceMult
  단, finalPosition ≤ 자본의 5% (max position cap)
  단, finalPosition ≥ $50 거래소 최소
```

**예시:**
```
계좌 $10,000
BTC entryPrice $67,000, stop $65,000, stopDistance 3.0%
baseSize = ($10,000 × 0.01) / 0.03 = $3,333

강도 84, confluence 0.81:
  strengthMult = (84-30)/70 = 0.77
  confluenceMult = 1 + 0.5 × (0.81 - 0.5) = 1.155

finalPosition = $3,333 × 0.77 × 1.155 = $2,964 (자본의 29.6%)
  → cap 5% 적용 → $500
```

**"자본 5% 한도" 가 너무 보수적이지 않나:**
- v6.1 의 "100% 포지션" 은 비현실. 한 번의 손절로 자본 -3% 손실은 정상이지만 -100% 는 사고.
- 자본 5%, 손절 3% → 거래당 max 0.15% 자본 손실. 100 거래 손절 시 -15%. 회복 가능.
- v6.1 의 100% 포지션 + 5% 손절 이면 거래당 -5%. 20 거래 손절 시 자본 0. 비현실.

**Tradelab 의 신뢰성 마케팅:** "수익 보장 X, 자본 보호 O" → 5% cap 은 사용자 보호 장치.

---

## 9. 변동성·시장 환경 적응 (v6.2 신설)

### 9.1 코인별 적응 파라미터

매주 자동 갱신:

```
per (symbol, interval):
  rsiQ10 = quantile(rsi_history_90d, 0.10)
  rsiQ30 = quantile(rsi_history_90d, 0.30)
  atrAvg = SMA(ATR(14), 90d)
  bandWidthAvg = EMA(BB_width, 50)
```

저장: Tradelab DB 의 per_symbol_params 테이블.

### 9.2 시장 환경 감지 (Macro Liquidity 통합)

03_ADDITIONAL_STRATEGIES 의 Macro Liquidity Tracker 점수 (-100 ~ +100) 를 BBDX 에 통합:

```
macroMultiplier =
  if regime == 'crisis':   0.30  // 70% 차감
  if regime == 'tight':    0.65
  if regime == 'neutral':  1.00
  if regime == 'easy':     1.20
  if regime == 'flooded':  1.40

finalConfidence = baseConfidence × macroMultiplier
```

UI 표시:
```
신뢰도: 81% × 1.20 (macro: easy) = 97% (CI 84~107% → 84~100%)
```

**'crisis' 환경에서는 BBDX LONG 사실상 비활성화** (신뢰도 30% 이하 → 진입 차단).

---

## 10. Wave Tracker 와의 통합 (v6.2 신설) — **개선 J**

v6.1 BBDX 와 v1.0 Wave Tracker 가 별도 → 통합 결정 룰 부재.

v6.2 통합 흐름:

```
[1] BBDX v6.2 시그널 발생 (NUM/PTN/BB 경로)
       ↓
[2] Wave Tracker v1.1 (개선판 별도 문서) 의 다중 TF 추세 조회
       - 4H 트렌드: ↑ / 평 / ↓
       - 1D 트렌드: ↑ / 평 / ↓
       - 1W 트렌드: ↑ / 평 / ↓
       - 트렌드 정렬도 (0~1)
       ↓
[3] 통합 confluence 점수 계산:
     unifiedScore = bbdxConfluence × waveAlignmentMultiplier
       waveAlignmentMultiplier =
         1.30 if 완벽 정렬 (1W↑ + 1D↑ + 4H↑)
         1.10 if 부분 정렬 (2 of 3 ↑)
         1.00 if 약한 정렬 (1 of 3 ↑)
         0.70 if mixed
         0.30 if opposing (1W↓ + 1D↓)
       ↓
[4] 피보나치 컨텍스트:
     if 현재가 ∈ [Fib 38.2%, Fib 61.8%]: +0.10
     elif 현재가 ∈ [Fib 23.6%, Fib 78.6%]: +0.05
     else: 0
       ↓
[5] 최종 진입 결정:
     finalConfidence = unifiedScore + fibBonus
     if finalConfidence < 0.40: 진입 X
     if 0.40 ≤ finalConfidence < 0.60: 신중 (작은 사이즈)
     if finalConfidence ≥ 0.60: 정상 (full sizing)
       ↓
[6] EXIT 통합 룰:
     BBDX 4 조건 EXIT 발동 OR
     Wave Tracker 추세선 하향 돌파 OR
     Fib 161.8% 도달 (수익 실현)
     → 셋 중 하나 트리거 시 EXIT
       ↓
[7] STOP 통합 룰:
     min(BB하단×0.97, ATR stop, Fib 23.6%) 중 가장 가까운 (높은) 가격
       → 자본 보호 우선
```

**왜 이 통합:**
- BBDX = 단기 (4H) entry trigger
- Wave Tracker = 중·장기 (1D, 1W) context
- Fibonacci = 가격 위치의 의미 부여
- 셋이 동의해야 진입, 한 곳에서 반대 신호면 EXIT

**v6.1 vs v6.2 통합:**
- v6.1: BBDX 와 Wave 가 별도 신호 → 충돌 시 사용자 혼란
- v6.2: 단일 통합 신호 → 명확한 결정

---

## 11. 모호 지점에 대한 표준 해석 (구현 시 명시)

본인이 지적한 4가지 모호 지점 + 추가 발견:

| # | 모호 지점 | 표준 해석 (v6.2) |
|---|---|---|
| 1 | "최근 5캔들 내" | 현재 캔들 포함 직전 5개 (`candles.slice(-5)`) |
| 2 | "BB 상단 상위 20% 이내" | 중간선~상단 영역의 상위 20% (= price ≥ middle + (upper-middle) × 0.8) |
| 3 | "밴드 폭 평균" | EMA(밴드폭, 50) — 적응 baseline |
| 4 | "BB 하단 터치 후 반전 캔들" | 터치 후 1~3 캔들 윈도우, 모든 후보 검증 |
| 5 | "약세 패턴 감지" 시간 | 직전 3 캔들 (현재 포함), freshness 가중 |
| 6 | "기존 100 캔들" 분석 | 4H: 250 캔들 (≈42일), 1D: 250, 1W: 100 |
| 7 | "거래량 평균" | EMA(volume, 50) — 적응 |
| 8 | "스윙 포인트" 정의 | 5캔들 양쪽 fractal (좌우 5캔들 중 가장 high/low) |
| 9 | "추세선 강도" 분모 | 추세선 형성 후 유효 캔들 수 (전체 X) |
| 10 | "다음 캔들 시가 진입" | 명시. close 가 아님 |

---

## 12. v6.1 → v6.2 마이그레이션 체크리스트

```
[ ] 강도 계산을 카테고리 가중 모델로 교체 (3.6절)
[ ] Falling Knife 시그모이드 페널티 (2.4절)
[ ] RSI 임계값 코인별 quantile 적응 (2.6절)
[ ] 거래량 baseline EMA 50 으로 (2.5절)
[ ] BB Lower Bounce 윈도우 1~3 캔들 명시 (3.4.4절)
[ ] BB Upper Riding 추가 조건 (3.4.1절)
[ ] 약세 패턴 EXIT 시간 윈도우 + 강도 가중 (4.2절)
[ ] STOP 변동성 적응 + trailing 옵션 (5.2, 5.3절)
[ ] Position sizing 변동성 비례 (8장)
[ ] Macro Liquidity 통합 (9.2절)
[ ] Wave Tracker 통합 결정 룰 (10장)
[ ] Multi-Confluence 신뢰도 calibration 도출 (3.5절)
[ ] 카테고리 가중치 calibration 도출 (3.6절)
[ ] 사례 cherry-pick 제거 → 백테스트 분포 게재 (7장)
[ ] 모호 지점 10가지 표준 해석 명시 (11장)
[ ] 강도 등급 라벨 폐기, 점수 직접 노출 (3.6절)
```

각 항목을 별도 PR. v6.1 운영 유지 + v6.2 점진 적용 (A/B 테스트 04_v2 4장 활용).

---

## 13. 솔직한 한계 (v6.2 도)

**여전히 못 푸는 것:**
- 캔들 패턴 정의의 본질적 모호성 (해머 vs 핀바 vs 망치 — 학파 차이)
- 사용자 자금 5% 이상 risk 가 필요한 알트 시즌의 기회 비용
- Tradelab 시그널의 reflexivity (사용자 다수 동시 진입 시 시장 영향)
- 거래소 maintenance, 데이터 결측 시 BB 계산 왜곡
- 한국 거시 (BOK, 원-달러) 가 아직 macro 점수에 미반영

**v6.2 가 v6.1 대비 추가 해결:**
- 강도 계산식 정합성
- 임계값 binary 함정 제거
- 신뢰도 통계 근거 부여
- 사례 cherry-pick 방지
- 변동성·자본 비례 사이징
- 약세 패턴 EXIT 모호성 해결
- Wave Tracker 통합 결정

---

## 14. 한 줄 요약 (v6.2)

**"v6.1 은 직관 가중치로 시그널을 만들었고, v6.2 는 모든 가중치·임계값·confluence 신뢰도를 calibration 으로 도출하며, 임계 hairline 결정을 부드러운 함수로 대체하고, 변동성·자본 적응 사이징으로 자본 보호를 강제한다.** 코어 (3 경로 entry, 4 조건 EXIT, 단일 STOP) 는 v6.1 그대로, 변경은 임계와 가중치에 한정 → 점진 마이그레이션."
