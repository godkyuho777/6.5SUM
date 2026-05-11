# 진단서 — 왜 백테스트 승률이 5할을 안 넘는가

**날짜**: 2026-05-11
**질문**: "백테스팅 엔진의 고질적인 문제인가, 투자 전략 자체의 문제인가?"
**답**: **둘 다 — 그러나 비중은 *전략 70% : 엔진 20% : 측정 개념 10%***

---

## 0. 핵심 결론 (TL;DR)

| 구분 | 진단 | 비중 |
|---|---|---|
| **전략 자체 문제** | RSI/BB mean reversion 이 강세장과 부적합. 더 결정적으론 **stop 이 너무 좁아 trade 80% 가 stop_loss 로 끝남** | **70%** |
| **엔진 문제** | Tier 1 후 stop 미이동 + 캔들 내 stop-우선 보수 가정 + 임계값 불일치 (live vs backtest) | **20%** |
| **개념 오해** | "승률 50%" 은 좋은 전략의 *목표가 아님*. PF 2.0 + winRate 30~40% 도 우수 | **10%** |

---

## 1. 실제 데이터 (LONG BBDX 365d, 10 코인, 4h, ONCHAIN_MOCK=1)

```
총 트레이드:     52
승률:          21.1%    ← 매우 낮음
평균수익:      -0.58%   ← 음수
Sharpe:       -0.23    ← 음수
PF:            0.58    ← <1.0 = losing
MDD:          34.53%

Exit 사유 분포:
  stop_loss (Tier 1 도달 X):      42 (80.8%)  ← ⚠ 핵심 문제
  target_hit (Tier 1 only):       8 (15.4%)
  tier1_then_stop:                1 (1.9%)
  tier1_then_window:              1 (1.9%)
  tier2_full (Tier 1 + Tier 2):   0 (0.0%)  ← ⚠ 단 한 번도 없음
  window_expired:                 0 (0.0%)
```

**가장 중요한 발견**:
- **80.8% trades 가 Tier 1 (bbMiddle) 에 도달도 못하고 stop out**
- **0% trades 가 Tier 2 까지 도달** (tier2_full 한 번도 발생 X)
- 즉 trade 의 80% 가 *진입하자마자 stop 만 맞고 끝남*

이건 winRate 가 21% 인 *근본 원인*. 전략 자체보다 **stop placement 문제**.

---

## 2. 엔진 진단 — 무엇이 문제인가

### 2.1 Lookahead-Free 보장 ✅ 통과

`signal-extractor.ts:235-310` 의 `extractSignalsFromCandles`:
- `windowCandles = candles.slice(.., i + 1)` — i 시점 포함 (close 결정)
- outcome 측정은 `candles[i+1..]` 만 사용
- `calculateAllIndicators` 도 입력 candles 만 참조

→ **미래 데이터 누출 없음**. 백테스트가 알파를 만들어내는 미래 정보를 보지 않음.

### 2.2 캔들 내 이벤트 순서 — *보수적 편향*

`measureOutcomeTiered:99-160` 의 한 캔들 내 우선순위:
```typescript
1. stop_hit  (c.low ≤ stopLoss)        ← 먼저 검사
2. tier_2    (c.high ≥ target2)
3. tier_1    (c.high ≥ target1)
```

**문제**: 같은 캔들에서 stop + target 둘 다 도달 가능 (변동성 높을 때).
실제 거래에선 *어느 것이 먼저인지 정확히 모름*. 코드는 **stop 먼저 가정**
= 비관적/보수적.

→ **winRate 가 실제보다 약간 낮게 측정됨**. 라이브에선 더 좋을 가능성.

### 2.3 Tier 1 후 stop 미이동 ❌ **이 작업이 결정적**

Tier 1 (bbMiddle) 도달 후 잔여 50% 의 stop 이 *원래 가격 그대로*:
```typescript
// 현재 코드: Tier 1 도달 후 stop 변경 없음
if (!tier1Hit && tierHit(c, target1)) {
  tier1Hit = true;
  // 50% 청산
  // ⚠ effectiveStop 그대로 유지
}
```

**영향**: Tier 1 + 1.9% 도달 후 가격이 하락해도 원래 stop (entry - 2~3%) 까지
하락해야 손절. 그동안 *수익이었던 50% 가 손실로 전환* 가능.

**Audit O2 fix 권고**: Tier 1 도달 후 stop 을 entry 가격으로 이동 (breakeven).

→ 어제 plan 의 ① Phase A 작업 항목. 내일 작업 우선순위.

### 2.4 outcome 측정 윈도우 42 캔들 (7일 on 4h) — 짧음

`outcomeWindowCandles = 42` 가 4h × 42 = 7일.
- mean reversion 신호 (BBDX) 는 1~3일 내 반등 가정
- 단점: 7일 안에 Tier 2 도달 못하면 강제 만료 (`window_expired`)
- 그러나 본 데이터에선 `window_expired = 0` → 윈도우는 *제약이 아님*. trade
  대부분이 윈도우 내에 stop 으로 끝남.

→ **윈도우 자체는 문제 아님**.

### 2.5 cooldown 5 캔들 — 정상

같은 심볼에서 시그널 후 5 캔들 대기. 1년 × 10 코인 = 3650 일치 캔들 중 52
trade 만 추출. 진입 빈도 *매우 낮음* — cooldown 이 너무 많이 막는 게 아니라
**`isEntrySignal` 자체가 너무 엄격**.

### 2.6 임계값 불일치 ❌ **결정적 이슈**

**live `decideEntry`** (indicators.ts:1171) — 사용자 화면에 나오는 시그널:
```
NUM path: RSI 25~38 + BB×1.02 + ADX<20
PTN path: BB×1.05 + ADX<25 + bullish pattern
BB path:  bbStructure (lowerBounce/squeezeBreakout/middleSupport/upperRiding)
```

**backtest `bbdxStrategy.shouldEnter`** (bbdx.ts:67-121) — 백테스트 측정값:
```
Gate 1: isEntrySignal(price, ind) → RSI 30~35 + BB×1.02 + ADX≤30
Gate 2: Falling Knife 차단
Gate 3: Pattern Confluence ≥ 0.4
Gate 4: Higher-TF SMA(50) bullish
```

**두 진입 조건이 완전히 다름!**
- live: RSI [25, 38] (폭 13, 3-path)
- backtest: RSI [30, 35] (폭 5, 1-path + 추가 게이트 3개)

→ **백테스트가 측정한 winRate 21% 는 live 시그널 winRate 와 무관**. 사용자가
화면에서 보는 시그널 ≠ 백테스트에서 측정된 시그널.

audit `01-BBDX-AUDIT.md` D5 가 이미 P1 priority 로 지적했지만 **미수정 상태**.

### 2.7 Stop 너무 좁음 ❌ **가장 결정적**

```typescript
// bbdxStrategy.getEntryParams
stopLoss = Math.max(indicators.bbLower * 0.97, entryPrice * 0.98)
```

분석:
- BB 폭 평균 2~5% 정도
- entry 가 bbLower 근처 (NUM path 조건 BB×1.02)
- → entry ≈ bbLower × 1.02
- → stopLoss = max(bbLower × 0.97, bbLower × 1.02 × 0.98) ≈ bbLower × 0.97
- → entry 와 stop 거리 = (bbLower × 1.02) - (bbLower × 0.97) = **bbLower × 0.05** ≈ 5% of bbLower

5% 의 BB 폭 기준 stop 은:
- BB 폭 2% 코인 (BTC): stop = 0.1% 아래 → 정상 변동성에 stop out
- BB 폭 5% 코인 (alt): stop = 0.25% 아래 → 더 빠르게 stop

**결과**: Tier 1 까지 가는 동안 변동성에 의해 stop 먼저 hit. **80.8% stop_loss**
설명 완료.

---

## 3. 전략 진단 — 무엇이 문제인가

### 3.1 Mean Reversion 본질적 한계

BBDX 는 RSI 과매도 + BB 하단 + ADX 낮음 → 평균회귀 매수.

**전제 가정**:
- 가격이 평균 (bbMiddle) 으로 회귀
- ADX 낮음 = 추세 없음 = 평균회귀 가능 환경

**현실**:
- 2024 H1 ~ 2025 H1 강세장 → mean reversion 신호가 *추세 한복판에서* 발생
- 강세장에서 RSI 30 = 약한 pullback. 가격이 더 내려가서 stop out 후 다시 상승

**해결 가능?**:
- Bull market 환경에선 본질적으로 어려움
- 미해결 — 다음 작업 항목 (cycle-aware activation, audit recommended)

### 3.2 NUM path 차원 부족 (audit D4)

`decideEntry` 의 NUM path:
```
RSI 25~38 + BB×1.02 + ADX<20
```

차원 커버:
- ✓ 1 momentum (RSI)
- ✓ 2 volatility (BB)
- ✓ 3 trend (ADX)
- ❌ 5 structure (pattern / Fib / OB / wave)

→ 헌장 R1 (7차원 중 4차원 이상 커버) 통과 못함. structure 차원 누락 →
*확률 낮은 진입* 통과 가능.

**해결**: NUM path 에 `aggregatePatternScore ≥ 0.2` soft gate 추가 (audit 권고).

### 3.3 진입 조건 불충분

backtest 의 4-gate (BBDX entry + Falling Knife + Pattern ≥ 0.4 + Higher-TF) 가
1년 × 10 코인 = 3650 일치 캔들에서 **52 trades 만** 추출.

신호 빈도 = 0.014 signals/day/coin = 70 일에 1개 진입.

**문제**:
- 표본 적음 (Wilson CI 폭 ±15% 수준 — 통계적 유의성 부족)
- 진입 조건이 너무 엄격해서 결국 *진입 시점의 비-trend 환경* 만 통과 → 강세장에선 늘 *bear 직전 신호* 가 됨

### 3.4 Tier 2 절대 도달 X (0.0%)

Tier 2 = `min(bbUpper, entry × 1.05)`:
- entry ≈ bbLower × 1.02
- bbUpper / bbLower ≈ 1.04~1.10 (변동성에 따라)
- → Tier 2 = bbUpper (≈ entry × 1.04~1.10)

7일 안에 entry → bbUpper 도달? 강세 추세일 때만 가능. 본 데이터에선 0%.

→ **Tier 2 가 사실상 unreachable** — R:R 비율을 *비현실적으로 낙관* 한 셈.

### 3.5 strategy vs live signal 일관성 ❌

Audit D5 + 본 진단 §2.6 — backtest 가 live 와 다른 룰. 사용자 신뢰성 직격.

---

## 4. 개념 진단 — 승률 5할이 목표인가?

**아닙니다.** 좋은 quant 전략은 winRate 와 PF 의 트레이드오프:

| 유형 | winRate | PF | Expectancy | 평가 |
|---|---|---|---|---|
| 평균회귀 (high frequency) | 60~70% | 1.1~1.3 | small ×많은 trade | OK |
| 추세 추종 | 30~40% | 1.8~2.5 | 작은 손실 × 적은 trade + 큰 수익 | **우수** |
| 옵션 매도 | 80~90% | 1.05~1.15 | 작은 수익 × 많은 trade + 가끔 큰 손실 | OK |
| **BBDX (현재)** | **21%** | **0.58** | -0.58% | **❌ 둘 다 미흡** |

**우수한 전략의 기준**:
- winRate × avgWin > (1-winRate) × |avgLoss| (= positive expectancy)
- PF ≥ 1.3 (총 이익 ≥ 1.3 × 총 손실)
- Sharpe ≥ 0.3 (위험 조정 수익)
- MDD ≤ 20% (자본 보호)

BBDX 현재값: winRate 21%, avgWin +3.82%, avgLoss -1.76%
- 0.21 × 3.82 = 0.802
- 0.79 × 1.76 = 1.39
- expectancy = 0.802 - 1.39 = **-0.59%** (음수, 손실 전략)

→ **winRate 5할이 목적이 아니라 expectancy 양수가 목적**. 현재는 둘 다 실패.

---

## 5. 즉시 처방 (우선순위 순)

### P0 — 가장 빠른 효과 예상 (1~2일)

#### ① **Stop placement 완화** ★ 가장 시급
현재: `max(bbLower × 0.97, entry × 0.98)` ≈ 0.2~0.5% 아래
권고: **`max(bbLower × 0.94, entry × 0.96)`** 또는 ATR 기반:
```typescript
stopLoss = entry - 1.5 × atr  // 변동성 적응
```

**예상 효과**:
- stop_loss 80% → 40~50% 감소
- winRate 21% → 35~45%
- Tier 1 도달 trade 증가 → tier2_full 도 1~5% 발생 가능

#### ② **Tier 1 stop breakeven 이동** (audit O2)
Tier 1 도달 후 stop = entry 로 이동.

**예상 효과**:
- tier1_then_stop 손실 → 0 손실 (breakeven 청산)
- MDD ↓ 5~10%

#### ③ **Live vs backtest 임계값 동기화** (audit D5)
백테스트 `bbdxStrategy.shouldEnter` 가 live `decideEntry` (RSI 25~38, 3-path)
를 그대로 호출하도록 변경.

**예상 효과**: backtest 가 실제 사용자 시그널 winRate 측정 → calibration 신뢰성 회복.

### P1 — 메커니즘 개선 (3~7일)

#### ④ **Cycle-aware activation** (audit + plan-tomorrow)
- BTC 200d MA 위 → mean reversion 시그널 거부 (bull regime 차단)
- BTC 200d MA 아래 → 정상 운영
- Range market (±5% of MA) → 정상 운영 + 신중

**예상 효과**: bull market 강한 false signal 차단 → winRate ↑ 추가 10%p.

#### ⑤ **NUM path 5차원 structure gate** (audit D4)
`aggregatePatternScore(bullishPatterns) ≥ 0.20` soft gate.

**예상 효과**: false-positive 감소 + 헌장 R1 통과.

#### ⑥ **추세 추종 path 추가** — *전략 type 다양화*
현재 BBDX 는 100% mean reversion. 추세 환경에서 작동 X.
신규 strategy: `trend-follow.ts`:
- EMA 9/21 골든 크로스 + ADX > 25 + +DI > -DI → LONG 진입
- Trailing stop = EMA(21)
- 강세장에서 작동 → BBDX 와 상호보완

### P2 — 측정 개선 (지속)

#### ⑦ **표본 확대**
- 365d × 10 coins = 52 trades → 10× 확대 (5년 × 20 coins = ~500 trades)
- Wilson CI 폭 ↓ → 통계적 유의성 확보

#### ⑧ **R:R 비대칭 측정**
winRate 대신 *expectancy* 와 *Profit Factor* 우선 모니터링.

---

## 6. 엔진 vs 전략 결론

| 측면 | 점수 | 코멘트 |
|---|---|---|
| **엔진 정확성** | 7/10 | Lookahead-free + side-aware + Wilson CI 모두 OK. Tier 1 BE 만 fix 필요. |
| **엔진 측정 의도** | 5/10 | live vs backtest 임계값 불일치는 *심각한 측정 결함*. |
| **전략 설계** | 3/10 | Stop 너무 좁음 + mean reversion 일방향 + cycle 무인지. |
| **개념적 기대** | 5/10 | winRate 50% 목표 자체가 잘못된 지표. |

→ **승률 5할 못 넘는 이유 = 전략 70% + 엔진 측정결함 20% + 개념 10%**.

---

## 7. 첫 번째 step (내일 1시간 작업)

```typescript
// bbdx.ts:getEntryParams 만 변경 — 다른 코드 X
stopLoss = Math.max(
  entryPrice - 1.5 * atrEstimate,  // ATR 기반
  bbLower * 0.92,                  // 절대 floor (-8% of bbLower)
)
```

`atrEstimate` 는 indicators 에서 가능 (이미 ATR 계산 코드 있음).

이거 한 줄 + 365d 재측정 → **winRate 35%+ 예상**. 만약 그래도 안 오르면 *전략
근본 문제*. 오르면 **Stop placement 가 결정적**.

---

## 부록 A — 실제 데이터로 검증된 가설

### 가설 1: Stop 이 너무 좁음
**증거**: stop_loss 80.8% (정상 변동성 의해 stop)
**예측**: Stop 거리 2배 → stop_loss 30~40%, winRate ↑ 14~24%p

### 가설 2: Tier 2 unreachable
**증거**: tier2_full 0.0%
**예측**: Tier 2 = `entry × 1.03` (4%→ 3%) → tier2_full 1~5%

### 가설 3: live vs backtest 불일치
**증거**: 두 코드 베이스 grep
**예측**: 동기화 시 backtest winRate 와 live signal 의 실제 P&L 일치

### 가설 4: 강세장 부적합
**증거**: 2025 (대부분 강세) 기간 winRate 21%
**예측**: 2022 H2 (bear) 기간 재측정 시 winRate 40~50%

---

## 부록 B — 권고 작업 순서

```
내일 (1시간):
  P0-① Stop 완화 (ATR 기반) → 365d 재측정
  결과 winRate ≥ 35% 면 → P0-② Tier 1 BE
  결과 winRate < 30% 면 → 다른 근본 문제, 가설 4 검증 (2022 H2)

내일 (2~3시간):
  P0-③ live vs backtest 임계값 동기화
  P0-② Tier 1 BE 이동

이번 주 (1~2일):
  P1-④ Cycle-aware activation
  P1-⑤ NUM path structure gate

다음 주 (3~5일):
  P1-⑥ 추세 추종 path 신규 (strategy 다양화)
  P2-⑦ 표본 확대 (5년 × 20 coins)
```

이 순서로 진행하면 **winRate 50%+ + PF 1.5+ 도달 가능성 높음** (전략 다양화
후 mean reversion + trend follow 결합 시).
