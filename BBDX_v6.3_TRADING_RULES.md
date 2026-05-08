# BBDX-PATTERN v6.3 매매기준 — 공식 + 산출 예시

> **버전:** v6.3 (진입 = v6.2 카테고리 가중 모델, EXIT = 4 카테고리 재설계)
> **헌장 종속:** STRATEGY_CHARTER.md 의 7차원 + 3규칙 모두 준수
> **목적:** Claude Code 가 코드로 옮길 수 있는 정확한 공식 + 가상 BTC 시나리오 산출값
> **시나리오:** BTC/USDT 4H, 가상의 진입·EXIT 흐름

---

## 0. 시나리오 가정

이 문서 전체에서 사용하는 BTC 가상 데이터:

```
시점 T0 (진입 후보 감지): 2026-05-06 12:00 UTC
  코인: BTC/USDT
  TF: 4H
  현재가: $79,950
  ATR(14): $1,420 (변동성 1.78%)
  거래량: 1,890 BTC (지난 4H)

지표 산출:
  BB(20, 2):
    BB upper:  $82,140
    BB middle: $80,500
    BB lower:  $78,798
    Width: $3,342

  RSI(14):
    현재: 32.4

  ADX(14):
    ADX: 18.7
    +DI: 19.2
    -DI: 23.4

  MACD(12, 26, 9):
    histogram: -85 (이전 -120, +35 회복 중)

  EMA Ribbon:
    EMA9: $80,180
    EMA21: $80,650
    EMA50: $81,200
    EMA100: $80,900
    EMA200: $79,500

  거래량 baseline (EMA 50): 1,580 BTC
  거래량 비율: 1,890 / 1,580 = 1.196
```

---

## 1. 진입 (LONG ENTRY)

### 1.1 3 독립 경로 (OR 관계)

진입 후보는 NUM·PTN·BB 세 경로 중 **하나라도 충족** 시 발생.

```
LONG ENTRY = NUM ∨ PTN ∨ BB
  단, NUM·PTN 은 Falling Knife 시그모이드 페널티 적용
```

### 1.2 Falling Knife 시그모이드 페널티

NUM·PTN 경로에 적용되는 추세 압력 페널티.

#### 공식

```
fkScore = sigmoid((adx - 25) / 5) × heaviside(diMinus - diPlus)

  sigmoid(x) = 1 / (1 + exp(-x))
  heaviside(x) = 1 if x > 0, else 0

multiplier = 1 - fkScore  (range: 0 ~ 1)
```

**해석:**
- diMinus ≤ diPlus → fkScore = 0 → multiplier = 1 (영향 없음)
- diMinus > diPlus, ADX 낮음 → multiplier 큼 (약한 페널티)
- diMinus > diPlus, ADX 높음 → multiplier 작음 (강한 페널티)

#### 산출 예시 (T0 시나리오)

```
diMinus(23.4) > diPlus(19.2) → heaviside = 1
sigmoid((18.7 - 25) / 5) = sigmoid(-1.26) = 1 / (1 + exp(1.26)) = 0.221

fkScore = 0.221 × 1 = 0.221
multiplier = 1 - 0.221 = 0.779

→ NUM·PTN 강도에 ×0.779 페널티 적용 (22% 차감)
```

---

### 1.3 NUM 경로 (수치 기반)

#### 1.3.1 진입 조건 (binary 게이트)

```
NUM_GATE =
  RSI ∈ [rsiQ10, rsiQ30]      // 코인별 적응 (v6.2)
  AND close ≤ BB.lower × 1.02
  AND ADX < 20
```

기본값 (calibration 미완료 시): `rsiQ10 = 25, rsiQ30 = 38`

#### 1.3.2 카테고리 가중 강도 (v6.2)

```
NUM_strength = (
    0.30 × momentumScore     // RSI 의 과매도 깊이
  + 0.25 × positionScore     // BB 하단 근접도
  + 0.20 × trendWeaknessScore // ADX 약함
  + 0.15 × volumeScore       // 거래량 confirmation
  + 0.10 × actionScore       // NUM 은 패턴 미사용 → 0
) × 100 × fkMultiplier
```

#### 1.3.3 카테고리 점수 공식

**모멘텀 (momentumScore):**
```
if rsi >= rsiQ30:  return 0
if rsi <= rsiQ10:  return 1
return (rsiQ30 - rsi) / (rsiQ30 - rsiQ10)
```

**위치 (positionScore):**
```
if close >= BB.upper:  return 0
if close <= BB.lower:  return 1
return (BB.upper - close) / (BB.upper - BB.lower)
```

**추세 약화 (trendWeaknessScore):**
```
return clamp((50 - adx) / 50, 0, 1)
```

**거래량 (volumeScore):**
```
ratio = volume / volumeBaselineEMA50

if ratio < 0.5:   return 0
if ratio > 1.5:   return 1
return clamp((ratio - 0.5) / 1.0, 0, 1)
```

**액션 (actionScore):**
NUM 경로는 0. PTN·BB 경로에서 사용.

#### 1.3.4 산출 예시 (T0 시나리오)

```
[Gate 검증]
  RSI 32.4 ∈ [25, 38] ✓
  close $79,950 ≤ $78,798 × 1.02 = $80,374 ✓
  ADX 18.7 < 20 ✓
  → Gate 통과

[카테고리 점수]
  momentumScore = (38 - 32.4) / (38 - 25) = 0.431
  positionScore = (82,140 - 79,950) / (82,140 - 78,798) = 0.655
  trendWeaknessScore = (50 - 18.7) / 50 = 0.626
  volumeScore = (1.196 - 0.5) / 1.0 = 0.696
  actionScore = 0

[가중 합]
  raw = 0.30 × 0.431 + 0.25 × 0.655 + 0.20 × 0.626 + 0.15 × 0.696 + 0.10 × 0
      = 0.1293 + 0.1638 + 0.1252 + 0.1044 + 0
      = 0.5227

[Falling Knife 페널티 적용]
  NUM_strength = 0.5227 × 100 × 0.779 = 40.7

→ NUM 진입 강도 41/100 (약한 시그널)
```

---

### 1.4 PTN 경로 (패턴 + 지표)

#### 1.4.1 진입 조건

```
PTN_GATE =
  has_bullish_pattern_in_last_5_candles
  AND close ≤ BB.lower × 1.05
  AND ADX < 25
```

#### 1.4.2 카테고리 가중 강도

```
PTN_strength = (
    0.0  × momentumScore     // PTN 은 RSI 미사용
  + 0.20 × positionScore
  + 0.20 × trendWeaknessScore
  + 0.20 × volumeScore
  + 0.40 × actionScore       // 패턴이 핵심
) × 100 × fkMultiplier
```

#### 1.4.3 actionScore (패턴 강도)

```
actionScore = max(detected_patterns, key=p => p.base × p.discount)

discount = exp(-candlesAgo / 3)
  candlesAgo=0 → 1.00
  candlesAgo=1 → 0.72
  candlesAgo=2 → 0.51
  candlesAgo=3 → 0.37
  candlesAgo=4 → 0.26
  candlesAgo=5 → 0.19
```

**패턴 base 임시값** (⚠️ calibration 필요, PATTERN_SYSTEM_AUDIT 결함 #2):
```
Bullish Engulfing: 0.85
Morning Star:      0.90
Three White Soldiers: 0.85
Hammer:            0.70
Inverted Hammer:   0.65
Bullish Pin Bar:   0.65
Doji:              0.40 (약함)
```

#### 1.4.4 산출 예시 (T0 시나리오)

T0 시점에 candlesAgo=2 에서 Hammer 감지 가정:

```
[Gate 검증]
  Hammer 감지 (candlesAgo=2) ✓
  close $79,950 ≤ $78,798 × 1.05 = $82,738 ✓
  ADX 18.7 < 25 ✓
  → Gate 통과

[카테고리 점수]
  positionScore = 0.655 (위와 동일)
  trendWeaknessScore = 0.626
  volumeScore = 0.696
  actionScore = 0.70 × exp(-2/3) = 0.70 × 0.513 = 0.359

[가중 합]
  raw = 0 + 0.20 × 0.655 + 0.20 × 0.626 + 0.20 × 0.696 + 0.40 × 0.359
      = 0 + 0.131 + 0.125 + 0.139 + 0.144
      = 0.539

[Falling Knife 페널티]
  PTN_strength = 0.539 × 100 × 0.779 = 42.0

→ PTN 진입 강도 42/100
```

---

### 1.5 BB 경로 (BB 구조 패턴 — Falling Knife 무관)

#### 1.5.1 4 서브패턴 (OR)

```
BB_GATE = BB:Riding ∨ BB:MiddleSupport ∨ BB:Squeeze ∨ BB:Bounce
```

#### 1.5.2 BB:Lower Bounce (시나리오 적용 가능성 높음)

```
조건:
  1. 직전 5 캔들 중 어느 캔들의 저가 ≤ BB.lower × 0.98 (터치)
  2. 터치 캔들 후 1~3 캔들 내 반전 캔들 (해머/인걸핑/핀바)
  3. 현재 종가 > 터치 캔들 종가 (회복 확인)
```

#### 1.5.3 BB 경로 카테고리 가중

```
BB_strength = (
    0.0  × momentumScore
  + 0.50 × positionScore     // BB 구조가 모든 것
  + 0.10 × trendWeaknessScore
  + 0.20 × volumeScore
  + 0.20 × actionScore
) × 100
  // BB 경로는 Falling Knife 페널티 미적용
```

#### 1.5.4 산출 예시 (T0 시나리오, BB:Lower Bounce 가정)

```
[Gate 검증 — Lower Bounce]
  candlesAgo=2 에 저가 $78,650 ≤ $78,798 × 0.98 = $77,222 ❌
  → Gate 실패

가정 변경: 직전 5 캔들 중 저가가 BB lower 터치한 경우
  예: candlesAgo=3 에 저가 $77,100 (터치)
  candlesAgo=2 에 Hammer 형성 (반전 확인)
  현재 종가 $79,950 > 터치 캔들 종가 $77,500 (회복) ✓
  → Gate 통과

[카테고리 점수]
  positionScore = 0.655
  trendWeaknessScore = 0.626
  volumeScore = 0.696
  actionScore = 0.359 (Hammer candlesAgo=2)

[가중 합]
  raw = 0 + 0.50 × 0.655 + 0.10 × 0.626 + 0.20 × 0.696 + 0.20 × 0.359
      = 0 + 0.328 + 0.063 + 0.139 + 0.072
      = 0.602

  BB_strength = 0.602 × 100 = 60.2

→ BB:Lower Bounce 진입 강도 60/100
```

---

### 1.6 다중 경로 confluence (v6.4 권고)

같은 시점에 여러 경로 동시 트리거 시:

```
final_strength = max(strengths) + 0.10 × (paths_count - 1)
  단, max 100
```

#### 산출 예시

NUM 41 + PTN 42 + BB 60 동시 트리거:
```
final = max(41, 42, 60) + 0.10 × (3 - 1) × 100 (보너스 정규화)
      = 60 + 20 = 80

→ 최종 진입 강도 80/100 (3 경로 confluence)
```

⚠️ confluence 보너스 0.10 은 v6.2 명세 임시값. STRATEGY_CHARTER 규칙 2 calibration 필요.

---

### 1.7 진입 결정 + 사이징

```
if final_strength < 40: 진입 X
if 40 ≤ final_strength < 60: 작은 사이즈 (자본 1%)
if final_strength ≥ 60: 정상 사이즈 (자본 5% cap)
```

#### 변동성 비례 사이징

```
target_risk = capital × 0.01
stop_distance = (entry - stop) / entry
base_size = target_risk / stop_distance

strength_mult = (strength - 30) / 70   // strength 100 → 1.0
confluence_mult = 1 + 0.5 × (confluence_score - 0.5)

final_position = base_size × strength_mult × confluence_mult
  단, ≤ capital × 0.05 (5% cap)
```

#### 산출 예시 (T0 시나리오)

```
계좌 자본: $10,000
진입가: $79,950 (다음 캔들 시가 + 슬리피지)
Stop Loss: $76,434.09 (= BB.lower × 0.97 = 78,798 × 0.97)
stop_distance = (79,950 - 76,434) / 79,950 = 0.0440

base_size = ($10,000 × 0.01) / 0.0440 = $2,272

strength_mult = (80 - 30) / 70 = 0.714
confluence_mult = 1 + 0.5 × (0.81 - 0.5) = 1.155

final_position = $2,272 × 0.714 × 1.155 = $1,873
  → 5% cap = $500
  → 최종 $500 (= BTC 0.00626)

손절 시 손실: ($79,950 - $76,434) × 0.00626 = $22 (자본의 0.22%)
```

---

## 2. 매도 청산 (EXIT) — v6.3 4 카테고리

### 2.1 우선순위

매 캔들 close 시:
```
1. STOP LOSS (최우선)
2. [EXIT-B] 방향성 반전
3. [EXIT-A] 목표 도달 (부분 청산)
4. [EXIT-C] 수익 보호 (보유 + stop 이동)
5. [EXIT-D] 시간 손절
```

위에서부터 트리거 시 즉시 적용.

---

### 2.2 STOP LOSS

#### 공식

```
Stop_BB   = BB.lower × 0.97
Stop_ATR  = entry × (1 - 1.5 × ATR / entry)
Stop_Fib  = Fib_anchor.low + (Fib_anchor.high - Fib_anchor.low) × 0.236

Stop_final = max(Stop_BB, Stop_ATR, Stop_Fib)
  // 가장 가까운 (높은) stop = 자본 보호 우선
```

#### 산출 예시

```
Stop_BB = $78,798 × 0.97 = $76,434
Stop_ATR = $79,950 × (1 - 1.5 × 1,420 / 79,950)
         = $79,950 × (1 - 0.02665)
         = $77,820
Stop_Fib (가정: 직전 swing low $76,000, high $82,500):
       = $76,000 + ($82,500 - $76,000) × 0.236
       = $76,000 + $1,534
       = $77,534

Stop_final = max($76,434, $77,820, $77,534) = $77,820 (ATR stop)

→ 손절 임계: $77,820
  현재가 $79,950 와의 거리: 2.66%
```

---

### 2.3 [EXIT-B] 방향성 반전

#### 공식

```
reversalScore = 0

# B1: +DI/-DI 크로스오버
if diPlus < diMinus:
  cross_strength = (diMinus - diPlus) / 30
  reversalScore += min(0.40, cross_strength × 0.4)

# B2: ADX 강화 + -DI 우위
if adx > 25 AND diMinus > diPlus:
  adx_factor = min(1.0, (adx - 25) / 15)
  reversalScore += adx_factor × 0.30

# B3: 약세 캔들 패턴
bearishStrength = sum(
    p.base × age_discount(p.candlesAgo) × freshness(p.candlesAgo)
    for p in bearish_patterns_last_3_candles
)
if bearishStrength >= 0.6:
  reversalScore += min(0.20, bearishStrength × 0.20)

# B4: 추세선 break
trendline_state ∈ {'intact', 'suspect', 'confirmed', 'broken'}
if trendline_state == 'broken':     reversalScore += 0.30
if trendline_state == 'confirmed':  reversalScore += 0.15

# B5: MACD 베어리시 다이버전스
if has_bearish_macd_divergence(last_50_candles):
  reversalScore += 0.20

# 트리거
if reversalScore >= 0.50: → 전체 청산
if reversalScore >= 0.30: → 50% 부분 청산
```

#### 산출 예시 (시나리오 T+15: 진입 후 15 캔들 경과)

가상 시점 T+15 의 지표:
```
현재가: $81,200 (+1.56% from $79,950)
+DI: 22.5
-DI: 25.8
ADX: 27.2
약세 인걸핑 candlesAgo=1 감지 (base=0.85)
3 Black Crows candlesAgo=3 감지 (base=0.85)
추세선 상태: 'suspect'
MACD 다이버전스: 없음
```

산출:
```
[B1] +DI/-DI 크로스
  diPlus 22.5 < diMinus 25.8 ✓
  cross_strength = (25.8 - 22.5) / 30 = 0.110
  reversalScore += min(0.40, 0.110 × 0.4) = 0.044

[B2] ADX 강화 + -DI 우위
  adx 27.2 > 25 ✓
  diMinus 25.8 > diPlus 22.5 ✓
  adx_factor = min(1.0, (27.2 - 25) / 15) = 0.147
  reversalScore += 0.147 × 0.30 = 0.044

[B3] 약세 패턴
  Bearish Engulfing candlesAgo=1
    discount = exp(-1/3) = 0.717
    freshness = 0.7 (1캔들 전)
    contribution = 0.85 × 0.717 × 0.7 = 0.427

  Three Black Crows candlesAgo=3
    discount = exp(-3/3) = 0.368
    freshness = 0 (3캔들 전, 윈도우 밖)
    contribution = 0

  bearishStrength = 0.427 ≥ 0.6 ❌
  → 트리거 X (가산 0)

[B4] 추세선 'suspect'
  reversalScore += 0 (broken·confirmed 아님)

  단 B4 의 'suspect' 도 부분 가산 권고:
  reversalScore += 0.05 (suspect 가중)

[B5] MACD 다이버전스 없음
  reversalScore += 0

[총합]
  reversalScore = 0.044 + 0.044 + 0 + 0.05 + 0 = 0.138

  → 0.30 미달 → EXIT 트리거 X (보유 지속)
```

---

### 2.4 [EXIT-A] 목표 도달 — 부분 청산

#### Tier 별 청산 비율

```
Tier 1: close ≥ BB.middle           → 50% 부분 청산
Tier 2: close ≥ Fib 100% (anchor.high) → 추가 30% 청산
Tier 3: close ≥ Fib 161.8%          → 100% 전체 청산
```

#### v6.4 권고: 강도 비례 적응 비율

```
Tier 1 비율 = clamp(1 - (entry_strength - 30) / 70 × 0.4, 0.3, 0.7)

PnL 보정:
  if pnl < +1%: 비율 + 0.20
  if pnl > +5%: 비율 - 0.15
```

#### 산출 예시 (시나리오: T+8, BB 중간선 회복)

```
진입가: $79,950
진입 강도: 80
현재가: $80,510 (BB.middle = $80,500 막 회복)
PnL: +0.70%

Tier 1 비율 = 1 - (80 - 30) / 70 × 0.4 = 1 - 0.286 = 0.714
PnL 보정: pnl < 1% → 비율 + 0.20 = 0.914
clamp 0.7 → 0.7

→ 70% 부분 청산
   청산 size: 0.00626 × 0.7 = 0.00438 BTC
   청산 가격: $80,510 (실제로는 다음 캔들 시가)
   잔여 포지션: 0.00188 BTC
```

---

### 2.5 [EXIT-C] 수익 보호

#### 공식

```
unrealized_pct = (current - entry) / entry

# C1: Breakeven move
if unrealized_pct >= 0.02 AND not stop_moved_to_breakeven:
  new_stop = entry
  → stop 을 entry 로 이동

# C2: 가격 기반 Trailing
if unrealized_pct >= 0.05:
  trailing_stop = current × 0.97
  if trailing_stop > current_stop:
    → stop 을 trailing_stop 으로 이동

# C3: ATR 기반 Trailing
if unrealized_pct >= 0.03:
  atr_stop = current - 1.5 × ATR
  if atr_stop > current_stop:
    → stop 을 atr_stop 으로 이동
```

#### 산출 예시 (시나리오: T+12, +3% 상승)

```
진입가: $79,950
현재가: $82,350 (+3.00%)
ATR: $1,420
현재 stop: $77,820 (초기 ATR stop)

[C1] Breakeven
  unrealized_pct 3% ≥ 2% ✓
  → stop 을 $79,950 으로 이동 (entry)

[C2] Trailing 5%
  unrealized_pct 3% < 5% ❌
  → 적용 X

[C3] ATR Trailing
  unrealized_pct 3% ≥ 3% ✓
  atr_stop = $82,350 - 1.5 × $1,420 = $80,220
  $80,220 > 현재 stop $79,950 (방금 breakeven 이동) ✓
  → stop 을 $80,220 으로 이동

→ 최종 stop $80,220 (이미 +0.34% 수익 보장)
```

---

### 2.6 [EXIT-D] 시간 손절

#### 공식

```
bars_held = current_bar - entry_bar
unrealized_pct = (current - entry) / entry

# v6.4 변동성 비례
atr_pct = atr / current_price

if atr_pct < 0.01:    bars_threshold = 50, progress_threshold = 0.005
if 0.01 ≤ atr_pct < 0.02: bars_threshold = 30, progress_threshold = 0.01
if atr_pct ≥ 0.02:    bars_threshold = 18, progress_threshold = 0.02

if bars_held ≥ bars_threshold AND unrealized_pct < progress_threshold:
  → 전체 청산 (시간 손절)
```

#### 산출 예시 (시나리오: T+30, 30 캔들 보유)

```
ATR: $1,420
현재가: $80,150
ATR 비율: 1,420 / 80,150 = 0.0177 → 중변동
  → bars_threshold = 30
  → progress_threshold = 0.01

bars_held = 30 ≥ 30 ✓
unrealized_pct = (80,150 - 79,950) / 79,950 = 0.0025 < 0.01 ✓

→ 시간 손절 트리거 (전체 청산)
   청산 size: 잔여 포지션 전부
   사유: "30 캔들 무진전"
```

---

## 3. 통합 EXIT 흐름 (실제 적용 순서)

```
def evaluate_exit(position, candle, indicators):
  # 0. 매 캔들 close 시 호출

  # 1. STOP LOSS 우선
  if check_stop_loss(position, candle):
    return ('STOP_LOSS', 1.0, 'Stop hit')

  # 2. 방향성 반전 (B 카테고리)
  rs = compute_reversal_score(candle, indicators)
  if rs >= 0.50:
    return ('FULL_EXIT', 1.0, f'Reversal {rs:.2f}')
  if rs >= 0.30:
    return ('PARTIAL_EXIT', 0.5, f'Reversal warning {rs:.2f}')

  # 3. 목표 도달 (A 카테고리, 부분 청산)
  target = check_profit_target(position, candle)
  if target.tier == 3: return ('FULL_EXIT', 1.0, 'Fib 161.8%')
  if target.tier == 2: return ('PARTIAL_EXIT', 0.3, 'Fib 100%')
  if target.tier == 1: return ('PARTIAL_EXIT', adaptive_ratio, 'BB middle')

  # 4. 수익 보호 (C 카테고리, stop 이동만)
  protection = check_protection(position, candle, indicators)
  if protection: return ('MOVE_STOP', protection.new_stop, protection.reason)

  # 5. 시간 손절 (D 카테고리)
  time_stop = check_time_stop(position, candle, indicators.atr)
  if time_stop: return ('FULL_EXIT', 1.0, time_stop.reason)

  return None  # 보유 지속
```

---

## 4. 매매 흐름 종합 예시 (BTC 4H 1주일)

T0 ~ T42 (4H × 42 = 1주일) 시나리오:

| 시점 | 가격 | 상태 | 이벤트 | 잔여 |
|---|---|---|---|---|
| T0 | $79,950 | NUM/PTN/BB confluence | **진입** 강도 80, 자본 5% ($500) | 0.00626 BTC |
| T2 | $80,200 | 보유 | EXIT 체크 (rs=0.05, 무이벤트) | 0.00626 |
| T8 | $80,510 | BB middle 회복 | **Tier 1 부분 청산** 70% (강도 80, PnL 0.70%) | 0.00188 |
| T12 | $82,350 | +3% 상승 | **C1·C3** stop $80,220 으로 이동 | 0.00188 |
| T18 | $83,800 | +4.8% | **C3** stop $81,670 으로 이동 | 0.00188 |
| T22 | $84,200 | +5.3% | **C2 활성화** trailing $81,674 (변화 없음) | 0.00188 |
| T28 | $82,900 | +3.7% (조정) | EXIT 체크 (rs=0.18, 무이벤트) | 0.00188 |
| T35 | $81,800 | -DI 크로스 + Engulfing | **Reversal trigger** rs=0.62 → 전체 청산 | 0 |

**손익 정산:**
```
거래 1 (T0 → T8, 70% 청산):
  진입 $79,950, 청산 $80,510
  size 0.00438 BTC
  손익: ($80,510 - $79,950) × 0.00438 = $2.45 (수수료·슬리피지 전)

거래 2 (T0 → T35, 30% 청산):
  진입 $79,950, 청산 $81,800
  size 0.00188 BTC
  손익: ($81,800 - $79,950) × 0.00188 = $3.48

총 손익: $2.45 + $3.48 = $5.93 (자본의 1.19%)
v6.1/v6.2 비교 (T0~T18 일괄 청산 가정):
  손익: ($83,800 - $79,950) × 0.00626 = $24.10 (자본의 4.82%)

→ 단일 청산이 v6.3 부분 청산보다 큰 수익. 단:
  - 단일 청산은 EXIT 시점 결정에 운 의존
  - v6.3 는 평균적으로 안정 (EXIT 결정 분산)
  - 백테스트로 long-run 비교 필요
```

⚠️ 위 예시는 단일 거래. v6.3 의 진짜 효과는 100+ 거래 평균에서 자본 효율 ↑.

---

## 5. 임계값 요약표 (구현 참조)

### 5.1 진입 임계 (v6.2)

| 변수 | NUM | PTN | BB |
|---|---|---|---|
| RSI lower | 25 (rsiQ10) | — | — |
| RSI upper | 38 (rsiQ30) | — | — |
| BB lower mult | 1.02 | 1.05 | (서브패턴 별) |
| ADX max | 20 | 25 | — |
| 패턴 lookback | — | 5 캔들 | (서브패턴 별) |
| Falling Knife | 시그모이드 | 시그모이드 | 미적용 |
| 카테고리 가중치 | 0.30/0.25/0.20/0.15/0.10 | 0/0.20/0.20/0.20/0.40 | 0/0.50/0.10/0.20/0.20 |
| 최소 진입 강도 | 40 | 40 | 40 |

### 5.2 EXIT 임계 (v6.3)

| 카테고리 | 트리거 |
|---|---|
| STOP | max(BB×0.97, ATR stop, Fib 23.6%) |
| EXIT-B 전체 | reversalScore ≥ 0.50 |
| EXIT-B 부분 | reversalScore ≥ 0.30 (50%) |
| EXIT-A Tier 1 | close ≥ BB.middle (50% 또는 강도 비례) |
| EXIT-A Tier 2 | close ≥ Fib 100% (+30%) |
| EXIT-A Tier 3 | close ≥ Fib 161.8% (100%) |
| EXIT-C Breakeven | PnL ≥ +2% |
| EXIT-C Trailing 5% | PnL ≥ +5%, stop = price × 0.97 |
| EXIT-C ATR Trailing | PnL ≥ +3%, stop = price - 1.5×ATR |
| EXIT-D 시간 손절 | bars ≥ 30, PnL < +0.5% (4H 기준) |

### 5.3 사이징 임계

| 항목 | 값 |
|---|---|
| 거래당 max risk | 자본 × 1% |
| 단일 포지션 max | 자본 × 5% (cap) |
| 일일 손실 한도 | 자본 × 3% (도달 시 24시간 진입 차단) |

---

## 6. ⚠️ 임시값 (calibration 필요)

다음 숫자들은 **현재 직관 또는 권위자 권고**. STRATEGY_CHARTER 규칙 2 (백테스트 알파 검증) 위반 가능. Stage 1 백테스트 엔진 완성 후 즉시 갱신:

| 항목 | 임시값 | calibration 후 |
|---|---|---|
| RSI 범위 | [25, 38] | 코인별 quantile [Q10, Q30] |
| 패턴 base | 0.40 ~ 0.90 | Tradelab 백테스트 결과 |
| 카테고리 가중치 | 0.30/0.25/... | constrained least squares |
| Multi-confluence 보너스 | 0.10 | 백테스트 winRate 차이 |
| reversalScore 임계 | 0.50 / 0.30 | TF·코인별 quantile |
| 시간 손절 캔들 | 30 / 50 | 변동성 비례 적응 |
| 부분 청산 비율 | 0.5 / 0.7 (강도 비례) | calibration |

---

## 7. v6.4 추가 변경 (진입 정밀화, 별도 적용)

이 문서는 v6.3 매매기준이지만, v6.4 가 진입 부분에 다음 추가:

| v6.4 변경 | 위치 | 본 문서 적용 |
|---|---|---|
| Live 트리거 (15분 단위) | 진입 시점 | 1.7 절 진입 결정 전 단계로 추가 |
| BB 근접도 grading (continuous) | NUM positionScore | 1.3.3 절 positionScore 보강 |
| 패턴 확정 검증 (1~2 캔들 후) | PTN 진입 | 1.4.1 PTN_GATE 추가 단계 |
| 강도 비례 부분 청산 | EXIT-A Tier 1 | 2.4 절 적응 비율 (이미 반영) |
| 적응 reversalScore 임계 | EXIT-B | 2.3 트리거 임계 적응 |
| 변동성 비례 시간 손절 | EXIT-D | 2.6 절 적용 (이미 반영) |

v6.4 별도 적용은 BBDX_v6.4.md 참조.

---

## 8. 한 줄 요약

**"진입은 3 경로 (NUM/PTN/BB) OR + 카테고리 가중 강도 0~100, EXIT 는 4 카테고리 (STOP > 반전 > 목표 > 보호 > 시간) 우선순위 + 부분 청산 + trailing.** 모든 임계는 임시값, calibration 필요. 자본 보호 우선 (거래당 1%, 포지션 5%, 일일 3%)."

---

## 9. 헌장 검증

이 매매기준이 STRATEGY_CHARTER 통과:

```
[✓] 7차원 커버리지:
    - 모멘텀: RSI ✓
    - 변동성: BB, ATR ✓
    - 추세: ADX, +DI/-DI, EMA Ribbon ✓
    - 거래량: volumeBaselineEMA50 ✓
    - 시장구조: BB, Fibonacci, 추세선 (v6.3 EXIT-B B4) ✓
    - 거시: ⚠️ 부재 (v6.4 또는 ONCHAIN/MACRO 통합 필요)
    - 온체인: ⚠️ 부재 (ONCHAIN_INTEGRATION 통합 필요)

[✓] 규칙 1 (차원 중복 X): 같은 차원 중복 없음
[⚠️] 규칙 2 (백테스트 알파): 임시값 다수 → calibration 필요
[✓] 규칙 3 (단독 시그널 X): 모든 룰이 BBDX 가중치
[✓] 자본 보호: 1% / 5% / 3% 한도
```

거시·온체인 차원은 BBDX_v6.4 + ONCHAIN_INTEGRATION 통합으로 보완.
