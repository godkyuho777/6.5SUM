# Tradelab Signal Scanner Audit — 2026-05-10

## 메타

- **레포**: `tradelab-backend`
- **검사 브랜치**: `feat/v6.5-merge` (HEAD `d6a7ee53`)
  - **확인 필요** — 사용자 요청 본문은 "dev 브랜치 7f08d47" 이라 명시했으나 작업 트리의 실제 브랜치는 `feat/v6.5-merge`, HEAD 는 `d6a7ee53`. dev 와 동일 또는 dev 의 머지 대상으로 추정. PR 머지 전 재확인 권장.
- **분석 일시**: 2026-05-10 (한국)
- **분석자**: signal-engineer
- **분석 범위**: src 전체 9,166 LoC (지표/시그널/모디파이어/온체인/추세/패턴/매크로/엑짓/백테스트/감정)
- **변경 한 코드 줄**: 0 (분석만, 헌장 검증 + 백테스트 회귀 권고만 작성)

## Charter Reference (요약)

| 차원 | KO | 표준 지표 | Tradelab 커버 |
|---|---|---|---|
| 1 momentum | 모멘텀 | RSI / MACD_hist / ROC | RSI(14) + MACD-Divergence (rule1Exempt) |
| 2 volatility | 변동성 | BB / ATR / BB_width | BB(20,2) |
| 3 trend | 추세 | ADX / +-DI / EMA Ribbon | ADX + EMA-Ribbon (rule1Exempt) |
| 4 volume | 거래량 | Vol_z / OBV / CVD / VWAP | Volume / VWAP / **CVD-Divergence (베타 stub)** |
| 5 structure | 구조 | Fib / Trendline / Order_Block / Liquidity / Wave_Tracker / Candle_Pattern | Fib + Trendline + **Order_Block (베타)** + Wave Alignment + Candle Patterns |
| 6 macro | 거시 | DXY / SOFR-IORB / F&G / BTC dom | Macro_Liquidity + Korea + Fear&Greed + **Funding-Extreme** + **Market-Breadth** |
| 7 onchain | 온체인 | Exchange_Netflow / Whale / Stable / Coinbase_Premium / ETF / Miner / LTH | 7 modifier (2 real, 5 stub-or-mock) |

**Operating Rules**:
- R1 (Dimension Duplicate): 같은 차원 동일 각도 중복 금지. `rule1Exempt` 플래그 명시 시만 예외.
- R2 (Backtest Alpha): 신규 지표는 Wilson 95% CI vs baseline + ≥100 signals + 365d 윈도우 알파 입증.
- R3 (No Standalone Signal): 비-BBDX 차원은 모두 multiplier-only.

## 스캐너 카탈로그

| # | 스캐너 | 위치 | 형태 | 상태 | 우선순위 |
|---|---|---|---|---|---|
| 1 | **BBDX (LONG)** `decideEntry` | `indicators.ts:1171-1225` | 3-path | live | **P1** |
| 2 | **BBDX (SHORT)** `decideShortEntry` | `indicators.ts:1068-1122` | 3-path (LONG mirror) | new — backtest 0건 | **P1** |
| 3 | **BBDX EXIT v6.3** `decideExit` + `decideReversal` + `checkProfitTarget` + `checkProtection` + `checkTimeStop` | `indicators.ts:1249-1255`, `exits/*.ts` | 4-category | live | **P2** |
| 4 | **Pattern Confluence** `detectPatternsAtIndex` + `aggregatePatternScore` + context | `patterns/*.ts` | input to BBDX (PTN path) + EXIT-B | live, beta strength | **P2** |
| 5 | **Falling Knife / Rising Knife** | `indicators.ts:938-960` | gate (block) | live | P3 |
| 6 | **Onchain 7-modifier** `computeOnchainScore` + `fetchOnchainScore` | `onchain/*` | multiplier (LONG/SHORT) + EXIT regime boost | 2 real (Coinbase Premium, SSR) / 5 stub | **P1** |
| 7 | **Onchain regime gates** `evaluateRegimeGates` | `signals/regime-gates.ts` | hard block (mean-reversion in tight/strong_dist) | live | P2 |
| 8 | **EMA Ribbon Modifier** `computeEmaRibbon` | `modifiers/ema-ribbon.ts` | multiplier (3차원) | live, BBDX backtest 에 wired | P2 |
| 9 | **MACD Divergence Modifier** `detectMacdDivergence` | `modifiers/macd-divergence.ts` | multiplier (1차원) | live, wired | P2 |
| 10 | **Order Block Modifier** `detectOrderBlock` | `modifiers/order-block.ts` | multiplier (5차원) — 베타 ±0.05 | live, wired | P3 |
| 11 | **Funding Extreme Modifier** `computeFundingExtreme` | `modifiers/funding-extreme.ts` | multiplier (6차원) | live | P2 |
| 12 | **Market Breadth Modifier** `computeMarketBreadth` | `modifiers/market-breadth.ts` | multiplier (6차원, contrarian) | live | **P1** (contrarian 잠재 폭발) |
| 13 | **CVD Divergence Modifier** `detectCvdDivergence` | `modifiers/cvd-divergence.ts` | multiplier=1.0 (베타 stub) | stub only | P3 (구현되면 P2) |
| 14 | **Macro Liquidity** `computeMacroScore` + `applyKoreaModifier` | `macro/liquidity.ts`, `macro/korea.ts` | multiplier + hard regime gate (crisis blocks all longs) | live (FRED data wired? **확인 필요**) | **P1** |
| 15 | **Multi-TF Trend / Wave Alignment** `analyzeTrend` + `classifyWaveAlignment` | `trend/multi-tf.ts`, `trend/analyze.ts`, `trend/wave-alignment.ts` | multiplier (perfect_up=1.30 ~ opposing=0.30) | live | **P1** |
| 16 | **Wave Sentiment & Matrix v4.1** `computeComposite` + `computeWaveMatrix` | `sentiment/sentiment-score.ts`, `sentiment/wave-matrix.ts` | display + advisory (BBDX wiring **확인 필요**) | live (display) | **P1** |
| 17 | **VWAP standalone strategy** + `decideVwapSignal` + `vwapToMultiplier` + `checkVwapMultiTfAlignment` | `indicators.ts:1573-1722`, `vwap-multi-tf.ts`, `backtest/strategies/vwap.ts` | standalone signal *and* BBDX multiplier (dual mode) | live | **P1** (헌장 R3 위반 위험) |
| 18 | **Fibonacci standalone strategy** + `calculateFibonacciLevels` + `isInFibZone` | `indicators.ts:397-418`, `backtest/strategies/fibonacci.ts` | standalone signal | live | **P1** (헌장 R3 위반 위험) |
| 19 | **Trend standalone strategy** | `backtest/strategies/trend.ts` | standalone signal | live | **P1** (헌장 R3 위반 위험) |
| 20 | **Multi-path Confluence** `computeConfluence` | `signals/multi-path-confluence.ts` | multiplier (BBDX 내부 path 합산) | live | P3 |
| 21 | **v6.5 Confidence Pipeline** `computeFinalConfidence` | `signals/confidence.ts` | orchestrator | live, but **`combineAdditionalModifiers` 미통합** | **P1** |
| 22 | **Backtest Calibration (Phase 3)** `runStandardCalibration` | `backtest/calibration.ts` | Wilson CI 임계값 도출 | live, 사용 흔적 미확인 | P2 |
| 23 | **Rolling Win-Rate** `computeRollingWinRate` | `winrate-rolling.ts` | display | live | P3 |

## 오디트 파일 인덱스

- `00-INDEX.md` — 본 파일
- `01-BBDX-AUDIT.md` — BBDX-PATTERN v6.5 LONG/SHORT/EXIT
- `02-ONCHAIN-AUDIT.md` — 7-modifier 합산 + regime + integration
- `03-ADDITIONAL-STRATEGIES-AUDIT.md` — 6 modifier (EMA, MACD, OB, Funding, Breadth, CVD)
- `04-VWAP-AUDIT.md` — VWAP standalone + multiplier hybrid
- `05-FIBONACCI-AUDIT.md` — Fib 골든존 standalone strategy
- `06-WAVE-TREND-AUDIT.md` — Multi-TF Trend Analysis Engine v2.0 + Wave Alignment
- `07-WAVE-SENTIMENT-AUDIT.md` — Wave Sentiment v4.1 + Matrix
- `08-BACKTEST-CALIBRATION-AUDIT.md` — Phase 1+2+3 + Wilson CI + Lookahead 검증
- `09-CHARTER-CROSS-CHECK.md` — 5 헌장 규칙별 cross-check (R1/R2/R3 + capital limits)

## 종합 우선순위 (즉시 개선 권고)

### P1 — 즉시 (false positive / 헌장 위반 / 알파 직격)

1. **VWAP/Fibonacci/Trend standalone 시그널 발행** (헌장 R3 위반 가능) → 04, 05, 06 참조
2. **`combineAdditionalModifiers` BBDX confidence 곱셈체인 미통합** → 03 참조 (modifiers 결과가 final_confidence 까지 도달 안 할 가능성)
3. **SHORT path 백테스트 알파 검증 0건** (헌장 R2 위반) → 01 참조
4. **Onchain 7-modifier 중 5개 stub** — Phase 1 가 stub 환경에서 튜닝됨 → 02 참조
5. **Wave Sentiment & Matrix 곱셈체인 wiring 미확인** — display 만 인지 BBDX 영향 인지 모호 → 07 참조
6. **Macro Liquidity FRED 실데이터 wiring** — `sources/fred.ts` 참조만 있고 실제 fetch 코드는 별도 확인 필요 → 02, 09 참조
7. **두 개의 onchain score 파이프라인 공존** (`score.ts` raw zscore vs `score-fetch.ts` modifier-fetch) → 02 참조 (정합성 위험)
8. **Market Breadth contrarian 1.30 multiplier** — 패닉 환경에서 LONG 가산은 winRate 회귀 위험 큼 → 03 참조
9. **EXIT-B `legacyV61Triggers` shadow logic** — `relaxedToBearish` 가 v6.1 기준으로 계산되어 v6.3 Reversal Score 와 모순될 수 있음 → 01 참조
10. **Pattern strength `PATTERN_STRENGTH` legacy table vs `PATTERN_BASE` 새 table 공존** — `detectAtIndex` (legacy) 와 `detectPatternsAtIndex` 두 경로 → 04, 09 참조

### P2 — 다음 회차 (alpha 검증 후)

- BBDX `NUM_RSI_LOW=25` / `NUM_RSI_HIGH=38` 임계 — Phase 3 calibration 결과 반영
- EXIT-B `0.50 / 0.30` threshold — TF/심볼별 adaptive (`reversalThresholds` 인자 활용 미흡)
- Pattern volume baseline `SMA(50)` → spec 의 `EMA(50)` 로 마이그레이션
- EMA Ribbon `Falling Knife (-60 score → 0.30 mult)` — BBDX `isFallingKnife` 와 의미 중복 가능 (R1 검증)
- Wave Alignment `perfect_down=0.65` — SHORT 추가 시 의미 반전 필요 (현재 LONG-only fork 됨)
- Multi-TF Trend `15m → 1h fallback` (`trend/analyze.ts:46`) — 단순화로 BBDX backtest 의 시간 정합성 깨질 위험
- Onchain `NORMALIZATION_DENOMINATOR` 1.35 vs `MODIFIER_BOUNDS.normalizationDenom` 1.4 불일치
- Backtest `cooldownCandles=5` — multi-strategy 동시 백테스트 시 같은 심볼 cool-down 충돌

### P3 — UX / 학습 카드

- `pressureLabel`, `reversalProbability` 의 magic number (25, 2.5)
- `volumeRatio` 가 candles<100 일 때 다른 베이스라인 사용 (n=5) — 오프-비-바이-원 위험
- Order Block `multiplier max ±0.05` 베타 — 임계 효과 작음, 데이터 더 모인 후 확장
- CVD Divergence WebSocket 구현 (P3 → 구현 시 P2)

## 한 문장 요약

> v6.5 머지 브랜치는 신원천 multi-modifier 아키텍처를 잘 구축했지만 **(a) 추가 modifier 의 곱셈체인 통합 부재, (b) VWAP/Fib/Trend standalone 시그널의 헌장 R3 위반 위험, (c) SHORT path 와 5/7 onchain modifier 의 알파 미검증** 이라는 3가지 구조적 문제로 현재 production 권장 수준이 아니며, P1 항목들을 백테스트로 정당화한 후 점진 활성화 필요.

## 가장 시급한 P1 3개 (사용자 시작점 권고)

1. **`combineAdditionalModifiers` 가 `computeFinalConfidence` 곱셈체인에 wiring 되어 있는지 grep 확인** → 만약 미통합이면 EMA-Ribbon / MACD-Divergence / OB / Funding / Breadth 5개 modifier 가 *작동은 하지만 실제 final_confidence 에 영향 0* — 모든 v6.5 알파 가설이 측정 자체가 안 됨 (03-ADDITIONAL-STRATEGIES-AUDIT.md §6)
2. **VWAP/Fibonacci/Trend standalone strategy (`backtest/strategies/*.ts`) 가 진짜 단독 진입 시그널을 router 에서 발행하는지 확인** → 만약 발행한다면 헌장 R3 위반. backtest 만 standalone 평가하고 *real-time signals 는 항상 BBDX 베이스에 곱셈* 인지 명확화 (04, 05, 06)
3. **SHORT path 와 5/7 onchain modifier (Netflow, Whale, ETF, Miner, LTH) 의 백테스트 알파 측정** → `runStandardCalibration` 에 SHORT 와 onchain breakdown 항목 추가 후 ≥100 signals 365d window 로 winRate vs baseline + Wilson CI lower bound 입증 (08-BACKTEST-CALIBRATION-AUDIT.md §3, 02-ONCHAIN-AUDIT.md §5)
