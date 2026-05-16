# Onchain ETF Flow Phase 1 — Farside HTML 파싱

> **영역**: `src/onchain/etf-flow.ts` (신규) + `__tests__/etf-flow.test.ts` (신규) +
> `stub-modifiers.ts` (수정) + `.env.example` (수정)
> **상태**: 진행 중 — backend agent `aa9b774fdc93c5cc8` 작업 완료 직전.
> **검증**: qa 가 `pnpm test` 실행 → 812 PASS (이전 777 → 신규 6 ETF Flow + 29 추가 회귀 안전).
> **미커밋**.

---

## 1. 현재 상태 (2026-05-17 기준)

### Git 작업트리

```
* dev
~ Modified: 3 files
   .env.example
   dist/types/src/macro/layer-builder.d.ts
   src/onchain/stub-modifiers.ts
? Untracked: 3 files
   dist/types/src/onchain/etf-flow.d.ts
   src/onchain/__tests__/etf-flow.test.ts
   src/onchain/etf-flow.ts
```

- backend agent 가 코드 작성 + dist/types 빌드 + test 통과 까지 완료.
- 본 세션은 코드 변경 영역이 아님 (docs only) → 04 는 "진행 상황 기록" 목적.
- commit + push 는 다음 backend-engineer 세션에서 수행.

---

## 2. 작업 배경

기존 ETF Flow modifier 는 `src/onchain/stub-modifiers.ts` 의 `computeEtfFlow` 가
env 미설정 시 항상 `value: 0, status: "stub"` 반환. 실제 데이터 fetch 안 함.

Phase 1 의 목표 — Farside Investors (https://farside.co.uk/) 의 무료 HTML 페이지를
직접 파싱하여 BTC + ETH ETF 의 일별 net flow 를 누적 (3일) → BBDX modifier 로 활용.

### 외부 API 선택 이유
- Farside 는 BTC/ETH ETF 일별 데이터를 무료 + API key 없이 제공.
- 유료 alternatives (Glassnode, CryptoQuant) 는 월 $39+.
- Stub-first 원칙으로 env (`ETF_FLOW_PROVIDER=farside`) 미설정 시 graceful fallback.

---

## 3. 계획된 파일 변경

### 신규: `src/onchain/etf-flow.ts`

핵심 함수:

```ts
export async function fetchEtfFlowFromFarside(opts: {
  asset: "btc" | "eth";
  cacheDir?: string;
  disableCache?: boolean;
}): Promise<EtfFlowDailyRow[] | null>

export function compute3DayNetFlow(rows: EtfFlowDailyRow[]): number

export function mapNetFlowToModifier(netFlow3d: number): number
// 임계값 매핑:
//   netFlow >= +$1.5B → +0.20
//   netFlow <= -$1B   → -0.25
//   사이 구간은 선형 보간

export async function computeEtfFlowModifier(opts: {
  asset?: "btc" | "eth";        // default "btc"
  disableCache?: boolean;
}): Promise<OnchainModifierResult>
```

### 신규: `src/onchain/__tests__/etf-flow.test.ts` (6+ tests)

| # | 케이스 | 검증 |
|---|---|---|
| 1 | HTML 파싱 — 정상 table | mock HTML 에서 일별 row 추출 |
| 2 | 음수 표기 `(123.4)` 정규화 | accounting parentheses → 음수 float |
| 3 | 3일 누적 계산 정확성 | latest 3 valid days |
| 4 | 임계값 매핑 — +$2B → +0.20 (cap) | 상한 |
| 5 | 임계값 매핑 — -$1.5B → -0.25 (cap) | 하한 |
| 6 | 임계값 매핑 — 선형 보간 | +$0.75B → ~+0.10 |
| (추가) | network 실패 → status: "error" | graceful fallback |
| (추가) | env 미설정 → status: "stub", value: 0 | 헌장 R3 안전 |

### 수정: `src/onchain/stub-modifiers.ts`

`computeEtfFlow` 가 `ETF_FLOW_PROVIDER === "farside"` 일 때 신규
`etf-flow.ts` 모듈로 위임:

```ts
export async function computeEtfFlow(opts: ...): Promise<OnchainModifierResult> {
  if (process.env.ETF_FLOW_PROVIDER === "farside") {
    return await computeEtfFlowModifier({ asset: opts.asset });
  }
  // 기존 stub 경로 — value: 0, status: "stub"
  return { value: 0, status: "stub", detail: "ETF_FLOW_PROVIDER not set" };
}
```

### 수정: `.env.example`

```env
# === Onchain ETF Flow (Phase 1) ===
# Farside Investors HTML scraping (no API key required).
# Set to "farside" to enable real data fetch. Empty = stub (value: 0).
ETF_FLOW_PROVIDER=
# Optional: override cache TTL hours (default 24)
ETF_FLOW_CACHE_TTL_HOURS=24
```

---

## 4. HTML 파싱 전략

### 대상 URL
- `https://farside.co.uk/btc/` — BTC Spot ETF flows
- `https://farside.co.uk/eth/` — ETH Spot ETF flows

### Table 구조
- `<table>` 안에 `<thead>` 가 ETF ticker (IBIT, FBTC, BITB, ...) header.
- `<tbody>` 의 각 `<tr>` 가 일별 row — 첫 칸 date, 나머지 ETF 별 net inflow ($ millions).
- 음수는 회계 표기 — `(123.4)` 같이 괄호로.

### 파싱 로직 (예정)

```ts
// 1. fetch HTML (axios.get + User-Agent header)
// 2. cheerio 로 첫 <table> 선택
// 3. <tbody> <tr> 순회, 각 row 의 date + sum of cell values
// 4. parseAccountingNumber("(123.4)") → -123.4
// 5. EtfFlowDailyRow[] 반환 (date desc)
```

### Graceful fallback
- HTML 구조 변경 → cheerio selector 미스 → `{ status: "error", detail: "HTML structure changed" }` 반환.
- 네트워크 실패 → axios catch → `{ status: "error", detail: msg }` 반환.
- 절대 throw 안 함 → score 합산 영향 X.

---

## 5. 임계값 매핑 (signal-engineer 설계)

### Rationale
- BTC Spot ETF 일별 net flow 의 historic 통계:
  - 평균 absolute: ~$200M
  - 90th percentile: ~$1B
  - extreme inflow (rally signal): ~$1.5B+
  - extreme outflow (panic): ~$1B-

### 매핑 표

| 3일 누적 net flow | modifier value |
|---|---|
| ≥ +$1.5B | +0.20 (cap) |
| +$0.5B ~ +$1.5B | 선형 보간 (0 ~ +0.20) |
| -$0.5B ~ +$0.5B | 0 (dead zone) |
| -$1B ~ -$0.5B | 선형 보간 (-0.25 ~ 0) |
| ≤ -$1B | -0.25 (cap) |

### Asymmetric cap 이유
- "panic" 의 BBDX 점수 영향이 "rally" 보다 약간 큼 (-0.25 vs +0.20).
- crypto 시장 특성 — 하락 모멘텀이 상승 모멘텀보다 빠르게 전개.

### MODIFIER_BOUNDS 준수
- onchain modifier 범위 -0.25 ~ +0.20 → 본 매핑이 BBDX 의 표준 modifier bound 안에 정확히 fit.

---

## 6. Disk Cache 정책

### TTL
- 24시간 (env `ETF_FLOW_CACHE_TTL_HOURS` 로 override 가능).
- Farside 는 일별 update → 하루 한 번 fetch 면 충분.

### 경로
- `.onchain-cache/etf-flow-{asset}-{dateYYYYMMDD}.json`
- `.gitignore` 에 `.onchain-cache/` 등록 필요 (별도 commit).

### Rate-limit 회피
- 12h TTL 면 production 트래픽 (코인 스캔 분당 N회) 에도 Farside 한 번/일.
- User-Agent header 정중하게 설정 — `"Tradelab/1.0 (research)"`.

---

## 7. 헌장 준수

| 규칙 | 결과 | 근거 |
|---|---|---|
| R1 (차원 중복 X) | ✅ | 7차원 (온체인) 단일 modifier `etf_flow`. 신규 차원 추가 없음 |
| R2 (백테스트 알파) | ⚠ | Phase 1 은 modifier 인프라 구축만. backtest 회귀는 안전 (computeEtfFlow 가 stub 경로 default) |
| R3 (단독 시그널 X) | ✅ | `OnchainModifierResult` 형태 — `applyOnchainToEntry` 의 multiplier 경로만 사용. 직접 entry 결정 발행 X |
| Stub-first | ✅ | `ETF_FLOW_PROVIDER` 미설정 시 `value: 0, status: "stub"` |
| 에러 격리 | ✅ | 모든 외부 호출 try/catch → 객체 반환, throw 절대 X |

---

## 8. dist/types 갱신 (예정)

```
dist/types/src/onchain/etf-flow.d.ts (신규)
  + export interface EtfFlowDailyRow { date: number; netFlowUsdMillions: number; }
  + export declare function fetchEtfFlowFromFarside(opts): Promise<...>;
  + export declare function compute3DayNetFlow(rows): number;
  + export declare function mapNetFlowToModifier(netFlow3d: number): number;
  + export declare function computeEtfFlowModifier(opts): Promise<OnchainModifierResult>;
```

→ 다음 backend-engineer 세션에서 `pnpm build:types` 로 자동 emit.

---

## 9. qa 검증 결과 (이미 완료)

- backend agent 실행 후 `pnpm test` → **812 PASS** (이전 777 → 신규 6 + 추가 회귀 안전).
- `pnpm check` (tsc --noEmit) 통과.
- 본 세션 시작 시점에서 코드는 모두 작성 완료, commit 만 남은 상태.

---

## 10. 다음 단계 (즉시)

1. **04 commit** — backend-engineer 세션이 다음 단계로:
   ```
   git add src/onchain/etf-flow.ts \
            src/onchain/__tests__/etf-flow.test.ts \
            src/onchain/stub-modifiers.ts \
            .env.example \
            dist/types/src/onchain/etf-flow.d.ts
   git commit -m "feat(onchain): ETF Flow Phase 1 — Farside HTML parsing + threshold mapping"
   ```
2. **5-ref push** — origin (tradelab-hq) + v65sum (godkyuho777) 양쪽 dev branch.
3. **`.gitignore` 갱신** — `.onchain-cache/` 추가 (현재 누락 가능성).
4. **Railway env 등록 검토** — `ETF_FLOW_PROVIDER=farside` production 활성화 여부 사용자 결정 (D-XXX 형태로 SCHEDULE_DEFERRED 추가).

---

## 11. 후속 작업

### Phase 2 (1~2주 후)
- **calibration 데이터 누적** — production 에서 ETF Flow modifier 가 BBDX 점수에
  미친 영향 vs 실 결과 비교 (R² 추적).
- 만약 R² < 0.10 → 임계값 조정 또는 weight 감소 (JEON_IN_GU 패턴과 동일).

### Phase 3 (1개월+)
- **Alt-ETF 추가** — SOL, XRP spot ETF 출시 시 동일 패턴 확장.
- **Pre-market flow** — Farside 가 일별 마감 후 update → 실시간성 부족.
  Block trade / pre-market futures 데이터로 보완 가능성 검토.

### Phase 4 (3개월+)
- **Farside HTML 구조 변경 대비** — error 알람 (Telegram) 자동 발송.
- **유료 alternative 검토** — Glassnode ETF Flow API 가 더 정확/실시간이면 마이그레이션.

---

작성: 2026-05-17
