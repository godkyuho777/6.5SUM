# 09 — Charter Cross-Check (5 Rules)

## 0. Charter 5-rule 요약

`src/charter/charter.ts` 정의:

- **DIMENSIONS** (7): momentum / volatility / trend / volume / structure / macro / onchain
- **R1 (R1_DIMENSION_DUPLICATE)**: 같은 차원 동일 각도 중복 금지. `allowsSameDimensionPair` 명시 시 예외.
- **R2 (R2_BACKTEST_ALPHA)**: 신규 지표 = Wilson 95% CI vs baseline + ≥100 signals + 365d window 입증.
- **R3 (R3_NO_STANDALONE_SIGNAL)**: 비-BBDX 차원은 multiplier-only.
- **CAPITAL_LIMITS**:
  - perTradeMaxRisk: 1%
  - positionMax: 5%
  - dailyLossLimit: 3% (24h re-entry block)
  - dryRunDays: 30 (live bot 최소)
  - circuitBreakerPauseMs: 30 min (triple-axis trigger)

## 1. R1 — Dimension Duplicate Cross-Check

### 1.1 차원별 indicator 등록 (`charter/dimension-mapping.ts`)

| 차원 | 등록 indicator | 같은 차원 다른 angle |
|---|---|---|
| 1 momentum | RSI, MACD_histogram, ROC | RSI ↔ MACD allowsSameDimensionPair ✓ |
| 2 volatility | BB, ATR (sec: trend), BB_width | 단일 |
| 3 trend | ADX, DI+/-, EMA_Ribbon, EMA, EMA_9_21_50 | **5중** — pair exception 미명시 |
| 4 volume | Vol_zscore, OBV, CVD, VWAP, Volume_Profile | **5중** — pair exception 미명시 |
| 5 structure | Fibonacci, Trendline, Order_Block, Liquidity_Pool, Wave_Tracker, Candle_Pattern | **6중** — pair exception 미명시 |
| 6 macro | DXY, SOFR-IORB, Fear&Greed, BTC_dominance, Macro_Liquidity | **5중** — pair exception 미명시 |
| 7 onchain | Exchange_Netflow, Whale_Alert, Stablecoin_Supply, Coinbase_Premium, ETF_Flow, Miner_Outflow, LTH_Supply | **7중** — pair exception 미명시 |

### 1.2 Additional modifier (`ADDITIONAL_MODIFIER_DIMENSIONS`)

- macdDivergence (1) `rule1Exempt: true`
- emaRibbon (3) `rule1Exempt: true`
- cvdDivergence (4) `rule1Exempt: true`
- orderBlock (5) `rule1Exempt: true`
- fundingExtreme (6) `rule1Exempt: true`
- marketBreadth (6) `rule1Exempt: true`
- waveAlignment (5) `rule1Exempt: true`

### 1.3 위반 가능 case

#### V1. 동일 차원 indicator 5+개 등록은 **R1 의미** (P2)
- 차원 3, 4, 5, 6, 7 모두 5+ indicator 등록.
- `validateAgainstCharter` 의 R1 체크 (`validator.ts:92-129`):
  - `indicators.length <= 1` 통과 (구체 strategy 의 *사용된* indicator 만 검사)
  - allowed-pair 외 offending count > 1 → 위반.
- 결과: registry 에 등록은 자유, 단 *strategy 가 같은 차원 2+ indicator 사용* 시 위반.

#### V2. BBDX strategy 의 indicator set (P1)
- BBDX 는 RSI (1) + BB (2) + ADX (3) + Pattern (5) + Fib (5).
- 5차원: Pattern + Fib *2중*. `Candle_Pattern` 과 `Fibonacci` 모두 structure 차원, `allowsSameDimensionPair` 미명시.
- **R1 위반 가능** — `validateAgainstCharter` 호출 시 critical violation.
- 단 `Candle_Pattern` 은 진입 신호 보강용 (PTN path), `Fibonacci` 는 EXIT-A target — 측정 각도 다름. registry 에 `allowsSameDimensionPair: ["Fibonacci", "Trendline"]` 추가 필요.

#### V3. EXIT-B 의 4 indicator 가 모두 동일 차원에 가까움 (P1)
- B1: +DI/-DI cross (3 trend)
- B2: ADX (3 trend)
- B3: bearishPattern (5 structure)
- B4: trendline (5 structure, 현재 wired X)
- B5: MACD divergence (1 momentum)
- 3 trend (2개) + 5 structure (2개) + 1 momentum (1개)
- trend `+DI/-DI` 와 `ADX` 는 같은 indicator family (실제로는 `calculateADX` 가 둘 다 산출) — 굳이 분리 indicator 로 봐야 하는지 모호.
- 단 *B1+B2 결합이 single trend signal* 이라고 보면 R1 통과.

### 1.4 권고

- BBDX strategy 의 indicator set 를 `validateAgainstCharter` 에 반드시 인지시켜 — `assertSevenDimensions` 호출 시점 명시 (현재 `signals/charter-assertion.ts` 가 export 만, 호출 위치 **확인 필요**).
- `Candle_Pattern` ↔ `Fibonacci` allowedPair 명시 (둘 다 structure but 다른 각도).

---

## 2. R2 — Backtest Alpha Cross-Check

### 2.1 통과 항목

- BBDX LONG core: backtest `bbdx` strategy 로 측정 가능 (`STANDARD_CALIBRATION_PARAMS:243-306` 7 param).

### 2.2 위반 가능 항목

| 항목 | calibration param 존재 | 측정 wiring | R2 통과 |
|---|---|---|---|
| BBDX LONG `decideEntry` | ✓ (7개) | ✓ | ✓ |
| BBDX SHORT `decideShortEntry` | ✗ | ✗ | **✗ 위반** |
| EMA Ribbon mult | ✓ (`emaRibbonMult`) | backtest meta 추적, *signalStrength 영향 0* | △ (측정만, 효과 0) |
| MACD Divergence mult | ✓ (`macdDivergenceMult`) | 동일 △ | △ |
| Order Block mult | ✗ | meta 만 | ✗ |
| Funding Extreme mult | ✗ | ✗ | ✗ |
| Market Breadth mult | ✗ | ✗ | ✗ |
| CVD Divergence | stub only | n/a | n/a |
| Onchain 7 modifier (각 분리) | ✗ (`modifiersProduct` 만 있음) | n/a | ✗ |
| Macro Liquidity mult | ✗ | ✗ | ✗ |
| Wave Alignment mult | ✗ | ✗ | ✗ |
| VWAP standalone | backtest strategy ✓ | ✓ | ✓ |
| Fibonacci standalone | backtest strategy ✓ | ✓ | ✓ |
| Trend standalone | backtest strategy ✓ | ✓ | ✓ |

### 2.3 결론

**R2 위반 12 항목** 중:
- SHORT path: 가장 심각 (live 진입 가능, alpha 0건)
- 9 modifier alpha 분리 측정 부재 (modifiers + onchain modifier 7 + macro + wave)
- Phase 3 calibration 의 의도 (`runStandardCalibration` 결과 → 임계 채택) 가 *부분만 작동*.

### 2.4 즉시 시정안

- `STANDARD_CALIBRATION_PARAMS` 에 12 param 추가.
- backtest 의 `BacktestTrade` 에 modifier 별 mult 필드 + 그 값을 사용한 `adjustedConfidence` 의 outcome 측정 (`signalStrength × modifiersProduct >= threshold` 진입 조건 추가) — 현재 `adjustedConfidence` 는 메타만, 진입 조건 영향 X.
- SHORT path 의 backtest strategy 신규.

---

## 3. R3 — No Standalone Signal Cross-Check

### 3.1 BBDX 자체 (기준점)

- `decideEntry`, `decideShortEntry` — BBDX 의 *기준 signal*. R3 적용 X (BBDX 가 *기준*).

### 3.2 6 Additional Modifier

- 모두 `multiplier` 반환 (`ModifierResult.multiplier`).
- standalone signal 발행 X — **통과** ✓.

### 3.3 7 Onchain Modifier

- 모두 `OnchainModifierResult.value` 반환 (-0.25 ~ +0.20).
- `applyOnchainToEntry` 가 BBDX signal 받아서 multiplier 적용 — **통과** ✓.
- 단 `regime-gates.ts` 의 strong_distribution 차단은 *standalone block* — block 은 multiplier 와 다름. 자본 보호 관점이라 R3 위반 아님 (capital limits 카테고리).

### 3.4 ★ Standalone Strategy 3개 (P1)

- `backtest/strategies/vwap.ts` — standalone signal 발행
- `backtest/strategies/fibonacci.ts` — standalone signal 발행
- `backtest/strategies/trend.ts` — standalone signal 발행

각각 `BacktestStrategy.shouldEnter` 가 `EntryEvaluation { entry: true }` 반환 — *진입 결정*.

#### 위반 여부

- **backtest 환경 만이면 OK** — 비교 baseline 측정 도구로서. spec 의 R3 는 production live 환경 한정 의도일 가능성.
- **live signal 발행 시 위반** — `routers.ts` 가 standalone strategy 결과를 *진입 권고로 발행* 하면 violation.

#### 확인 필요

- `routers.ts` grep 결과 `getStrategy("vwap")`, `getStrategy("fibonacci")`, `getStrategy("trend")` 호출 위치 — 단 grep 결과 (앞서 수행) 에서 standalone strategy 의 live 발행 흔적 미확인.

### 3.5 ★ Wave Sentiment & Matrix prediction (P1)

- `wave-matrix.ts:derivePrediction:194-223` — 5가지 `predictionKo` 메시지:
  - "강한 상승 일치. 추세 추종 진입 + 익절 계획 필수." (강한 bullish)
  - "약한 상승 편향. 확정 캔들 대기 권장." (약한 bullish)
  - "강한 하락 일치. 역추세 롱 자제. 분할 매수 검토." (강한 bearish)
  - 등.

- 메시지 톤 *진입 권고* — 사용자 측 인지로 *standalone signal* 처럼 작동 가능.
- multiplier 미통합 → BBDX final_confidence 영향 0.

#### 위반 여부

- **R3 위반 가능** — UI 가 진입 권고로 표시 시.
- 단 spec 의 의도가 advisory only 이고 사용자 책임 인지에 의존하면 통과.

### 3.6 권고

- `routers.ts` 의 standalone strategy live 발행 코드 검증.
- `predictionKo` 메시지 톤 → "환경 분류" (예: "강한 상승 환경 — BBDX confluence 시 진입 검토").

---

## 4. Capital Limits Cross-Check

### 4.1 perTradeMaxRisk = 1%

- `charter/limits.ts:23-34` `checkPerTradeRisk` 함수 정의.
- 호출 위치 — `decideEntry` 내부에 *없음* (코드 grep 결과). 별도 layer 에서 호출 **확인 필요**.
- 위반 여부: 함수 호출 안 되면 *checking 자체 부재* → 자본 보호 헌장 강제력 없음.

### 4.2 positionMax = 5%

- `checkPositionSize` — 동일하게 호출 위치 미확인.

### 4.3 dailyLossLimit = 3%

- `checkDailyLoss` — 호출 위치 미확인.
- 24h re-entry block 메커니즘 — `decideEntry` 의 early-return wiring 명시 없음.

### 4.4 dryRunGate = 30 days

- `checkDryRunGate` — 활성 bot 환경 한정. 사용자 환경에서 manual signal tracking 만이면 적용 X.

### 4.5 circuitBreakerPauseMs = 30 min

- triple-axis trigger 정의 spec **확인 필요**.
- 호출 코드 미확인.

### 4.6 ★ 결론 (P1)

- **5개 capital limit 모두 함수 정의는 있고 호출 위치 미확인** — 자본 보호 헌장이 *코드 수준에서 강제 안 될 수 있음*.
- 권고: `decideEntry`, `decideShortEntry` 시작에서 4개 check 호출 (perTradeRisk, positionSize, dailyLoss, circuitBreaker). 위반 시 early-return null + `RiskCheck.reason` 으로 사유 표시.

---

## 5. 종합 Risk Matrix

| 헌장 항목 | 통과 | 위반 가능 | 위반 명확 |
|---|---|---|---|
| R1 (Dimension Duplicate) | onchain 7 modifier | BBDX strategy Pattern+Fib (5차원 2중) | none |
| R2 (Backtest Alpha) | BBDX LONG core | 9 modifier 분리, BBDX SHORT, Wave/Macro/Sentiment | BBDX SHORT (live 가능, alpha 0건) |
| R3 (No Standalone) | 6 additional + 7 onchain | Wave Sentiment prediction | Standalone strategy live 발행 시 |
| Capital limits | none | 5 check 모두 호출 위치 미확인 | dailyLossLimit 미통합 시 |

## 6. 권고 우선순위

| 항목 | P | 영향 |
|---|---|---|
| BBDX SHORT alpha 측정 (R2) | **P1** | 위반 명확 |
| Capital limit 5 check 호출 wiring | **P1** | 자본 보호 강제력 |
| Standalone strategy live 발행 검증 (R3) | **P1** | 위반 가능 → 시정 |
| Wave Sentiment prediction 톤 조정 (R3) | P1 | 사용자 인지 |
| 9 modifier alpha calibration (R2) | P1 | 위반 가능 → 측정 통과 |
| BBDX strategy Pattern+Fib R1 등록 (allowedPair) | P2 | R1 형식 통과 |
| `runStandardCalibration` 결과 CI/PR 자동 출력 | P2 | R2 운영 |
