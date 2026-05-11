# 03 — Additional Strategies Modifier Audit (6개 modifier)

## 0. 개요

`src/modifiers/` 의 6개 modifier 는 *03_ADDITIONAL_STRATEGIES.md* 명세를 구현. 모두 `multiplier` 형태의 결과 (`ModifierResult` interface, `types.ts:24-40`) 만 반환 — 헌장 규칙 3 준수.

차원 매핑 (`charter/dimension-mapping.ts:111-130` `ADDITIONAL_MODIFIER_DIMENSIONS`):

| Modifier | 차원 | rule1Exempt | beta |
|---|---|---|---|
| macdDivergence | 1 momentum | true | false |
| emaRibbon | 3 trend | true | false |
| cvdDivergence | 4 volume | true | **true** (stub only) |
| orderBlock | 5 structure | true | **true** |
| fundingExtreme | 6 macro | true | false |
| marketBreadth | 6 macro | true | false |
| waveAlignment | 5 structure | true | false |

## 1. EMA Ribbon — `modifiers/ema-ribbon.ts`

### 1.1 현재 룰 (`scoreToMultiplier` `:75-81`)

| Score | Multiplier |
|---|---|
| > +30 | 1.15 |
| 0~+30 | 1.05 |
| -30~0 | 1.00 |
| -60~-30 | 0.80 |
| < -60 | **0.30** |

Score 산출 (`computePartialScore`): EMA9>21, 21>50, 50>100, 100>200 각 +15 / 역방향 -15. Perfect bull (+expansion>0) → 90, perfect bear → -90.

### 1.2 단점

#### R1. 0.30 multiplier 의 미세 의미 (P1)
- `< -60` (perfect bear + expansion>0) 시 LONG mult 0.30 — *거의 차단 수준*.
- BBDX 의 `isFallingKnife` (-DI>+DI && ADX>25) 와 의미 중복 위험. `isFallingKnife` 는 binary 차단, 본 modifier 는 0.30 가산 — 같은 환경에서 **이중 차감**.
- 헌장 R1 (dimension duplicate): EMA Ribbon 은 trend (3차원), Falling Knife 도 trend. `rule1Exempt: true` 명시되어 있지만 *실효 측정 각도 차이* 입증 필요 (현재 측정값 0건).

#### R2. expansion 5-candle 윈도우 (P3)
- `expansion = (widthNow - widthBefore) / |widthBefore|` (`ema-ribbon.ts:142-146`).
- 5 캔들 고정 윈도우는 TF 무관 — 1h 5캔들 (5h) 와 1d 5캔들 (5일) 은 의미 차이 큼.

#### R3. 데이터 부족 (`< 50 candles`) 시 multiplier 1.0 + status='stub' (P2)
- 합리적이지만, Multi-TF Trend Engine 이 `< 50` 에서 `SIDEWAYS` 처리하는 것과 *다른 fallback 정책* — 일관성 부재.

### 1.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| Falling Knife mult | 0.30 | **0.50** | binary 차단은 `isFallingKnife` 가 담당. 본 modifier 는 *연속 가산* 만. |
| expansion 윈도우 | 5 candles | TF 별 (1h:24, 4h:6, 1d:3, 1w:2) | TF independent 의미 |
| 알파 측정 | 0건 | calibration param 으로 emaRibbon mult 추가 (이미 `STANDARD_CALIBRATION_PARAMS` 에 있음, 사용 흔적 미확인) | R2 통과 |

### 1.4 영향 가설

- R1 개선 → `isFallingKnife` 와 중복 환경에서 *과도 차감 회복*, **winRate ↑ 1~2%p** (false negative 감소).
- R2 → TF 별 알파 분리 가능.

### 1.5 헌장 검증

- **R1**: trend 차원, ADX 와 동일. `rule1Exempt: true`, but 측정 각도 입증 위해 ADX 와 *상관도 < 0.7* 입증 필요 (현재 미검증).
- **R2**: alpha 측정 0건 — 위반 가능.
- **R3**: multiplier-only ✓.

---

## 2. MACD Divergence — `modifiers/macd-divergence.ts`

### 2.1 현재 룰

```ts
// macd-divergence.ts:143-156
bullish        → 1.0 + strength × 0.20  (max 1.20)
hidden_bullish → 1.0 + strength × 0.10  (max 1.10)
none           → 1.00
hidden_bearish → 1.0 - strength × 0.10  (min 0.90)
bearish        → 1.0 - strength × 0.20  (min 0.80)
```

5-bar fractal swing 탐지 (`findSwingHighs/Lows`). minSwingDistance=10 (default).

### 2.2 단점

#### M1. fractal swing 의 lookahead 안전성 검증 (P1)
- 5-bar fractal 은 i 의 high 가 i±2 보다 strict 큼.
- `findSwingHighs(highs, maxIdx)` 가 `i ≤ maxIdx-2` 까지만 검사 (`macd-divergence.ts:81-93`) — i+2 까지 데이터 필요하므로 **이미 fractal 확정된 swing 만 인정**.
- 정상. lookahead-free.
- 단점 없음, 하지만 *백테스트의 i 시점 결정에서 마지막 2 캔들의 swing 은 미인지* — divergence 검출 지연 (2 캔들).

#### M2. lookback 50 default (`macd-divergence.ts:165-167`) (P2)
- TF 무관 50 캔들. 1h 50캔들 (50시간) vs 1d 50캔들 (50일).
- divergence 의미가 TF 별로 다름.

#### M3. swing 우선순위 로직 결함 (P1)
- `macd-divergence.ts:208-277` 에서 bearish 와 bullish 둘 다 검출되면 *bullishMoreRecent* 또는 *bullStrength > strength* 면 bullish 우선.
- 두 우선순위 조건이 **OR** 결합 — bullish 가 *strength 가 작아도* 더 최근이면 bullish 우선시.
- 결과: 마지막 swing low 가 swing high 보다 *1 캔들이라도* 최근이면 strength 무관 bullish 분류.
- 단점: 시그널 잡음 큼. swing 우선순위는 *strength 비교* 만 사용해야 합리적.

#### M4. histRange 분모 (`macd-divergence.ts:202`) (P3)
- `histRange = Math.max(...hist.map(|h|), 1e-9)` — *전체 히스토리* 의 max abs 사용.
- magnitudeFactor 정규화 분모로 — 시간이 지나면 max abs 가 누적 (히스토리 최대값) 으로 magnitudeFactor 점점 작아짐.
- 권고: lookback 윈도우 내 max abs 만 사용.

### 2.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| swing 우선순위 | bullishMoreRecent OR bullStrength > strength | **strength 만** | M3 — 잡음 감소 |
| lookback default | 50 (TF independent) | TF 별 (1h:60, 4h:50, 1d:30, 1w:20) | M2 |
| histRange | 전체 시리즈 max abs | lookback 윈도우 내 max abs | M4 |

### 2.4 영향 가설

- M3 → divergence 분류 정확도 ↑ — **winRate ↑ 2~3%p** (특히 EXIT-B B5 컴포넌트).

### 2.5 헌장 검증

- **R1**: momentum 차원 (RSI 와 동일). `rule1Exempt: true` + `INDICATOR_REGISTRY` 의 `MACD_histogram.allowsSameDimensionPair: ["RSI"]` ✓.
- **R2**: `STANDARD_CALIBRATION_PARAMS.macdDivergenceMult` 존재. *백테스트 결과 활용 흔적 확인 필요*.
- **R3**: multiplier-only ✓.

---

## 3. CVD Divergence — `modifiers/cvd-divergence.ts`

### 3.1 현재 상태

**전체 stub** — `multiplier=1.0`, `status="stub"`, `betaStub=true` (`cvd-divergence.ts:46-54`). 입력 `symbol`, `candles` 는 `void` (사용 안 함).

### 3.2 단점

#### C1. spec 에 명시된 4 단계 구현 미완 (P3 → 구현 시 P2)
- WebSocket `/v5/public/spot publicTrade` stream 통합 필요.
- 본 작업 범위 외라 명시 — OK. 단 `dimensionsCovered: [4]` 가 BBDX 백테스트 strategy meta 에 들어가면 **데이터 없이도 4차원 covered 로 보고됨** — `assertSevenDimensions` 통과를 거짓으로 만들 위험.

### 3.3 개선안

- C1: 구현 전까지는 charter assertion 에서 `cvdDivergence` 를 indicator 로 *등록 안 함*. 실데이터 활성화 시점에 등록.

### 3.4 헌장 검증

- **R1**: volume 차원, OBV/Vol_z 와 다른 각도 (rule1Exempt). 통과.
- **R2**: 데이터 0건 — 측정 불가, 영향 없음 — 통과 (multiplier=1.0, alpha 영향 0).
- **R3**: multiplier-only ✓.

---

## 4. Order Block — `modifiers/order-block.ts`

### 4.1 현재 룰

- 5-bar fractal swing low/high 탐지 (lookback 20).
- Sell-side liquidity grab: 현재 캔들이 swing low 깬 후 회복 → **multiplier 1.05** (clamp 0.90~1.10)
- Buy-side liquidity grab: 현재 캔들이 swing high 위 wick 후 거부 → **multiplier 0.95** (clamp 0.90~1.10)

### 4.2 단점

#### B1. multiplier 영향 ±0.05 — 무력 (P3)
- spec 의 "베타 — multiplier 작게 (max ±0.05)" 의도 명시.
- 그러나 다른 modifier 들 (EMA Ribbon ±0.20, MACD ±0.20, Funding ±0.20, Breadth ±0.30) 와 비교 시 *측정 노이즈 수준* — alpha 식별 어려움.
- backtest calibration 에서 modifiersProduct 0.50 ~ 1.45 범위 (`STANDARD_CALIBRATION_PARAMS:303`) 인데 OB 는 0.95~1.05 만 기여 → 분리 측정 거의 불가.

#### B2. lookback 20 hardcoded (P3)
- TF independent.

#### B3. piercePct 정규화 (`order-block.ts:107-109`) (P3)
- `piercePct = (swingLow - last.low) / swingLow × 100`
- score = `100 - piercePct × 20` (clamp 0..100). piercePct 5% → score 0.
- 단점: 5% 침투는 매우 큰 wick — 정상 grab 의 경계 (보통 0.5~2%) 와 맞지 않음. score 분포가 한 쪽으로 치우침 (대부분 90~100).

### 4.3 개선안

- B1: 베타 단계 종료 후 ±0.10 으로 확장.
- B2: TF 별 lookback (1h:30, 4h:20, 1d:15, 1w:10).
- B3: `score = 100 - piercePct × 50` 로 민감도 ↑ (분포 균등화).

### 4.4 헌장 검증

- **R1**: structure 차원, Fib/Trendline 과 다른 각도 (rule1Exempt). 통과.
- **R2**: 베타. backtest 알파 측정 시 계측 노이즈에 묻힐 위험 — calibration 결과 신뢰도 낮음.
- **R3**: multiplier-only ✓.

---

## 5. Funding Extreme — `modifiers/funding-extreme.ts`

### 5.1 현재 룰 (`classifyRegime`, `regimeToMultiplier`)

| Rate (8h) | Regime | Multiplier |
|---|---|---|
| > +0.001 (0.1%) | long_extreme | 0.85 |
| > +0.0005 (0.05%) | long_elevated | 0.92 |
| -0.0005 ~ +0.0005 | neutral | 1.00 |
| < -0.0005 | short_elevated | 1.10 |
| < -0.001 | short_extreme | 1.20 |

### 5.2 단점

#### F1. spot-only 코인 stub 처리 (`computeFundingExtreme:118-127`) (P2)
- `category: "linear"` (perp) 만 funding 존재.
- spot-only USDT 페어 (BBDX 일부) 는 stub.
- **단점**: spot-only 코인의 BBDX score 는 funding modifier 영향 0 — spec 의 "macro 차원 커버" 가 *코인 별로 다름*.
- 헌장 R1 검증: `MARKET_BREADTH` 도 6차원 (rule1Exempt). spot-only 코인은 6차원이 *Market Breadth 만으로 covered*. 단 Market Breadth 도 외부 호출 의존 → 둘 다 fail 하면 6차원 누락.

#### F2. 8h funding rate 의 의미 (P2)
- Bybit 의 funding 은 8h 마다 정산. `rate=0.001` 은 *1일 0.3%* (3회 × 0.1%).
- 임계 0.1% 가 *8h 단위* 인지 *연환산* 인지 spec **확인 필요** — 명세서 §8 의 표를 못 봐서 추측.
- 0.1% 가 8h 라면: 하루 0.3%, 연 110% — 매우 극단적. 일반적인 funding 0.01% (8h) 도 long_elevated 미만 → 임계가 너무 높음.
- 0.1% 가 연환산이면: 8h 단위로 0.1%/365×3 = 0.0008% — 임계가 너무 낮음.

#### F3. cache TTL 5min (`funding-extreme.ts:38`) (P3)
- funding 정산 주기 8h 인데 5분 cache — 과한 빈도 호출.
- 권고: TTL = 30min 또는 1h.

### 5.3 개선안

- F1: spot-only 코인은 *대체 macro 지표* 사용 (e.g. F&G 만으로). 또는 `dimensionsCovered` 메타에서 6차원 *부분 커버* 표시.
- F2: 임계 단위 명세 확인 후 reflect.
- F3: TTL 5min → 1h.

### 5.4 헌장 검증

- **R1**: macro 차원, Wave Tracker 와 다른 각도 (rule1Exempt). 통과.
- **R2**: alpha 측정 0건 (calibration param 에 없음). **위반 가능**.
- **R3**: multiplier-only ✓.

---

## 6. Market Breadth — `modifiers/market-breadth.ts` ★★★

### 6.1 현재 룰 (`classifySentiment`, `sentimentToMultiplier`)

| RSI 분포 | Sentiment | Multiplier |
|---|---|---|
| RSI<30 비율 > 0.6 | panic | **1.30** (contrarian, LONG 가산) |
| RSI<30 비율 > 0.3 | fear | 1.10 |
| 그 외 | neutral | 1.00 |
| RSI>70 비율 > 0.3 | greed | 0.90 |
| RSI>70 비율 > 0.5 | euphoria | **0.60** (강한 차감) |

### 6.2 단점 ★ (P1)

#### MB1. **Contrarian 1.30 multiplier 의 위험** (P1)
- Panic 환경 (60%+ 코인 RSI<30) 에서 LONG mult 1.30 — *역행 베팅 가산*.
- "역행 베팅 철학 — 사용자 호불호" 라 주석 명시 (`market-breadth.ts:11-13`).
- **단점**: 알파 미입증 가설. 학술적으로 panic 후 평균회귀가 통계적 우위는 있으나 (Lo 2002 등), **timing risk 큼** — panic 이 길어지면 LONG 진입은 catching falling knife.
- 1.30 은 **strong_accumulation onchain** 과 동일 가산 폭 — 두 modifier 가 *같은 panic 환경에서 동시에 1.30 가산* 시 final mult = 1.30 × 1.30 = **1.69** — single signal 에 대해 60%+ 가산. 위험 spike.
- 헌장 R3 의 "modifier-only" 통과는 하지만, **실용적 자본 보호 위험**.

#### MB2. RSI 분포 % 임계 (0.6, 0.5, 0.3) hardcoded (P2)
- Universe 96 coins 에서 60% (= 58 코인) RSI<30 — 매우 극단적 환경 (10년에 한 번 수준).
- 0.3 (29 코인) 도 자주 발생 안 함.
- 결과: 대부분 시간은 neutral, 가끔 fear/greed — 알파 기여 작음.

#### MB3. 96 universe 가 헌장 R1 검증 미반영 (P2)
- 모든 96 coin 의 RSI 가 같은 값으로 평균화 — *코인별 알파 차이 무시*.
- 메이저 코인의 RSI<30 (BTC) 와 신규 토큰의 RSI<30 (SHIB) 를 동등 가중 — sentiment 정확도 ↓.

#### MB4. EMA(200) 사용했는데 결과에 미반영 (`market-breadth.ts:170-171`) (P3)
- `aboveEMA200Pct` 계산하지만 `classifySentiment` 는 `rsiBelow30Pct` + `rsiAbove70Pct` 만 사용.
- `breakdown` 에는 표시 — 즉 미사용 데이터 fetch.

### 6.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| panic mult | 1.30 | **1.15** | onchain 1.30 와 중복 가산 위험. 1.15 면 contrarian 가설 약하게 표현. |
| euphoria mult | 0.60 | **0.75** | 동일 — 강한 차감은 BBDX 의 `decideEntry` 가 이미 처리 (RSI 38 cap). |
| RSI 임계 | 0.6 / 0.5 / 0.3 | **0.5 / 0.4 / 0.25** | 빈도 ↑ — alpha 측정 가능 신호 ↑ |
| EMA(200) 활용 | 미사용 | sentiment 분류에 `aboveEMA200Pct` 가산 (예: panic + breadth<0.3 → mult 더 낮춤) | MB4 |
| 코인 가중치 | 균등 | 시총 가중 또는 BTC 1.0 / 메이저 0.7 / 알트 0.3 | MB3 |

### 6.4 영향 가설 ★

- MB1 (panic 1.30 → 1.15) → panic 환경 false positive 감소. **MDD ↓ 1~3%** (catching knife 회피), **winRate slight ↑**.
- MB2 (임계 ↓) → modifier 영향 빈도 ↑, alpha 측정 가능.

### 6.5 헌장 검증

- **R1**: macro 차원, Funding/Wave Tracker 와 다른 각도 (rule1Exempt). 통과 — 단 측정 각도 다름 입증 필요.
- **R2**: alpha 측정 0건 (calibration 에 없음). **위반 가능**.
- **R3**: multiplier-only ✓. 단 onchain 과 *복합 mult* 효과는 별도 검증.

---

## 7. **`combineAdditionalModifiers` BBDX 곱셈체인 통합 검증** ★★★ (P1)

### 7.1 현황

`modifiers/index.ts:64-82` 의 `combineAdditionalModifiers` 함수:
```ts
export function combineAdditionalModifiers(decision: {
  emaRibbonMult?: number;
  marketBreadthMult?: number;
  macdDivergenceMult?: number;
  fundingExtremeMult?: number;
  cvdDivergenceMult?: number;
  orderBlockMult?: number;
}): number { /* product */ }
```

주석 (`modifiers/index.ts:51-62`):
> v6.5 머지 후 `src/signals/confidence.ts` (또는 동등 위치) 에서 EntryDecision 의 *Mult 필드를 본 함수로 묶어 곱셈 체인에 합쳐야 함. **(현재 EntryDecision 에 optional 필드만 추가됨, 통합 위치는 후속 커밋)**

### 7.2 grep 결과

`combineAdditionalModifiers` 사용처:
- `modifiers/index.ts:64` (정의)
- 그 외 — **없음**

### 7.3 영향 ★

- **모든 6 modifier 의 multiplier 결과가 final_confidence 에 영향 0** — 측정만 하고 사용 안 함.
- backtest `bbdx.ts:107` 가 `modifiersProduct = emaRibbonMult * macdDivergenceMult * orderBlockMult` 계산 후 `metadata` 에 저장 — *하지만 `signalStrength` 곱셈에 미반영* (params 의 signalStrength 는 base 값만).
- backtest 의 `BacktestTrade.adjustedConfidence = signalStrength × modifiersProduct` 는 계산되지만 (signal-extractor.ts:300-303), **outcome 측정 (win/loss)** 은 `signalStrength` 만 기준 (실제 진입 조건 변화 없음).
- 결과: backtest 알파가 modifier 영향 *0 인 baseline 만 측정* — calibration 결과 신뢰도 의문.

### 7.4 헌장 검증

- **R2 위반 가능**: 6 modifier 의 alpha 검증이 측정조차 안 됨.
- **R3 위반 X**: multiplier 정의는 modifier-only. 단 *효과 0* 이라 운영상 무의미.

### 7.5 즉시 시정안

1. `signals/confidence.ts:computeFinalConfidence` 의 `raw = base × confluence × wave × macro × onchain` 식에 `× combineAdditionalModifiers(decision)` 추가 — modifier 값이 EntryDecision 에 들어와야 함.
2. backtest 의 `signalStrength` 비교를 **기존 baseline 과 modifier 적용 후의 두 측정** 으로 분리 — A/B 알파 비교.
3. 또는 `EntryDecision` 인터페이스에 `*Mult` 필드 추가 + `decideEntry` 가 modifier 호출 (현재 호출은 backtest strategy 에만 있음 — live router 는 wiring **확인 필요**).

---

## 8. 종합 권고

| 항목 | P 우선 | 영향 |
|---|---|---|
| `combineAdditionalModifiers` 곱셈체인 통합 | **P1** | 모든 6 modifier 의 알파 측정 가능 |
| Market Breadth panic mult 1.30 → 1.15 | **P1** | onchain 과 복합 가산 위험 회피 |
| MACD swing 우선순위 (M3) | P1 | EXIT-B 정확도 |
| EMA Ribbon 0.30 → 0.50 | P2 | `isFallingKnife` 와 중복 차감 회피 |
| 6 modifier 의 알파 측정 (calibration param 추가) | **P1** (R2) | 헌장 통과 |
| Funding Extreme 임계 단위 spec 확인 | P2 | 정확한 임계 |
| Order Block ±0.05 → ±0.10 (베타 졸업 후) | P3 | alpha 측정 가능 폭 |
| CVD Divergence WebSocket 구현 | P3 | 4차원 실데이터 |
