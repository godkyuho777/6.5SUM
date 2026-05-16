# BBDX Combined Strategy — LONG + SHORT 통합 백테스트

> **영역**: `src/backtest/strategies/bbdx-combined.ts` 외 8 파일
> **기간**: 2026-05-15 (4 commits)
> **목적**: LONG (BBDX) 과 SHORT (BBDX Short) 두 strategy 결과를 한 번에 시간 순
> 병합 + `metricsBySide: { long, short, combined }` 출력하는 신규 strategy 추가.

---

## 1. 작업 요약

기존엔 LONG 백테스트와 SHORT 백테스트를 따로 두 번 실행한 뒤 사용자가 직접
결과를 머릿속으로 합쳐야 했음. `bbdx-combined` 신규 strategy 는 sentinel 패턴으로
시간 순 병합 결과를 한 번에 반환.

사용자 예제 시나리오 (테스트로 검증):
- LONG 백테스트: 10 trades, 6 wins → 60.0% win rate
- SHORT 백테스트: 5 trades, 2 wins → 40.0% win rate
- **Combined**: 15 trades, 8 wins → **53.3% win rate**

`combined` 의 메트릭은 시간 순 병합된 trade list 로부터 직접 계산 (가중평균 아님).

### Trend-Follow label rename
같은 시기 작업 — strategy ID `"trend-follow"` 는 backward-compat 유지하되
사용자에게 보이는 label 만 "EMA+ADX 정배열" 로 변경. UI/리포트에 일관된 명명.

---

## 2. Commits

```
817378c feat(backtest): add bbdx-combined strategy (LONG+SHORT unified)   (+527 -11, 8 files)
5e8377a feat(backtest): rename Trend-Follow label to "EMA+ADX 정배열"     (+1 -1)
8801205 build: rebuild dist/types for bbdx-combined                       (+60 -5, 5 files)
db94c7a feat(backtest): CLI --strategy 에 bbdx-combined 추가              (+8 -1)
```

총 +596 / -18 lines, 4 commits.

---

## 3. 신규 strategy 파일 — `src/backtest/strategies/bbdx-combined.ts`

73 lines, sentinel 패턴:

```ts
export const bbdxCombinedStrategy: BacktestStrategy = {
  id: "bbdx-combined",
  label: "BBDX Combined (LONG+SHORT)",
  side: "both",                          // ← 신규 union arm
  shouldEnter: () => false,              // ← sentinel — 직접 진입 결정 안 함
  shouldExit: () => false,
  // ... 기타 인터페이스 충족용 noop 메서드
};
```

### 의미
- `side: "both"` — 기존 `"long" | "short"` 에 신규 arm 추가.
- `shouldEnter` 가 항상 false → 절대 자체적으로 trade 발행 X.
- 실제 entry/exit 결정은 runner 가 분기하여 `bbdx` 와 `bbdx-short` 두 strategy 에 위임.
- 헌장 R3 (단독 시그널 X) 준수 — sentinel 자체가 신호를 만들지 않음.

---

## 4. `src/backtest/runner.ts` 분기 (+59 lines)

```ts
export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  if (config.strategy === "bbdx-combined") {
    const longSignals = await extractAllSignals({ ...config, strategy: "bbdx" });
    const shortSignals = await extractAllSignals({ ...config, strategy: "bbdx-short" });

    const longTrades = simulateTrades(longSignals, config);
    const shortTrades = simulateTrades(shortSignals, config);

    // 시간 순 병합 (signalTs 기준)
    const trades = [...longTrades, ...shortTrades]
      .sort((a, b) => a.signalTs - b.signalTs);

    return {
      trades,
      metricsBySide: {
        long: computeMetrics(longTrades),
        short: computeMetrics(shortTrades),
        combined: computeMetrics(trades),
      },
      // ... 기타 필드
    };
  }

  // 기존 단일-side path
  // ...
}
```

`computeMetricsBySide` 헬퍼 형태로도 export (`src/backtest/metrics.ts`).
**중요**: `combined` 는 가중 평균 아니라 병합 trade list 에서 직접 재계산.
→ Sharpe / MDD 같은 sequence-dependent 메트릭이 정확.

---

## 5. `src/backtest/types.ts` — `BacktestSideMetrics` (+18 lines)

```ts
export interface BacktestSideMetrics {
  long: BacktestMetrics;
  short: BacktestMetrics;
  combined: BacktestMetrics;
}

export interface BacktestResult {
  // ... 기존 필드
  metricsBySide?: BacktestSideMetrics;   // ← bbdx-combined 일 때만 채워짐
}
```

`bbdx-combined` 이외 strategy 는 `metricsBySide` 가 undefined.

---

## 6. zod input schema 갱신 — `src/routers.ts`

```ts
// Before
strategy: z.enum(["bbdx", "bbdx-short", "trend-follow", "fibonacci", "vwap"]).default("bbdx")

// After
strategy: z.enum([
  "bbdx",
  "bbdx-short",
  "bbdx-combined",          // ← 신규
  "trend-follow",
  "fibonacci",
  "vwap",
]).default("bbdx")
```

→ `trpc.backtest.run.useMutation({ strategy: "bbdx-combined" })` 가능.

---

## 7. CLI 지원 — `src/backtest/cli.ts` (+7 lines)

```bash
pnpm backtest --strategy bbdx-combined --symbol BTCUSDT --start 2024-01-01 --end 2024-12-31
```

`--strategy bbdx-combined` 가 zod enum 통과 → runner 의 combined 분기 작동.

---

## 8. Trend-Follow label rename (`5e8377a`)

`src/backtest/strategies/trend-follow.ts:65`:

```ts
// Before
label: "Trend-Follow"

// After
label: "EMA+ADX 정배열"
```

- ID `"trend-follow"` 유지 → 기존 백테스트 결과 / production 호출 호환.
- frontend-engineer 가 별도로 UI 에서 label 사용 시 자동 반영.

---

## 9. 20 신규 테스트 케이스

`src/backtest/strategies/bbdx-combined.test.ts` — 357 lines, 20 tests. 주요 케이스:

| 그룹 | # | 케이스 | 검증 |
|---|---|---|---|
| Registry | 1 | `bbdxCombinedStrategy.id === "bbdx-combined"` | identity |
| Registry | 2 | `strategies` registry 에 등록 | `index.ts` export |
| Sentinel | 3 | `shouldEnter` always false | 어떤 입력에도 진입 신호 발행 X |
| Sentinel | 4 | `shouldExit` always false | 어떤 입력에도 청산 신호 발행 X |
| Sentinel | 5 | `side === "both"` | 신규 union arm |
| Runner | 6 | bbdx-combined 분기 — LONG 만 fetch | mock bbdx strategy 호출 검증 |
| Runner | 7 | bbdx-combined 분기 — SHORT 도 fetch | mock bbdx-short strategy 호출 검증 |
| Runner | 8 | 시간 순 병합 — signalTs ascending | LONG/SHORT 교대 input → output sorted |
| Runner | 9 | 시간 순 병합 — 동시 timestamp tie-break | 동일 ts 시 안정 정렬 |
| Metrics | 10 | metricsBySide.long 독립 계산 | LONG trades 만으로 |
| Metrics | 11 | metricsBySide.short 독립 계산 | SHORT trades 만으로 |
| Metrics | 12 | metricsBySide.combined 재계산 | 가중평균 아닌 병합 list 기반 |
| Parity | 13 | 단독 bbdx run 결과 == combined.long | parity 보장 |
| Parity | 14 | 단독 bbdx-short run 결과 == combined.short | parity 보장 |
| 사용자 예제 | 15 | LONG 6/10 + SHORT 2/5 → combined 8/15 = 53.3% | win rate 정확 |
| 사용자 예제 | 16 | combined PnL = long PnL + short PnL | 합산 정확 |
| Edge | 17 | LONG=0 trades → combined == short | empty LONG 안전 |
| Edge | 18 | SHORT=0 trades → combined == long | empty SHORT 안전 |
| Edge | 19 | 양쪽 모두 empty → combined empty 메트릭 | division-by-zero 방지 |
| CLI | 20 | `--strategy bbdx-combined` zod 통과 | enum 갱신 검증 |

총 vitest: 757 → **777 PASS** (회귀 0).

---

## 10. dist/types 갱신 (`8801205`)

```
dist/types/src/backtest/strategies/bbdx-combined.d.ts (신규, 26 lines)
  - export declare const bbdxCombinedStrategy: BacktestStrategy;
  - export type Side = "long" | "short" | "both";    ← types.ts 확장 반영

dist/types/src/backtest/strategies/index.d.ts (+2 lines)
  + export * from "./bbdx-combined";

dist/types/src/backtest/strategies/types.d.ts (+11 -2)
  - side: "long" | "short" | "both";

dist/types/src/backtest/types.d.ts (+19 lines)
  + BacktestSideMetrics
  + BacktestResult.metricsBySide?

dist/types/src/routers.d.ts (+15 -5)
  - strategy zod enum 갱신
  - BacktestResult 시그니처 갱신
```

→ 프론트엔드가 `import { BacktestSideMetrics } from "@tradelab/backend/router"` 가능.

---

## 11. 헌장 준수

| 규칙 | 결과 | 근거 |
|---|---|---|
| R1 (차원 중복 X) | ✅ | 기존 LONG/SHORT 결합만 — 신규 차원 추가 없음 |
| R2 (백테스트 알파) | ✅ | 백테스트 회귀 757 → 777 PASS, 모든 기존 테스트 통과 |
| R3 (단독 시그널 X) | ✅ | sentinel — `shouldEnter` 항상 false, 진입 결정은 LONG/SHORT 본체에 위임 |
| Parity (idempotency) | ✅ | 단독 bbdx run 결과 == bbdx-combined.metricsBySide.long (테스트 13/14) |

---

## 12. 후속 작업

### 즉시 (1주)
- **frontend-engineer 작업** — `BacktestPage` 의 strategy selector 에 "BBDX Combined" 옵션 추가, `metricsBySide` 3-column 카드 UI 렌더링.
- **CLI 결과 출력** — 현재 CLI 는 combined 시 trades 만 stdout, metricsBySide 도 출력하도록 포맷 갱신 권장.

### 중기 (1개월)
- **Equity curve 시각화** — 시간 순 병합 trade list 기반 cumulative PnL 차트.
  단순 long-only / short-only 와 비교 시 risk-adjusted return 비교 가능.
- **Strategy weighting 옵션** — 현재 combined 는 LONG/SHORT 1:1 weight.
  size multiplier 옵션 (예: LONG 1.0x, SHORT 0.5x) 추가 검토.

### 장기 (3개월+)
- **3+ strategy 결합** — bbdx-combined 패턴을 generalize 하여 임의 strategy
  list 의 시간 순 병합 지원 (예: bbdx + fibonacci + vwap simultaneously).

---

작성: 2026-05-17
