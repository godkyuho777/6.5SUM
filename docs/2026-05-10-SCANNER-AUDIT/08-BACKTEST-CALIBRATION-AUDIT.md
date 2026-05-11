# 08 — Backtest Calibration Audit (Phase 1+2+3)

## 0. 개요

`src/backtest/` 의 백테스트 엔진 — 헌장 R2 (백테스트 알파) 의 운영 인프라.

- `data-loader.ts` — Bybit V5 시간 페이지네이션
- `signal-extractor.ts` — Lookahead-free 시그널 재생 (Phase 1: tier 1/2 partial exits)
- `metrics.ts` — winRate / Sharpe / MDD / PF / Expectancy
- `runner.ts` — orchestrator + DB 저장
- `cli.ts` — `pnpm backtest`
- `calibration.ts` — Wilson 95% CI 임계값 자동 도출 (Phase 3)
- `strategies/*.ts` — 4 strategy (bbdx / fibonacci / vwap / trend)
- `report-generator.ts` — markdown 리포트

## 1. Lookahead-free 보장 검증 (`signal-extractor.ts`)

### 1.1 현재 룰 (`extractSignalsFromCandles:227-310`)

```ts
for (let i = minWarmupCandles; i <= maxSignalIdx; i++) {
  // ── Lookahead-free: candles[0..i] 만 사용 ────────────
  const windowCandles = candles.slice(Math.max(0, i - 199), i + 1);
  const indicators = calculateAllIndicators(windowCandles);
  ...
  // outcome 측정: candles[i+1..i+window]
  const outcome = measureOutcomeTiered(candles, i, ...);
}
```

### 1.2 검증 통과

- `windowCandles = candles.slice(.., i + 1)` — i 포함 (close 시점 결정).
- outcome 시작 `i + 1` — i+1 캔들부터 결과 측정 — 정상.
- `calculateAllIndicators` → 입력 candles 만 참조, 미래 미참조.

### 1.3 잠재 결함

#### L1. `calculateAllIndicators` 의 fib levels (P2)
- `calculateFibonacciLevels(maxHigh, minLow, 'up')` — windowCandles 의 max/min.
- *간접* 결함: anchor 정의에 따라 fib levels 가 i 시점의 의미에 영향.
- lookahead-free 자체는 통과 (windowCandles 가 candles[0..i]).
- 단점: anchor 가 *200 캔들 max* 라 *과거 spike* 가 anchor 됨 — 진짜 swing 이 아닌 outlier-anchor (05-FIBONACCI-AUDIT 의 F2 와 동일).

#### L2. `aggregatePatternScore` 의 ageDiscount (P3)
- `Math.exp(-d.candlesAgo / 3)` — windowCandles 안의 패턴 lookback (5 캔들).
- 정상.

#### L3. `detectOrderBlock` swing 탐지 — fractal i+2 까지 필요 (P2)
- `findRecentSwingLow(lows, lastIdx, 20)` — `i = lastIdx - 2` 부터 검사 (`order-block.ts:42`).
- fractal 5-bar 는 i±2 필요 → lastIdx-2 까지가 max → **lookahead-free 통과**.

#### L4. `detectMacdDivergence` swing 탐지 (P2)
- 동일 — `findSwingHighs(highs, maxIdx)` → i ≤ maxIdx-2 까지만 (`macd-divergence.ts:81-93`).
- lookahead-free 통과.

### 1.4 종합 lookahead 검증

- 코어 BBDX (RSI, BB, ADX) — lookahead-free ✓
- Pattern (`detectPatternsAtIndex`) — windowCandles 만 사용 ✓
- Modifier (EMA Ribbon, MACD div, Order Block) — i±2 fractal lag, lookahead-free ✓
- Onchain (`computeOnchainScore`) — runtime fetch (backtest 시 stub 0 또는 mock) — lookahead 영향 X
- Trend (`analyzeTimeframeTrendDeep`) — windowCandles 의 close/high/low 만 ✓
- Sentiment — backtest 에 미통합 (별도 데이터 source) — 백테스트에서 안 쓰임

**결론**: Lookahead-free 보장 통과. 단 L1 의 anchor 결함이 *알파 distortion* 영향.

---

## 2. 청산 측정 (Phase 1: tier 1/2 partial)

### 2.1 현재 룰 (`measureOutcomeTiered:57-186`)

청산 우선순위 (한 캔들 내):
1. Stop 도달 (low ≤ stopLoss) → 잔여 100% 손절
2. Tier 2 도달 (high ≥ target2) → 잔여 100% 청산
3. Tier 1 도달 (high ≥ target1) → 50% 부분 청산 (잔여 50% 는 다음 caps)

윈도우 만료 → 잔여 마지막 close 청산.

### 2.2 단점

#### O1. 캔들 내 이벤트 순서 (P1)
- `c.low <= stopLoss` 검사 후 `c.high ≥ target2` 검사.
- 같은 캔들에 stop + target2 둘 다 도달 가능 (큰 변동성).
- 현재 코드: stop 먼저 검사 → 잔여 100% 손절.
- **단점**: 실시간 환경에서 stop 보다 먼저 target 도달 가능. 캔들 단위 측정으로 *어느 이벤트가 먼저 인지 불명* — *비관적 가정* (stop 먼저) 으로 통일.
- spec 정합 — 보수적 ✓.
- 단 backtest winRate 가 *약간 저평가* — 실제 라이브에서 더 좋을 가능성.

#### O2. Tier 1 도달 후 잔여 50% 의 stop 동일 (P2)
- Tier 1 (50% partial) 후 잔여 50% 는 *원래 stop 그대로* 유지.
- `protection.ts:C1` (breakeven move) 같은 동적 stop 이동 없음.
- 결과: Tier 1 후 잔여 50% 가 원래 손익비 그대로 운영 — partial 의 의미 부분 상실.
- 권고: Tier 1 도달 후 stop 을 *entry 로 이동* (breakeven), 또는 *원래 stop + 0.3% above* (tighten).

#### O3. tier1_then_window 의 잔여 청산 가격 (P3)
- 윈도우 만료 시 잔여 50% 가 *마지막 close 가격* 으로 청산.
- 단점: Tier 1 후 잔여가 *천천히 추세 따라가는 환경* 에서 마지막 close 가 의미 없을 수 있음 — 보다 합리적 청산: 마지막 캔들 close 또는 trailing stop 적용 후 도달가.
- 단 단순 측정으로 OK.

### 2.3 개선안

- O2: Tier 1 도달 후 stop = `max(originalStop, entryPrice)` 로 breakeven 이동.

### 2.4 영향 가설

- O2 → 잔여 50% 의 손실 cap → **MDD ↓ 2~4%**, **expectancy ↑ slightly**.

---

## 3. Wilson CI Calibration (`calibration.ts`)

### 3.1 현재 룰

- `wilsonScoreInterval` — 정확. z=1.96 (95% CI).
- `bucketByValue` — edges 배열 기반 bucket, 마지막 inclusive.
- `calibrate` — bucket 별 winRate vs baseline + 5%p threshold.
- `STANDARD_CALIBRATION_PARAMS` — 7개 표준 파라미터.

### 3.2 단점

#### CB1. baseline + 5%p hardcoded (P2)
- `b.ciLower >= baselineWinRate + 0.05` (`calibration.ts:208`).
- 5%p 절대값 — winRate 50% 와 90% 환경에서 같은 임계.
- 단점: 90% baseline 환경에서 95%p 차이는 *통계 노이즈*. 50% baseline 의 5%p 보다 의미 큼.
- 권고: relative threshold (e.g. 10% relative improvement).

#### CB2. `sufficient: n >= 20` (P2)
- 작은 표본 — 20 trade 면 Wilson CI 폭 매우 큼 (winRate 50% n=20 → CI 28~72%).
- 권고: `sufficient: n >= 50` (CI 폭 ±15%).

#### CB3. SHORT path / additional modifiers calibration param 누락 (P1)
- `STANDARD_CALIBRATION_PARAMS` 에 LONG BBDX 만.
- 누락:
  - SHORT path RSI / BB tolerance / ADX
  - VWAP standalone vs modifier alpha
  - Fib retracement depth alpha
  - Trend strategy alpha
  - Onchain modifier 별 alpha (각 7개)
  - Wave Alignment alpha
  - Funding Extreme alpha
  - Market Breadth alpha
- 결과: 6 modifier + onchain 7 + 3 standalone strategy = **15+개 알파 측정 0건** — 헌장 R2 통과 못함.

### 3.3 개선안

- CB1: relative threshold 추가 옵션.
- CB2: `sufficient: n >= 50`.
- CB3: param 추가 — 가장 시급한 P1 작업.

---

## 4. Backtest Strategy 등록 (`strategies/index.ts:46`)

- 4 strategy registered: bbdx / fibonacci / vwap / trend.
- BBDX strategy (`bbdx.ts`) 가 default.
- 각 strategy 가 `dimensionsCovered` 메타 — assertion 사용 가능.

### 4.1 단점

#### S1. 4 strategy 가 *동일 universe + tf* 에서 동시 백테스트 시 cooldown 충돌 (P3)
- `cooldownCandles=5` — 각 strategy 별로 별도 lastSignalIdx 추적해야.
- 현재 `signal-extractor.ts:226` `let lastSignalIdx = -Infinity;` 가 strategy 별 분리 X (single value).
- backtest 가 single strategy 만 실행 — 충돌 사실 X. 단 multi-strategy 동시 실행 시 cooldown 정확도 의심.

#### S2. SHORT strategy 누락 (P1)
- `bbdx.ts` 는 LONG only.
- SHORT 백테스트 strategy 신규 필요 — `decideShortEntry` 사용.

---

## 5. Metrics 계산 (`metrics.ts`)

### 5.1 현재 룰

- mean, std, winRate, Sharpe (avgReturn / stdReturn), MDD (equity curve peak-to-trough), Profit Factor, Expectancy.

### 5.2 단점

#### MT1. Sharpe 의 무위험 수익률 0 가정 (P3)
- `sharpe = stdReturn > 0 ? avgReturn / stdReturn : 0`.
- 트레이드 단위 — 정상.
- 단점: 연환산 Sharpe 표시 시 trades_per_year 비례 — UI 표시 spec **확인 필요**.

#### MT2. MDD가 trades 순서 의존 (P2)
- `calcMaxDrawdown` 가 `trades.forEach((t) => equity *= 1 + t.returnPct/100)` — trades 가 signalTs 순서대로 정렬되어야.
- `extractAllSignals:335` 가 `sort((a, b) => a.signalTs - b.signalTs)` ✓.
- 통과.

#### MT3. profitFactor Infinity edge case (P3)
- `totalLoss=0` 일 때 `totalProfit > 0` 면 Infinity, else 0.
- UI 표시 시 `Infinity` 처리 명확히 필요.

---

## 6. 헌장 R2 (Backtest Alpha) 종합 검증

### 6.1 통과 항목

- BBDX LONG core (RSI / BB / ADX) — calibration param 있음, alpha 측정 가능.
- Pattern Confluence — calibration param 있음.
- Higher-TF SMA(50) gate — backtest 에 wired.

### 6.2 미통과 항목 (R2 위반 가능)

- BBDX SHORT path
- 6 additional modifiers (`combineAdditionalModifiers` 미통합)
- 7 onchain modifier 각각의 알파 분리 (현재 onchain 통합 mult 만 측정)
- Macro Liquidity multiplier
- Wave Alignment multiplier
- VWAP / Fibonacci / Trend standalone alpha (backtest 측정 가능하지만 *baseline 비교 결과 사용 흔적 미확인*)
- Wave Sentiment & Matrix prediction 효용

### 6.3 즉시 시정안

1. `STANDARD_CALIBRATION_PARAMS` 에 SHORT path + 6 modifier mult + onchain 7 modifier value + macro mult + wave mult 항목 추가 (15개).
2. `runStandardCalibration` 결과를 PR comment / CI log 에 자동 출력 (현재 사용 흔적 미확인 — `report-generator.ts` 와 wiring **확인 필요**).
3. SHORT backtest strategy 신규 (`backtest/strategies/bbdx-short.ts`).

## 7. 권고 우선순위

| 항목 | P | 영향 |
|---|---|---|
| SHORT path calibration param 추가 | **P1** | R2 통과 |
| 6 modifier alpha 분리 측정 | **P1** | R2 통과 |
| 7 onchain modifier alpha 분리 | **P1** | R2 통과 |
| Tier 1 후 stop breakeven 이동 (O2) | P2 | MDD |
| Calibration relative threshold (CB1) | P2 | 정확도 |
| sufficient n 20→50 (CB2) | P2 | CI 폭 |
| Fib anchor 결함 수정 (L1) | P1 | 알파 distortion |
| `runStandardCalibration` 결과 CI 자동 출력 | P2 | 운영 |
