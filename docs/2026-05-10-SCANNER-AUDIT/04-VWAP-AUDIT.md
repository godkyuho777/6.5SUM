# 04 — VWAP Strategy Audit (Parker Brooks Style)

## 0. 개요

VWAP 전략은 **두 모드** 로 사용됨:

1. **Standalone strategy** (`backtest/strategies/vwap.ts`) — backtest 실행 시 별도 BBDX-independent 진입 신호 발행.
2. **BBDX multiplier** (`indicators.ts:1739-1750:vwapToMultiplier`, `vwap-multi-tf.ts:checkVwapMultiTfAlignment`) — multiplier-only.

이 dual mode 자체가 **헌장 R3 (No Standalone Signal) 위반 위험** — 04 §3 참조.

## 1. Standalone strategy (`backtest/strategies/vwap.ts:36-122`)

### 1.1 현재 룰

진입 게이트 4개:
- Gate 1: `vwapPosition === "ABOVE"`
- Gate 2: `emaPosition === "ABOVE"`
- Gate 3: `detectPullback(candles, vwap, ema9)` true
- Gate 4: `candle.volume ≥ avgVol(50)`

청산:
- Tier 1: `min(VWAP+1σ, entry×1.025)` → 50%
- Tier 2: `min(VWAP+2σ, entry×1.05)` → 잔여 50%
- Stop: `max(VWAP-1σ, entry×0.98)`

### 1.2 단점

#### V1. 헌장 R3 위반 가능 (P1)
- `dimensionsCovered: [3, 4]` (`vwap.ts:40`) 만 명시 — *2 차원만 covered*.
- 7차원 중 5개 누락: momentum (1), volatility (2), structure (5), macro (6), onchain (7).
- `assertSevenDimensions` 실행 시 **5개 누락 → CharterAssertionError throw**.
- backtest 가 standalone 으로 실행되는 환경에서 *진짜 진입 발행* 시 R1 (단일 차원만) + R3 (BBDX 미베이스) 동시 위반.
- **확인 필요**: backtest 가 standalone 시그널을 *paper trading* 만으로 사용하는지, real-time signal 로 발행하는지.

#### V2. `detectPullback` look-back 5 candles (P2)
- `indicators.ts:1351-1381` 의 `detectPullback` — last 5 candles 에서 vwap/ema9 의 0.5% 이내 터치 검사.
- 5 캔들 고정 — TF 무관.
- 단점: 1h TF 5캔들 (5h) vs 1d 5캔들 (5일) — pullback 의미 다름.

#### V3. avgVol 50 baseline → SMA, spec 의 EMA(50) 와 다름 (P3)
- `vwap.ts:30-34` `avgVolume()` 가 단순 평균.
- spec (Pattern audit context) 의 EMA(50) 권고와 다름.
- 단점: 거래량 spike 환경에서 SMA 가 EMA 보다 *과도하게 영향* 받음.

#### V4. signalStrength 공식 의문 (P3)
- `vwap.ts:113-116`: `signalStrength = 50 + (distance / entryPrice) × 1000`
- `distance = abs(entry - vwap)`. distance/entry × 1000 = % × 10.
- entry 가 VWAP 와 0.5% 떨어져 있으면 signalStrength = 50 + 5 = 55. 5% 떨어져 있으면 100.
- 단점: 0.5~5% 거리 → 55~100 의 비현실적 분포. 대부분 60~70 영역에 쏠릴 위험.

### 1.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| 7차원 커버 | 2차원 만 | BBDX 베이스 기반 (standalone X) | R3 통과 |
| pullback lookback | 5 candles | TF 별 (1h:8, 4h:5, 1d:3) | TF 의미 |
| avgVol | SMA(50) | EMA(50) | spec 정합 |
| signalStrength 공식 | 50 + dist% × 10 | dist%/2σ × 50 (정규화 강도) | 분포 균등화 |

### 1.4 헌장 검증

- **R1**: 2 차원 단독 — VWAP (volume) + EMA (trend) 둘다 다른 각도. 통과.
- **R2**: standalone strategy 로 backtest 측정값 있음 — 통과 가능. 단 alpha 가 baseline 대비 입증되었는지 **확인 필요**.
- **R3**: **standalone signal 발행 시 위반**. multiplier-only 모드 (`vwapToMultiplier`) 만 사용해야 통과.

---

## 2. BBDX Multiplier 모드 (`indicators.ts:1573-1750`)

### 2.1 `decideVwapSignal` (5-component 평가, `:1573-1722`)

#### 2.1.1 현재 룰

옵션 제공 시 (`opts.pullbackQuality || opts.volumeProfile`):
- (1) VWAP distance: 25점 (vwapDistPct × 17.5 × 100, capped)
- (2) EMA position: 20 (aligned), 10 (AT), 0 (else)
- (3) Pullback v2: 25 (bounceConfirmed), 12 (detected only), 0
- (4) Volume Profile support (POC/HVN within 0.5%): 15
- (5) Volume Profile structure (LONG: LVN above): 15

총 100점. `< VWAP_SIGNAL_THRESHOLD(50)` 이면 null.

옵션 미제공 시 (legacy 4-component):
- (1) VWAP distance: 35점
- (2) EMA: 25 (aligned) / 12.5 (else)
- (3) Volume confirm: 25
- (4) Pullback: 15

#### 2.1.2 단점

#### VM1. 두 평가 모드 (5-comp vs 4-comp) 공존 (P2)
- Legacy fallback 유지는 호환성. 단 backtest 시 어느 모드인지 결정 (calibration 결과가 5-comp 인지 4-comp 인지) — alpha 측정의 의미 모호.

#### VM2. VWAP distance 17.5x scaling (P3)
- vwapDistPct 0.5% (0.005) → 25 cap (0.005 × 100 × 17.5 = 8.75 — wait, formula error?)
- 재계산: `vwapDistPct × 100 × 17.5` — vwapDistPct 가 fraction (0.005) 이면 0.5 × 17.5 = 8.75. 25 도달하려면 vwapDistPct ≥ 0.0143 (1.43%).
- **단점 명확**: VWAP 와 1.43% 떨어진 경우만 max score. 일반적 진입 시점에서 VWAP 와 거리는 0.1~0.5% — score 6~25 영역.

### 2.2 `vwapToMultiplier` (`:1739-1750`)

#### 2.2.1 현재 룰

```
signal.side === bbdxSide:  1.0 + (strength - 50) / 50 × 0.30  → 1.0~1.30
signal.side !== bbdxSide:  1.0 - (strength - 50) / 50 × 0.30  → 0.70~1.0
```

bbdxSide default `"LONG"`. SHORT 미지원 (forward-compat placeholder).

#### 2.2.2 단점

#### VM3. SHORT 무지원 (P2)
- Tradelab 이 SHORT 를 추가했지만 (`decideShortEntry`), `vwapToMultiplier(signal, "LONG")` 만 호출.
- SHORT 의 VWAP multiplier 누락.

#### VM4. strength 50 = 1.0 의 의미 (P3)
- strength <50 면 `decideVwapSignal` 이 null 반환 — `vwapToMultiplier(null) = 1.0`.
- strength >=50 만 들어옴 — 1.0~1.30 (aligned) 또는 0.70~1.0 (opposing).
- 단점: strength 51 도 1.006 multiplier. *최소 영향 임계가 너무 낮음*.

### 2.3 Multi-TF VWAP Alignment (`vwap-multi-tf.ts:80-119`)

#### 2.3.1 현재 룰

- 1h / 4h / 1d 각 단일 TF VWAP signal 평가.
- BBDX side 와 일치하는 TF 갯수:
  - 3개 → aligned → mult 1.15
  - 2개 → partial → 1.05
  - 1개 → mixed → 0.95
  - 0개 → neutral → 1.00

#### 2.3.2 단점

#### VM5. neutral mult 1.00 vs mixed 0.95 (P2)
- 0개 일치 (모두 미발행 또는 모두 반대) → 1.00.
- 1개만 일치 → 0.95.
- **역설**: 모두 미발행이 1개 일치보다 *유리*. 사용자 직관 위반.
- 권고: neutral → 0.95 (또는 mixed → 0.93 으로 격차 회복).

---

## 3. ★ 헌장 R3 통합 위험 (P1)

### 3.1 두 모드 동시 운영의 모순

- VWAP standalone strategy (`backtest/strategies/vwap.ts`) 가 standalone signal 발행 가능 (적어도 backtest 환경에서는).
- 같은 코드베이스에서 `decideVwapSignal` + `vwapToMultiplier` 가 BBDX multiplier 로 사용.
- **사용자 측 인지 모호**: live signal 페이지가 "VWAP signal: LONG @ $X" 표시하면 standalone 인지 multiplier 인지 알기 힘듦.

### 3.2 권고

- live 환경: VWAP 는 *항상 BBDX 의 multiplier 로만* 사용. `decideVwapSignal` 결과는 UI 에 표시하되 "VWAP modifier: +0.20 to BBDX confidence" 형태.
- backtest 환경: standalone 측정 허용 — *비교 baseline* 으로 활용. 단 비교 결과만 사용, real-time 진입 발행 X.
- `routers.ts` grep 결과 standalone VWAP signal 발행 코드 **확인 필요**.

---

## 4. 백테스트 회귀 알파

### 4.1 측정 가능 항목

- VWAP standalone vs BBDX baseline (winRate / Sharpe / MDD)
- VWAP-as-modifier 가 BBDX 에 추가 알파 기여 (modifier=1.0 baseline 대비)

### 4.2 측정 불가 항목 (현재)

- `combineAdditionalModifiers` 미통합으로 vwap-as-modifier 효과 측정 불가 (03 참조).

---

## 5. 헌장 검증 종합

- **R1 (Dimension Duplicate)**: VWAP (volume 4) + EMA (trend 3) 동시 사용 — 둘 다 다른 차원. 통과.
- **R2 (Backtest Alpha)**: standalone backtest 가능 — 통과 가능. 단 modifier 모드 alpha 측정은 미통합으로 *0건*.
- **R3 (No Standalone Signal)**: **standalone strategy 가 진짜 standalone signal 발행 시 위반**. live 환경에서는 multiplier-only 만 사용.
- **Capital protection**: VWAP 자체에는 차단 룰 없음 — BBDX 의 일반 capital protection 에 의존.

## 6. 권고 우선순위

| 항목 | P | 영향 |
|---|---|---|
| Standalone vs multiplier 모드 명확 분리 (live/backtest) | **P1** | R3 |
| signalStrength 공식 정규화 (V4) | P3 | 분포 |
| Multi-TF Alignment neutral vs mixed (VM5) | P2 | 직관 |
| pullback TF-별 lookback | P2 | TF 의미 |
| SHORT 지원 (VM3) | P2 | 비대칭 |
