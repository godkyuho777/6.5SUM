# 01 — BBDX-PATTERN v6.5 Audit

## 1. LONG `decideEntry` — `indicators.ts:1171-1225`

### 1.1 현재 임계값 (그대로 인용)

```ts
// indicators.ts:1159-1164
const NUM_RSI_LOW = 25;
const NUM_RSI_HIGH = 38;
const NUM_BB_TOLERANCE = 0.02;
const NUM_ADX_MAX = 20;
const PTN_BB_TOLERANCE = 0.05;
const PTN_ADX_MAX = 25;
```

3-path 우선순위:
- BB path (`bbStructure != null`) — `lowerBounce | squeezeBreakout | middleSupport | upperRiding`
- PTN path — `bullishPatterns.length > 0 && price ≤ bbLower×1.05 && adx < 25`
- NUM path — `25 ≤ rsi ≤ 38 && price ≤ bbLower×1.02 && adx < 20`

### 1.2 단점

#### D1. NUM path RSI 폭이 비대칭 (P2)
- `[25, 38]` 폭 13 — 하한이 25 로 매우 낮음.
- 일반 mean-reversion 25~30 영역은 **falling knife** 환경 비율이 높음. `isFallingKnife` 차단이 있긴 하지만 `-DI > +DI && adx > 25` 조건 — adx<20 인 NUM path 와 *서로 작동 영역이 겹치지 않을* 가능성.
- 결과: RSI 25~28 영역 진입은 거의 무필터 — 과매도 더 깊어지는 case false positive 발생 가능.

#### D2. PTN path 가 NUM path 보다 ADX 한도 더 너그러움 (P2)
- PTN ADX < 25, NUM ADX < 20.
- 의도: 패턴이 강할 때 ADX 약간 더 허용.
- 단점: 패턴이 형성된 ADX 20~25 영역은 추세 이동 *시작 직후* — bullish 패턴이라도 false positive 큼 (예: 일시 반등 후 추세 재개).

#### D3. PTN path BB tolerance 1.05 (5%) — 너무 넓음 (P2)
- BB 하단 ×1.05 면 정상 변동성 코인의 BB 폭 자체를 거의 다 포함.
- spec PR-1 의 `lowerBounce` 가 0.98 (-2%) 인 것과 정합성 깨짐 (BB path 더 엄격, PTN path 더 헐거움 — backwards).

#### D4. NUM path 에 패턴 confluence 검증 없음 (P1)
- BB path 는 `bbStructure` 가 패턴 컨텍스트 일부 포함, PTN path 는 패턴 자체.
- NUM path 는 **순수 RSI+BB+ADX numeric** 만으로 진입 — 헌장 R1 의 "구조" 차원 (5) 커버 부재.
- BBDX 가 PTN/BB/NUM 우선순위로 fallback 하는 구조라 NUM 이 가장 흔하게 발생할 텐데, 5차원 구조 컨버리지 0 → R1 위반 가능 (`charter-assertion` 통과 여부 **확인 필요**).

#### D5. `decideEntry` 와 backtest `bbdx` strategy 의 임계값 불일치 (P1)
- `decideEntry` (live): RSI 25~38 + BB×1.02 + ADX<20 + bbStructure | bullishPatterns
- `backtest/strategies/bbdx.ts:isEntrySignal`: RSI **30~35** + BB×1.02 + ADX≤30 (default config in `isEntrySignal`)
- 두 임계가 다름 — backtest 결과를 live 의 임계 정당화로 쓸 수 없음 (헌장 R2 위반 가능).
- **확인 필요**: 두 코드 경로가 의도적인지, 또는 live 가 v6.5 임계로 업데이트되었지만 backtest 가 v6.1 잔재인지.

### 1.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| NUM_RSI_LOW | 25 | **28** | RSI 25~28 영역 false positive 비율 높음. backtest calibration `STANDARD_CALIBRATION_PARAMS.rsi.edges` 가 28을 첫 boundary 로 두는 것과 정합. |
| NUM_RSI_HIGH | 38 | **35** | 35 초과는 mean-reversion 시그널 약함. backtest `currentThreshold:35` 와 정합. |
| NUM path 패턴 게이트 | 없음 | `aggregatePatternScore(bullishPatterns) ≥ 0.20` (소프트) | 5차원 구조 커버 + R1 통과. backtest `bbdx.ts:Gate 3 ≥0.4` 보다 약하게 — NUM 은 RSI+BB 가 이미 강한 신호이므로. |
| PTN_BB_TOLERANCE | 0.05 | **0.03** | BB ×1.05 는 너무 헐거움. spec `lowerBounce 0.98` 와 정합 회복. |
| PTN_ADX_MAX | 25 | **22** | NUM 과의 격차 (5) 를 (2) 로 좁힘. PTN 도 mean-reversion 환경. |
| live↔backtest 임계 동기화 | 불일치 | live `decideEntry` 임계 → backtest config 로 reflect | R2 신뢰성 회복 |

### 1.4 수익률 영향 가설

- D1+D3 개선 → **falsePositiveRate ↓ 5~8%**, **winRate ↑ 2~4%p**, **Sharpe ↑ 0.10~0.15**.
- D4 (NUM 게이트 추가) → 신호 빈도 ↓ 30%, **expectancy ↑** (낮은 빈도 + 높은 hit rate).
- D5 동기화 → backtest 신뢰성 회복, R2 통과 가능.

### 1.5 헌장 검증

- **R1**: NUM path 는 5차원 구조 커버 0 → 위반 가능. 개선안 D4 (소프트 패턴 게이트) 적용 시 통과.
- **R2**: live 와 backtest 임계 불일치 → 알파 입증 의문. 동기화 필수.
- **R3**: BBDX 자체는 standalone signal 의 *기준점* — 통과.

---

## 2. SHORT `decideShortEntry` — `indicators.ts:1068-1122`

### 2.1 현재 임계값

```ts
// indicators.ts:1049-1054
const SHORT_NUM_RSI_LOW = 62;
const SHORT_NUM_RSI_HIGH = 75;
const SHORT_NUM_BB_TOLERANCE = 0.02;
const SHORT_NUM_ADX_MAX = 20;
const SHORT_PTN_BB_TOLERANCE = 0.05;
const SHORT_PTN_ADX_MAX = 25;
```

LONG 의 정확한 미러: RSI [62, 75], BB upper × (1 - 0.02), ADX < 20 (NUM) / 25 (PTN).

### 2.2 단점

#### S1. RSI 비대칭 미러 (P2)
- LONG: [25, 38] (폭 13, 중앙 31.5)
- SHORT: [62, 75] (폭 13, 중앙 68.5)
- 100 - 31.5 = 68.5 — 정확히 미러됨 ✓
- BUT: 암호화폐 시장의 long-short asymmetry (e.g. Hong & Stein 1999, Frazzini & Lamont 2006 cross-asset): 상승 동력이 하락 동력보다 더 강하므로 *대칭 임계는 SHORT 알파를 underestimate*. RSI 75+ 영역은 LONG RSI 25- 영역보다 더 짧고 격렬 — 대칭 임계는 SHORT 신호 빈도를 낮춤.

#### S2. SHORT path 백테스트 알파 측정 0건 (P1, R2 위반)
- `backtest/strategies/bbdx.ts` 는 LONG only.
- SHORT path 가 `decideShortEntry` 로 live 환경에서 발행 가능하지만 (라우터 wiring **확인 필요**), **백테스트 winRate / Sharpe / MDD 측정값이 없음**.
- 헌장 R2: "신규 지표는 ≥100 signals 365d 알파 입증 필수" → SHORT path 는 명시 위반.

#### S3. `isRisingKnife` 차단 누락 (P1)
- LONG 의 `isFallingKnife` 는 호출 측 (live router) 이 미리 차단.
- SHORT 의 `isRisingKnife` 함수 (`indicators.ts:954-960`) 는 정의되어 있으나, **`decideShortEntry` 내부에서 호출 X**, JSDoc 만 "호출 측에서 차단해야 함" 이라 표기 — 실제 라우터 호출 코드 **확인 필요**.
- 결과: live 환경에서 강한 상승 추세 (`+DI > -DI && ADX > 25`) 중 SHORT 진입 가능 — 자본 보호 헌장 위배 위험.

#### S4. SHORT 자본 보호 차단 (`applyOnchainShortToEntry`) 의 비대칭 (P2)
- LONG: `strong_distribution + 평균회귀(non-Riding)` → 차단
- SHORT: `strong_accumulation + 평균회귀(non-lowerRiding)` → 차단
- **누락된 비대칭**: macro `crisis` regime 은 LONG 만 차단 (`regime-gates.ts:55-62`). SHORT 는 crisis 환경에서 오히려 favored 일 수 있어 이 비대칭은 OK. **단**, SHORT 도 macro `flooded` 환경에서 차단해야 균형 — *현재 미구현*.

### 2.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| SHORT_NUM_RSI_LOW | 62 | **65** | 비대칭 미러 회복 — 65~75 폭 10. RSI 65 미만은 SHORT entry 로 너무 약함. |
| SHORT_NUM_RSI_HIGH | 75 | **75** | 유지 (75 초과는 너무 short 진입 후 더 오를 risk). |
| `isRisingKnife` 게이트 | 호출 측 책임 | **`decideShortEntry` 내부에 명시적 호출** | 자본 보호 안전화. 위반 비용 너무 큼. |
| SHORT 백테스트 strategy | 없음 | `backtest/strategies/bbdx-short.ts` 신규 + `runStandardCalibration` SHORT 변형 추가 | R2 통과 |
| Macro flooded → SHORT 차단 | 없음 | `regime-gates.ts` 에 미러 추가 | 비대칭 보호 |

### 2.4 수익률 영향 가설

- S1 개선 → SHORT 빈도 ↓ 25%, **winRate ↑ 3~5%p**, **expectancy ↑**.
- S2 (alpha 측정 도입) — 직접 영향 없으나 R2 통과로 production 가능.
- S3 (rising knife 차단) → **MDD ↓ 1~2%** (강한 상승 중 SHORT 손실 피함).
- S4 → 균형 잡힌 비대칭, 양방향 자본 보호.

### 2.5 헌장 검증

- **R1**: LONG 미러라 차원 커버는 동일 — NUM path D4 와 동일한 5차원 누락 위험.
- **R2**: **위반** — 알파 측정 0건. 즉시 시정 필요.
- **R3**: BBDX 자체 standalone — 통과.
- **Capital protection**: `isRisingKnife` 미통합으로 *간접 위반 가능*.

---

## 3. EXIT v6.3 (`exits/*.ts` + `decideExit`)

### 3.1 현재 룰

- 우선순위: **STOP > B (Reversal) > A (Profit) > C (Protect) > D (Time)** (`exits/index.ts:9`)
- **EXIT-A** (profit-target.ts):
  - Tier 1: `price ≥ bbMiddle && !tier1Already` → 50% partial
  - Tier 2: `price ≥ fib100` → 30% partial
  - Tier 3: `price ≥ fib161_8` → full
- **EXIT-B** (reversal.ts) 5-component (B1~B5):
  - B1: -DI > +DI cross → 0..0.40
  - B2: ADX>25 + -DI>+DI → 0..0.30
  - B3: bearishPattern strength ≥ 0.6 → 0..0.20
  - B4: trendline broken → 0.30 / confirmed_break → 0.15 (현재 wired 안됨)
  - B5: macd bearish divergence → 0.20 (현재 wired 안됨)
  - boost: macroRegime crisis +0.20 / tight +0.10 / flooded -0.10
  - boost: onchainRegime strong_distribution +0.20 / distribution +0.10 / strong_accumulation 곱 ×0.8 (when score<0.7)
  - threshold: ≥0.50 full / ≥0.30 partial 50%
- **EXIT-C** (protection.ts):
  - C1: PnL≥+2% & !movedToBE → stop=entry
  - C2: PnL≥+5% → stop=price×0.97
  - C3: PnL≥+3% & atr>0 → stop=price-1.5×atr
- **EXIT-D** (time-stop.ts):
  - D1: 30 bars + PnL<+0.5% → full
  - D2: 50 bars + PnL<+1.0% → full

### 3.2 단점

#### E1. `legacyV61Triggers` shadow logic (P1)
- `exits/index.ts:43-59` 가 v6.1 의 `bbMiddle / rsi65 / adx30 / plusDi25` 4-trigger 를 매번 **재계산**해서 ExitDecision 의 `triggers / conditionsMet / relaxedToBearish` 필드를 채움.
- 이 데이터는 *FE 호환성* 용이라 주석 (`exits/index.ts:30-34`).
- 위험: `relaxedToBearish = bearishPresent && triggers.length < 3` 가 v6.1 임계 (adx ≥ 30 등) 로 계산되는데 v6.3 reversal score 의 결정과 *모순* 될 수 있음. UI 가 어떤 걸 표시하느냐에 따라 사용자 혼란 → exit 결정 인지 부조화.
- **확인 필요**: FE 가 진짜로 legacy 4-trigger 를 표시하는지, 아니면 reversalScore 만 표시하는지.

#### E2. EXIT-B B4/B5 wiring 부재 (P1, R2 영향)
- `reversal.ts:108-123` 가 `trendlineBreak`, `macdDivergence` 컴포넌트를 정의하지만 input 이 매번 0 (호출 측에서 채우지 않음).
- **결과**: spec 의 5-component score 가 사실상 3-component (B1+B2+B3, max 0.40+0.30+0.20=0.90) — 임계 0.50 통과 더 어려움.
- 현재 onchain `+0.20` boost 등 외부 가산이 *상대적으로 너무 큰 weight* 를 가짐.

#### E3. EXIT-A Tier 1 의 단일 조건 (P2)
- `bbMiddle` 도달 → 무조건 50% partial.
- BB middle 은 평균회귀의 자연스러운 첫 저항 — 정상.
- **단점**: trend continuation 환경 (BB upper riding 진행 중) 에서도 BB middle 도달 시 50% 청산 → trend 추종 path 의 알파 잘라먹음.
- 개선: `bbStructure === 'upperRiding'` 이거나 `waveAlignment === 'perfect_up'` 일 때 Tier 1 비율 25% 또는 면제.

#### E4. EXIT-C C2 (5% 트레일링) 와 C3 (ATR 트레일링) 동시 발사 가능 (P3)
- `protection.ts:60-77` 에서 `unrealizedPct ≥ 0.05` 면 C2, `≥ 0.03` 면 C3 — *5% 도달 시 두 layer 가 같이 작동*.
- "highest stop wins" 라 안전하지만, 로깅/UI 에서 어느 layer 가 작동했는지 모호 — `layer` 필드가 마지막 if 만 기록.

#### E5. EXIT-D 30 bars / 50 bars hard threshold (P2)
- TF independent.
- 4h × 30 = 5일, 1d × 30 = 30일. **의도가 시간단위 일관성인지 캔들갯수 일관성인지 모호**.
- spec 주석에 "B.2 variability-aware time stop... B.1 keep static". 단계적 진화 인정.
- 단점: 변동성 환경에서 30 bars 가 너무 길거나 너무 짧을 수 있음.

#### E6. Onchain `strong_accumulation` damp 의 곱셈 vs 가산 비대칭 (P2)
- 다른 onchain regime: 가산 (+0.20 / +0.10).
- strong_accumulation: 곱셈 ×0.8 (when score<0.7).
- 비대칭은 spec 의도이지만, 곱셈은 점수 0 일 때 영향 0, 가산은 *항상* 영향 — 시그널 강도가 약할 때 가산이 곱셈보다 훨씬 큰 영향. EXIT 결정 안정성 ↓.

### 3.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| `legacyV61Triggers` 표면화 | shadow logic | FE 가 사용 안 하면 제거, 사용하면 v6.3 reversal breakdown 으로 표현 일원화 | E1 — 인지 부조화 제거 |
| B4 trendline wiring | 0 (input 없음) | `decideExitForScanner` 가 indicator.trendlines 를 inspect 후 input 제공 | spec 명시 |
| B5 MACD wiring | 0 (input 없음) | `decideExitForScanner` 가 `detectMacdDivergence` 결과 활용 | EXIT-B 의 5-component 복원 |
| EXIT-A Tier 1 trend 면제 | 무조건 | `bbStructure==='upperRiding' \|\| waveAlignment==='perfect_up'` 시 면제 또는 25% | E3 |
| EXIT-D adaptive | 30/50 hard | `30 × (1 + (atr/avgAtr - 1) × 0.5)` 식의 ATR 적응 | E5 |
| strong_accumulation 가산화 | ×0.8 곱셈 | `-0.05` 가산 (저영향, 일관) | E6 — 다른 regime 들과 동일 형태 |

### 3.4 수익률 영향 가설

- E1 → 사용자 인지 일관성 (UX). 알파 직접 영향 없음.
- E2 (B4/B5 wiring) → EXIT-B 가 0.50 임계를 정상적으로 통과 — **MDD ↓ 1~3%** (조기 reversal 인지).
- E3 (Tier 1 trend 면제) → trend path 의 **expectancy ↑ 5~10%**.
- E4 → UX 만.
- E5 → 변동성 환경 적응 — **Sharpe ↑** (변동성 큰 코인 ↑, 작은 코인 ↓ — 평균 ↑ 추정).
- E6 → 안정성 (winRate 변화 미미).

### 3.5 헌장 검증

- **R1**: EXIT-B B1+B2+B5 가 모두 momentum 차원 — `MACD_histogram` allowsSameDimensionPair RSI 만 명시. B5 가 standalone 쓰이면 R1 검증 필요.
- **R2**: B4/B5 미통합 상태로 production 운영 시 **measure-without-effect**. 스펙 알파 측정 못함.
- **R3**: `decideExit` 자체가 BBDX 의 일부 — 통과.
- **Capital protection**: STOP 우선순위 보존 ✓, dailyLossLimit 통합 **확인 필요** (`exits/*.ts` 어디에서도 dailyLoss 검증 안 함 — 별도 layer 인지 미확인).

---

## 4. Falling/Rising Knife — `indicators.ts:938-960`

### 4.1 현재 룰

```ts
isFallingKnife: minusDi > plusDi && adx > 25
isRisingKnife:  plusDi > minusDi && adx > 25
```

### 4.2 단점

#### K1. `isFallingKnife` 와 `decideEntry` 가 *별도 호출* — 통합 위치 모호 (P1)
- `decideEntry` 는 falling knife 검사 안 함 — 호출 측 (router/scanner) 책임.
- backtest `bbdx.ts:Gate 2` 는 inline check (`indicators.minusDi > indicators.plusDi && indicators.adx > 25`) — `isFallingKnife` 함수 *호출 안 함*.
- 결과: 룰이 두 곳에 *복제*. 향후 임계값 변경 시 한쪽만 변경 위험.

#### K2. 임계값 hard-code 25 (P3)
- ADX 25 는 trend strength 의 일반 마지노선이지만 코인별 / TF 별 차이 큼.
- BTC 4h 의 25 와 SHIB 1h 의 25 는 다른 의미.

### 4.3 개선안

- K1: `decideEntry` 내부에 `if (isFallingKnife(...)) return null` 명시. backtest 도 헬퍼 호출로 통일.
- K2: `adxThreshold` 를 `BacktestConfig` / per-symbol-tier 로 외출 (예: btc 25, major_alt 22, small_alt 20).

### 4.4 헌장 검증

- 자본 보호 게이트 — 통과. 단 K1 의 통합 누락이 위반 가능 (자본 보호 룰이 호출 측 책임이라면 *간접 위반*).
