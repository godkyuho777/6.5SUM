# 05 — Fibonacci Strategy Audit

## 0. 개요

Fibonacci 전략은 **standalone strategy** (`backtest/strategies/fibonacci.ts`) 으로만 구현됨. BBDX multiplier 형태 (`fibToMultiplier`) **없음**.

추가로 `indicators.ts:397-418` 에 `calculateFibonacciLevels`, `isInFibZone` 헬퍼.

## 1. Standalone Strategy (`backtest/strategies/fibonacci.ts`)

### 1.1 현재 룰

진입 게이트 4개:
- Gate 1: `inFibGoldenZone(price, low, high)` — price ∈ [0.382, 0.618] retracement
- Gate 2: `indicators.rsi < 50`
- Gate 3: `candles[idx].volume ≥ avgVol(50)`
- Gate 4: `prev.close > prev.open` (직전 캔들 양봉)

청산:
- Tier 1: `min(anchor.high, entry × 1.04)` → 50%
- Tier 2: `min(anchor.low + range × 1.272, entry × 1.07)` → 잔여 50%
- Stop: `max(anchor.low × 0.99, entry × 0.98)`

`signalStrength = round((1 - fibPosition) × 100)` — fibPosition 0.382 → 62, 0.618 → 38.

### 1.2 단점

#### F1. 헌장 R3 위반 가능 (P1)
- `dimensionsCovered: [5]` (`fibonacci.ts:57`) — 1차원만.
- 7차원 중 6 누락: momentum (1, RSI 사용하지만 dimensionsCovered 미명시), volatility (2), trend (3), volume (4), macro (6), onchain (7).
- 실제 코드는 `indicators.rsi` (1차원), `volume` (4차원) 사용 — `dimensionsCovered` 메타가 *부정확*.
- `assertSevenDimensions` 호출 시 *오인 fail*.
- VWAP 와 같은 R3 위반 위험.

#### F2. anchor 계산이 windowCandles 의 max/min — 진짜 swing 이 아님 (P1)
- `computeFibAnchor(candles)` 가 단순 `Math.max(high)`, `Math.min(low)` (`fibonacci.ts:24-33`).
- Fib retracement 의 spec: 의미 있는 *swing high* 와 *swing low* 사이 (보통 ZigZag, fractal, 또는 Williams swing 으로 식별).
- 단순 high/low 는 **outlier wick 한 개**가 anchor 가 될 수 있음 — 가짜 retracement.
- 결과: 정상 시장에서는 작동하지만, 큰 spike 후 anchor 가 spike high 가 되어 *모든 가격이 deep retracement* 로 분류 → false positive 폭증.

#### F3. RSI < 50 조건 (P2)
- 단점: 50 은 RSI 중립선 — *너무 헐거움*. 깊은 retracement 에서 RSI 35~45 가 일반적인데 50 미만은 거의 모든 case 통과.
- spec 의 Fib + RSI confluence 는 RSI 30~40 영역에서 더 의미있음.

#### F4. Tier 1 = anchor.high 회복 — 매우 야심찬 목표 (P2)
- 0.382 ~ 0.618 retracement 진입 후 Tier 1 이 anchor.high (= 1.0 retracement 회복).
- 의미: 깊은 되돌림 후 *이전 swing high 까지 회복* — 60~30% 가격 상승 필요.
- entry × 1.04 cap 으로 제한되지만, 4% 도달도 mean-reversion 환경에서 자주 미달성.
- backtest winRate 가 baseline 보다 낮을 가능성.

#### F5. Tier 2 = Fib 1.272 extension (P3)
- spec 의 Fib 161.8% extension 권고와 다름 (1.272 < 1.618).
- Tier 1 (1.0) → Tier 2 (1.272) 사이 격차 작음 — 두 tier 사이 추가 알파 작음.
- 권고: Tier 2 = `min(anchor.low + range × 1.618, entry × 1.07)`.

#### F6. signalStrength = (1 - fibPosition) × 100 (P3)
- fibPosition 0.382 (얕은 retracement) → strength 62
- fibPosition 0.618 (깊은 retracement) → strength 38
- **반대 의도**: 깊은 retracement 가 더 강한 진입 신호여야 함 (mean-reversion 알파 ↑).
- 현재 공식: 얕은 retracement → 강한 시그널 — *역설적*.

### 1.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| anchor 산출 | max/min | Williams 5-bar swing fractal (most recent) | F2 — outlier 회피 |
| RSI 임계 | < 50 | **< 40** | F3 — 더 강한 oversold confluence |
| Tier 1 | anchor.high (1.0 retr) | `anchor.low + range × 0.5` (mid retr) | F4 — 더 도달 가능한 목표 |
| Tier 2 | 1.272 ext, ×1.07 cap | **1.618 ext, ×1.10 cap** | F5 — spec 정합 |
| signalStrength | (1 - fibPos) × 100 | **fibPos × 100** | F6 — 역설 수정 |
| dimensionsCovered | [5] | [1, 4, 5] (RSI + volume + Fib) | F1 — assertion 정합 |

### 1.4 영향 가설

- F2 (anchor) → false positive ↓ 20%, **winRate ↑ 5~7%p**.
- F3 (RSI 임계) → 신호 빈도 ↓ 40%, **expectancy ↑** (높은 hit rate, 낮은 빈도).
- F4 (Tier 1) → Tier 1 hit rate ↑, **avgReturn ↑** (early profit lock).
- F6 (strength 역전) → 시그널 우선순위 정확화. UI 결정 신뢰도 ↑.

### 1.5 헌장 검증

- **R1**: structure 차원, 단독. 통과 단독으로는.
- **R2**: backtest 가능 — 측정값 있음. 단 anchor 결함으로 false positive 데이터로 측정 — alpha 신뢰도 의문.
- **R3**: standalone strategy 발행 시 위반. live 환경 사용 모드 **확인 필요**.

---

## 2. Helper functions (`indicators.ts:397-418`)

### 2.1 `calculateFibonacciLevels`

```ts
levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
```

표준 Fib levels — 통과.

### 2.2 `isInFibZone`

```ts
isInFibZone(price, fibPrice, tolerance = 0.005)
```

±0.5% tolerance — 정상. TF 별 조정 가능.

### 2.3 `calculateAllIndicators` 의 fib 계산 (`indicators.ts:184-188`)

```ts
const maxHigh = Math.max(...highs);
const minLow = Math.min(...lows);
const fibLevels = calculateFibonacciLevels(maxHigh, minLow, 'up');
```

#### Fib calculation (P2)

- 전체 candles 의 max/min — F2 와 같은 결함.
- BBDX 의 `TechnicalIndicators.fibLevels` 가 모든 곳에서 이 값 사용 — *모든 fib-related 로직이 unreliable anchor 사용*.
- 백테스트 시 `windowCandles` 가 200개라 anchor 가 200 캔들 max/min — 한 번 큰 spike 가 anchor 되면 200 캔들 동안 모든 fib level 왜곡.

---

## 3. EXIT-A Tier 2/3 의 Fib 의존 (`exits/profit-target.ts:38-45`)

- `fib100`, `fib161_8` input 으로 받음 — 호출 측이 채움.
- `decideExitForScanner` (exits/index.ts:67-74) 의 ScannerExitContext 가 `fib100`, `fib161_8` 옵션 — **현재 채워지지 않음**.
- 결과: EXIT-A 가 Tier 1 (BB middle) 만 작동. Tier 2/3 영구 미작동.

### 3.1 영향

- Profit target 의 Fib-based extension exit 활용 0건 — **expectancy 측정 누락**.

### 3.2 권고

- `decideExitForScanner` 호출 측이 `indicators.fibLevels` 의 0.0 / 1.618 level 을 channel — 단 anchor 결함 (F2) 해결 후.

---

## 4. 종합 헌장 검증

- **R1**: structure 차원 단독. 통과.
- **R2**: backtest 가능, 단 anchor 결함으로 측정 신뢰도 ↓.
- **R3**: **standalone strategy 발행 시 위반** — live 환경에서 BBDX-multiplier 모드 미구현이라 standalone 만 가능 = 위반.
- **Capital protection**: anchor outlier 결함이 stop placement 도 영향 — `anchor.low × 0.99` 가 잘못된 anchor 면 너무 멀거나 너무 가까운 stop.

## 5. 권고 우선순위

| 항목 | P | 영향 |
|---|---|---|
| anchor 결함 수정 (F2) | **P1** | 모든 Fib-based 로직의 정확도 |
| dimensionsCovered 정확화 (F1) | **P1** | assertion 통과 |
| signalStrength 역전 수정 (F6) | P2 | 우선순위 신뢰도 |
| Tier 1/2 목표 재조정 (F4, F5) | P2 | hit rate |
| RSI < 50 → < 40 | P2 | confluence 강화 |
| `decideExitForScanner` Fib 채움 | P2 | EXIT-A 활용 |
| BBDX-multiplier 모드 신규 추가 (`fibToMultiplier`) | **P1** | R3 통과 |
