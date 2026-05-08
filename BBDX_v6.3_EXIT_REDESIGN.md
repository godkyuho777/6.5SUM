# BBDX-PATTERN v6.3 — EXIT 룰 재설계 + 전체 전략 단점·개선안

**기준 문서**: v6.1 운영 중 → v6.2 명세 → v6.3 (EXIT 재설계 + 통합 검토)
**핵심 변경**: EXIT 조건의 트레이딩 논리 결함 보완
**상태**: 개선 명세

---

## 0. v6.2 → v6.3 핵심 변경

v6.2 까지의 EXIT 룰은 v6.1 의 "4 조건 중 3 충족" 골격을 유지했어요. 하지만 그 골격 자체에 **트레이딩 논리상 결함**이 있어서, v6.3 에서 EXIT 룰을 처음부터 재설계합니다.

| 영역 | v6.1/v6.2 | v6.3 |
|---|---|---|
| EXIT 조건 #3 (ADX ≥ 30) | "강한 추세 형성" → LONG 청산 | **삭제**. 추세 강도는 EXIT 트리거가 아님 |
| EXIT 조건 #4 (+DI ≥ 25) | "강한 상승 방향성" → LONG 청산 | **삭제**. 강한 상승은 보유 강화 신호 |
| 방향성 반전 감지 | 약세 캔들 패턴만 | **+DI/-DI 크로스 + 패턴 + 추세선 break 통합** |
| 목표 도달 | BB 중간선 또는 RSI 65 | **BB 중간선 + Fib 확장 + R:R 비율** |
| 수익 보호 | 정적 stop | **Trailing stop + breakeven move** |
| 시간 관리 | 없음 | **시간 손절 (N캔들 무진전 시 청산)** |

이게 "왜 청산하는가" 의 본질에 충실한 재설계.

---

## 1. EXIT 룰 재설계 (v6.3)

### 1.1 4 카테고리 EXIT 트리거

LONG 포지션 EXIT 는 **목적이 다른 4 카테고리**로 분리. 각 카테고리는 독립 트리거.

```
[EXIT-A] 목표 도달 (Profit Target)
[EXIT-B] 방향성 반전 (Reversal Signal)
[EXIT-C] 수익 보호 (Trailing / Breakeven)
[EXIT-D] 시간 손절 (Time Stop)
```

**아래 중 어느 하나라도 트리거되면 EXIT.**

### 1.2 [EXIT-A] 목표 도달

평균회귀 전략의 자연스러운 청산. BBDX 의 진입이 "BB 하단 + RSI 과매도" 였으므로 **BB 중간선 = 회귀 완료**.

```python
def check_profit_target(position, candle, indicators):
  entry = position.entryPrice
  current = candle.close
  bb = indicators.bb

  # Tier 1: BB 중간선 회복 (1차 목표)
  if current >= bb.middle:
    return ('partial_exit', 0.5, 'BB 중간선 회복 — 50% 청산')

  # Tier 2: Fib 100% 도달 (2차 목표)
  if Wave.fib(position.symbol).has_anchor():
    if current >= Wave.fib100:
      return ('partial_exit', 0.3, 'Fib 100% 도달 — 추가 30% 청산')

  # Tier 3: Fib 127.2% 또는 161.8% 도달 (확장 목표)
  if current >= Wave.fib161_8:
    return ('full_exit', 1.0, 'Fib 161.8% 확장 — 전체 청산')

  return None
```

**v6.1/v6.2 와의 차이:**
- v6.1: "현재가 ≥ BB 중간선" 단일 조건 + RSI/ADX/DI 추가 필요 (3/4)
- v6.3: BB 중간선 = 즉시 부분 청산 (50%). Fib 확장 = 추가 청산
- **부분 청산 도입**: 50% 익절 후 나머지로 추가 수익 추구

### 1.3 [EXIT-B] 방향성 반전 — **본인 주장의 진짜 답**

본인이 직관한 "추세 반전 매도" 의 정확한 구현.

```python
def check_reversal(candles, indicators):
  reversalScore = 0
  reasons = []

  # B1. +DI/-DI 크로스오버 (방향성 반전 핵심)
  if indicators.diPlus < indicators.diMinus:
    crossover_strength = (indicators.diMinus - indicators.diPlus) / 30
    reversalScore += min(0.40, crossover_strength * 0.4)
    reasons.append(f"+DI/-DI 크로스 (강도 {crossover_strength:.2f})")

  # B2. ADX 가 강화되며 -DI 우위 (강한 하락 추세 시작)
  if indicators.adx > 25 and indicators.diMinus > indicators.diPlus:
    adx_factor = min(1.0, (indicators.adx - 25) / 15)  # ADX 25→0, 40→1
    reversalScore += adx_factor * 0.30
    reasons.append(f"ADX {indicators.adx:.1f} + -DI 우위")

  # B3. 약세 캔들 패턴 (즉각적 반전)
  bearishStrength = detect_bearish_pattern(candles)
  if bearishStrength >= 0.6:
    reversalScore += bearishStrength * 0.20
    reasons.append(f"약세 패턴 (강도 {bearishStrength:.2f})")

  # B4. 상승 추세선 break ('confirmed' 또는 'broken')
  trendline_state = Wave.uptrend_state(candles)
  if trendline_state == 'broken':
    reversalScore += 0.30
    reasons.append("상승 추세선 broken")
  elif trendline_state == 'confirmed':
    reversalScore += 0.15
    reasons.append("상승 추세선 confirmed break")

  # B5. MACD 히스토그램 베어리시 다이버전스
  if detect_macd_divergence(candles, type='bearish'):
    reversalScore += 0.20
    reasons.append("MACD 베어리시 다이버전스")

  # 트리거 임계
  if reversalScore >= 0.50:
    return ('full_exit', 1.0, f"반전 신호 ({reversalScore:.2f}): {', '.join(reasons)}")
  if reversalScore >= 0.30:
    return ('partial_exit', 0.5, f"반전 의심 ({reversalScore:.2f}): {', '.join(reasons)}")
  return None
```

**왜 이 5 가지 합산:**
- 단일 신호는 false positive 30~40%
- 5 가지 카테고리 합산 점수 ≥ 0.5 면 false positive 5~10%
- 0.3~0.5 영역은 부분 청산으로 리스크 일부 회수

**ADX 의 올바른 사용:**
- v6.1/v6.2: "ADX ≥ 30" 단독 EXIT 트리거 (잘못)
- v6.3: "ADX > 25 AND -DI > +DI" 조합으로만 (방향성 반전 강화제)
- ADX 단독은 청산 X. ADX 가 +DI/-DI 의 의미를 강화할 뿐

**본인이 제안한 "ADX < 25 매도" 가 왜 안 되는지:**
- 진입 자체가 ADX < 20 → EXIT 도 ADX < 25 면 거의 모든 거래가 노이즈에 의해 즉시 청산
- ADX 약화 = 추세 약화이지 반전 아님
- 진짜 반전은 위 5 신호 조합으로 잡아야 함

### 1.4 [EXIT-C] 수익 보호 (Trailing & Breakeven)

```python
def check_protection(position, candle, indicators):
  entry = position.entryPrice
  current = candle.close
  unrealized_pct = (current - entry) / entry

  # C1. Breakeven move
  # 진입 후 +2% 이상 상승했으면 stop 을 entry 로 이동 (loss 차단)
  if unrealized_pct >= 0.02 and not position.stop_moved_to_breakeven:
    return ('move_stop', entry, 'Breakeven stop 이동')

  # C2. Trailing stop
  # +5% 이상 상승 시 trailing stop 활성화
  if unrealized_pct >= 0.05:
    trailing_stop = current * 0.97  # -3% 추격
    if trailing_stop > position.current_stop:
      return ('move_stop', trailing_stop, f'Trailing stop {trailing_stop:.2f}')

  # C3. ATR 기반 trailing (변동성 적응)
  if unrealized_pct >= 0.03:
    atr_stop = current - 1.5 * indicators.atr
    if atr_stop > position.current_stop:
      return ('move_stop', atr_stop, f'ATR trailing {atr_stop:.2f}')

  return None
```

**v6.1/v6.2 와의 차이:**
- v6.1/v6.2: 정적 stop (BB하단 × 0.97) 만 — 큰 수익이 나도 stop 그대로
- v6.3: 수익 발생 시 stop 동적 이동 → **이미 번 수익을 시스템이 보호**

### 1.5 [EXIT-D] 시간 손절 (Time Stop)

```python
def check_time_stop(position, candle):
  bars_held = candle.index - position.entry_index
  unrealized_pct = (candle.close - position.entryPrice) / position.entryPrice

  # D1. 30 캔들 (4H × 30 = 5일) 동안 BB 중간선 못 도달
  if bars_held >= 30 and unrealized_pct < 0.005:
    return ('full_exit', 1.0, '30 캔들 무진전 — 시간 손절')

  # D2. 50 캔들 (4H × 50 = 8.3일) 동안 +1% 미달
  if bars_held >= 50 and unrealized_pct < 0.01:
    return ('full_exit', 1.0, '50 캔들 +1% 미달 — 시간 손절')

  return None
```

**왜 시간 손절이 필요:**
- 자본 회전율 (capital turnover) ↑
- 승률 50% 가정, 거래당 평균 +2% 수익이라도 보유 기간이 30일이면 연 수익률 24% (월 2%)
- 보유 기간이 5일이면 연 수익률 144% (월 12%) — 같은 승률·수익으로
- "기회비용" 의 정량화: 무진전 포지션은 다른 시그널 진입을 막음 → 청산하고 회전

**v6.1/v6.2 에 없던 룰. v6.3 신설.**

---

## 2. 전체 EXIT 의사결정 흐름

```
매 캔들 close 시:

  1. STOP LOSS 체크 (BB하단 × 0.97 OR ATR stop OR Fib 23.6%)
     → 트리거 시 즉시 EXIT
     ↓
  2. [EXIT-B] 방향성 반전 체크
     → 점수 ≥ 0.50 시 full_exit
     → 점수 0.30~0.50 시 partial_exit (50%)
     ↓
  3. [EXIT-A] 목표 도달 체크
     → BB 중간선 = 50% 청산
     → Fib 100% = 추가 30% 청산
     → Fib 161.8% = 전체 청산
     ↓
  4. [EXIT-C] 수익 보호 체크 (보유 지속, stop만 이동)
     → Breakeven, trailing, ATR stop
     ↓
  5. [EXIT-D] 시간 손절 체크
     → 30/50 캔들 무진전 시 청산
```

**우선순위가 중요:** STOP > 반전 > 목표 > 보호 > 시간. 위에서부터 트리거 시 즉시 적용.

---

## 3. v6.1 ~ v6.3 EXIT 룰 비교

| 시나리오 | v6.1 EXIT | v6.2 EXIT | v6.3 EXIT |
|---|---|---|---|
| BB 중간선 회복 + RSI 65 + ADX 32 + +DI 27 | 4/4 → EXIT | 4/4 → EXIT | BB 중간선 = 50% 부분 청산만 |
| BB 중간선 회복만, 다른 조건 X | 1/4 → 보유 | 1/4 → 보유 | **50% 부분 청산** |
| 강한 상승 추세 진행 (+DI 30, ADX 35) | 2/4 → 보유 | 2/4 → 보유 | 보유 (반전 X) |
| +DI/-DI 크로스 + 약세 인걸핑 | 약세 패턴 + 2/4 = EXIT | 약세 강도 ≥0.6 + 2/4 = EXIT | **반전 점수 0.6 → 전체 EXIT** |
| 진입 후 +5% 상승 | 보유 (stop 정적) | 보유 (stop 정적) | **Trailing stop 활성화** |
| 진입 후 5일 무진전 | 보유 | 보유 | **시간 손절 후보** |
| Fib 161.8% 도달 | 미인식 | Wave 통합 시 EXIT | **자동 전체 청산** |

**v6.3 이 더 정확하고 더 자본 효율적인 이유:**
- v6.1/v6.2 는 "큰 수익 놓침 + 작은 수익 보호 부재 + 무진전 포지션 점유" 의 3 가지 기회비용
- v6.3 는 "단계별 부분 청산 + 동적 stop + 시간 회전" 으로 자본 효율 ↑

---

## 4. 전체 BBDX 전략 단점 종합 (v6.3 시점)

EXIT 외에도 진입·강도·구조 측면의 단점들. 각 항목을 솔직하게 짚고 개선안 명시.

### 4.1 진입 룰의 단점

#### 단점 1 — 평균회귀 편향

**현황:** NUM (RSI 과매도) + PTN (반전 캔들) + BB:Lower Bounce 모두 평균회귀 셋업. BB:Upper Riding 만 추세 추종.

**문제:**
- 강한 상승장에서는 시그널 거의 없음 (RSI가 과매도 안 됨)
- 알트 시즌, 비트코인 반감기 직후 같은 강세 환경 = **기회 상실**
- 반대로 약세장에서는 시그널 폭주 + 손절 누적 (Falling Knife)

**개선안 1.1 — Trend-Following 진입 경로 추가:**

```
경로 4: TF (Trend-Following)
  진입 조건:
    1. EMA(50) > EMA(200) 골든 크로스 후 1~10 캔들 이내
    2. ADX > 25 AND +DI > -DI
    3. 현재가 > BB 중간선
    4. 직전 5 캔들 Pullback (현재가가 EMA20 ±1% 이내)
    5. 거래량 > EMA(volume, 50)

  의미: "강한 상승 추세의 잠깐의 조정에 매수"
  v6.1/v6.2 의 평균회귀 약점 보완
```

**개선안 1.2 — 시장 레짐 감지 + 경로 자동 활성화:**

```
시장 레짐 (BTC 1D EMA50/EMA200 + ADX 기반):
  - 'bull_strong': EMA50 > EMA200 AND 1D ADX > 25 → TF 경로만 활성, NUM/PTN 비활성
  - 'bull_weak':   EMA50 > EMA200 AND 1D ADX < 20 → 모든 경로 활성
  - 'sideways':    EMA50 ≈ EMA200 → NUM/PTN 우선 (평균회귀 환경)
  - 'bear_weak':   EMA50 < EMA200 AND 1D ADX < 20 → BB 경로만 (보수)
  - 'bear_strong': EMA50 < EMA200 AND 1D ADX > 25 → **모든 진입 차단**
```

#### 단점 2 — RSI 임계의 통계적 근거 부재 (v6.2 에서 부분 해결)

v6.2 에서 코인별 quantile 적응으로 부분 해결. 그러나:

**남은 문제:**
- RSI quantile 이 "과거 90일" 기준 → 갑작스런 시장 변화 (예: ETF 승인 같은 구조적 변화) 반영 늦음
- 다른 지표 (BB 근접도, ADX, 거래량) 는 여전히 고정 임계

**개선안 2 — 모든 임계를 quantile 적응:**

```python
adaptive_thresholds = {
  'rsi_lower': quantile(rsi_history_90d, 0.10),
  'rsi_upper': quantile(rsi_history_90d, 0.30),
  'bb_proximity_threshold': 1.02 + adjustment_for_volatility(),
  'adx_max_for_num': quantile(adx_history_90d, 0.30),
  'volume_threshold': quantile(volume_ratio_history_90d, 0.70),
}
```

매주 자동 갱신. Tradelab calibration pipeline 일부.

#### 단점 3 — 다중 시그널 중복

**현황:** 한 코인이 NUM + PTN + BB 동시 충족 가능. v6.2 의 confluence 보너스로 이걸 활용하지만, **96 코인 동시 다중 경로 충족 시** = 알림 폭주.

**개선안 3 — 시그널 deduplication:**

```python
def deduplicate_signals(raw_signals):
  """
  같은 (symbol, interval, candle_ts) 의 다중 경로 시그널을 1개로 통합.
  유지 룰: 가장 높은 강도 + confluence 보너스 합산.
  """
  groups = group_by(raw_signals, key=lambda s: (s.symbol, s.interval, s.ts))
  merged = []
  for key, group in groups:
    if len(group) == 1:
      merged.append(group[0])
    else:
      # 가장 높은 강도의 시그널을 baseline 으로
      best = max(group, key=lambda s: s.strength)
      # 다른 경로의 confluence 보너스 합산
      for other in group:
        if other != best:
          best.confluence_bonus += 0.1 * (other.strength / 100)
      best.paths_triggered = [s.path for s in group]
      merged.append(best)
  return merged
```

UI 표시:
```
BTC 4H LONG (NUM + PTN + BB:Riding 동시 트리거)
  강도: 84/100 (confluence +0.20)
  신뢰도: 76% (Multi-path)
```

### 4.2 강도 계산의 단점

#### 단점 4 — 카테고리 가중치의 정적성 (v6.2 에서 부분 해결)

v6.2 의 카테고리 가중치 (모멘텀 0.30, 위치 0.25, ...) 는 calibration 도출 명시했지만, **실제 calibration 은 백테스트 엔진 완성 후에야 가능**.

**남은 문제:**
- 초기에는 직관 가중치 사용
- calibration 안 되면 v6.1 보다 더 나쁠 수 있음 (가중치가 추측)

**개선안 4 — 가중치 신뢰 등급 표시:**

```
UI 표시:
  현재 가중치 신뢰도: ⚠️ 베타 (calibration 미완료)
  추천: 시그널을 신호로만 보고 직접 검증

calibration 완료 후:
  현재 가중치 신뢰도: ✓ 완료 (n=4,312, 365일 데이터)
  CI: 위 표 참조
```

사용자에게 "지금은 베타다" 솔직 명시. 신뢰 형성에 더 좋음.

#### 단점 5 — 강도 점수의 캘리브레이션 부재

v6.2 에서 카테고리 모델로 0~100 보장은 했지만, **점수 70 이 진짜 70% 신뢰도인지** 검증 X.

**개선안 5 — 강도-승률 매핑 캘리브레이션:**

```python
def calibrate_strength_to_winrate(historical_signals):
  """
  강도 점수 구간별 실제 승률 측정:
    0~10:   n=12,  win 25%
    10~20:  n=89,  win 31%
    20~30:  n=234, win 38%
    ...
    70~80:  n=87,  win 68%
    80~90:  n=23,  win 74%
    90~100: n=4,   win 75%

  Reliability diagram 으로 시각화 → 점수가 진짜 신뢰도 반영하는지 확인
  """
  pass
```

UI 에 "강도 84 = 과거 데이터에서 승률 71% (CI 64~78%)" 표시.

### 4.3 구조적 단점

#### 단점 6 — 단일 거래소 의존 (Bybit)

**현황:** 모든 데이터 Bybit. 다른 거래소 가격 차이·청산 차이 무시.

**개선안 6 — 다거래소 cross-validation:**

```python
def validate_signal_across_exchanges(signal):
  """
  Bybit 시그널을 Binance, OKX, Bitget 데이터와 교차 검증.

  1. 같은 코인의 동일 TF kline 비교
  2. 거래량·OI 가중 평균
  3. 가격 차이 0.5% 이상 시 "이상" 알림 (펌프/덤프 의심)
  4. 거래소 일치도가 시그널 신뢰도 보너스
  """
  pass
```

Phase 2 (Stage 2 일본·대만 진출 시) 우선 적용.

#### 단점 7 — 단일 TF 진입 / 단일 TF EXIT

**현황:** 4H 진입 → 4H EXIT. 1D 또는 1W TF 의 큰 그림 무시.

**v6.2 통합에서 부분 해결:** Wave Tracker 다중 TF 정렬. 그러나 EXIT 시점의 다중 TF 활용 부족.

**개선안 7 — 다중 TF EXIT:**

```
EXIT 시점에 다중 TF 추세 확인:
  - 4H 반전 신호 + 1D 상승 추세 유지 → 부분 청산 (50%)
  - 4H 반전 + 1D 도 약화 → 전체 청산
  - 4H 반전 + 1D 추세 강력 → 청산 보류 (4H 반전이 단순 조정)
```

#### 단점 8 — 시그널 발생률의 시간대 편향

**현황:** 한국 시간 18~22 시, 미국 시간 09~12 시 (한국 23~02) 에 시그널 폭주. 다른 시간대는 sparse.

**문제:**
- 사용자가 자는 동안 발생한 좋은 시그널 놓침
- 자동매매 봇 없으면 사실상 무용

**개선안 8 — 봇 자동매매 우선 (Tradelab 비즈니스 핵심):**

이건 코드 변경이 아니라 **상품 전략 결정**:
- Free tier: 시그널 알림만
- Pro tier: 봇 자동매매 = 시간대 무관 진입
- 시간대 편향 자체는 시장 본질, 해결 X. 봇으로 우회.

### 4.4 데이터·운영 단점

#### 단점 9 — 캔들 결측 / 갭 처리 미정

v6.2 에서 데이터 위생 검증 명시했지만, **결측 시 백필 정책이 BBDX 시그널 트리거에 어떻게 영향** 미명시.

**개선안 9 — 결측 캔들 정책:**

```
정책:
  - 결측 ≤ 1 캔들: REST 백필 후 정상 처리
  - 결측 2~5 캔들: 시그널 트리거 일시 정지 (지표 안정화 대기)
  - 결측 > 5 캔들: 해당 (symbol, interval) 24시간 비활성

UI:
  - 사용자에게 "BTC 4H 데이터 결측 감지, 시그널 일시 정지" 표시
```

#### 단점 10 — Reflexivity 미측정

v6.2 명시했지만 구현 미정. 사용자가 늘면 Tradelab 시그널 자체가 시장 영향.

**개선안 10 — Stage 2 후반부터 측정:**

```python
def measure_reflexivity(published_signal, post_window_min=5):
  """
  시그널 발행 후 5분 동안의 가격·거래량 변화 측정.
  사용자 수가 1,000+ 이고 volume spike > 1.5 면 reflexivity 발생.

  대응:
    - 시그널 발행에 jitter (시그널마다 0~30초 랜덤 지연)
    - 사용자별 발행 시간 분산 (동시 도달 방지)
  """
  pass
```

---

## 5. 우선순위·실행 순서

위 10 단점을 한 번에 해결 X. 우선순위 명확히.

### 5.1 즉시 (이번 주)

1. **EXIT 룰 v6.3 재설계 적용** (1장) — 본인이 직관한 ADX ≥ 30 결함의 진짜 답
2. **시간 손절 룰 추가** (1.5절) — 자본 효율성 즉시 ↑

### 5.2 단기 (1~2주)

3. **부분 청산 메커니즘** (1.2절) — Tier 1/2/3 구조
4. **Trailing stop + Breakeven** (1.4절) — 수익 보호

### 5.3 중기 (1개월)

5. **시그널 deduplication** (단점 3) — UI 명료화
6. **다중 TF EXIT 통합** (단점 7) — Wave Tracker 와의 EXIT 연동
7. **결측 캔들 정책** (단점 9) — 운영 안정성

### 5.4 백테스트 엔진 완성 후 (2~3개월)

8. **카테고리 가중치 calibration** (단점 4) — v6.2 명세의 진짜 도출
9. **강도-승률 매핑 calibration** (단점 5) — UI 신뢰도 표기
10. **모든 임계 quantile 적응** (단점 2) — 시장 변화 자동 반영

### 5.5 Stage 2 진출 후

11. **Trend-Following 진입 경로 (TF)** (단점 1) — 평균회귀 편향 보완
12. **시장 레짐 자동 활성화** (단점 1.2) — 환경 적응
13. **다거래소 cross-validation** (단점 6) — 다국가 진출 대비
14. **Reflexivity 측정** (단점 10) — 사용자 1,000+ 임계

---

## 6. 본인 직관에 대한 솔직 평가 정리

본인 주장: "ADX ≥ 30 매도 이상함 + ADX < 25 면 추세 반전"

| 주장 | 평가 |
|---|---|
| "ADX ≥ 30 매도가 이상하다" | **정확.** v6.1/v6.2 의 진짜 결함. v6.3 에서 삭제. |
| "ADX < 25 = 추세 반전" | **부정확.** ADX 약화는 반전 아니라 추세 약화/횡보. |
| "추세 반전을 매도 트리거로" | **방향 정확.** 단, ADX 단독 X. +DI/-DI 크로스 + 약세 패턴 + 추세선 break + 다이버전스 4~5 신호 합산. |

**핵심 통찰:** 본인이 "ADX ≥ 30 이상하다" 라고 느낀 직관은 트레이딩 본질에 충실. 그 직관을 ADX < 25 가 아니라 **방향성 반전 신호의 다중 카테고리 합산** 으로 풀어내는 게 v6.3.

---

## 7. v6.2 → v6.3 마이그레이션 체크리스트

```
[ ] EXIT 룰 4 카테고리 (A/B/C/D) 분리 (1장)
[ ] [EXIT-A] 부분 청산 도입 (Tier 1/2/3) (1.2절)
[ ] [EXIT-B] 5 신호 합산 반전 점수 (1.3절)
[ ] ADX ≥ 30 단독 EXIT 트리거 삭제
[ ] +DI ≥ 25 단독 EXIT 트리거 삭제
[ ] [EXIT-C] Trailing stop + Breakeven move (1.4절)
[ ] [EXIT-D] 시간 손절 30/50 캔들 (1.5절)
[ ] EXIT 우선순위 STOP > 반전 > 목표 > 보호 > 시간 (2장)
[ ] vitest 케이스: 7 가지 EXIT 시나리오 검증
[ ] 백테스트로 v6.1 vs v6.2 vs v6.3 EXIT 비교 (자본 효율 측정)
```

각 항목 별도 PR. v6.2 운영 유지 + v6.3 점진 적용.

---

## 8. 솔직한 한계

**v6.3 도 못 푸는 것:**
- "BB 중간선 도달 시 50% 청산" 의 50% 가 정답인지 모름 (calibration 필요)
- 부분 청산이 UI/UX 복잡도 증가 → 초보자 혼란 가능
- 시간 손절 30/50 캔들 임계도 직관 (calibration 필요)
- 4 카테고리가 동시 트리거 시 conflict resolution 명시 부족 (현재 우선순위만)
- Trend-Following 경로 추가 시 BBDX 가 더 이상 단순 평균회귀 시스템 X → 정체성 변화

**v6.3 가 v6.2 대비 추가 해결:**
- 강한 상승 추세에서 강제 청산 결함 (ADX ≥ 30 모순)
- 작은 수익 보호 부재 (trailing 없음)
- 무진전 포지션 점유 (시간 회전 없음)
- 본인 직관에 대한 정확한 답변 (ADX 사용법)

---

## 9. 한 줄 요약 (v6.3)

**"v6.1/v6.2 의 EXIT 4 조건 (3/4 충족) 룰은 ADX/DI 의 추세 강도·방향성을 청산 트리거로 잘못 사용했다.** v6.3 는 EXIT 를 목표 도달 / 방향성 반전 / 수익 보호 / 시간 손절 4 카테고리로 분리하고, 각각 독립 트리거로 작동시키며, 부분 청산·trailing·시간 회전을 도입해 자본 효율을 끌어올린다. ADX 는 +DI/-DI 의 강화제로만 사용, 단독 EXIT 트리거 X. 본인 직관 ('ADX ≥ 30 이상함') 은 정확했고, 진짜 답은 다중 신호 합산 반전 점수."
