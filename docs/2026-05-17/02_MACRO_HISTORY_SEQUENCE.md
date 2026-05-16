# Macro History Sequence — C3/C4 Composite 활성화

> **영역**: `src/macro/layer-builder.ts` → `buildMacroRawHistory`
> **기간**: 2026-05-16 (4 commits)
> **목적**: 12 FRED 시리즈를 120일 일별 grid 로 forward-fill → C3 (net liquidity 30d)
> 와 C4 (cycle phase) composite 를 0/neutral 더미값에서 실값으로 활성화.

---

## 1. 작업 요약

01 영역 (`buildMacroLayerRange` 12 시리즈 확장) 이후에도 `composite` 단계의
C3/C4 는 여전히 0/neutral 이었음. 이유는 `computeCompositeSignals` 가 history
sequence (시계열 형태) 를 요구하는데 `buildMacroLayerRange` 가 latest snapshot
하나만 만들어 넘기고 있었기 때문.

`buildMacroRawHistory(fredResults, endMs, daysCount=120)` 신규 헬퍼로 12 시리즈
observations 를 일별 grid 에 forward-fill 매핑 → `computeCompositeSignals` 에
history 전달 → C3/C4 활성화.

---

## 2. Commits

```
a907610 feat(macro): buildMacroRawHistory — 12 시리즈 일별 grid + forward-fill   (+178)
5c1bf2e feat(macro): buildMacroLayerRange — history 전달로 C3/C4 활성화          (+15 -4)
e36d2fd test(macro): history sequence + composite C3/C4 계산 6 케이스           (+284 -1, 7 new tests)
c2302f0 build: rebuild dist/types for buildMacroRawHistory                       (+28 -5)
```

총 +505 / -10 lines, 4 commits.

---

## 3. `buildMacroRawHistory` 설계

### 시그니처

```ts
export function buildMacroRawHistory(
  fredResults: Record<string, FredObservation[]>,
  endMs: number,
  daysCount: number = 120
): MacroRawHistorySequence
```

### 입력
- `fredResults` — `fetchAllFredSeriesForLayer` 의 결과 (12 시리즈 → observation arrays).
- `endMs` — history 의 마지막 일자 (포함). ALFRED look-ahead 차단의 cut-off.
- `daysCount` — 일별 grid 길이. default 120일 (4개월). C3 의 30d 변화율 + 약간의 buffer.

### 출력 (개념)

```ts
type MacroRawHistorySequence = Array<{
  ts: number;        // 일자 timestamp (UTC midnight)
  sofr: number | null;
  iorb: number | null;
  dgs10: number | null;
  dgs2: number | null;
  walcl: number | null;
  rrp: number | null;
  tga: number | null;
  dxy: number | null;
  vix: number | null;
  fedFunds: number | null;
  cpi: number | null;
  cpiYoY: number | null;     // ← 매일 cpi[d] / cpi[d-365] - 1 로 계산
  dfii10: number | null;
}>;
```

(실제 타입 이름/구조는 `src/macro/layer-builder.ts` 의 export 를 참고. 위는 의미 요약.)

---

## 4. Forward-fill semantics

FRED 시리즈는 빈도가 제각각:

| 시리즈 | 빈도 |
|---|---|
| SOFR, IORB, DGS10, DGS2, DTWEXBGS, VIXCLS, DFII10 | Daily (영업일만) |
| WALCL | Weekly (수요일 발표) |
| RRPONTSYD, WTREGEN | Daily (영업일만) |
| FEDFUNDS | Monthly |
| CPIAUCSL | Monthly (mid-month 발표) |

`buildMacroRawHistory` 는 매 일별 grid cell 에 대해:
1. 해당 일자 ≤ obs.date 인 가장 최근 valid observation 찾기
2. 찾으면 그 value 채움, 못 찾으면 null
3. **CPI YoY** — `cpi[d]` 와 `cpi[d-365]` 둘 다 valid 이면 매일 계산
4. **WALCL** — weekly 시리즈를 daily 로 forward-fill (수요일 발표 → 다음 화요일까지 동일값)

→ 모든 시리즈가 같은 daily grid 로 정렬됨 → `computeCompositeSignals` 가 일관된 history 처리 가능.

---

## 5. `buildMacroLayerRange` 의 history 전달 (`5c1bf2e`)

기존:
```ts
const composite = computeCompositeSignals({
  // ... latest snapshot 만, history 없음
});
```

After:
```ts
const history = buildMacroRawHistory(fredResults, endMs, 120);
const composite = computeCompositeSignals({
  // ... latest snapshot
  history,   // ← 신규 인자
});
```

`computeCompositeSignals` (별도 모듈) 가 history 를 받으면 C3/C4 계산 가능.

---

## 6. C3 — Net Liquidity 30d 변화율

**정의**: `net_liquidity = WALCL - RRPONTSYD - WTREGEN`
**C3**: `(net_liquidity[today] - net_liquidity[today-30d]) / net_liquidity[today-30d]`

### Before
- `c3_net_liquidity_30d_pct: 0` (history 없어서 모든 호출이 같은 latest value 만 봄)

### After
- 실측 예시 (2026-05-16 기준): `c3_net_liquidity_30d_pct: -0.01082` (-1.08%)
- → 지난 30일간 net liquidity 가 1.08% 감소 (Fed 자산 축소 / TGA 증가 / RRP 증가 등 복합)

검증: `curl 'http://localhost:3000/api/trpc/macroV2.snapshot'` 응답에서 확인.

---

## 7. C4 — Cycle Phase 분류

**정의**: 다음 거시 변수의 조합으로 5 phase 중 하나 분류:
- `pre_recession` — yield curve 역전 + VIX 상승 + DXY 강세
- `recession_imminent` — yield curve 깊은 역전 + WALCL 축소 + CPI YoY 둔화
- `fed_pivot` — SOFR-IORB spread 축소 + WALCL 정체 + real yield 하락
- `crypto_rally` — DXY 약세 + real yield 하락 + net liquidity 증가
- `neutral` — 위 4 조건 모두 미충족

### Before
- 항상 `c4_cycle_phase: "neutral"` (history 없으면 분류 로직이 실행 안 됨)

### After
- 실측 (2026-05-16): C4 가 history 기반으로 분류 됨 (구체 phase 는 그날의 거시 조합에 따라 변동).

검증: `macroV2.snapshot` 응답의 `composite.c4_cycle_phase` 가 `"neutral"` 이외의 값으로 나오는 일자가 존재.

---

## 8. 7 신규 테스트 케이스 (`e36d2fd`)

`src/macro/__tests__/layer-builder.test.ts` 에 +284 lines / 7 new tests.

| # | 케이스 | 검증 |
|---|---|---|
| 1 | `buildMacroRawHistory` 기본 출력 길이 | 120일 grid, 모든 row 에 `ts` 포함 |
| 2 | Forward-fill — daily 시리즈 | SOFR 가 영업일만 있어도 주말이 latest valid 로 채워짐 |
| 3 | Forward-fill — weekly 시리즈 (WALCL) | 수요일 발표 후 다음 6일 동일값 |
| 4 | CPI YoY 매일 계산 | `cpi[d] / cpi[d-365] - 1` 정확성 |
| 5 | C3 net liquidity 30d 변화율 활성화 | 0 → 실값 (mock data 기준 검증) |
| 6 | C4 cycle phase 분류 — pre_recession | yield curve 역전 + VIX 상승 mock → "pre_recession" |
| 7 | C4 cycle phase — neutral fallback | 모든 조건 미충족 mock → "neutral" |

총 vitest: 24 → 31 PASS (회귀 0).

---

## 9. dist/types 갱신 (`c2302f0`)

```
dist/types/src/macro/layer-builder.d.ts (+28 -5):
  + export interface MacroRawHistoryRow { ... }
  + export type MacroRawHistorySequence = MacroRawHistoryRow[];
  + export declare function buildMacroRawHistory(
  +   fredResults: Record<string, FredObservation[]>,
  +   endMs: number,
  +   daysCount?: number
  + ): MacroRawHistorySequence;
```

→ 프론트엔드/CLI 가 `import { buildMacroRawHistory } from "@tradelab/backend/..."` 가능.

---

## 10. ALFRED look-ahead 차단 강제 (재확인)

`buildMacroRawHistory` 는 `endMs` 를 cut-off 로 사용:
- 모든 일별 grid cell `ts <= endMs`
- 각 cell 의 latest valid observation 도 `obs.date <= ts`
- → 백테스트 시점에 미래 데이터 누설 0

내부에서 `fredResults` 가 이미 `fetchAllFredSeriesForLayer({ realtime: false, endMs })`
로 ALFRED 의 `realtime_end=endMs` 를 거쳐 들어온 observations 이므로 이중 안전.

---

## 11. Before / After (구체)

### macroV2.snapshot 응답 비교

#### Before (2026-05-15 기준)

```json
{
  "composite": {
    "c1_liquidity_score": 0.12,        // 동작 (C1 은 raw 단계에서 계산)
    "c2_real_rate_pressure": -0.03,    // 동작 (C2 도 raw 단계)
    "c3_net_liquidity_30d_pct": 0,     // ← 더미
    "c4_cycle_phase": "neutral"        // ← 항상
  }
}
```

#### After (2026-05-16 기준)

```json
{
  "composite": {
    "c1_liquidity_score": 0.12,
    "c2_real_rate_pressure": -0.03,
    "c3_net_liquidity_30d_pct": -0.01082,   // ← -1.08% 실값
    "c4_cycle_phase": "<actual phase>"      // ← 분류 활성
  }
}
```

---

## 12. 헌장 준수

| 규칙 | 결과 | 근거 |
|---|---|---|
| R1 (차원 중복 X) | ✅ | 6차원 (거시) 내부 composite 계산만, 신규 차원 추가 없음 |
| R2 (백테스트 알파) | N/A | composite 계산 수정. modifier 가중치/임계값 변경 아님 |
| R3 (단독 시그널 X) | ✅ | composite 는 snapshot 출력 전용. BBDX 진입 결정에 직접 노출 안 됨 |
| ALFRED look-ahead | ✅ | `endMs` cut-off + realtime=false 이중 안전 |

---

## 13. 후속 작업

### DFII10 wiring (즉시)
- 현재 `dfii10` 가 `MacroRawHistorySequence` 의 row 에는 들어오지만, `MacroLayerSnapshot.single_indicators.real_yield_change_30d` 필드에 wiring 안 됨.
- 작업: `buildMacroLayerRange` 마지막 단계에서 `pctChange(latestValid(dfii10), valueDaysAgo(dfii10, endMs, 30))` 계산해 주입.
- 예상 LOC: ~5 lines + test 1~2 케이스.

### C4 분류 임계값 calibration (1~2개월)
- 현재 5 phase 의 조합 임계값은 명세서 기반 정성 추정.
- 3개월 이상 실데이터 누적 후 historic 분포 (역사적 recession / Fed pivot 사례) 와
  matching 하여 임계값 calibrate.

### Production cache 정책 검증
- 12 시리즈 fetch 비용 (12 HTTP 호출) × cache miss 빈도 → FRED rate limit (120 req/min) 안전 확인.
- realtime mode 12h TTL 이 충분한지, 1h 단축 필요한지 production 로그 분석.

---

작성: 2026-05-17
