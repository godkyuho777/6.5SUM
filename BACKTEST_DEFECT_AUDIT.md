# Backtest Engine — Defect Audit (2026-05-11)

작업: dev 브랜치의 기존 백테스트 엔진 결함 식별 + Phase α (dual-engine)
통합 시점에서 fixable / deferred 분류.

스코프: `src/backtest/{runner, signal-extractor, metrics, calibration,
data-loader}.ts` + `src/backtest/strategies/*` + 신규 `engines/*`.

방법: 코드 read-only audit + 명세서 (BBDX v6.x, DUAL_BACKTEST_ENGINE_PLAN,
MACRO_LIQUIDITY_TRACKER_v2) 와 대조.

---

## 요약

| # | 결함 | 위치 | 영향도 | 상태 |
|---|---|---|---|---|
| D1 | 수수료/슬리피지 trade-by-trade 미적용 | `runner.ts` / `signal-extractor.ts` | High | **fix** (이번 PR) |
| D2 | Wilson CI 가 메트릭에 노출되지 않음 | `metrics.ts:computeMetrics` | Medium | **fix** (이번 PR) |
| D3 | look-ahead 보장이 구조적이지만 런타임 assertion 없음 | `signal-extractor.ts` | Medium | **fix** (이번 PR) |
| D4 | Sample size 경고가 결과 객체에 미부착 | `runner.ts` / `BacktestResult` | Medium | **fix** (이번 PR) |
| D5 | Multiple comparison (BH FDR) 미적용 | runner / DB | High | **deferred (Engine A/B 에 구현 완료, runner 미적용)** |
| D6 | OOS 분리 / walk-forward 부재 | `runner.ts` | High | deferred (Phase β) |
| D7 | Perp funding cost 누적 부재 | `signal-extractor.ts` | Medium | deferred (spot-only 기준, perp 사용 시 결함) |
| D8 | Fixed 5% cap 외 position-sizing 옵션 없음 | `signal-extractor.ts` | Low | deferred |
| D9 | Time-stop 이 bar-count 만 (volatility 비례 없음) | `signal-extractor.ts:measureOutcomeTiered` | Low | deferred |
| D10 | Drawdown 이 trade-by-trade equity curve 만 | `metrics.ts:calcMaxDrawdown` | Low | accepted (현재 모델에 적합) |
| D11 | 모든 strategy 가 fixed long bias — short 우회 검증은 별도 | `strategies/bbdx-short.ts` | Low | accepted |

---

## 결함 상세

### D1 — 거래 비용 누적 누락

**위치**: `src/backtest/runner.ts` + `src/backtest/signal-extractor.ts`

**증상**: `metrics.ts` 는 `applyCostModel(rawReturnPct, model)` 헬퍼와
`DEFAULT_COST_MODEL = { fee_pct: 0.001, slippage_pct: 0.0005 }` 를 export
하지만, `signal-extractor.ts` 의 `measureOutcomeTiered` 가 반환하는
`returnPct` 는 fee/slippage 가 적용되지 않은 raw 값.

`runner.ts` 는 `computeMetrics(trades)` 를 그대로 호출 — `trades[i].returnPct`
는 round-trip cost 가 차감되지 않은 상태.

**영향**: 실거래 환경 (Bybit Spot 0.1% taker + 추정 슬리피지 0.05%) 에서는
trade 당 최소 0.3% 수익 손실. 작은 winRate 차이가 음수 expectancy 로 전환 가능.

**Fix (이번 PR)**:
1. `runner.ts` 의 `runBacktest` 가 `BacktestConfig.feePct`, `slippagePct` 옵션을
   받도록 확장 (default = `DEFAULT_COST_MODEL`).
2. `signal-extractor.ts` 의 `extractSignalsFromCandles` 가 config 의 cost-model
   을 trade.returnPct / win 계산에 적용 (round-trip).
3. raw 값을 보존하려는 호출자를 위해 `trade.rawReturnPct` 도 함께 저장 (옵션,
   backward-compat 위해 미적용 — 별도 follow-up).

### D2 — Wilson CI 미노출

**위치**: `src/backtest/metrics.ts:computeMetrics`

**증상**: `BacktestMetrics` 에 `winRate` 만 있고 `ci_low`/`ci_high` 가 없음.
`metrics.ts` 에는 이미 `withCi()`, `wilsonScoreInterval()` 이 있지만
`runner.ts` 는 호출하지 않음.

**Fix (이번 PR)**:
- `runner.ts` 가 `withCi(overall)` 로 변환하여 결과의 `overall` 을
  `BacktestMetricsExt` (CI 포함) 로 격상.
- 신규 Engine A/B (`single-indicator`, `multi-strategy`) 는 이미 CI 포함.

### D3 — Look-ahead assertion 부재

**위치**: `src/backtest/signal-extractor.ts:extractSignalsFromCandles`

**증상**: 구조적으로는 안전:
- `windowCandles = candles.slice(Math.max(0, i - 199), i + 1)` — 정확히 [0..i]
- `measureOutcomeTiered(candles, i, ...)` 는 `i+1..endIdx` 만 접근

그러나 strategy 가 `candles[i+N]` 을 잘못 참조해도 잡지 못함. 미래에 새
strategy 작성자가 무심코 lookahead 를 도입하면 침묵 실패.

**Fix (이번 PR)**:
- `signal-extractor.ts` 헤더에 명시 + DEV assertion 추가:
  `strategy.shouldEnter` 가 받는 candles 배열의 length 가 `i+1` 보다 작거나
  같은지 sanity check (NODE_ENV !== production).
- 신규 Engine A/B 의 `timeline-types.ts:assertNoLookahead` 와 동일 정신.

### D4 — Sample size 경고 미부착

**위치**: `BacktestResult.overall`

**증상**: `classifySampleSufficiency` 가 metrics.ts 에 정의되어 있지만
`runner.ts` 는 콘솔 로그에만 출력. `BacktestResult.overall.sample_sufficiency`
필드가 없음 — 호출자 (UI/API consumer) 가 확인 불가.

**Fix (이번 PR)**: D2 와 동일 fix 로 해결 (`withCi` 가 `sample_sufficiency`
포함).

### D5 — Multiple comparison (BH FDR) 미적용

**위치**: 사용자 hypothesis 등록 + runner 의 결과 노출

**증상**: `src/backtest/statistics/multiple-comparison.ts` 의
`benjaminiHochberg`, `applyMultipleComparisonCorrection` 이 구현돼 있지만
`runner.ts` 의 path 에는 호출 X. 같은 사용자가 100 번 백테스트하면 5% 이
우연으로 유의미하게 보일 수 있음.

**Fix (deferred)**:
- DB 통합 필요 (사용자별 hypothesis registry). Phase β 에서 user_hypotheses
  drizzle 테이블 추가 + runner 가 자동으로 BH 보정한 결과를 응답에 포함.
- 현재 Engine A/B 는 단일 결과의 p-value 만 보고. 다중 가설 보정은 frontend
  가 등록된 hypothesis 와 함께 호출하는 별도 endpoint 로 분리 예정.

### D6 — OOS / walk-forward 부재

**위치**: `src/backtest/runner.ts`

**증상**: train/test split, walk-forward, k-fold 없음. 한 번에 모든 데이터
사용. 임계값 튜닝 시 자동으로 overfit.

**Fix (deferred — Phase β)**:
- `runBacktestWalkForward(symbols, splits, params)` 신규 함수.
- DUAL_BACKTEST §5 의 walk-forward 사양 따름.

### D7 — Perp funding cost 누락

**위치**: `signal-extractor.ts:measureOutcomeTiered`

**증상**: 본 엔진은 Bybit Spot 캔들 (data-loader.ts 의 endpoint) 만 가정.
Perp 으로 확장 시 funding rate 8시간마다 누적 X.

**Fix (deferred)**: spot-only 기준에서는 결함 X. Perp 확장 시 funding cost
계산 모듈 추가 후 `measureOutcomeTiered` 에서 누적.

### D8 — Position-sizing 옵션 없음

**위치**: `signal-extractor.ts`

**증상**: 모든 trade 는 100% size (returnPct 그대로). ATR 비례, Kelly, fixed
fraction 등 옵션 X. risk-of-ruin 시뮬레이션 불가.

**Fix (deferred)**: Position-sizing 모듈은 BBDX v6.5 ENTRY 차원에 직접 영향.
별도 audit 후 진행.

### D9 — Time-stop 이 bar-count 만

**위치**: `signal-extractor.ts:measureOutcomeTiered` (window 인자)

**증상**: `outcomeWindowCandles` 가 고정 bar 수. ATR 폭발 / 변동성 급변에
adaptive X.

**Fix (deferred)**: ATR-scaled time-stop 추가 시 BBDX exit 차원 변경 → 별도
PR (헌장 검증 필요).

### D10 — Drawdown 모델 (Accepted)

**위치**: `metrics.ts:calcMaxDrawdown`

**상태**: 현재 trade-by-trade equity curve 기반 — 동시 다중 포지션이
없는 single-strategy 모델에 적합. Portfolio 백테스트 도입 전까지 변경 불필요.

### D11 — Long bias (Accepted)

**위치**: `strategies/bbdx-short.ts` 가 별도 존재 — long/short side 분리 측정
`metrics.ts:computeMetricsBySide`. 본 audit 범위 외.

---

## 권장 후속

1. **Phase α (즉시, 이번 PR)** — D1, D2, D3, D4 fix.
2. **Phase β (다음 PR)** — D5 (사용자 hypothesis registry + drizzle 테이블),
   D6 (walk-forward), D9 (ATR time-stop).
3. **Phase γ (조건부)** — D7 (perp 확장 시), D8 (position-sizing module).
4. **모니터링** — D10/D11 은 portfolio mode / pure-short alpha 측정 필요 시
   재검토.

---

## 회귀 보호

이번 PR fix 에 대한 회귀 보호:

- `metrics.test.ts` (기존) — cost-model 적용 후 winRate 가 양수 영역
  유지되는지 smoke.
- `single-indicator.test.ts` (신규) — fee/slippage 인자 별 avg_return 비교
  테스트 포함.
- `multi-strategy.test.ts` (신규) — DSL 결과의 `alpha_significant` 가
  `p_value < 0.05 && sample_sufficiency !== "insufficient"` 인 경우만 true
  인지 확인.
- `timeline.test.ts` (기존) — `assertNoLookahead` boundary 케이스.

---

## 산출 요약

- 총 결함: 11
- Fix (이번 PR): 4 (D1, D2, D3, D4)
- Deferred: 6 (D5, D6, D7, D8, D9 + future)
- Accepted (변경 불필요): 2 (D10, D11)
