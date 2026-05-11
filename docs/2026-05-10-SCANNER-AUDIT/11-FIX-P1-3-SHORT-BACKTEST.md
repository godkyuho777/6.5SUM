# P1-#3 FIX — SHORT 백테스트 Alpha 검증 인프라

**날짜**: 2026-05-10
**Audit 참조**: `00-INDEX.md` 우선순위 P1-#3, `01-BBDX-AUDIT.md` §2 (S2/S3), `08-BACKTEST-CALIBRATION-AUDIT.md` §3.2 (CB3)

## 문제 (Audit)

1. **헌장 R2 위반** — SHORT path (어제 추가됨, `decideShortEntry`) 의 backtest
   alpha 측정 0건. backtest engine 이 LONG-only 였음.
2. **자본 보호 누락 (S3)** — `isRisingKnife` 게이트가 `decideShortEntry` 외부에
   존재 (`호출 측 책임`). 라이브 환경에서 강한 상승 추세 중 SHORT 진입 가능
   위험.
3. **CB3** — `STANDARD_CALIBRATION_PARAMS` 에 SHORT 임계값 없음.

## 수정 사항

### 1. `signal-extractor.ts` — `measureOutcomeTiered` side-aware

LONG/SHORT 양방향 outcome 측정. helper closure 로 분기:

```typescript
const calcReturn = (exit: number) =>
  ((side === "long" ? exit - entryPrice : entryPrice - exit) / entryPrice) * 100;
const tierHit = (c: Candle, target: number) =>
  side === "long" ? c.high >= target : c.low <= target;
const stopHit = (c: Candle, stop: number) =>
  side === "long" ? c.low <= stop : c.high >= stop;
```

`maxFavorable` / `maxAdverse` 도 side 인지 — SHORT 의 favorable = 가격 ↓
가장 깊은 시점 = `entry - minLow`.

### 2. `strategies/types.ts` — `BacktestStrategy.side` 필드 + `bbdx-short` 등록

```typescript
export type StrategyName = "bbdx" | "bbdx-short" | "fibonacci" | "vwap" | "trend";
export type StrategySide = "long" | "short";

interface BacktestStrategy {
  // ...
  side?: StrategySide;  // default "long"
}
```

### 3. `strategies/bbdx-short.ts` (신규 — 167 라인)

`bbdx.ts` (LONG) 의 정확한 mirror:
- **Gate 1**: `decideShortEntry` (Rising Knife 차단 내장)
- **Gate 2**: bearish Pattern Confluence ≥ 0.4
- **Gate 3**: Higher-TF SMA(50) bearish/sideways (`checkHigherTfBearish`)
- **Modifier**: EMA Ribbon × MACD × OB → `invertMultiplier(2 - x)` 부호 반전
- **Tier 1**: `bbMiddle` (가격 하락 시 도달)
- **Tier 2**: `max(bbLower, entry × 0.95)`
- **Stop**: `min(bbUpper × 1.03, entry × 1.02)`

```typescript
export const bbdxShortStrategy: BacktestStrategy = {
  name: "bbdx-short",
  label: "BBDX SHORT (RSI / BB / ADX)",
  description: "v6.5 SHORT mirror — RSI 62~75 평균회귀 + BB 상단 + ADX 약함",
  dimensionsCovered: [1, 2, 3, 5],
  side: "short",
  // ...
};
```

### 4. `indicators.ts` — `decideShortEntry` 자본 보호 게이트 명시화 (Audit S3)

```typescript
export function decideShortEntry(...) {
  // ── 자본 보호 게이트 (P1-#3 fix) ──
  // 강한 상승 추세 (+DI > -DI && ADX > 25) 에서 평균회귀 SHORT 차단.
  // lowerRiding (추세 추종 SHORT) 만 예외.
  const risingKnife = isRisingKnife(ind.plusDi, ind.minusDi, ind.adx);
  if (risingKnife && bbStructureShort !== "lowerRiding") {
    return null;
  }
  // ... 기존 로직 (BB > PTN > NUM)
}
```

LONG 의 `isFallingKnife + upperRiding 예외` 와 정확히 미러.

### 5. `backtest/calibration.ts` — `SHORT_CALIBRATION_PARAMS` + `runShortCalibration`

5 SHORT 전용 파라미터 (RSI / ADX / Pattern / SignalStrength / Modifiers):

```typescript
export const SHORT_CALIBRATION_PARAMS: CalibrationParam[] = [
  { name: "rsi-short", edges: [55, 60, 62, 65, 70, 75, 85], currentThreshold: 65 },
  // ...
];

export function runShortCalibration(trades: BacktestTrade[]) {
  const shortTrades = trades.filter((t) => t.side === "short");
  return SHORT_CALIBRATION_PARAMS.map((p) => calibrate(shortTrades, p));
}
```

RSI edges 가 [55, 60, 62, 65, 70, 75, 85] — Audit S1 권고 (비대칭 미러: SHORT
RSI 65 부터, 폭 [65, 75]) 반영.

### 6. `backtest/metrics.ts` — `computeMetricsBySide`

```typescript
export function computeMetricsBySide(
  trades: BacktestTrade[],
): { long: BacktestMetrics; short: BacktestMetrics } {
  const longTrades = trades.filter((t) => (t.side ?? "long") === "long");
  const shortTrades = trades.filter((t) => t.side === "short");
  return { long: computeMetrics(longTrades), short: computeMetrics(shortTrades) };
}
```

LONG/SHORT winRate, Sharpe, MDD, Profit Factor 분리 출력.

### 7. `backtest/cli.ts` — CLI 통합

`--strategy bbdx-short` 옵션 추가. SHORT trade 가 1건 이상 시 자동 표시:

```
📐 LONG / SHORT split (P1-#3 alpha verification):
   LONG  : n=234 winRate=58.5% avgRet=1.42% Sharpe=0.34 MDD=18.2% PF=1.65
   SHORT : n=87  winRate=52.9% avgRet=0.92% Sharpe=0.21 MDD=14.1% PF=1.32
```

`--calibrate` 시 SHORT 별도 calibration report 자동 작성:
`backtest-reports/calibration_short_<runName>_<date>.md`

### 8. 단위테스트 13건 신규 (`__tests__/short-strategy.test.ts`)

- `computeMetricsBySide` 3 케이스
- `SHORT_CALIBRATION_PARAMS` 3 케이스
- `bbdx-short` registration 3 케이스
- `decideShortEntry` Rising Knife 차단 3 케이스
- SHORT win 정의 1 케이스

### 9. 추가 변경: `BacktestTrade.side` + `BacktestStrategyName`

```typescript
type BacktestStrategyName = "bbdx" | "bbdx-short" | "fibonacci" | "vwap" | "trend";
type BacktestSide = "long" | "short";

interface BacktestTrade {
  // ...
  side?: BacktestSide; // default "long" (backward compat)
}
```

`signal-extractor.ts` 가 strategy 의 side 를 trade record 에 직렬화.

## 헌장 검증

| 규칙 | 영향 | 검증 |
|---|---|---|
| **R1 차원 중복 X** | ✓ | SHORT 도 LONG 미러 — 같은 4 차원 (1/2/3/5). 새 차원 X. |
| **R2 백테스트 알파** | ✓ | **본 fix 의 핵심 목적** — SHORT 도 Wilson 95% CI / winRate / Sharpe 측정 가능. 5 SHORT calibration 파라미터 추가. |
| **R3 단독 시그널 X** | ✓ | `bbdx-short` 도 BBDX core (RSI+BB+ADX) 4-gate 직렬. modifier 단독 X. |
| **R4 자본 보호** | ✓ **강화** | `decideShortEntry` 내부 Rising Knife 게이트 명시 (audit S3 시정). |
| **R5 Knife 차단** | ✓ | LONG `isFallingKnife` + upperRiding 예외 ↔ SHORT `isRisingKnife` + lowerRiding 예외. |

## 사용법 — 알파 측정 시작 (사용자 액션)

```powershell
# 1. SHORT-only 백테스트 (180일, top 20 코인, 4h)
cd tradelab-backend
pnpm backtest --strategy bbdx-short --tf 4h --quick --calibrate

# 2. LONG + SHORT 분리 측정 (별도 실행 후 비교)
pnpm backtest --strategy bbdx --tf 4h --calibrate --name "long_v6.5"
pnpm backtest --strategy bbdx-short --tf 4h --calibrate --name "short_v6.5"
```

각 결과:
- `backtest-reports/<runName>_*.md` — 전체 metric
- `backtest-reports/calibration_<runName>_*.md` — Wilson CI 권고 임계
- 콘솔 끝에 `📐 LONG / SHORT split` 자동 출력

### 알파 합격 기준 (Charter R2)
- **n ≥ 100 trades** (각 side 별)
- **365d window** (또는 quick 모드 90d 첫 검증)
- **CI lower bound ≥ baseline + 5%p** (calibration.ts `b.ciLower >= baselineWinRate + 0.05`)
- **profitFactor ≥ 1.3** (수동 확인)

미통과 시 SHORT path 임계값 재조정 (signal-engineer 권고) 또는 feature flag 비활성.

## 검증

- ✅ `pnpm check` 0 exit
- ✅ `pnpm test` **493/493 pass** (+13 SHORT 신규)

## 다음 단계 (다음 회차)

- [ ] **사용자**: SHORT 백테스트 실행 + 결과 검토. winRate ≥ 55%, Sharpe ≥ 0.30, MDD ≤ 15% 권고.
- [ ] **alpha 입증 시**: `indicators-client.ts` 클라이언트 사이드 SHORT 미러
  추가 + Lite Alerts SHORT 발송 활성화.
- [ ] **alpha 미통과 시**: Audit S1 권고 (RSI [62→65, 75]) 적용 후 재측정.
- [ ] **RisingKnife 게이트**: live router 의 SHORT 진입 path 에서도 동일 게이트
  중복 검증 (defense in depth).
