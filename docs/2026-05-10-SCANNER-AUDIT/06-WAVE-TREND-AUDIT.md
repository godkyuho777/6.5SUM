# 06 — Multi-TF Trend Engine v2.0 + Wave Alignment Audit

## 0. 개요

3개 모듈로 분리:
- `trend/multi-tf.ts` — Per-TF deep trend 분석 (4-tier confirmation)
- `trend/wave-alignment.ts` — Multi-TF aggregation → mult
- `trend/analyze.ts` — orchestrator (캐시 + fetch)

추가로 **standalone backtest strategy** (`backtest/strategies/trend.ts`).

## 1. Per-TF Deep Trend (`trend/multi-tf.ts:257-353`)

### 1.1 현재 룰

4-tier confirmation:
- **trendline**: 직전 20 close linear regression slope, normalized > 0.0005 (per-bar 0.05%)
- **emaArray**: GOLDEN / DEATH / BULLISH_ALIGNED / BEARISH_ALIGNED / MIXED
- **adxStrength**: STRONG (>25) / WEAK (<20) / BORDERLINE (20~25)
- **hhHlStructure**: HH_HL_x2 / HH_HL_x1 / MIXED / LH_LL_x1 / LH_LL_x2 (Williams 5-bar swing)
- (aux) **volumeConfirm**: INCREASING / FLAT / DECREASING (5-on-5 비교)

side 결정 logic (`multi-tf.ts:298-314`):
- bullishEma + STRONG adx + slope>0 + meaningful → BULLISH
- bearishEma + STRONG adx + slope<0 + meaningful → BEARISH
- bullishEma + +DI>-DI + slope>0 + meaningful + adx≠WEAK → BULLISH (낮은 신뢰도)
- bearishEma + -DI>+DI + slope<0 + meaningful + adx≠WEAK → BEARISH
- 그 외 → SIDEWAYS

confidenceScore = side 부합 confirmations 갯수 × 25 (max 100).

### 1.2 단점

#### T1. SMA-style EMA 호출 비효율 (P3)
- `analyzeTimeframeTrendDeep:281-283` 가 `calculateEMA(closes, 9), calculateEMA(closes, 21), calculateEMA(closes, 50)` 별도 호출.
- 이미 인덱스 기반 시리즈 함수 (`emaSeries` in `ema-ribbon.ts`) 가 있어도 미재사용.
- 단점: O(N) × 3 호출 — 250 캔들 ×3 = 750 ops, 가벼움 — *단점 아님*. 주의는 일관성.

#### T2. slope normalization edge case (P2)
- `slopeNorm = abs(slope) / max(abs(slopeWindow.last), 1e-9)` (`multi-tf.ts:293`).
- slopeWindow.last 가 0 에 가까우면 normalization 폭주 — 1e-9 fallback 으로 방지하지만 실제 가격이 0 인 경우 X (안전).
- 0.0005 (per-bar 0.05%) 임계 — 1d TF 면 일 0.05% 변화 = 의미 있는 trend? 아래.

#### T3. 0.0005 임계가 TF 무관 (P1)
- 1h: per-bar 0.05% = 시간당 0.05% 변화 = 일 1.2% — 의미 있음.
- 4h: per-bar 0.05% = 일 0.3% — 약함.
- 1d: per-bar 0.05% = 일 0.05% — 너무 낮음, 거의 모든 평일 trend 가 meaningful 로 인정.
- 단점: 1d TF 에서 false positive 폭증.

#### T4. EMA cross 5-candle window (`multi-tf.ts:170-175`) (P3)
- `prevCloses = closes.slice(0, closes.length - 5)`.
- 5 캔들 전 시점의 EMA 와 비교 → cross 탐지.
- 단점: 5 캔들 이상 전 cross 도 GOLDEN/DEATH 분류해야 할 수 있음 (긴 trending 시장).

#### T5. swing detection lookback 30 (`multi-tf.ts:220`) (P2)
- `slice = candles.slice(-Math.min(30, candles.length))`.
- 30 캔들 안에서 마지막 2 swing high + 2 swing low.
- 5-bar fractal 조건상 30 안에 swing 이 충분히 형성되지 않을 수 있음 (변동성 낮은 환경).
- 결과: highs.length<2 면 MIXED 반환 — *너무 자주 MIXED* → side 결정 SIDEWAYS bias.

### 1.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| slope 임계 | 0.0005 (TF independent) | TF 별 (1h: 0.0005, 4h: 0.001, 1d: 0.003, 1w: 0.005) | T3 |
| swing lookback | 30 | TF 별 (1h: 50, 4h: 30, 1d: 20, 1w: 15) | T5 |
| EMA cross window | 5 candles | TF 별 (1h: 8, 4h: 5, 1d: 3) | T4 |

### 1.4 헌장 검증

- **R1**: trend 차원, ADX/EMA Ribbon 과 같은 차원. `INDICATOR_REGISTRY` 에 등록 X — 별도 항목으로 추가 권고. `rule1Exempt: true` 명시 필요 (`waveAlignment` 메타에 이미 존재 — 정확히는 multi-tf 의 알고리즘은 `waveAlignment` 에 의해 5차원 *멀티 TF 정합 상태* 로 mapping 되어 있음. 이 멀티-TF aggregation 단계에서 trend 가 아닌 5차원 로 분류된 건 차원 매핑 정확).
- **R2**: alpha 측정 — backtest `trend` strategy 가 측정 가능. 단 standalone — R3 위반 위험.
- **R3**: standalone backtest strategy 만 — wave-alignment.ts 의 `waveAlignmentToMultiplier` 가 BBDX 곱셈체인에 통합 (signals/confidence.ts:100) ✓ — 통과.

---

## 2. Wave Alignment (`trend/wave-alignment.ts:83-163`)

### 2.1 현재 룰

```
WAVE_MULTIPLIERS = {
  perfect_up:   1.30,
  partial_up:   1.10,
  mixed:        0.85,
  opposing:     0.30,
  perfect_down: 0.65,
}
```

분류 로직:
- perfect_up: 모든 TF BULLISH
- perfect_down: 모든 TF BEARISH
- opposing: longest TF BEARISH AND any TF BULLISH
- partial_up: bullFrac ≥ 0.6 AND longest TF ≠ BEARISH AND bearWeight = 0
- 그 외: mixed

TF weights default: 15m:1, 1h:2, 4h:3, 1d:4, 1w:5.

### 2.2 단점

#### W1. partial_up 조건 `bearWeight === 0` (P2)
- bullFrac ≥ 0.6 + bearWeight = 0 → partial_up.
- 단점: bullFrac 0.7 + bearWeight 0.1 (4 TF 중 3개 bullish, 1개 bearish) → mixed.
- 0.7 majority 인데 mixed (mult 0.85) 처리 — 보수적이지만 *의미 있는 majority* 인지 모호.
- 권고: `bearWeight ≤ 0.2 × totalWeight` 까지 partial_up 인정.

#### W2. opposing mult 0.30 강도 (P2)
- 최강 차감.
- "longest TF BEARISH + 다른 TF BULLISH" — 단기 bullish 가 거짓 신호일 수 있음 (counter-trend rally) — 합리적 차감.
- 단점: 0.30 은 거의 차단 수준. 1d 가 BEARISH 라고 모든 LONG 진입을 0.30 mult 차감하면 *short-term mean-reversion 알파* 잘라먹음.
- 권고: 0.50 으로 완화. 또는 macroRegime + onchainRegime 와 결합 시만 0.30.

#### W3. perfect_down 0.65 (LONG-only fork) (P2)
- 모든 TF BEARISH → LONG mult 0.65.
- opposing (0.30) 보다 약함 — 구조 일관 일관 *덜* 위험. 합리적.
- 단점: SHORT 추가 후 의미 반전 — perfect_down 환경에서 SHORT 는 *favored* 이므로 `waveAlignmentToMultiplier(_, "SHORT")` 가 1.30 반환해야. 현재 LONG-only fork (`:42` `if (bbdxSide === "LONG") return WAVE_MULTIPLIERS[alignment]`) — SHORT mult 1.0 반환 (영향 없음).
- 결과: SHORT 진입 시 wave alignment 의 *알파 잠재력 0*.

#### W4. partial_down 누락 (P2)
- partial_up 미러 없음 — 모든 약한 bearish 환경이 mixed 로 분류.
- 의도일 수 있지만 perfect_down 추가했으면 partial_down 도 추가 필요 (대칭성).

### 2.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| partial_up bearWeight | =0 | ≤ 0.2 × total | W1 — 더 인정폭 |
| opposing mult | 0.30 | **0.50** | W2 — 과도 차감 회피 |
| SHORT wave mult | 1.0 (no-op) | mirror logic (perfect_down → SHORT 1.30 등) | W3 |
| partial_down 추가 | 누락 | bearFrac ≥ 0.6 + bullWeight = 0 → 0.85 (LONG) | W4 |

### 2.4 영향 가설

- W1 → partial_up 빈도 ↑ — bull 환경 mult 1.10 가산 더 자주 적용 → **avgReturn ↑ 0.5~1.5%** (LONG 환경).
- W2 (opposing 0.30 → 0.50) → counter-trend 진입 *완전 차단* 회피. mean-reversion 알파 회복.
- W3 (SHORT support) → SHORT path 의 wave 알파 측정 가능 — R2 통과 위해 필요.

### 2.5 헌장 검증

- **R1**: 5차원 (multi-TF 정합). `rule1Exempt: true` 명시 ✓.
- **R2**: backtest 측정 — `trend` standalone strategy 만. `waveMult` 의 BBDX 통합 alpha 측정은 `signals/confidence.ts` 통합 후 *측정 가능*.
- **R3**: `waveAlignmentToMultiplier` ✓ — multiplier-only.

---

## 3. analyzeTrend orchestrator (`trend/analyze.ts`)

### 3.1 현재 룰

- 4 TF (15m, 1h, 4h, 1d) 동시 fetch
- 5분 cache (`CACHE_TTL_MS`)
- fetchKlines 실패 시 `sidewaysFallback` (graceful)

### 3.2 단점

#### A1. 15m → 1h fallback (P1)
- `normalizeTf:46`: `"15m": "1h"` — Bybit V5 Spot 호환 위해 단순화.
- 결과: 15m TF 로 분석 요청해도 *실제로는 1h candles 사용*.
- backtest 의 시간 정합성 깨짐 — 1h 데이터가 TF "15m" 로 라벨링됨.
- 헌장 R2 영향: 백테스트 결과의 TF 별 분리가 *모순* — 15m 결과는 1h 결과의 별칭.

#### A2. KLINES_LIMIT = 200 (P3)
- 200 캔들 fetch — EMA(200) 계산 정확도에 한계.
- spec 의 EMA Ribbon `< 50 candles → stub` 와 `< 200 → 부정확` 의 경계 모호.

#### A3. fetchKlines 실패 graceful → SIDEWAYS (P2)
- 단일 TF fetch 실패 시 다른 TF 도 SIDEWAYS 처리되지 않고 본 TF 만 SIDEWAYS.
- 결과: 1d fetch 실패 → 15m/1h/4h 은 정상, 1d 만 SIDEWAYS → opposing 로 분류 가능 — *fetch 실패가 mult 0.30 로 변환*.
- 권고: error count > 1 면 전체 result `mult=1.0` (영향 없음).

### 3.3 개선안

- A1: 15m TF spec 재확인. 진짜 15m 필요 시 Bybit Linear (perpetual) 또는 별도 데이터 source.
- A2: 250 또는 300 candles fetch.
- A3: error count 임계 처리 추가.

---

## 4. Standalone backtest strategy (`backtest/strategies/trend.ts`)

### 4.1 룰

진입 게이트 5개:
- Gate 1: EMA 9 > 21 > 50 (정배열)
- Gate 2: ADX ≥ 20
- Gate 3: +DI > -DI
- Gate 4: SMA(50) 상승 + price > SMA
- Gate 5: HH/HL 구조 (5-on-5 high/low 평균 비교)

### 4.2 단점

#### TS1. 헌장 R3 위반 가능 (P1)
- VWAP/Fib 와 같은 위험.
- `dimensionsCovered: [3]` (`trend.ts:70`) — 1차원만 명시.
- 실제 사용: SMA (3차원), EMA (3차원), ADX (3차원), 가격구조 (5차원, HH/HL).
- 모두 *trend 단일 차원* 으로 spec — R1 위반 가능.

#### TS2. `hasBullishStructure` 의 5-on-5 단순 평균 (P2)
- spec 의 Williams 5-bar fractal 과 다름.
- 5 캔들 high 평균 > 그 이전 5 high 평균 — *20 캔들 추세* 측정만, swing 자체 인지 X.
- 결과: HH/HL 검증이 *trend continuation* 의미만, 진짜 *higher high + higher low* 의미 부족.

#### TS3. signalStrength 공식 (`trend.ts:147-150`) (P3)
- `adxFactor = min(50, adx); diFactor = min(30, plusDi - minusDi); strength = adxFactor + diFactor + 20`
- ADX 50 + DI 차이 30 + 20 = 100. 일반 trend 환경 (ADX 25, DI 차이 10) → 25+10+20 = 55.
- 분포가 한쪽으로 쏠림 (대부분 50~70 영역). +20 magic number 도 의미 모호.

### 4.3 헌장 검증

- **R1**: 4 indicator (EMA + SMA + ADX + HH/HL 구조) 가 모두 trend (3) — *4중 동일 차원*. dimension-mapping 의 `EMA`, `EMA_9_21_50`, `ADX` 가 모두 trend, `allowsSameDimensionPair` 명시 X. **R1 위반 가능**.
- **R2**: standalone backtest 측정 가능 — 통과 가능 단 alpha 검증 결과 **확인 필요**.
- **R3**: backtest 가 standalone signal 발행 시 위반.

## 5. 권고 우선순위

| 항목 | P | 영향 |
|---|---|---|
| `15m → 1h` fallback 명확화 (A1) | **P1** | TF 정합성 |
| Trend strategy R1/R3 검증 (TS1) | **P1** | 헌장 통과 |
| Wave Alignment opposing 0.30 → 0.50 (W2) | P2 | 과도 차감 회피 |
| SHORT wave mirror (W3) | P2 | SHORT alpha 측정 |
| TF-별 slope 임계 (T3) | P1 | 1d false positive |
| `hasBullishStructure` Williams fractal (TS2) | P2 | 정확도 |
| swing lookback TF-별 (T5) | P2 | side 결정 정확도 |
