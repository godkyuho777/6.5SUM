# Macro Layer Builder — 12 FRED 시리즈 확장

> **영역**: `src/macro/layer-builder.ts`
> **기간**: 2026-05-15 (4 commits)
> **목적**: `MacroLayerSnapshot` 의 7 single-indicator 필드 + composite 일부를
> 실제 FRED 데이터로 채움 (이전엔 모두 0/neutral).

---

## 1. 작업 요약

`buildMacroLayerRange` 는 기존에 SOFR + 한국은행(BOK) 만 fetch 했음. 결과적으로
`MacroLayerSnapshot` 의 single-indicator 필드 (`sofr_iorb_spread_bp`,
`yield_curve_10_2`, `walcl_change_30d_pct`, `rrp_tga_change_30d_pct`,
`dxy_change_30d`, `vix_level`, `real_yield_change_30d`) 가 모두 0 으로 떨어졌고,
`MacroLayerSnapshot.composite` 의 C3/C4 도 history 부재로 0/neutral 만 반환.

이번 확장은 그 첫 단계 — 12 FRED 시리즈를 **병렬 (Promise.all)** fetch 하고
헬퍼 함수로 30d / YoY 변화율을 계산하여 7 single-indicator 필드를 모두 실값으로
채움. (composite C3/C4 활성화는 02 영역 — `buildMacroRawHistory` 후속.)

---

## 2. Commits

```
173eaaf feat(macro): expand buildMacroLayerRange — 12 FRED series parallel fetch  (+317 -37)
4e7890a test(macro): layer-builder multi-series fetch coverage                    (+368 -1, 14 new tests)
befc698 build: rebuild dist/types for buildMacroLayerRange expansion              (+36 -9)
ba52b31 chore: gitignore .macro-cache/ (FRED disk cache, runtime only)            (+1)
```

총 +722 / -47 lines, 4 commits.

---

## 3. 12 FRED 시리즈

`src/macro/layer-builder.ts` 상단에 `FRED_SERIES_FOR_LAYER` 상수 추가 후 export:

| Series ID | 용도 | Snapshot 필드 |
|---|---|---|
| `SOFR` | Overnight 금리 | `sofr_iorb_spread_bp` (with IORB) |
| `IORB` | Interest on Reserve Balances | (paired with SOFR) |
| `DGS10` | 10Y Treasury yield | `yield_curve_10_2` (with DGS2) |
| `DGS2` | 2Y Treasury yield | (paired with DGS10) |
| `WALCL` | Fed balance sheet (weekly) | `walcl_change_30d_pct`, C3 net liquidity |
| `RRPONTSYD` | Reverse Repo | `rrp_tga_change_30d_pct`, C3 net liquidity |
| `WTREGEN` | Treasury General Account | `rrp_tga_change_30d_pct`, C3 net liquidity |
| `DTWEXBGS` | Trade Weighted USD (proxy DXY) | `dxy_change_30d` |
| `VIXCLS` | VIX | `vix_level` |
| `FEDFUNDS` | Fed Funds Rate (monthly) | `real_yield_change_30d` 보조 |
| `CPIAUCSL` | CPI All Urban (monthly) | `real_yield_change_30d`, C3 보조 |
| `DFII10` | 10Y TIPS (real yield) | `real_yield_change_30d` (wiring 후속) |

병렬 fetch — `Promise.all(FRED_SERIES_FOR_LAYER.map(id => fetchFredSeries(id, ...)))`.
실패 시 graceful — 개별 series 가 throw 해도 다른 series 는 영향 없음.

---

## 4. 신규 헬퍼 함수

`src/macro/layer-builder.ts` 에 4 헬퍼 + 1 fetch 오케스트레이터 신규:

```ts
function latestValid(obs: FredObservation[]): FredObservation | null
function valueDaysAgo(obs: FredObservation[], endMs: number, daysAgo: number): number | null
function pctChange(now: number | null, past: number | null): number | null
function latestObsMs(obs: FredObservation[]): number | null
async function fetchAllFredSeriesForLayer(opts: BuildMacroRangeOpts): Promise<Record<string, FredObservation[]>>
```

### 핵심 의미

- **`latestValid`** — observation 배열에서 가장 최근의 non-NaN, non-null value 를 가진 row 반환.
  FRED 는 weekly/monthly 시리즈도 daily 그리드로 응답하면서 빈 칸을 `.` 또는
  결측 NaN 으로 채움 → 단순 last index 가 아닌 latest valid 가 필요.

- **`valueDaysAgo`** — endMs 기준 `daysAgo` 일 이전의 값. 30d 변화율 계산용.
  forward-fill semantic — 정확히 30일 전 row 가 없으면 그 시점 이전 가장 가까운 valid value.

- **`pctChange(now, past)`** — `(now - past) / past`. null-safe (둘 중 하나라도 null 이면 null).

- **`latestObsMs`** — latest valid observation 의 timestamp (ALFRED look-ahead 차단 검증용).

- **`fetchAllFredSeriesForLayer`** — `Promise.all` 로 12 시리즈 동시 fetch, 결과를
  `Record<seriesId, FredObservation[]>` 형태로 반환. ALFRED `realtime_start` /
  `realtime_end` 자동 주입.

---

## 5. `BuildMacroRangeOpts.disableCache` 옵션

신규 옵션 추가 — 테스트가 cache 우회하고 fetch 자체 동작을 검증할 수 있도록.

```ts
export interface BuildMacroRangeOpts {
  endMs?: number;
  realtime?: boolean;
  cacheDir?: string;
  disableCache?: boolean;   // ← 신규
}
```

production 에서는 항상 `false` (default).

### Cache TTL 정책 (재확인)

| 모드 | TTL |
|---|---|
| `realtime: true` (default) | 12 시간 |
| `realtime: false` (백테스트 ALFRED) | 영구 (filename 에 realtime_end ms 포함되어 hash 됨) |

`.macro-cache/` 디렉토리는 commit `ba52b31` 으로 `.gitignore` 에 등록 — runtime only, 절대 commit 금지.

---

## 6. ALFRED look-ahead 차단 강제

기존 `buildMacroLayerRange` 의 핵심 안전장치 — `realtime_end <= endMs` 강제.
이번 확장에서도 동일하게 유지:

```ts
const fredResults = await fetchAllFredSeriesForLayer({
  endMs,
  realtime: opts.realtime,
  // realtime=false 일 때 fetchFredSeries 가 realtime_end=endMs 로 호출
});
```

→ ALFRED API 가 `endMs` 시점에 "이미 발표된" observation 만 반환하도록 보장.
백테스트 lookahead 방지의 핵심.

---

## 7. Before / After

### Before (`173eaaf` 이전)

```json
{
  "as_of": 1747526400000,
  "single_indicators": {
    "sofr_iorb_spread_bp": 0,
    "yield_curve_10_2": 0,
    "walcl_change_30d_pct": 0,
    "rrp_tga_change_30d_pct": 0,
    "dxy_change_30d": 0,
    "vix_level": 0,
    "real_yield_change_30d": 0
  },
  "composite": { ... C1/C2 만 동작, C3/C4 는 0/neutral ... }
}
```

### After (`befc698` 이후)

```json
{
  "as_of": 1747526400000,
  "single_indicators": {
    "sofr_iorb_spread_bp": -9.0,
    "yield_curve_10_2": 0.48,
    "walcl_change_30d_pct": 0.0034,
    "rrp_tga_change_30d_pct": -0.012,
    "dxy_change_30d": -0.0084,
    "vix_level": 18.4,
    "real_yield_change_30d": 0.0     // ← DFII10 wiring 후속 (02 후속에서)
  },
  "composite": { ... C1/C2 동작 + C3/C4 는 history 활성 후 (02 영역) ... }
}
```

---

## 8. 14 신규 테스트 케이스

`src/macro/__tests__/layer-builder.test.ts` 에 +368 lines / 14 new tests. 주요 케이스:

| # | 케이스 | 검증 |
|---|---|---|
| 1 | `fetchAllFredSeriesForLayer` 12 시리즈 동시 fetch | mock fetch 가 12 series 각각 호출되었는지 |
| 2 | 개별 series fetch 실패 graceful | DGS10 만 throw → DGS2 + 나머지 정상 |
| 3 | `latestValid` — NaN row skip | 마지막 row 가 NaN 이면 이전 valid row 반환 |
| 4 | `latestValid` — 모두 결측 시 null | 모든 row NaN → null 반환 |
| 5 | `valueDaysAgo` — 정확한 30d 이전 | 30일 전 row 가 있으면 그 값 |
| 6 | `valueDaysAgo` — forward-fill | 30일 전 row 없으면 이전 가장 가까운 valid |
| 7 | `pctChange` — null-safe | now=null 또는 past=null → null |
| 8 | `pctChange` — past=0 보호 | division-by-zero 방지 |
| 9 | `sofr_iorb_spread_bp` 계산 정확성 | (SOFR - IORB) * 100 bp |
| 10 | `yield_curve_10_2` 계산 | DGS10 - DGS2 |
| 11 | `walcl_change_30d_pct` weekly 보정 | weekly 시리즈를 30일 grid 에 맞춤 |
| 12 | `vix_level` latest only | 변화율 아닌 절댓값 |
| 13 | `realtime: false` ALFRED 호출 | `realtime_end <= endMs` 검증 |
| 14 | `disableCache: true` cache 우회 | fetchFredSeries 가 매번 호출됨 |

총 vitest: 10 → 24 PASS (회귀 0).

---

## 9. dist/types 갱신 (`befc698`)

```
dist/types/src/macro/layer-builder.d.ts (+36 -9):
  + export declare const FRED_SERIES_FOR_LAYER: readonly string[];
  + export interface BuildMacroRangeOpts {
  +   ...
  +   disableCache?: boolean;
  + }
  + export declare function fetchAllFredSeriesForLayer(...): Promise<...>;
```

→ 프론트엔드가 `import { FRED_SERIES_FOR_LAYER } from "@tradelab/backend/..."` 가능.

---

## 10. 헌장 준수

| 규칙 | 결과 | 근거 |
|---|---|---|
| R1 (차원 중복 X) | ✅ | 6차원 (거시) 내부 raw 데이터 확장만, modifier 신규 추가 없음 |
| R2 (백테스트 알파) | N/A | raw 데이터 단계 — composite/modifier 변경 아님 |
| R3 (단독 시그널 X) | ✅ | single-indicator 필드는 snapshot 출력 전용. BBDX 진입 결정에 직접 노출 안 됨 |

---

## 11. 후속 작업

- **C3/C4 composite 활성화** → 02 영역 (`buildMacroRawHistory`).
- **DFII10 wiring** — `real_yield_change_30d` 필드에 실값 주입 (현재 0 으로 떨어짐).
- **production FRED rate limit 모니터링** — 12 시리즈 병렬 fetch 가 무료 티어
  (120 req/min) 안에서 안전한지 Railway 로그 추적. 만약 429 발생 시 rate limiter 추가.
- **macro snapshot 캐시 hit ratio 추적** — disk cache 적중률이 production 에서
  어떻게 분포하는지 (12h TTL realtime mode 기준).

---

작성: 2026-05-17
