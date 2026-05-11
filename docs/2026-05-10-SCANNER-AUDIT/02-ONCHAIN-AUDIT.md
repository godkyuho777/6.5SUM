# 02 — Onchain 7-Modifier Audit

## 1. 두 개의 onchain 파이프라인 공존 (P1)

이 코드베이스는 **서로 다른 두 개의 onchain 점수 파이프라인** 을 동시에 운영한다 (`onchain/score-fetch.ts:1-17` 의 주석이 직접 인정).

### 1.1 파이프라인 A — `score.ts:computeOnchainScore`
- 입력: raw zscore / raw USD net / raw fraction
- 출력: `OnchainScoreResult` (regime, mult, breakdown 7 modifier numeric)
- 사용처: `signals/confidence.ts` (BBDX final_confidence 곱셈체인)
- 상수:
  - `NORMALIZATION_DENOMINATOR = 1.35` (`score.ts:82`)
  - regime boundaries: 0.6 / 0.2 / -0.2 / -0.6 (`score.ts:86-90`)
  - multipliers: strong_acc 1.30 / acc 1.15 / neutral 1.00 / dist 0.85 / strong_dist 0.70

### 1.2 파이프라인 B — `score-fetch.ts:fetchOnchainScore`
- 입력: 직접 외부 API fetch (Coinbase Premium, SSR real / 5 stub)
- 출력: `OnchainScore` (UI-ready, status/detail 메타 포함)
- 사용처: `routers.ts` (총 6개 라우트에서 호출, 482, 494, 510, 533, 542, 628, 830)
- 상수:
  - `MODIFIER_BOUNDS.normalizationDenom = 1.4` (`onchain/types.ts:78-83`)
  - regime boundaries: 0.6 / 0.2 / -0.2 / -0.6 (`onchain/types.ts:86-91`) — 같음
  - **multiplier**: 파이프라인 B 는 multiplier 자체가 없음. 대신 `applyOnchainToEntry` 가 `1 + score × 0.30` 공식 사용 (`onchain/bbdx-integration.ts:33`)

### 1.3 정합성 위험

- **분모 1.35 vs 1.40** — 같은 raw modifier 합이 두 파이프라인에서 서로 다른 정규화 score 산출. regime boundary 가 같아도 *boundary 통과 여부가 달라짐*.
- 예: 7 modifier 합 = 0.85
  - 파이프 A: 0.85 / 1.35 = **0.630** → strong_accumulation
  - 파이프 B: 0.85 / 1.40 = **0.607** → strong_accumulation (같음, 우연)
  - 그러나 합 = 0.27 면: A=0.200(boundary, neutral), B=0.193(neutral) — 다른 regime 분류
- **multiplier 공식 다름**:
  - A: 표 lookup (1.30/1.15/1.00/0.85/0.70)
  - B: `1 + score × 0.30` 연속 함수 (max 1.30 ~ min 0.70)
  - 같은 score=0.5 면: A=1.15 (acc 표), B=1.15 (1+0.5×0.30) — 우연 일치
  - score=0.4 면: A=1.15 (still acc), B=1.12 — 차이 0.03
- 사용자가 UI 에서 본 onchain regime/mult 와 BBDX confidence 가 사용한 것이 *다를 수 있음*.

### 1.4 개선안 (P1)

- 두 파이프라인 통합. 권고: 파이프라인 B (`fetchOnchainScore`) 가 외부 호출 + UI 메타를 담당, 결과의 raw modifier 결과를 파이프라인 A 의 `OnchainInputs` 형태로 변환해서 `computeOnchainScore` 호출. 단일 multiplier 표 사용.
- 또는 파이프라인 B 의 `applyOnchainToEntry` 를 `ONCHAIN_MULTIPLIERS[regime]` lookup 으로 교체 (현재 `1+score×0.30` → 표 lookup).
- 정규화 분모 통일 (1.40 권장 — 모든 7 modifier 의 max abs 합 = 0.25+0.20+0.20+0.20+0.25+0.15+0.15 = **1.40**, 정확함).

---

## 2. Modifier-by-modifier 단점 + 임계값 검증

### 2.1 Exchange Netflow (`modifiers.ts:25-32`)
- 임계: z<-2 → +0.20, z<-1 → +0.10, z>+2 → -0.25, z>+1 → -0.10
- **stub** — `sources/cryptoquant.ts` 가 `null` 반환. 실데이터 0건.
- 비대칭: bullish max +0.20, bearish max -0.25 (12.5% 차이). spec 의도지만 모든 7 modifier 가 비슷한 비대칭 — 누적되면 score 평균이 음수로 편향.

### 2.2 Whale Alert (`modifiers.ts:53-61`)
- 임계: net> +$300M → +0.15, > +$100M → +0.07, < -$300M → -0.20, < -$100M → -0.07
- **stub** — `stub-modifiers.ts:106-138` 가 mock 또는 stub.
- 7배 비대칭 (-0.20 / +0.15) — bearish 가산.
- 단점: USD 절대값 임계는 시간이 지나면 의미 변함 (시총 증가, 코인 가격 변동). USD-denominated 임계는 정기 calibration 필요.

### 2.3 SSR (`modifiers.ts:77-84`)
- 임계: z<-1.5 → +0.15, z<-0.5 → +0.05, z>+1.5 → -0.20, z>+0.5 → -0.05
- **real** — `ssr.ts` 가 CoinGecko Free 무료 호출.
- **결함**: 90일 buffer 가 *런타임 누적* (`ssrHistory: { ts, ssr }[]`). 서버 재시작 시 buffer 초기화 → **첫 호출에서 z=0 (영향 없음)** 처리. spec 의 90일 통계가 실제로는 *서버 uptime 동안만* 누적.
- 결과: 백테스트에서 SSR modifier 가 *항상 0* 일 가능성 (백테스트 시 시작 시점에 90일 history 없음).

### 2.4 Coinbase Premium (`modifiers.ts:97-104`)
- 임계: > +0.2% → +0.15, > +0.05% → +0.05, < -0.2% → -0.20, < -0.05% → -0.05
- **real** — `coinbase-premium.ts` 가 Coinbase Exchange API + Bybit ticker.
- 비대칭: 화이트리스트 27 coin 만 지원 (`coinbase-premium.ts:37-41`). 나머지는 stub 처리.
- 단점: 실시간 호출 (캐시 없음 명시). rate limit hit 가능성. backoff 미구현.

### 2.5 ETF Flow (`modifiers.ts:117-124`)
- 임계: 3d>+$1.5B → +0.20, > +$500M → +0.10, < -$1B → -0.25, < -$300M → -0.10
- **stub** — `farside.ts` 가 `null` 반환. `stub-modifiers.ts:142-202` 의 Farside 호출 코드는 *HTTP 호출 후 byte length 검증만 — 실제 파싱 미구현*.
- BTC/ETH 만 적용 (spec 명시). 다른 코인은 stub 0.
- 25% 비대칭 (max -0.25 / +0.20).

### 2.6 Miner Outflow (`modifiers.ts:138-144`)
- 임계: z>+2 → -0.15, z>+1 → -0.05, z<-1.5 → +0.10
- **BTC only**, **stub**.
- 비대칭: 매도압 최대 -0.15, 매수압 +0.10 (1.5배). bearish 편향.

### 2.7 LTH Supply (`modifiers.ts:157-162`)
- 임계: 30d > +2% → +0.10, < -2% → -0.15
- **BTC/ETH only**, **stub**.
- **2-bucket only** — z<-1.5/+1.5 같은 strong threshold 없음. 단점: 1.5배 점진성 — 모든 다른 modifier 는 4-단계, 본 항목만 2-단계.
- 비대칭: -0.15 / +0.10 (1.5배 bearish 편향).

---

## 3. Tier-based modifier 활성화 (`symbol-tier.ts:65-79`)

| Tier | Modifiers | Count |
|---|---|---|
| btc | netflow + whale + ssr + coinbasePremium + etfFlow + minerOutflow + lthSupply | 7 |
| eth | netflow + whale + ssr + coinbasePremium + etfFlow + lthSupply | 6 |
| major_alt | netflow + whale + ssr + coinbasePremium | 4 |
| small_alt | netflow + whale | 2 |

### 3.1 단점

#### T1. major_alt 화이트리스트 31개 hardcoded (P2)
- `symbol-tier.ts:18-50` 에 31개 코인 명시.
- 주석에 "Move to a config or env-driven list when symbol coverage stabilizes".
- 단점: 새로운 메이저 알트 추가 시 (e.g. 신규 상장) 코드 변경 필요.

#### T2. small_alt 가 ETH/BTC 0.30 multiplier 환경에서 같은 ±0.30 mult 받음 (P2)
- 분모는 1.35/1.40 (7 modifier 합 기준).
- small_alt 는 *2개 modifier 만* 합산. 합 max = 0.25+0.20 = 0.45 → score = 0.45/1.40 = 0.32 (acc 미만).
- 결과: small_alt 는 **strong_accumulation regime 에 도달 불가능** (boundary 0.6 초과 필요).
- bearish 쪽: max = -0.25-0.20 = -0.45, score = -0.32 (distribution 미만).
- 즉 small_alt 는 항상 acc/neutral/dist 사이만 — strong regime 결정 불가능.
- 단점: regime gates 의 `strong_distribution` 차단이 small_alt 에 *영구 미작동*. 이게 의도인지 버그인지 **확인 필요**.

#### T3. 분모 1.40 vs tier-별 modifier 갯수 불일치 (P1)
- 분모는 7 modifier 합산 max abs (1.40) 기준.
- 그러나 small_alt 는 2개만, btc 는 7개.
- 같은 raw modifier value 0.20 가 score 에 미치는 영향:
  - btc (분모 1.40 가정): 0.143
  - small_alt: 0.143 (분모 같음)
- *tier-별 분모 동적화 필요*. 권고: 분모 = `enabled.length × 0.20` 식의 동적 정규화 (tier 별로 max abs 합 다름).

### 3.2 개선안

- T1: `MAJOR_ALT_SET` 을 env-driven `MAJOR_ALT_LIST` env var 또는 DB 로 외출.
- T2/T3: 분모 동적 — `score.ts:computeOnchainScore` 에 tier 의 `enabled` modifier 갯수 기반 분모 계산 추가.
  ```ts
  const tierMaxAbs = enabled.reduce((sum, m) => sum + MODIFIER_MAX_ABS[m], 0);
  const score = clamp(total / tierMaxAbs, -1, 1);
  ```

---

## 4. Onchain × BBDX 통합 (`bbdx-integration.ts`)

### 4.1 LONG `applyOnchainToEntry`

```ts
multiplier = 1 + onchain.score × 0.30
strong_distribution + non-Riding path → blocked (자본 보호)
```

### 4.2 SHORT `applyOnchainShortToEntry`

```ts
multiplier = 1 - onchain.score × 0.30
strong_accumulation + non-lowerRiding path → blocked
```

### 4.3 EXIT `applyOnchainToExit`

```ts
distribution / strong_distribution → +0.15 가산
strong_accumulation → -0.10 가산
```

### 4.4 단점

#### O1. `1 + score × 0.30` vs ONCHAIN_MULTIPLIERS 표 (P1, 1.3 항목과 중복)
- 두 multiplier 공식이 다른 결과 산출.

#### O2. EXIT 보정 +0.15 가 `decideReversal.ts` 의 `+0.20 strong_dist / +0.10 dist / strong_accumulation ×0.8` 와 **이중 적용** 가능 (P1)
- `applyOnchainToExit` 가 router 에서 호출되면 reversal 점수에 +0.15 가산.
- `computeReversalScore` 가 `ctx.onchainRegime` 인자로도 보정 (+0.20).
- 두 호출 경로가 모두 활성화되면 strong_dist 환경에서 EXIT score +0.35 가산 — *spec 의 의도 초과*.
- **확인 필요**: router 가 둘 다 호출하는지, 또는 `applyOnchainToExit` 만 호출하는지.

#### O3. `BB:Riding` 경로 식별 (P2)
- `applyOnchainToEntry:38` 에서 `signal.path !== "BB:Riding"` 으로 mean-reversion 판정.
- `decideEntry` 의 BB path 결과는 `bbStructure` enum (`upperRiding | squeezeBreakout | middleSupport | lowerBounce`) — 이게 어떻게 `"BB:Riding"` string 으로 변환되는지 명확하지 않음.
- 가능성: 호출 측에서 `path === 'BB' && bbStructure === 'upperRiding'` → `"BB:Riding"` 매핑. 이 매핑 코드 위치 **확인 필요**.
- 매핑 누락 시 `signal.path` 가 단순 "BB" 면 *모든 BB path 가 mean-reversion 으로 분류* → upperRiding 도 strong_dist 환경에서 차단됨 (의도 위배).

---

## 5. 백테스트 회귀 가능성

### 5.1 stub modifier 5개의 알파 기여 측정 0건

- 백테스트 시 `stub-modifiers.ts` 의 5 modifier 가 항상 `value=0` 또는 `ONCHAIN_MOCK=1` 일 때만 deterministic mock.
- 결과: backtest winRate / Sharpe 가 onchain 없이 측정됨 (Coinbase Premium + SSR 만 영향, 그것도 SSR 은 90일 buffer 부재로 사실상 0).
- spec 의 "5/7 modifiers add alpha" 가설 **백테스트로 검증 불가**.

### 5.2 권고

- mock 데이터 deterministic seeding (`ONCHAIN_MOCK=1`) 으로 backtest 실행 + Wilson CI 비교.
- 또는 historical 데이터를 외부 source (Glassnode CSV, CryptoQuant export) 에서 수동 import 하여 365d alpha 측정.
- 헌장 R2 통과 위해서는 **각 modifier 별 알파 기여 분리 측정** 필요 (calibration param 형태로 `runStandardCalibration` 에 추가).

---

## 6. 헌장 검증

- **R1 (Dimension Duplicate)**: 7 modifier 가 모두 7차원 (onchain) — single dimension. 통과.
- **R2 (Backtest Alpha)**: stub 5개 + SSR buffer 부재 → 알파 측정 사실상 불가. **위반 가능**.
- **R3 (No Standalone Signal)**: `applyOnchainToEntry` 가 BBDX 의 `signal` 받아서 `multiplier` 적용 — 통과. 단 `regime-gates.ts` 의 `strong_distribution` 차단은 *standalone block* 행동 — block 은 가산이 아니라 `finalStrength=0` 으로 만듬. R3 의 "단독 시그널 발행 X" 와 "단독 차단 X" 는 다른 개념 — 차단은 자본 보호이므로 통과. 단 사용자 측 인식이 모호.
- **Capital protection**: `strong_distribution + 평균회귀 차단` ✓, `strong_accumulation + 평균회귀 SHORT 차단` ✓.

---

## 7. 권고 우선순위 정리

| 항목 | 우선순위 | 영향 |
|---|---|---|
| 두 파이프라인 통합 | **P1** | 일관성, 정확성 |
| 분모 1.35 → 1.40 통일 | **P1** | regime 분류 정합성 |
| EXIT 이중 보정 (O2) | **P1** | spec-violation, alpha 측정 distortion |
| `1+score×0.30` vs 표 통일 | **P1** | 일관성 |
| BB:Riding path 매핑 검증 | **P1** | 자본 보호 위반 가능 |
| Tier-based 분모 동적화 | P2 | small_alt regime 정확도 |
| stub 5 modifier 알파 측정 | **P1** (R2 통과) | spec validity |
| MAJOR_ALT 화이트리스트 외출 | P2 | 운영성 |
| SSR 90d buffer 영속화 | P2 | 백테스트 정확도 |
| Coinbase Premium 캐시 | P3 | 호출 비용 |
