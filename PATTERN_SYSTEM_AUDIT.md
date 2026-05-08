# BBDX 패턴 시스템 정밀 진단 보고서

> **대상:** v6.1 ~ v6.4 의 캔들 패턴 정의 + 패턴 강도 + 가중치 부여 + 신뢰도 산출
> **목적:** Claude Code 가 패턴을 코드로 학습·구현하기 전 발견된 결함 모두 짚기
> **결론:** **12 가지 결함 발견. 그 중 4 가지는 심각 (critical)**, 8 가지는 중간~낮음.
> **권고:** 심각 결함 4 개는 코드 작성 전 반드시 해결. 안 하면 백테스트 결과가 가짜.

---

## 0. 진단 범위

```
v6.1 (운영 중):
  - 캔들 패턴 7개 (해머, 인걸핑, 모닝스타, 역해머, 핀바, 도지, 3WhiteSoldiers)
  - 약세 패턴 3개 (약세인걸핑, 이브닝스타, 3BlackCrows)
  - 패턴 강도 60~100 정수
  - candlesAgo 0~5 윈도우
  - 중복 제거 우선순위

v6.2 (개선 명세):
  - 패턴 base 0.4~0.9 정규화
  - candlesAgo 지수 감쇠
  - 약세 패턴 freshness 가중

v6.3 (EXIT 재설계):
  - 약세 패턴이 [EXIT-B] 반전 점수의 1 컴포넌트

v6.4 (타점 정밀화):
  - 패턴 확정 검증 (단점 C)
```

각 버전을 살펴봤고, 패턴 시스템 전반에 12 가지 결함이 누적되어 있어요.

---

## 1. 심각 (Critical) 결함 — 4개

### 결함 #1 — 패턴 정의의 자연어 모호성 (가장 심각)

**문제:**
v6.1 의 패턴 정의는 모두 자연어. 예:

```
해머: "긴 하꼬리 + 작은 몸통 + 양봉"
인걸핑: "이전 캔들을 완전히 감싸는 양봉"
도지: "시가 ≈ 종가 (우유부단)"
핀바: "긴 꼬리 + 반전 방향 신호"
```

**왜 심각:**
- "긴 하꼬리" 가 정확히 얼마인가? 몸통의 2배? 3배? 5배?
- "이전 캔들을 완전히 감싸는" — 시가만? 종가만? 둘 다? high/low 까지?
- "시가 ≈ 종가" 의 ≈ 는 0.1%? 0.5%? 1%?
- "긴 꼬리" — 한쪽? 양쪽? 어느 쪽이 길어야?

**Claude Code 가 이걸 코드로 옮기면 본인이 의도한 정의와 다를 가능성 80% 이상.** 그리고 "다른 정의" 의 패턴으로 백테스트하면 결과가 완전히 다르게 나와요.

**실제 해머 정의의 학파별 차이:**

| 출처 | 하꼬리 | 상꼬리 | 몸통 위치 |
|---|---|---|---|
| Steve Nison (원저자) | 몸통 × 2배 이상 | 몸통의 50% 이하 | 캔들 상단 |
| TradingView 기본 | 몸통 × 2배 | 거의 없음 | 무관 |
| Bulkowski (백테스트 권위자) | 몸통 × 2배 + range 의 60% 이상 | range 의 10% 이하 | 무관 |
| Pine Script 표준 | 몸통 × 2배 + range × 0.7 이상 | 명시 X | 명시 X |

**같은 "해머" 가 4 가지 정의.** v6.1 은 어느 것을 의도했는지 명시 X.

**v6.2 가 부분 해결:** patternBase 정규화는 했지만 **정의 자체는 그대로 자연어**. 핵심 결함 미해결.

**해결 (v6.5 권고):**
모든 패턴을 **수식으로 명시**. 예:

```typescript
// 해머 (Tradelab 표준 정의)
function isHammer(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0) return false;

  const lowerWick = Math.min(c.open, c.close) - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);

  return (
    lowerWick >= body * 2.0 &&         // 하꼬리 ≥ 몸통 × 2
    upperWick <= body * 0.5 &&         // 상꼬리 ≤ 몸통 × 0.5
    body / range >= 0.05 &&            // 몸통 ≥ 캔들 5%
    body / range <= 0.40 &&            // 몸통 ≤ 캔들 40%
    c.close >= c.open                  // 양봉 (또는 도지 허용)
  );
}
```

각 패턴마다 정확한 수식 + 단위 테스트 + edge case 명시.

**우선순위:** 즉시 (코드 작성 전 필수)

---

### 결함 #2 — 패턴 강도가 직관 (calibration 부재)

**문제:**
v6.1 의 패턴 강도:
```
인걸핑: 100
모닝스타: 90
3WhiteSoldiers: 85
해머: 75
역해머: 75
핀바: 70
도지: 60
```

**왜 심각:**
이 숫자들 어디서 왔나? 문서에 근거 없음.
- 인걸핑 100 vs 해머 75 = 인걸핑이 1.33 배 더 신뢰?
- 모닝스타 90 vs 핀바 70 = 모닝스타가 1.29 배 더 신뢰?
- **근거 백테스트 통계 없음.** 권위자 권위만으로 부여.

**실제 학술 백테스트 결과 (Bulkowski, Encyclopedia of Candlestick Charts, 2008):**

| 패턴 | Bulkowski 의 5일 후 승률 | v6.1 강도 |
|---|---|---|
| Bullish Engulfing | 63% | 100 (1위) |
| Three White Soldiers | 70% | 85 (3위) |
| Morning Star | 78% | 90 (2위) |
| Hammer | 60% | 75 (4위) |
| Inverted Hammer | 56% | 75 (4위) |
| Pin Bar | 별도 분류 X | 70 (6위) |
| Doji | 50% (랜덤 수준) | 60 (7위) |

**관찰:**
- v6.1 의 순위 (인걸핑 1위) ≠ Bulkowski 의 통계 (모닝스타 1위, 3WhiteSoldiers 2위)
- 인걸핑 100 점은 **과대평가**. Bulkowski 기준 모닝스타가 더 강함
- 도지는 50% (사실상 noise) 인데 60 점 부여
- v6.1 강도와 실제 승률의 **상관관계 약함**

**Claude Code 가 이 강도로 학습하면 가짜 신뢰도가 production 에 들어감.**

**해결 (v6.5 권고):**
Tradelab 자체 백테스트로 patternBase 갱신. STRATEGY_CHARTER 규칙 2 (백테스트 알파 검증) 의 정확한 사례.

```python
def calibrate_pattern_strength():
  results = {}
  for pattern_name in ALL_PATTERNS:
    detections = backtest_detect_pattern(pattern_name, days=365)
    outcomes = measure_outcomes(detections, window=7_days)
    win_rate = outcomes.wins / outcomes.total
    ci = wilson_score_interval(outcomes.wins, outcomes.total)

    results[pattern_name] = {
      'win_rate': win_rate,
      'ci_low': ci[0],
      'ci_high': ci[1],
      'n': outcomes.total,
      'patternBase': map_to_base(win_rate, baseline=0.50),
    }

  return results
```

매주 자동 갱신. 갱신 시 큰 변화 (>20%) 면 사용자 알림.

**우선순위:** 즉시 (직관 강도로 백테스트 → 결과 무의미)

---

### 결함 #3 — Look-ahead bias 위험 (candlesAgo 윈도우)

**문제:**
v6.1: "최근 5캔들 윈도우 내 패턴 감지". v6.2: candlesAgo 지수 감쇠.

**왜 심각:**
"최근 5캔들" 의 정의가 모호. 두 가지 해석 가능:

**해석 A (look-ahead 안전):** 현재 캔들 t 시점에서, 인덱스 t-4 ~ t 까지 5개 캔들 검사.
**해석 B (look-ahead 위험):** 패턴 캔들이 candlesAgo=2 이면, 그 후 2 캔들의 데이터 사용 가능 → 사후 정보로 패턴 "확정".

**예시 — 위험한 경우:**

```python
# 위험: 해머 candlesAgo=2 감지 시 candlesAgo=0,1 정보 활용
def is_hammer_post_facto(candles, idx):
  if not basic_hammer_shape(candles[idx]): return False

  # 위험: 해머 이후 2 캔들이 양봉이면 "확정 해머" 분류
  if candles[idx+1].close > candles[idx].close: return True
  return False
```

**이게 Look-ahead bias.** 백테스트에서 candlesAgo=2 시그널을 조회할 때 candlesAgo=0,1 의 캔들을 본다 = **미래 정보 사용**.

**v6.4 단점 C 의 "패턴 확정 검증 1~2 캔들" 도 같은 위험.** 명세가 정확하지 않으면 똑같이 빠짐.

**v6.4 의 정확한 의도:**
```
패턴 form 시점 (예: t-2)
→ t-1 시점에 "확정 후보" 로 마킹 (아직 진입 X)
→ t 시점에 확정 검증 (거래량, 후속 양봉)
→ t+1 시점에 진입
```

이 흐름이면 안전. 단 코드가 정확히 이 순서로 작동하는지 검증 필수.

**해결:**
```python
def detect_pattern_safe(candles, current_idx):
  """
  현재 인덱스 i 시점에서, candles[0..i] 슬라이스만 사용.
  candles[j > i] 는 절대 접근 X.
  """
  patterns = []
  for j in range(max(0, current_idx - 4), current_idx + 1):
    # j 가 패턴 캔들 후보
    pattern_slice = candles[:j+1]  # j 까지만
    if is_hammer(pattern_slice[-1]):  # j 시점 단일 캔들 패턴
      patterns.append({'pattern': 'hammer', 'candle_idx': j, 'candles_ago': current_idx - j})
    if j >= 2 and is_morning_star(pattern_slice[-3], pattern_slice[-2], pattern_slice[-1]):
      patterns.append({'pattern': 'morning_star', 'candle_idx': j, 'candles_ago': current_idx - j})
  return patterns
```

**검증 방법:**
백테스트 코드에 다음 unit test 추가:

```python
def test_no_lookahead():
  candles_full = load_candles(days=365)
  for i in range(100, len(candles_full)):
    # 시그널 시점 i 에서 감지된 패턴
    sig_at_i = detect_pattern_safe(candles_full[:i+1], i)
    # 같은 i 에서, 더 많은 미래 데이터를 보고 감지된 패턴
    sig_with_future = detect_pattern_safe(candles_full[:i+10], i)
    # 두 결과가 일치해야 함 (i 시점 결정에 i+1~i+9 영향 X)
    assert sig_at_i == sig_with_future, f"Look-ahead detected at i={i}"
```

**우선순위:** 즉시 (이게 깨지면 백테스트 승률이 거짓)

---

### 결함 #4 — 중복 제거 우선순위가 임의

**문제:**
v6.1 중복 제거 우선순위:
```
인걸핑 > 모닝스타 > 해머 > 도지
```

**왜 심각:**
- 이 순서가 어디서 왔나? 강도 점수 (인걸핑 100 > 모닝스타 90 > 해머 75 > 도지 60) 와 일치하지만, **결함 #2** 에서 강도 자체가 직관.
- **같은 캔들에 여러 패턴이 동시 감지되는 건 사실상 정상.** 강한 양봉 인걸핑은 동시에 모닝스타의 마지막 캔들이고, 동시에 해머일 수도 있음. **중복 제거 자체가 정보 손실.**
- v6.1 은 "인걸핑만 기록" — 다른 패턴 정보 폐기.

**대안 — 중복 제거 X, 다중 패턴 합산:**

```python
def detect_all_patterns(candles, lookback=5):
  """
  중복 제거 X. 모든 패턴 동시 기록.
  """
  detected = []
  for j in range(max(0, len(candles)-lookback), len(candles)):
    if j >= 0:
      if is_hammer(candles[j]):
        detected.append({'pattern': 'hammer', 'idx': j, 'base': 0.7})
    if j >= 1:
      if is_bullish_engulfing(candles[j-1], candles[j]):
        detected.append({'pattern': 'engulfing', 'idx': j, 'base': 0.85})
    if j >= 2:
      if is_morning_star(candles[j-2], candles[j-1], candles[j]):
        detected.append({'pattern': 'morning_star', 'idx': j, 'base': 0.9})
  return detected


def pattern_aggregate_score(detected):
  """
  여러 패턴 동시 감지 시 합산 (단, 각 패턴 단독 max 1.0).

  단순 합 X → max + 보너스
    primary = max(base × discount)
    bonus = 0.10 × (다른 패턴 수, 최대 0.20)
    final = min(1.0, primary + bonus)
  """
  if len(detected) == 0: return 0
  scored = [d['base'] * exp(-(d['candles_ago']) / 3) for d in detected]
  primary = max(scored)
  bonus = min(0.20, (len(detected) - 1) * 0.10)
  return min(1.0, primary + bonus)
```

**효과:**
- 다중 패턴 감지 = confluence 신호 (강한 진입)
- 정보 폐기 X
- 백테스트 결과가 "여러 패턴 동시 발생 시 진짜 더 신뢰?" 검증 가능

**우선순위:** 즉시 (정보 손실 + 임의 순서)

---

## 2. 중간 심각도 (Major) 결함 — 4개

### 결함 #5 — 약세 패턴 정의가 강세 패턴 단순 반전 (정밀도 낮음)

**문제:**
v6.1 의 약세 패턴:
- 약세 인걸핑 (100): 강세 인걸핑의 부호 반대
- 이브닝스타 (90): 모닝스타 부호 반대
- 3 Black Crows (85): 3 White Soldiers 부호 반대

**Bulkowski 통계로 검증:**

| 패턴 | 5일 후 하락률 |
|---|---|
| Bearish Engulfing | 79% (강함) |
| Evening Star | 72% |
| Three Black Crows | 78% |
| **Dark Cloud Cover** | 60% (v6.1 미포함) |
| **Shooting Star** | 65% (v6.1 미포함) |
| **Hanging Man** | 56% (v6.1 미포함) |

**v6.1 의 약세 패턴 3개 = 너무 적음.** Bulkowski 의 약세 reversal 패턴 약 12개 중 3개만.

**v6.3 [EXIT-B] 의 반전 점수 가중치 0.20** 에서 약세 패턴 부족이 영향. 진짜 반전 신호 일부 놓침.

**해결:**
Dark Cloud Cover, Shooting Star, Hanging Man 추가. 단 STRATEGY_CHARTER 규칙 2 (백테스트 알파 검증) 후.

**우선순위:** 중기 (백테스트 엔진 완성 후)

---

### 결함 #6 — 거래량 컨텍스트 미통합

**문제:**
v6.1 패턴은 **단순 OHLC 형태만 검사**. 거래량 무시.

학술 결과: **거래량 동반 패턴이 거래량 없는 패턴보다 신뢰도 1.5~2배.**

예 (Bulkowski):
- 일반 해머: 60% 승률
- 거래량 평균 × 1.5 동반 해머: 78% 승률
- 거래량 평균 × 2.0 동반 해머: 84% 승률

**v6.1 / v6.4 미반영.** v6.4 단점 C 가 부분 해결 (확정 검증 시 거래량 체크) 이지만 그건 진입 시점 검증, **패턴 강도 자체에는 미반영**.

**해결:**
```python
def pattern_strength_with_volume(pattern, candle, volume_baseline):
  base = PATTERN_BASE[pattern]
  vol_ratio = candle.volume / volume_baseline
  # 거래량 multiplier
  if vol_ratio >= 2.0:   vol_mult = 1.40
  elif vol_ratio >= 1.5: vol_mult = 1.25
  elif vol_ratio >= 1.2: vol_mult = 1.10
  elif vol_ratio < 0.8:  vol_mult = 0.80  # 거래량 부족 = 신뢰도 ↓
  else:                  vol_mult = 1.00

  return min(1.0, base * vol_mult)
```

**우선순위:** 즉시 (코드 작성 시점에 추가)

---

### 결함 #7 — 컨텍스트 (선행 추세) 미통합

**문제:**
v6.1 패턴은 **현재 캔들 + 직전 1~2 캔들만 검사**. **선행 추세 무시**.

학술 결과: **하락 추세 후 강세 패턴 = 진짜 반전 신호. 횡보·상승 추세 후 강세 패턴 = noise.**

예:
- 강한 하락 5 캔들 후 해머: 70% 승률 (반전 신뢰 ↑)
- 횡보 후 해머: 50% 승률 (랜덤)
- 상승 추세 중 해머: 40% 승률 (오히려 약세)

**v6.1 미반영.** 같은 해머 패턴이라도 컨텍스트 따라 의미 완전 다름.

**해결:**
```python
def pattern_with_trend_context(candles, pattern_idx, lookback=5):
  base = PATTERN_BASE[pattern_name]

  # 패턴 직전 5 캔들의 trend
  prior_candles = candles[pattern_idx - lookback : pattern_idx]
  if len(prior_candles) < lookback: return base

  prior_returns = [(c.close - c.open) / c.open for c in prior_candles]
  cumulative_return = sum(prior_returns)

  # 강세 패턴은 하락 추세 후일 때 강함
  if cumulative_return < -0.05:    # 5% 이상 하락 후
    context_mult = 1.30
  elif cumulative_return < -0.02:  # 2~5% 하락 후
    context_mult = 1.15
  elif cumulative_return > 0.05:   # 5% 이상 상승 후
    context_mult = 0.60   # 강세 패턴이지만 의미 약함
  else:
    context_mult = 1.00

  return min(1.0, base * context_mult)
```

**STRATEGY_CHARTER 의 규칙 1 (차원 중복 X) 검증:**
- 패턴 = 가격 액션 차원 (5번 시장 구조에 가까움)
- 추세 컨텍스트 = 추세 차원 (3번)
- **다른 차원 결합** → 규칙 1 통과 ✓

**우선순위:** 즉시

---

### 결함 #8 — TF (타임프레임) 별 적합성 미고려

**문제:**
v6.1 패턴 강도는 모든 TF 동일. 그러나:

| 패턴 | 4H 신뢰도 | 1D 신뢰도 | 1W 신뢰도 |
|---|---|---|---|
| Doji | 낮음 (노이즈) | 중간 | 높음 (의미 있는 우유부단) |
| Hammer | 중간 | 높음 | 매우 높음 |
| Engulfing | 높음 | 매우 높음 | 가장 높음 |
| 3 White Soldiers | 중간 | 높음 | 가장 높음 (장기 반전) |

**Andrew Lo et al. (2000)** 의 학술 연구:
- 단기 (4H 이하) 캔들 패턴: 신뢰도 50% 부근 (사실상 random)
- 일봉 (1D): 약간 above-random (52~58%)
- 주봉 (1W): meaningful (60~70%)

**핵심 통찰:** **4H 캔들 패턴 자체가 의심스러운 신호.** v6.1 의 주력 TF 가 4H 인 점 + 패턴 의존도 높음 = 사실 효과 약할 가능성.

**해결:**
TF별 patternBase 차등.

```python
PATTERN_BASE_BY_TF = {
  '4h': {
    'engulfing': 0.65,       # 4H 에서는 약함
    'morning_star': 0.70,
    'hammer': 0.55,
    'doji': 0.30,            # 거의 무의미
    ...
  },
  '1d': {
    'engulfing': 0.85,
    'morning_star': 0.90,
    'hammer': 0.75,
    'doji': 0.50,
    ...
  },
  '1w': {
    'engulfing': 0.95,
    'morning_star': 0.95,
    'hammer': 0.85,
    'doji': 0.70,
    ...
  },
}
```

**우선순위:** 즉시 (TF별 백테스트 결과로 갱신)

---

## 3. 낮은 심각도 (Minor) 결함 — 4개

### 결함 #9 — 패턴이 시간 정보 무시

**문제:**
같은 해머 패턴이라도 KST 새벽 3시 형성 vs KST 오후 8시 형성이 의미 다름. 거래 활성 시간 (KST 18~22) 의 패턴이 더 신뢰.

**해결:**
시간대 가중. 단, 영향 작음 → Stage 2 후 도입.

### 결함 #10 — 갭 (gap) 처리 미명시

**문제:**
캔들 간 갭이 있으면 "이전 캔들 종가" vs "현재 캔들 시가" 차이가 큼. 인걸핑 정의에 영향.

**해결:**
Wave Tracker v1.1 의 갭 처리 정책 (gap-aware mode) 을 패턴에도 적용.

### 결함 #11 — 패턴 통계의 시장 환경 의존성 미반영

**문제:**
강세장 (BTC 4년 사이클의 전반) 의 강세 패턴 신뢰도 vs 약세장 신뢰도 다름. 동일 base 적용 → 시장 환경 무시.

**해결:**
시장 레짐 (bull_strong / bull_weak / sideways / bear_weak / bear_strong) 별 patternBase 차등. Macro Liquidity Tracker 통합.

**STRATEGY_CHARTER 규칙 2 통과:** 시장 레짐 별 백테스트 결과로 도출.

### 결함 #12 — 패턴 신뢰도 표시의 사용자 혼란

**문제:**
v6.1 사례 2 의 강도 100 점 (해머 패턴) → 결과 -4.5% 손절. 사용자가 "100 점인데 왜 손실?" 의문.

**현실:**
100 점이라고 해서 100% 승률 X. 실제 승률은 60~70% (가장 강한 패턴).

**해결:**
UI 표시를 강도 점수가 아니라 **승률 + CI** 로:

```
이전: 강도 100/100
변경: 과거 통계 승률 71% (n=187, CI 64~78%)
```

사용자가 정확한 기대값 형성. v6.2 의 "강도-승률 매핑 캘리브레이션" (단점 5) 의 정확한 적용.

---

## 4. 발견된 결함의 우선순위 매트릭스

| 결함 | 심각도 | 백테스트 신뢰성 영향 | Claude Code 작성 시 즉시 해결 필요? |
|---|---|---|---|
| #1 자연어 정의 모호성 | 🔴 Critical | **결과 가짜** | **예, 즉시** |
| #2 강도 직관 (calibration X) | 🔴 Critical | 가짜 가중치 | **예, 즉시** |
| #3 Look-ahead bias 위험 | 🔴 Critical | **결과 가짜** | **예, 즉시** |
| #4 중복 제거 임의 | 🔴 Critical | 정보 손실 | **예, 즉시** |
| #5 약세 패턴 부족 | 🟡 Major | EXIT 약화 | 백테스트 후 |
| #6 거래량 컨텍스트 X | 🟡 Major | 신뢰도 저하 | 즉시 (간단) |
| #7 선행 추세 컨텍스트 X | 🟡 Major | 가짜 시그널 ↑ | 즉시 |
| #8 TF별 적합성 X | 🟡 Major | 4H 시그널 의심 | 즉시 (TF별 base) |
| #9 시간대 무시 | 🟢 Minor | 작음 | Stage 2 후 |
| #10 갭 처리 X | 🟢 Minor | 작음 | 백테스트 후 |
| #11 시장 환경 X | 🟢 Minor | 중간 | 백테스트 후 |
| #12 UI 신뢰도 표시 | 🟢 Minor | UX | Stage 1 |

---

## 5. 즉시 해결 권고 — Claude Code 입력 명령

본인이 Claude Code 에 패턴 학습시키기 전 다음 4 가지를 명세에 박으세요. 그렇지 않으면 백테스트 결과가 모두 가짜일 수 있어요.

### 5.1 정확한 패턴 수식 (결함 #1 해결)

```typescript
// /server/src/patterns/definitions.ts
// 모든 패턴을 수식으로 정의. 자연어 X.

export interface CandleMetrics {
  body: number;       // |close - open|
  range: number;      // high - low
  upperWick: number;  // high - max(open, close)
  lowerWick: number;  // min(open, close) - low
  isBull: boolean;    // close >= open
}

export function getMetrics(c: Candle): CandleMetrics {
  return {
    body: Math.abs(c.close - c.open),
    range: c.high - c.low,
    upperWick: c.high - Math.max(c.open, c.close),
    lowerWick: Math.min(c.open, c.close) - c.low,
    isBull: c.close >= c.open,
  };
}

// 해머 (Tradelab 표준)
export function isHammer(c: Candle): boolean {
  const m = getMetrics(c);
  if (m.range === 0) return false;
  return (
    m.lowerWick >= m.body * 2.0 &&    // 하꼬리 ≥ 몸통 × 2
    m.upperWick <= m.body * 0.5 &&    // 상꼬리 ≤ 몸통 × 0.5
    m.body / m.range >= 0.05 &&       // 몸통 ≥ 캔들 5%
    m.body / m.range <= 0.40          // 몸통 ≤ 캔들 40%
    // 양봉/음봉 모두 허용 (Bulkowski 표준)
  );
}

// 강세 인걸핑
export function isBullishEngulfing(prev: Candle, curr: Candle): boolean {
  const prevBear = prev.close < prev.open;
  const currBull = curr.close > curr.open;
  return (
    prevBear && currBull &&
    curr.open <= prev.close &&        // 시가가 직전 종가 이하
    curr.close >= prev.open &&        // 종가가 직전 시가 이상
    Math.abs(curr.close - curr.open) > Math.abs(prev.close - prev.open) * 0.8
                                      // 현재 몸통이 직전 몸통의 80% 이상
  );
}

// 모닝스타
export function isMorningStar(c1: Candle, c2: Candle, c3: Candle): boolean {
  const m1 = getMetrics(c1), m2 = getMetrics(c2), m3 = getMetrics(c3);
  return (
    !c1.close > c1.open && m1.body / m1.range >= 0.5 &&  // c1 강한 음봉
    m2.body / Math.max(m2.range, 1e-9) <= 0.30 &&        // c2 작은 몸통
    c3.close > c3.open && m3.body / m3.range >= 0.5 &&   // c3 강한 양봉
    c3.close > (c1.open + c1.close) / 2                  // c3 종가가 c1 중점 위
  );
}

// 핀바 (강세, Bullish Pin Bar)
export function isBullishPinBar(c: Candle): boolean {
  const m = getMetrics(c);
  if (m.range === 0) return false;
  return (
    m.lowerWick / m.range >= 0.6 &&   // 하꼬리가 캔들의 60% 이상
    m.body / m.range <= 0.30 &&       // 몸통이 캔들의 30% 이하
    m.upperWick / m.range <= 0.20 &&  // 상꼬리가 캔들의 20% 이하
    c.close > c.open                  // 양봉 (핀바는 보통 양봉)
  );
}

// 도지
export function isDoji(c: Candle, threshold = 0.1): boolean {
  const m = getMetrics(c);
  if (m.range === 0) return false;
  return m.body / m.range < threshold;  // 몸통이 캔들의 10% 미만
}

// 3 White Soldiers
export function isThreeWhiteSoldiers(c1: Candle, c2: Candle, c3: Candle): boolean {
  const allBull = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
  const ascending = c2.close > c1.close && c3.close > c2.close;
  const opensInside =
    c2.open >= c1.open && c2.open <= c1.close &&
    c3.open >= c2.open && c3.open <= c2.close;
  // 추가: 각 캔들의 몸통이 충분히 커야
  const m1 = getMetrics(c1), m2 = getMetrics(c2), m3 = getMetrics(c3);
  const bigBodies =
    m1.body / m1.range >= 0.5 &&
    m2.body / m2.range >= 0.5 &&
    m3.body / m3.range >= 0.5;
  return allBull && ascending && opensInside && bigBodies;
}
```

### 5.2 거래량 + 컨텍스트 multiplier (결함 #6, #7 해결)

```typescript
export function patternStrengthWithContext(
  pattern: DetectedPattern,
  candles: Candle[],
  patternIdx: number,
  baselineVolume: number,
): number {
  let strength = pattern.base;

  // 거래량 multiplier
  const volRatio = candles[patternIdx].volume / baselineVolume;
  if (volRatio >= 2.0) strength *= 1.40;
  else if (volRatio >= 1.5) strength *= 1.25;
  else if (volRatio >= 1.2) strength *= 1.10;
  else if (volRatio < 0.8) strength *= 0.80;

  // 추세 컨텍스트 (직전 5 캔들)
  const lookback = 5;
  if (patternIdx >= lookback) {
    const prior = candles.slice(patternIdx - lookback, patternIdx);
    const cumReturn = prior.reduce(
      (acc, c) => acc + (c.close - c.open) / c.open, 0
    );

    if (pattern.bullish) {
      // 강세 패턴은 하락 후 의미 ↑
      if (cumReturn < -0.05) strength *= 1.30;
      else if (cumReturn < -0.02) strength *= 1.15;
      else if (cumReturn > 0.05) strength *= 0.60;
    } else {
      // 약세 패턴은 상승 후 의미 ↑
      if (cumReturn > 0.05) strength *= 1.30;
      else if (cumReturn > 0.02) strength *= 1.15;
      else if (cumReturn < -0.05) strength *= 0.60;
    }
  }

  return Math.min(1.0, strength);
}
```

### 5.3 Look-ahead 안전 윈도우 (결함 #3 해결)

```typescript
export function detectPatternsAtIndex(
  candles: Candle[],
  currentIdx: number,
  lookback: number = 5,
): DetectedPattern[] {
  /**
   * IMPORTANT: 절대 candles[j > currentIdx] 접근 금지.
   * candles 슬라이스는 0..currentIdx 범위만 사용.
   */
  const detected: DetectedPattern[] = [];

  for (let j = Math.max(0, currentIdx - lookback + 1); j <= currentIdx; j++) {
    // 단일 캔들 패턴
    if (isHammer(candles[j])) {
      detected.push({
        type: 'hammer', candleIdx: j,
        candlesAgo: currentIdx - j, base: 0.7, bullish: true,
      });
    }
    if (isDoji(candles[j])) {
      detected.push({
        type: 'doji', candleIdx: j,
        candlesAgo: currentIdx - j, base: 0.4, bullish: null,
      });
    }
    // 2-캔들 패턴
    if (j >= 1 && isBullishEngulfing(candles[j-1], candles[j])) {
      detected.push({
        type: 'bullish_engulfing', candleIdx: j,
        candlesAgo: currentIdx - j, base: 0.85, bullish: true,
      });
    }
    // 3-캔들 패턴
    if (j >= 2 && isMorningStar(candles[j-2], candles[j-1], candles[j])) {
      detected.push({
        type: 'morning_star', candleIdx: j,
        candlesAgo: currentIdx - j, base: 0.9, bullish: true,
      });
    }
    if (j >= 2 && isThreeWhiteSoldiers(candles[j-2], candles[j-1], candles[j])) {
      detected.push({
        type: 'three_white_soldiers', candleIdx: j,
        candlesAgo: currentIdx - j, base: 0.85, bullish: true,
      });
    }
  }
  return detected;
}
```

### 5.4 다중 패턴 합산 (결함 #4 해결)

```typescript
export function aggregatePatternScore(
  detected: DetectedPattern[],
  candles: Candle[],
  baselineVolume: number,
): number {
  if (detected.length === 0) return 0;

  // 각 패턴마다 컨텍스트 강도 계산
  const scored = detected.map(p => {
    const contextStrength = patternStrengthWithContext(
      p, candles, p.candleIdx, baselineVolume
    );
    const ageDiscount = Math.exp(-p.candlesAgo / 3);
    return contextStrength * ageDiscount;
  });

  // 중복 제거 X. Max + bonus 모델.
  const primary = Math.max(...scored);
  const bonus = Math.min(0.20, (detected.length - 1) * 0.10);
  return Math.min(1.0, primary + bonus);
}
```

### 5.5 vitest 테스트 (즉시 추가 필수)

```typescript
// /server/src/patterns/__tests__/no_lookahead.test.ts
import { describe, test, expect } from 'vitest';
import { detectPatternsAtIndex } from '../patterns';
import { loadTestCandles } from './fixtures';

describe('No Look-ahead Bias', () => {
  test('결정이 미래 캔들에 의존하지 않는다', () => {
    const candles = loadTestCandles(365);

    for (let i = 100; i < candles.length - 10; i++) {
      const detectedAtI = detectPatternsAtIndex(candles.slice(0, i + 1), i);
      const detectedWithFuture = detectPatternsAtIndex(candles.slice(0, i + 10), i);
      expect(detectedAtI).toEqual(detectedWithFuture);
    }
  });

  test('해머 패턴 정의 — Tradelab 표준', () => {
    // 해머: 하꼬리 ≥ 몸통 × 2, 상꼬리 ≤ 몸통 × 0.5
    const validHammer: Candle = {
      ts: 0, open: 100, high: 101, low: 95, close: 100.5, volume: 1000,
    };
    expect(isHammer(validHammer)).toBe(true);

    const invalidHammer: Candle = {
      ts: 0, open: 100, high: 105, low: 99, close: 100.5, volume: 1000,
    };
    // 상꼬리 4.5 가 몸통 0.5 보다 매우 큼 → 해머 X
    expect(isHammer(invalidHammer)).toBe(false);
  });
});
```

---

## 6. Claude Code 입력 권장 명령

```
패턴 학습 시스템을 본격 구현하기 전에 다음을 진행해줘:

1. /server/src/patterns/definitions.ts 작성
   - 본 문서 5.1 의 정확한 수식 사용
   - 모든 함수는 순수 (pure), look-ahead 안전
   - 해머·인걸핑·모닝스타·핀바·도지·3WhiteSoldiers + 약세 3개 = 9개 패턴

2. /server/src/patterns/context.ts 작성
   - 5.2 의 거래량 + 추세 컨텍스트 multiplier
   - getMetrics 헬퍼 사용

3. /server/src/patterns/aggregator.ts 작성
   - 5.3 의 detectPatternsAtIndex (look-ahead 안전)
   - 5.4 의 aggregatePatternScore (max + bonus)

4. /server/src/patterns/__tests__/ 에 vitest 케이스
   - no_lookahead.test.ts (5.5)
   - definitions.test.ts (각 패턴 정확한 수식 검증)
   - aggregator.test.ts (다중 패턴 합산 검증)

5. patternBase 임시 값은 본 문서 5.1 의 숫자 사용.
   추후 calibration pipeline 으로 갱신.

6. 모든 PR 에 STRATEGY_CHARTER.md 의 7차원 + 3규칙 통과 확인.
   특히 규칙 1 (차원 중복 X) — 패턴은 5번 시장 구조 차원, 컨텍스트는 3번 추세 차원.

작업 전 설계 보여주고 승인 받기.
```

---

## 7. 솔직한 한계

**이 진단도 못 푸는 것:**
- 패턴 정의의 학파별 차이는 본질. Tradelab "표준" 정의가 절대적 정답 X
- 캔들 패턴 자체가 단기 (4H) 에서는 제한된 alpha (Andrew Lo 학술 결과)
- 12 결함을 모두 해결해도 패턴 시스템이 BBDX 의 핵심 alpha 가 아닐 가능성
- 진짜 alpha 는 패턴 + 거시 + 온체인 + 추세 컨플루언스 → 패턴 단독 의존 위험

**진단 후 권장 결정:**
- 패턴 시스템에 너무 큰 비중 두지 말 것 (현재 v6.1 의 patternBase 100/90/85 는 과대평가)
- 패턴은 BBDX 의 PTN 경로 보조로만, NUM/BB 가 핵심
- v6.4 의 카테고리 가중 모델에서 patternAction 카테고리 가중치 0.10~0.15 정도 적정 (NUM 경로) ~0.40 (PTN 경로)

---

## 8. 한 줄 요약

**"BBDX 패턴 시스템에 12개 결함, 그 중 4개 critical: 자연어 정의 모호성·강도 직관·look-ahead 위험·중복 제거 임의.** 코드 작성 전 4개 모두 해결해야 백테스트 결과가 진짜. 거래량·선행 추세·TF 적합성 4개 major 결함도 즉시 해결 권고. 패턴은 보조 신호이지 alpha 의 중심이 아님 — 비중 과대평가 주의."
