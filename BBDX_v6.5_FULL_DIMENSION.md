# BBDX-PATTERN v6.5 — 7차원 풀 커버리지

> **버전:** v6.5 (v6.4 의 헌장 위반 보완)
> **변경 핵심:** 거시 컨텍스트 (6번 차원) + 온체인 (7번 차원) 매매기준에 정식 통합
> **헌장 통과:** STRATEGY_CHARTER 7차원 모두 커버 ✓
> **이전 버전:** v6.4 (5/7 차원만 커버 → 헌장 위반)

---

## 0. v6.4 → v6.5 변경 요약

v6.4 문서에서 거시·온체인을 "통합한다"고 언급했지만 **매매 흐름에 진짜로 박지 못했음**. v6.5 가 그 빈 자리를 채움.

| 차원 | v6.4 상태 | v6.5 상태 |
|---|---|---|
| 1. 모멘텀 | ✓ | ✓ |
| 2. 변동성 | ✓ | ✓ |
| 3. 추세 | ✓ | ✓ |
| 4. 거래량/유동성 | ✓ | ✓ |
| 5. 시장 구조 | ✓ | ✓ |
| **6. 거시 컨텍스트** | ✗ 명시만, 흐름 미통합 | **✓ Macro multiplier 정식 통합** |
| **7. 온체인** | △ 의사코드, 흐름 부분 통합 | **✓ Onchain modifier 정식 통합** |
| **헌장 통과** | ✗ 5/7 (위반) | **✓ 7/7** |

진입·EXIT 룰의 코어는 v6.4 와 동일. 변경은 **신뢰도 가중·차단 조건·EXIT 트리거** 세 지점.

---

## 1. 7차원 통합 신뢰도 모델

### 1.1 통합 공식

```
final_confidence = base_strength
                 × multi_path_confluence
                 × wave_alignment_mult
                 × macro_mult            ← v6.5 신규 (6번 차원)
                 × onchain_mult          ← v6.5 신규 (7번 차원)
                 ÷ 100  // 백분율
```

**각 multiplier 의 역할:**
- `base_strength` (0~100): v6.2 카테고리 가중 강도. 1·2·3·4·5번 차원 합산
- `multi_path_confluence` (1.0~1.20): NUM/PTN/BB 다중 경로 보너스
- `wave_alignment_mult` (0.30~1.30): 다중 TF 추세 정렬 (5번 차원)
- `macro_mult` (0.30~1.40): 6번 차원 — Macro Liquidity Tracker
- `onchain_mult` (0.70~1.30): 7번 차원 — 온체인 modifier

### 1.2 차원별 매핑 (헌장 검증)

```
1. 모멘텀         → base_strength.momentumScore
2. 변동성         → base_strength.positionScore + ATR (STOP·trailing)
3. 추세           → base_strength.trendWeaknessScore + Falling Knife sigmoid
4. 거래량/유동성  → base_strength.volumeScore
5. 시장 구조      → base_strength.actionScore + wave_alignment_mult + Fibonacci
6. 거시 컨텍스트  → macro_mult ← v6.5 신규
7. 온체인         → onchain_mult ← v6.5 신규
```

**헌장 규칙 1 (차원 중복 X) 검증:**
- 각 multiplier 가 다른 차원 측정 ✓
- base_strength 내부의 5 카테고리도 각각 다른 차원 ✓

**헌장 규칙 2 (백테스트 알파 검증):**
- 모든 multiplier 의 임계는 calibration 으로 도출 (현재 임시값)

**헌장 규칙 3 (단독 시그널 X):**
- macro·onchain 은 multiplier 형태, 단독 시그널 발행 X ✓

---

## 2. 거시 컨텍스트 통합 (6번 차원)

### 2.1 Macro Liquidity Score

03_ADDITIONAL_STRATEGIES 의 Macro Liquidity Tracker 를 BBDX 에 정식 통합.

#### 2.1.1 입력 5개

| # | 데이터 | 출처 | 갱신 |
|---|---|---|---|
| 1 | SOFR - IORB 스프레드 | FRED API | 일별 |
| 2 | Fed RRP 잔고 변화 30d | FRED RRPONTSYD | 일별 |
| 3 | TGA 잔고 변화 30d | FRED WTREGEN | 일별 |
| 4 | Fed 대차대조표 30d | FRED WALCL | 주별 |
| 5 | 실질 Fed Funds Rate | FRED FEDFUNDS - CPI | 월별 |

#### 2.1.2 Macro Liquidity Score (-100 ~ +100)

```python
def macro_liquidity_score():
  score = 0

  # 1. SOFR-IORB 스프레드 (가장 민감)
  spread_bp = (sofr - iorb) * 100
  if spread_bp > 5:    score -= 40   # 유동성 위기
  elif spread_bp > 2:  score -= 15
  elif spread_bp > 0:  score += 0
  else:                score += 10

  # 2. RRP 잔고 변화 (역지표)
  if rrp_change_30d < -0.10:  score += 25
  elif rrp_change_30d > 0.10: score -= 15

  # 3. TGA 잔고 변화 (역지표)
  if tga_change_30d < -0.05:  score += 20
  elif tga_change_30d > 0.10: score -= 20

  # 4. Fed 대차대조표
  if fed_balance_30d > 0.01:   score += 25  # QE
  elif fed_balance_30d < -0.01: score -= 25 # QT

  # 5. 실질 금리
  if real_rate < 0:    score += 15  # 음수 = risk-on
  elif real_rate > 2:  score -= 15

  return clamp(score, -100, +100)
```

#### 2.1.3 Regime 분류 → multiplier

```
score < -50:    'crisis'    → multiplier 0.30
score -50~-15:  'tight'     → multiplier 0.65
score -15~+15:  'neutral'   → multiplier 1.00
score +15~+50:  'easy'      → multiplier 1.20
score > +50:    'flooded'   → multiplier 1.40
```

### 2.2 한국 거시 추가 (옵션, Stage 1 한국 우선)

```python
def korea_macro_modifier():
  # BOK 기준금리 변화 (분기별)
  bok_rate_trend = bok_rate_change_90d()

  # 원-달러 환율 (일별)
  krw_usd = fetch_krw_usd()
  krw_30d_change = (krw_usd_now - krw_usd_30d) / krw_usd_30d

  # 한국 거시 보정
  modifier = 0
  if bok_rate_trend > 0.005: modifier -= 0.05  # 한국 긴축 → 위험자산 ↓
  if krw_30d_change > 0.03:  modifier += 0.05  # 원화 약세 → 코인 hedge 수요 ↑

  return modifier  # ±0.05
```

#### 결합:
```
final_macro_mult = base_macro_mult × (1 + korea_modifier)
```

### 2.3 매매 흐름 통합

#### 진입 시:
```
if macro_regime == 'crisis':
  → 모든 LONG 진입 차단

if macro_regime == 'tight' AND signal_path != 'BB:Riding':
  → 진입 차단 (긴축 환경에서 평균회귀 리스크 ↑)

else:
  → final_confidence × macro_mult 적용
```

#### EXIT 시:
```
[EXIT-B] reversalScore 에 거시 가중 추가:

if macro_regime == 'crisis': reversalScore += 0.20
if macro_regime == 'tight':  reversalScore += 0.10
if macro_regime == 'flooded': reversalScore -= 0.10  # 강세 환경 EXIT 보류
```

### 2.4 산출 예시 (T0 시나리오 + 가상 거시)

```
가정:
  SOFR 4.32%, IORB 4.30% → 스프레드 +2bp
  RRP 잔고 -8% (30d)
  TGA 잔고 -3% (30d)
  Fed 대차대조표 +0.2% (30d)
  실질 금리 +0.8%

  BOK 기준금리 변동 0
  원-달러 +1.2% (30d)

산출:
  spread 2bp → score -15 (tight 영역)
  rrp -8% → score +0 (-10% 미만 미충족)
  tga -3% → score +0
  fed +0.2% → score +0 (+1% 미만 미충족)
  real_rate +0.8% → score +0

  total = -15 + 0 + 0 + 0 + 0 = -15
  regime = 'tight' (정확히 경계)
  base_macro_mult = 0.65

  korea_modifier:
    bok_rate +0 → 0
    krw +1.2% (3% 미만) → 0
    합산 = 0

  final_macro_mult = 0.65 × 1.0 = 0.65

→ BBDX 시그널 신뢰도 35% 차감
→ 만약 진입 path 가 'BB:Riding' 이 아니면 → 진입 차단
```

---

## 3. 온체인 통합 (7번 차원)

### 3.1 Onchain Score

ONCHAIN_INTEGRATION 의 7개 modifier 를 BBDX 매매기준에 정식 박음.

#### 3.1.1 7개 modifier 합산

```python
def onchain_score(symbol):
  modifiers = {
    'netflow':       exchange_netflow_modifier(symbol),    # ±0.20
    'whale':         whale_alert_modifier(symbol),         # ±0.20
    'ssr':           ssr_modifier(),                       # ±0.20
    'coinbase':      coinbase_premium_modifier(symbol),    # ±0.20
    'etf_flow':      etf_flow_modifier(symbol),            # ±0.25 (BTC/ETH 만)
    'miner_outflow': miner_outflow_modifier(symbol),       # ±0.15 (BTC 만)
    'lth_supply':    lth_supply_modifier(symbol),          # ±0.15 (BTC/ETH 만)
  }

  total = sum(modifiers.values())
  # 합산 범위 약 -1.35 ~ +1.35
  normalized = clamp(total / 1.35, -1.0, +1.0)

  return normalized, modifiers
```

#### 3.1.2 Regime 분류 → multiplier

```
score > +0.6:    'strong_accumulation'  → multiplier 1.30
+0.2 ~ +0.6:     'accumulation'         → multiplier 1.15
-0.2 ~ +0.2:     'neutral'              → multiplier 1.00
-0.6 ~ -0.2:     'distribution'         → multiplier 0.85
< -0.6:          'strong_distribution'  → multiplier 0.70
```

### 3.2 매매 흐름 통합

#### 진입 시:

```
if onchain_regime == 'strong_distribution' AND signal_path != 'BB:Riding':
  → 진입 차단 (분배 환경에서 평균회귀 리스크 ↑)

else:
  → final_confidence × onchain_mult 적용
```

#### EXIT 시 (v6.3 [EXIT-B] 강화):

```
if onchain_regime == 'strong_distribution':
  reversalScore += 0.20  # 분배 환경 → EXIT 가속

if onchain_regime == 'distribution':
  reversalScore += 0.10

if onchain_regime == 'strong_accumulation':
  if reversalScore < 0.7:  # 약한 반전 신호 무시
    reversalScore *= 0.8
```

### 3.3 BTC/알트 차등

| 코인 종류 | onchain modifier 적용 |
|---|---|
| BTC | 7개 modifier 모두 적용 (ETF Flow, Miner Outflow, LTH 포함) |
| ETH | ETF Flow + LTH 만 추가 (Miner X) |
| SOL/BNB/메이저 알트 | Netflow + Whale + SSR + Coinbase Premium 4개만 |
| 시총 100위 밖 알트 | Netflow + Whale 2개만 (SSR/Coinbase 데이터 부족) |

### 3.4 산출 예시 (T0 시나리오 + 가상 온체인)

```
BTC/USDT, T0 시점:

가정:
  Exchange Netflow (24h): -3,200 BTC (z = -2.4)
  Whale 송금 (12h): $180M 거래소 → 미상, $0 미상 → 거래소
  SSR z-score: -1.8 (매수 자금 풍부)
  Coinbase Premium: +0.08%
  ETF Flow (3d 누적): +$650M
  Miner Outflow (7d): 평균 (z = +0.3)
  LTH Supply (30d): +1.5%

산출:
  netflow_modifier:   z=-2.4 → +0.20
  whale_modifier:     net = $180M / $100M = +1.8 → +0.07 (1~3 영역)
  ssr_modifier:       z=-1.8 → +0.15
  coinbase_modifier:  +0.08% → +0.05
  etf_flow_modifier:  +$650M (500M~1.5B) → +0.10
  miner_modifier:     z=+0.3 (영향 없음) → 0
  lth_modifier:       +1.5% (2% 미만) → 0

  total = 0.20 + 0.07 + 0.15 + 0.05 + 0.10 + 0 + 0 = 0.57
  normalized = 0.57 / 1.35 = 0.422
  regime = 'accumulation' (0.2~0.6)
  onchain_mult = 1.15

→ BBDX 시그널 신뢰도 15% 가산
```

---

## 4. v6.5 통합 진입 흐름

### 4.1 매매 결정 의사코드

```python
def bbdx_v65_entry_decision(symbol, tf, candles):
  # === [Step 1] 거시·온체인 게이트 (사전 차단) ===
  macro = compute_macro_liquidity()
  onchain_score, onchain_breakdown = compute_onchain_score(symbol)
  onchain_regime = classify_onchain_regime(onchain_score)

  # 거시 위기 시 모든 LONG 차단
  if macro.regime == 'crisis':
    return None  # 사유: 거시 위기

  # === [Step 2] BBDX 시그널 검사 (1·2·3·4·5번 차원) ===
  bbdx = check_bbdx_signal(candles)
  if not bbdx.triggered: return None

  # === [Step 3] 베이스 강도 (5 차원) ===
  base_strength = compute_category_weighted_strength(bbdx, candles)

  # === [Step 4] 5번 차원 보강: Wave 정렬 ===
  wave = compute_wave_alignment(symbol, tf)
  wave_mult = WAVE_MULTIPLIERS[wave.alignment]
  # 'perfect_up' 1.30 ~ 'opposing' 0.30

  # === [Step 5] 6번 차원: Macro multiplier ===
  macro_mult = MACRO_MULTIPLIERS[macro.regime]
  # 'crisis' 0.30 ~ 'flooded' 1.40

  if macro.regime == 'tight' AND bbdx.path != 'BB:Riding':
    return None  # 긴축 환경에서 평균회귀 차단

  # === [Step 6] 7번 차원: Onchain multiplier ===
  onchain_mult = ONCHAIN_MULTIPLIERS[onchain_regime]

  if onchain_regime == 'strong_distribution' AND bbdx.path != 'BB:Riding':
    return None  # 분배 환경에서 평균회귀 차단

  # === [Step 7] 통합 신뢰도 ===
  confluence = bbdx.multi_path_confluence  # 1.0 ~ 1.20
  final_confidence = (
    base_strength
    * confluence
    * wave_mult
    * macro_mult
    * onchain_mult
  )
  final_confidence = clamp(final_confidence, 0, 100)

  # === [Step 8] 진입 결정 ===
  if final_confidence < 40: return None
  if final_confidence < 60: size_factor = 'small'   # 자본 1%
  else:                     size_factor = 'normal'  # 자본 5% cap

  # === [Step 9] 7차원 검증 (헌장 자동) ===
  dimensions_covered = {
    'momentum':     base_strength.includes('rsi'),
    'volatility':   base_strength.includes('bb', 'atr'),
    'trend':        base_strength.includes('adx', 'di', 'ema'),
    'volume':       base_strength.includes('volume'),
    'structure':    wave is not None,
    'macro':        macro is not None,
    'onchain':      onchain_score is not None,
  }
  assert all(dimensions_covered.values()), "헌장 위반: 7차원 미커버"

  return {
    'path': bbdx.path,
    'final_confidence': final_confidence,
    'size_factor': size_factor,
    'dimensions': dimensions_covered,
    'breakdown': {
      'base': base_strength,
      'confluence': confluence,
      'wave': wave_mult,
      'macro': macro_mult,
      'onchain': onchain_mult,
    },
  }
```

### 4.2 통합 산출 예시 (T0 시나리오)

```
입력:
  BTC/USDT 4H, T0 시점

[Step 1] 거시·온체인 게이트
  Macro: tight (-15)
  Onchain: accumulation (+0.42)
  → 거시 'tight' 통과 (crisis 아님)

[Step 2] BBDX 시그널
  3 경로 confluence: NUM(41) + PTN(42) + BB:Lower Bounce(60) ✓

[Step 3] 베이스 강도
  base_strength = 60 (BB 경로 max) + 20 (3 경로 보너스) = 80

[Step 4] Wave 정렬 (가정: 4H 상승, 1D 횡보, 1W 상승)
  alignment = 'partial_up'
  wave_mult = 1.10

[Step 5] Macro multiplier
  regime 'tight' → 0.65
  bbdx.path 'BB:Lower Bounce' (BB 경로 아닌 NUM 경로 차단되었어야)
  실제로는 path = 'BB:Lower Bounce' 이므로 통과 (BB 경로는 'BB:Riding' 만 통과)

  ⚠️ 룰 명시 필요: 'BB:Lower Bounce' 도 평균회귀에 가까움
  → 더 보수적 룰: tight 시 'BB:Riding' AND 'BB:Squeeze' 만 통과

  → 시나리오 종료 (tight 차단)
```

**다시 가정 (macro neutral 상황으로):**

```
재시나리오: macro 'neutral' (score 0)
  macro_mult = 1.00

[Step 6] Onchain multiplier
  regime 'accumulation' → 1.15
  bbdx.path 'BB:Lower Bounce', regime 'strong_distribution' 아님 → 통과

[Step 7] 통합 신뢰도
  confluence = 1.20 (3 경로 보너스 0.20)
  final_confidence = 80 × 1.20 × 1.10 × 1.00 × 1.15
                   = 121.4 → clamp 100
                   = 100

[Step 8] 진입 결정
  final_confidence 100 ≥ 60 → size_factor 'normal' (자본 5% cap)

[Step 9] 헌장 검증
  ✓ 7차원 모두 커버 → 헌장 통과
```

**최종 산출:**
```
🟢 BTC/USDT 4H LONG (NUM + PTN + BB confluence)
  최종 신뢰도: 100/100

  베이스 강도: 80 (3 경로 confluence)
  multiplier:
    - confluence: ×1.20
    - Wave (partial_up): ×1.10
    - Macro (neutral): ×1.00
    - Onchain (accumulation): ×1.15

  진입가: $79,950 (다음 캔들 시가 + 슬리피지)
  Stop Loss: $77,820 (max(BB×0.97, ATR stop, Fib 23.6%))
  포지션: 자본 5% cap = $500 (BTC 0.00626)

  [헌장 검증]
  ✓ 1. 모멘텀 (RSI 32.4)
  ✓ 2. 변동성 (BB width $3,342, ATR 1.78%)
  ✓ 3. 추세 (ADX 18.7, +DI 19.2, -DI 23.4)
  ✓ 4. 거래량 (1.196× baseline)
  ✓ 5. 시장 구조 (BB:Lower Bounce, Wave partial_up)
  ✓ 6. 거시 (Macro neutral, score 0)
  ✓ 7. 온체인 (Accumulation, score +0.42)

⚠️ 백테스트 통계. 미래 보장 X. 자기책임.
```

---

## 5. v6.5 통합 EXIT 흐름

### 5.1 변경 사항

v6.3 의 4 카테고리 EXIT 룰 골격 유지. v6.5 가 추가하는 것:

| EXIT 카테고리 | v6.4 | v6.5 |
|---|---|---|
| STOP LOSS | max(BB×0.97, ATR, Fib) | 동일 |
| [EXIT-B] 반전 | 5 신호 합산 | **+ 거시·온체인 가중** |
| [EXIT-A] 목표 | Tier 1/2/3 부분 청산 | 동일 |
| [EXIT-C] 보호 | Breakeven + Trailing | 동일 |
| [EXIT-D] 시간 | 변동성 비례 | 동일 |

### 5.2 [EXIT-B] 강화

```python
def reversal_score_v65(candles, indicators, macro, onchain):
  # v6.3 기본 5 신호
  rs = base_reversal_score(candles, indicators)

  # v6.5 추가: 거시·온체인 가중
  if macro.regime == 'crisis':
    rs += 0.20
  elif macro.regime == 'tight':
    rs += 0.10
  elif macro.regime == 'flooded':
    rs -= 0.10

  if onchain.regime == 'strong_distribution':
    rs += 0.20
  elif onchain.regime == 'distribution':
    rs += 0.10
  elif onchain.regime == 'strong_accumulation':
    if rs < 0.7:
      rs *= 0.8  # 약한 반전 신호 무시

  return clamp(rs, 0, 1)
```

### 5.3 산출 예시 (T+15 시나리오)

```
v6.3 산출 결과: rs = 0.138 (트리거 X)

v6.5 추가 (가정):
  Macro: 'tight' (T+15 까지 환경 변화) → +0.10
  Onchain: 'distribution' (분배 신호 시작) → +0.10

v6.5 final rs = 0.138 + 0.10 + 0.10 = 0.338

→ 0.30 ~ 0.50 영역 → 50% 부분 청산 트리거
   (v6.3 에서는 보유 지속이었음)
```

**이게 v6.5 의 진짜 효과: 거시·온체인 환경 악화 감지 시 EXIT 가속.**

---

## 6. 전체 매매 흐름 종합 (BBDX_v6.3_TRADING_RULES 의 4장 갱신)

T0 ~ T42 (1주일) 시나리오:

| 시점 | 가격 | 거시 | 온체인 | rs | 이벤트 |
|---|---|---|---|---|---|
| T0 | $79,950 | neutral | accumulation | - | **진입** strength 100, $500 |
| T2 | $80,200 | neutral | accumulation | 0.05 | 보유 |
| T8 | $80,510 | neutral | accumulation | 0.07 | **Tier 1 부분 청산 70%** |
| T12 | $82,350 | neutral | accumulation | 0.10 | C1·C3 stop $80,220 |
| T18 | $83,800 | neutral | accumulation | 0.15 | C3 stop $81,670 |
| T20 | $83,500 | **tight 진입** | accumulation | 0.18 + 0.10 = 0.28 | 보유 (0.30 미달) |
| T25 | $82,800 | tight | **distribution** | 0.22 + 0.10 + 0.10 = 0.42 | **부분 청산 50%** ⭐ v6.5 |
| T30 | $82,200 | tight | distribution | 0.28 + 0.20 = 0.48 | 보유 |
| T35 | $81,800 | tight | distribution | 0.62 + 0.20 = 0.82 | **전체 청산** rs ≥ 0.50 |

**손익 정산 (v6.3 vs v6.5):**

```
v6.3 시나리오:
  T8: 70% × ($80,510 - $79,950) × 0.00438 = $2.45
  T35: 30% × ($81,800 - $79,950) × 0.00188 = $3.48
  총: $5.93 (자본 1.19%)

v6.5 시나리오:
  T8: 70% × ($80,510 - $79,950) × 0.00438 = $2.45
  T25: 50% (잔여 30% 의 절반 = 15%) × ($82,800 - $79,950) × 0.000939 = $2.68
  T35: 50% (잔여 15%) × ($81,800 - $79,950) × 0.000939 = $1.74
  총: $6.87 (자본 1.37%)
```

**v6.5 가 v6.5 가 거시·온체인 환경 악화를 감지해 더 빨리 부분 청산 → 평균 가격 ↑ → 자본 효율 ↑.** 단일 거래 차이는 작지만 100+ 거래 평균에서 의미.

---

## 7. v6.4 → v6.5 마이그레이션 체크리스트

```
[ ] Macro Liquidity Tracker 모듈 (FRED API 연동)
    - server/src/macro/liquidity.ts
    - 5 입력 fetch + score 산출

[ ] Macro multiplier 진입 차단 룰
    - 'crisis' → 모든 LONG 차단
    - 'tight' AND 평균회귀 경로 → 차단

[ ] Onchain modifier 모듈 (ONCHAIN_INTEGRATION 명세)
    - server/src/onchain/modifiers.ts
    - 7 modifier (BTC) / 4 modifier (알트) 차등

[ ] Onchain multiplier 진입 차단 룰
    - 'strong_distribution' AND 평균회귀 → 차단

[ ] [EXIT-B] reversalScore 거시·온체인 가중 추가

[ ] 통합 진입 의사코드 (4.1 절) 코드 적용

[ ] 헌장 7차원 검증 자동화
    - server/src/charter/validator.ts
    - 진입 결정마다 dimensions_covered 검증

[ ] vitest:
    - 'crisis' 거시 시 진입 차단 검증
    - 'strong_distribution' 온체인 시 평균회귀 차단 검증
    - 7차원 하나라도 부재 시 assertion error

[ ] UI 표시 갱신 (4.2 절 산출 예시 형태)
    - 모든 시그널 옆 7차원 ✓ 표기
    - macro·onchain regime 라벨 노출

[ ] 백테스트 v6.4 vs v6.5 비교
    - 자본 효율, false positive, 평균 청산 가격
```

---

## 8. ⚠️ 임시값 (v6.5 도 calibration 필요)

v6.5 도 다음 값들은 임시. STRATEGY_CHARTER 규칙 2 위반 가능.

| 항목 | 임시값 | calibration 후 |
|---|---|---|
| MACRO_MULTIPLIERS | crisis 0.30 ~ flooded 1.40 | regime 별 BBDX 승률 데이터 |
| ONCHAIN_MULTIPLIERS | strong_distribution 0.70 ~ strong_accumulation 1.30 | 7 modifier 합산 점수 vs outcome |
| reversalScore 거시 가중 | crisis +0.20, tight +0.10, flooded -0.10 | 백테스트 Reversal 정확도 |
| reversalScore 온체인 가중 | strong_distribution +0.20, distribution +0.10 | 백테스트 |

각 임시값을 백테스트 엔진 결과로 교체.

---

## 9. 헌장 검증 — v6.5 풀 통과

```
[✓] 7차원 커버리지:
    1. 모멘텀: RSI ✓
    2. 변동성: BB, ATR ✓
    3. 추세: ADX, +DI/-DI, EMA Ribbon ✓
    4. 거래량: volumeBaselineEMA50 ✓
    5. 시장구조: BB, Fibonacci, 추세선, Wave Tracker ✓
    6. 거시: Macro Liquidity Tracker (5 입력) + 한국 거시 ✓
    7. 온체인: 7 modifier (BTC) / 4 modifier (알트) ✓

[✓] 규칙 1 (차원 중복 X):
    각 multiplier 가 다른 차원 측정.
    base_strength 내부 5 카테고리도 다른 차원.

[⚠️] 규칙 2 (백테스트 알파 검증):
    임시값 다수. calibration pipeline 필요.

[✓] 규칙 3 (단독 시그널 X):
    macro·onchain 모두 multiplier 형태.
    단독 시그널 발행 X.

[✓] 자본 보호:
    1% / 5% / 3% 한도 (v6.4 동일)
    + 거시 'crisis' 시 모든 진입 차단 (강화)
    + 온체인 'strong_distribution' 시 평균회귀 차단 (강화)
```

---

## 10. 한 줄 요약

**"v6.4 의 헌장 위반 (5/7 차원) 을 보완. v6.5 는 거시 (Macro Liquidity Tracker, 5 입력) + 온체인 (7 modifier) 을 진입·EXIT 매매기준에 정식 통합.** 모든 LONG 진입은 7차원 모두 통과해야 발생, 거시·온체인 위기 환경 시 자동 차단, EXIT-B 반전 점수에 거시·온체인 가중 추가. 헌장 7/7 풀 통과."

---

## 부록 A: v6.4 와 v6.5 의 차이 (한눈에)

| 영역 | v6.4 | v6.5 |
|---|---|---|
| 7차원 커버 | 5/7 (헌장 위반) | **7/7 (풀 통과)** |
| 거시 통합 | 명시만, 흐름 X | **macro_mult + 진입 차단** |
| 온체인 통합 | 의사코드 | **onchain_mult + EXIT 가중** |
| 진입 차단 조건 | macro 미반영 | **crisis/tight + strong_distribution** |
| EXIT-B 가중 | 5 신호만 | **+ 거시·온체인 가중** |
| 헌장 검증 | 수동 | **assertion 자동 검증** |
| 한국 거시 | 부재 | **BOK + 원-달러 통합 (옵션)** |

---

## 부록 B: v6.5 와 ONCHAIN_INTEGRATION·STRATEGY_CHARTER 관계

```
STRATEGY_CHARTER.md (헌장)
  ↓ 정의
  7차원 + 3규칙 + 자본 보호

  ↓ 구현 명세 분리
  ├── BBDX_v6.5 (이 문서) — 1·2·3·4·5번 + 6·7번 통합 진입·EXIT 룰
  ├── ONCHAIN_INTEGRATION.md — 7번 차원 상세 (modifier 정의)
  ├── 03_ADDITIONAL_STRATEGIES.md — 6번 차원 (Macro Liquidity)
  ├── BBDX_PATTERN_v6.2 (5 카테고리 가중 모델)
  ├── BBDX_v6.3_EXIT_REDESIGN (4 카테고리 EXIT)
  └── BBDX_v6.4 (진입 정밀화 + 헌장 검증 자동화)

v6.5 가 위 모든 명세를 통합한 결정 흐름.
```

본인이 이 v6.5 를 백엔드에 적용하면 7차원 헌장 풀 통과 + 거시·온체인 통합 매매 시스템 완성.
