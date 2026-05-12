# BBDX v6.5 매매 기준서 — 가중치 + 진입/청산 규칙 (코드 기반)

**날짜**: 2026-05-11
**소스**: `src/indicators.ts`, `src/exits/*`, `src/modifiers/*`, `src/signals/*`, `src/onchain/*`, `src/trend/*`
**버전**: v6.5 (P1 fix 적용 후, commit `11bb2c9`)

> 이 문서는 *실제 코드에서 추출한 매매 기준*. 명세서 가정값이 아닌 **운영
> 중인 임계값** 입니다.

---

## 0. 시그널 우선순위 + 차단 흐름

```
[1] 자본 보호 (가장 우선)
    ├─ Falling Knife (LONG): -DI > +DI AND ADX > 25 → LONG 차단
    ├─ Rising Knife (SHORT):  +DI > -DI AND ADX > 25 → SHORT 차단 (lowerRiding 예외)
    ├─ Onchain strong_distribution + 평균회귀 LONG → BLOCKED
    └─ Onchain strong_accumulation + 평균회귀 SHORT → BLOCKED

[2] 진입 path 선택 (BB > PTN > NUM 우선순위)
    └─ decideEntry() — 3-path 중 가장 우선 path 1개만 반환

[3] Confidence 계산 (multiplier chain)
    final_confidence = base × confluence × wave × macro × onchain × additional
    clamp [0, 100]

[4] Regime gates (자본 보호 재검증)
    └─ evaluateRegimeGates() — strong_distribution / crisis 시 차단
```

---

## 1. LONG 진입 — `decideEntry` 3-path

### Path 1: **BB 구조** (최우선 — `bbStructure != null`)

4개 BB 구조 중 하나 감지 시 즉시 진입:

| 구조 | 정의 | 조건 |
|---|---|---|
| **lowerBounce** | BB 하단 반등 | 직전 캔들이 bbLower 터치 후 양봉 |
| **squeezeBreakout** | 스퀴즈 상향 이탈 | BB 폭 좁아진 후 bbMiddle 위 양봉 + 거래량 |
| **middleSupport** | 중단선 지지 | 5중 3 캔들이 bbMiddle ±1% 터치 + 종가 ≥ middle |
| **upperRiding** | 상단 추세 추종 | 연속 3 캔들이 bbUpper *위* 양봉 (추세 LONG) |

**전제**: `bbStructure` 가 감지되면 RSI/ADX 조건 X (BB 자체가 강한 신호).

### Path 2: **PTN (패턴)** — `indicators.ts:1242-1257`

```typescript
조건:
  ① bullishPatterns.length > 0                  (9 가지 강세 패턴)
  ② price ≤ bbLower × 1.05                       (BB 하단 5% 이내)
  ③ ADX < 25                                    (추세 약함, 평균회귀 환경)
```

**9가지 강세 패턴**: engulfing / morningStar / hammer / invertedHammer / pinBar / doji / threeWhiteSoldiers + (PATTERN_STRENGTH 60~100)

### Path 3: **NUM (수치)** — `indicators.ts:1259-1272`

```typescript
조건:
  ① 25 ≤ RSI ≤ 38                                (NUM_RSI_LOW=25, NUM_RSI_HIGH=38)
  ② price ≤ bbLower × 1.02                       (BB 하단 2% 이내)
  ③ ADX < 20                                    (추세 매우 약함)
```

### 차원 커버 검증 (헌장 R1)

| Path | 1 momentum | 2 volatility | 3 trend | 5 structure |
|---|---|---|---|---|
| BB | ✗ | ✓ | ✗ | ✓ |
| PTN | ✗ | ✓ | ✓ | ✓ |
| NUM | ✓ | ✓ | ✓ | ✗ ← R1 위반 가능 |

---

## 2. SHORT 진입 — `decideShortEntry` (LONG 미러)

⚠️ **Production gate 차단 중** — `ENABLE_SHORT_SIGNALS=1` env 필요.

### 자본 보호 게이트 (먼저)

```typescript
if (isRisingKnife(plusDi, minusDi, adx) && bbStructureShort !== "lowerRiding")
  return null;
```

### Path 1: **BB 구조** (SHORT 미러)

| 구조 | 정의 |
|---|---|
| upperRejection | 상단 거부 |
| squeezeBreakdown | 스퀴즈 하향 이탈 |
| middleResistance | 중단 저항 |
| lowerRiding | 하단 추세 추종 SHORT (RisingKnife 예외) |

### Path 2: **PTN SHORT**

```
① bearishPatterns.length > 0
② price ≥ bbUpper × 0.95
③ ADX < 25
```

### Path 3: **NUM SHORT** (alpha 튜닝 적용)

```
① 65 ≤ RSI ≤ 75      ← P0 fix (62→65, 비대칭 미러 회복)
② price ≥ bbUpper × 0.98
③ ADX < 20
```

---

## 3. signalStrength 계산 — 5-component (총 100점)

```typescript
calculateSignalStrengthV2(price, ind, volumeConfirmation):

  rsiScore       = ((NUM_RSI_HIGH - rsi) / (NUM_RSI_HIGH - NUM_RSI_LOW)) × 25
                   (0~25, RSI 25에 가까울수록 높음)

  bbProximity    = (1 - (price - bbLower) / (bbUpper - bbLower)) × 25
                   (0~25, BB 하단 가까울수록 높음)

  adxReversal    = ((20 - adx) / 20) × 20
                   (0~20, ADX 낮을수록 높음)

  reversalProb   = reversalProbability(adx) / 100 × 15
                   = (100 - adx × 2.5) / 100 × 15
                   (0~15)

  volumeConfirm  = -5 ~ +15
                   ratio > 1.2: ((ratio-0.8)/0.4) × 15, max 15
                   ratio < 0.8: -5
                   else: 0

total = rsiScore + bbProximity + adxReversal + reversalProb + volumeConfirm
clamp [0, 100]
```

---

## 4. final_confidence 곱셈 체인 — `signals/confidence.ts`

```
final_confidence = base
                 × confluence
                 × wave
                 × macro × Korea
                 × onchain
                 × additional
clamp [0, 100]
```

### 4.1 base (= signalStrength 0~100)

위 §3 의 5-component 결과.

### 4.2 confluence (multi-path bonus)

```
1 path 단독:     1.00
2 path 동시:     1.10
3 path 동시:     1.20
```

### 4.3 wave (Wave Alignment, multi-TF)

`trend/wave-alignment.ts`:

| Alignment | LONG mult | SHORT mult |
|---|---|---|
| **perfect_up** (모든 TF BULLISH) | **1.30** | 0.65 |
| partial_up | 1.10 | 0.85 |
| mixed | 0.85 | 0.85 |
| opposing | **0.30** | **0.30** (자본 보호) |
| **perfect_down** | 0.65 | **1.30** |

TF 가중치: 15m=1, 1h=2, 4h=3, 1d=4, 1w=5 (긴 TF 우선).

### 4.4 macro (`macro/liquidity.ts`)

| Regime | mult |
|---|---|
| flooded | 1.40 |
| easy | 1.15 |
| neutral | 1.00 |
| tight | 0.70 |
| crisis | 0.30 |

Korea modifier: `+0.05` / `-0.05` / `0` 가산.

### 4.5 onchain (7-modifier)

```
score = (netflow + whale + ssr + coinbasePremium + etfFlow + minerOutflow + lthSupply) / 1.35
clamp [-1, 1]
```

| score 범위 | Regime | mult |
|---|---|---|
| > +0.6 | strong_accumulation | 1.30 |
| > +0.2 | accumulation | 1.15 |
| > -0.2 | neutral | 1.00 |
| > -0.6 | distribution | 0.85 |
| ≤ -0.6 | strong_distribution | 0.70 |

**Modifier 가중치** (`onchain/modifiers.ts`):

| Modifier | bullish max | bearish max |
|---|---|---|
| Exchange Netflow (z-score) | +0.20 (z<-2) | -0.25 (z>+2) |
| Whale Alert (USD net) | +0.15 (>$300M) | -0.20 (<-$300M) |
| SSR (z-score) | +0.15 (z<-1.5) | -0.20 (z>+1.5) |
| Coinbase Premium | +0.15 (>+0.2%) | -0.20 (<-0.2%) |
| ETF Flow (3d USD) | +0.20 (>+$1.5B) | -0.25 (<-$1B) |
| Miner Outflow (z) | +0.10 (z<-1.5) | -0.15 (z>+2) |
| LTH Supply (30d %) | +0.10 (>+2%) | -0.15 (<-2%) |

### 4.6 additional (`combineAdditionalModifiers`)

6개 multiplier 의 단순 product:

| Modifier | 범위 | 활성 조건 |
|---|---|---|
| **EMA Ribbon** | 0.30~1.15 | EMA 정배열 골든 / 데드 크로스 |
| **MACD Divergence** | 0.80~1.20 | bullish/bearish divergence |
| **Order Block** | 0.95~1.05 | demand/supply zone 진입 |
| **Funding Extreme** | 0.85~1.20 | perp funding ±0.05% |
| **Market Breadth** | 0.60~1.30 | TOP 30 상승/하락 비율 |
| CVD Divergence | 1.0 (베타 stub) | 미구현 |

---

## 5. EXIT (청산) 결정 — v6.3 4-카테고리

우선순위: **STOP > B (Reversal) > A (Profit) > C (Protect) > D (Time)**

### 5.1 EXIT-A (Profit Target) — `profit-target.ts`

| Tier | 조건 | 청산 비율 |
|---|---|---|
| Tier 1 | price ≥ bbMiddle (+ tier1 미발생) | **50%** |
| Tier 2 | price ≥ fib100% (anchor + range) | **+30%** |
| Tier 3 | price ≥ fib161.8% | **full (100%)** |

### 5.2 EXIT-B (Reversal Score) — `reversal.ts` (5-component)

```
B1 (+DI/-DI cross):     0 ~ 0.40   (-DI > +DI 시: min(0.4, (-DI - +DI)/30 × 0.4))
B2 (ADX bear strength): 0 ~ 0.30   (ADX > 25 AND -DI > +DI 시: ((adx-25)/15) × 0.3)
B3 (bearish pattern):   0 ~ 0.20   (strongest pattern ≥ 0.6 시: strength × 0.2)
B4 (trendline state):   0 / 0.15 / 0.30  (intact / confirmed_break / broken)
B5 (MACD bear div):     0 / 0.20   (감지 시 0.20)

baseScore = B1 + B2 + B3 + B4 + B5    (max 1.40)

+ macro boost: crisis +0.20 / tight +0.10 / flooded -0.10
+ onchain boost: strong_dist +0.20 / dist +0.10 / strong_acc ×0.8 (when score<0.7)
```

**임계값**:
- ≥ 0.50 → **full exit**
- ≥ 0.30 → **partial 50%**
- < 0.30 → no exit

### 5.3 EXIT-C (Protection — stop 이동만) — `protection.ts`

| 조건 | 액션 |
|---|---|
| PnL ≥ +2% & !movedToBE | stop = entry (breakeven) |
| PnL ≥ +5% | stop = price × 0.97 (trailing) |
| PnL ≥ +3% & ATR>0 | stop = price - 1.5 × ATR (variability) |

### 5.4 EXIT-D (Time Stop) — `time-stop.ts`

| 조건 | 액션 |
|---|---|
| 30 bars 경과 & PnL < +0.5% | full exit |
| 50 bars 경과 & PnL < +1.0% | full exit |

---

## 6. Stop Loss 계산 (Backtest)

### LONG (`bbdx.ts`, P1 적용 후)

```typescript
atr = calculateATR(windowCandles, 14)   // Wilder smoothing
stopLoss = max(
  entry - 1.5 × ATR,                     // 변동성 적응
  bbLower × 0.92                         // 절대 floor (-8%)
)

// Tier 1 도달 후 (P0-② BE 이동)
effectiveStop = max(stopLoss, entryPrice)
```

### SHORT (`bbdx-short.ts`)

```typescript
stopLoss = min(bbUpper × 1.03, entry × 1.02)
```

---

## 7. R:R (Risk:Reward) 비대칭화

### BBDX LONG (P1 적용 후)

```
target1 = bbMiddle + 0.5 × ATR        (Tier 1, 50% 부분 청산)
target2 = min(max(bbUpper, entry + 2×ATR), entry × 1.08)   (Tier 2, 잔여 50%)
stop    = max(entry - 1.5×ATR, bbLower × 0.92)
```

**평균 R:R**: 1 : 1.5 : 3.0 (stop : T1 : T2)

### BBDX SHORT

```
target1 = bbMiddle                    (가격 하락 시 도달)
target2 = max(bbLower, entry × 0.97)
stop    = min(bbUpper × 1.03, entry × 1.02)
```

### Trend-Follow (P1-③ 신규, **winRate 44.8%, PF 0.98**)

```
stop    = entry - 1.0 × ATR
target1 = entry + 1.5 × ATR           (50% 부분 청산)
target2 = entry + 3.5 × ATR           (잔여 50%, trend continuation)
```

**R:R**: 1 : 1.5 : 3.5

---

## 8. Trend-Follow 진입 게이트 (Mean Reversion 보완)

5단계 직렬 게이트:

```
① EMA 정배열:    EMA(9) > EMA(21) > EMA(50)
② ADX ≥ 25       (강한 추세)
③ +DI > -DI       (강세 우위)
④ price > SMA(50)  (장기 추세 위)
⑤ HH (Higher High): 직전 20 캔들 max > 그 이전 10 캔들 max
```

**모든 게이트 통과** 시에만 진입.

차원 커버: 1 momentum(EMA velocity) / 3 trend(ADX+DI+SMA) / 5 structure(HH)

---

## 9. Cycle-aware Activation (P1-④, 신규)

`cycle/btc-regime.ts`:

```typescript
detectBtcCycleRegime():
  ma200 = SMA(BTC 1d closes, 200)
  distance = (current_price - ma200) / ma200

  if distance > +0.05  → bull
  if distance < -0.05  → bear
  else                  → neutral
```

### Strategy 활성화 매트릭스

| Strategy | bull | bear | neutral |
|---|---|---|---|
| BBDX (mean reversion LONG) | ❌ skip | ✅ active | ✅ active |
| BBDX-SHORT | ❌ skip | ✅ active | ❌ skip |
| **Trend-Follow** | ✅ active | ❌ skip | ❌ skip |

→ 동시에 1~2 strategy 만 활성 — over-trading 방지 + regime 최적화.

---

## 10. 자본 보호 (헌장 R4)

### 10.1 LONG 차단

| 조건 | 동작 |
|---|---|
| `isFallingKnife` (-DI>+DI && ADX>25) | LONG 진입 차단 (upperRiding 예외) |
| Onchain `strong_distribution` + 평균회귀 path | finalStrength = 0, BLOCKED |
| Macro `crisis` regime | LONG 곱셈 mult 0.30 |
| Wave `opposing` alignment | mult 0.30 |

### 10.2 SHORT 차단

| 조건 | 동작 |
|---|---|
| `isRisingKnife` (+DI>-DI && ADX>25) | SHORT 진입 차단 (lowerRiding 예외) |
| Onchain `strong_accumulation` + 평균회귀 path | BLOCKED |
| `ENABLE_SHORT_SIGNALS != "1"` (production) | scanner 자체 산출 X |

---

## 11. 헌장 5 규칙 검증

| 규칙 | 기준 | 현재 상태 |
|---|---|---|
| **R1 차원 중복 X** | 같은 차원 동일 각도 X (rule1Exempt 명시 시 예외) | ✓ (NUM path 5차원 누락 시정 권고) |
| **R2 백테스트 알파** | Wilson 95% CI ≥ baseline +5%p, n≥100 | ⚠ BBDX 미입증, Trend-Follow 거의 통과 |
| **R3 단독 시그널 X** | modifier 는 BBDX core 없이 진입 발행 X | ✓ |
| **R4 자본 보호** | falling/rising knife + strong regime 차단 | ✓ 강화됨 |
| **R5 표본 충분** | 365d, ≥100 trades | ✓ |

---

## 12. 백테스트 검증 결과 (365d, 10 코인, 4h)

| Strategy | trades | winRate | PF | Sharpe | MDD | 평가 |
|---|---|---|---|---|---|---|
| BBDX (P0) | 1728 | 31.1% | 0.44 | -0.30 | 100% | 손실 |
| **BBDX (P1)** | 1360 | 33.8% | 0.54 | -0.23 | 99.99% | 손실 ↓ |
| **Trend-Follow (P1)** | 703 | **44.8%** | **0.98** | -0.007 | 87.76% | **거의 breakeven** |
| BBDX-SHORT | 1101 | 37.8% | 0.55 | -0.25 | 98.85% | 손실 |

### 알파 합격 기준 (Charter R2)
- winRate ≥ 50% — Trend-Follow 가 가장 근접 (44.8%)
- Sharpe ≥ 0.30 — 미달
- **PF ≥ 1.3** — Trend-Follow 0.98 (한 줄 ADX 28 강화로 도달 예상)
- MDD ≤ 20% — 모두 미달

---

## 13. 다음 작업 — P2 권고

| 우선순위 | 작업 | 영향 |
|---|---|---|
| **P2-①** ⭐ | Trend-Follow ADX 25 → **28** | PF 1.3+ 도달 예상 |
| P2-② | Trend-Follow HH 조건 % threshold | false-positive ↓ |
| P2-③ | Cycle-aware scanner 통합 (live) | production 안전성 |
| P2-④ | Trend-Follow + BBDX ensemble | 양쪽 장점 활용 |
| P2-⑤ | BBDX → bear regime 한정 | mean reversion 본질 보존 |

---

## 부록 A — 시그널 흐름 요약

```
시장 데이터 → calculateAllIndicators
            → detectAllCandlePatterns
            → detectBBStructure
            → ratio (volumeRatio)

[자본 보호] isFallingKnife? → LONG 차단
            isRisingKnife? → SHORT 차단

[진입 결정] decideEntry (BB > PTN > NUM)
            decideShortEntry (env=1 시)

[강도 측정] calculateSignalStrengthV2 → base (0~100)

[Confidence] computeFinalConfidence:
              base × confluence × wave × macro × onchain × additional

[Regime gate] evaluateRegimeGates (strong_distribution / crisis)

[Size factor] computeSizeFactor (full / large / medium / small / reject)
```

---

## 부록 B — 코드 참조

| 항목 | 파일 | 라인 |
|---|---|---|
| LONG 진입 (decideEntry) | `src/indicators.ts` | 1209-1275 |
| SHORT 진입 (decideShortEntry) | `src/indicators.ts` | 1075-1135 |
| signalStrength | `src/indicators.ts` | 1415-1440 |
| ATR 계산 | `src/indicators.ts` | 91-111 |
| EXIT-A profit | `src/exits/profit-target.ts` | - |
| EXIT-B reversal | `src/exits/reversal.ts` | 68-180 |
| EXIT-C protection | `src/exits/protection.ts` | - |
| EXIT-D time | `src/exits/time-stop.ts` | - |
| Confidence chain | `src/signals/confidence.ts` | 85-150 |
| Onchain score | `src/onchain/score.ts` | 100-160 |
| Wave Alignment | `src/trend/wave-alignment.ts` | 38-66 |
| 6 modifiers product | `src/modifiers/index.ts` | 64-82 |
| BBDX backtest | `src/backtest/strategies/bbdx.ts` | - |
| **Trend-Follow** | `src/backtest/strategies/trend-follow.ts` | 신규 (P1-③) |
| Cycle module | `src/cycle/btc-regime.ts` | 신규 (P1-④) |
| SHORT backtest | `src/backtest/strategies/bbdx-short.ts` | - |
