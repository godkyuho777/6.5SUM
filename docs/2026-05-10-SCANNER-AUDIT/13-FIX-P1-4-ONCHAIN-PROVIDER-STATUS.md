# P1-#4 FIX — Onchain 5/7 Stub Modifier 검증 + 가시화

**날짜**: 2026-05-10
**Audit 참조**: `00-INDEX.md` 우선순위 P1-#4, `02-ONCHAIN-AUDIT.md` §1, §2, §5

## Audit 권고 검토 결과

Audit `02-ONCHAIN-AUDIT.md` 가 제기한 P1 권고:
1. ❌ **분모 1.35 → 1.40 통일** — *Spec 위반*. `BBDX_v6.5_FULL_DIMENSION.md:237`
   가 `clamp(total / 1.35, ...)` 명시. spec 우선.
2. ❌ **`1+score×0.30` 공식 vs ONCHAIN_MULTIPLIERS 표 통일** — Spec 가 두
   경로의 분리를 *의도* 한 것일 가능성. 후속 spec 명확화 권고.
3. ✅ **5/7 stub modifier 가시화** — 채택. 운영시점에 어떤 modifier 가
   real/stub/mock 인지 명확히.
4. **EXIT 이중 보정 (O2)** — 별도 검증 필요. P2 작업.
5. **두 파이프라인 통합 (1.4)** — 큰 변경. P2.

## 적용한 수정 (P1-#4 Phase 1)

### 1. `onchain/provider-status.ts` (신규 — 156 라인)

7-modifier 의 provider mode 가시화:

```typescript
export type ProviderMode = "real" | "stub" | "mock" | "partial";

export function getOnchainProviderStatus(): ProviderStatus[]
export function summarizeProviderStatus(): { real, mock, stub, effective, total }
export function describeProviderStatusForBacktest(): string
```

환경변수 검사:
- `CRYPTOQUANT_API_KEY` → exchange_netflow / miner_outflow
- `WHALE_ALERT_API_KEY` → whale_alert
- `GLASSNODE_API_KEY` → lth_supply
- `ETF_FLOW_PROVIDER=farside` → etf_flow
- `ONCHAIN_MOCK=1` → stub 자리에 mock 활성

**현재 dev 환경 (모든 외부 키 미설정)**:
| Modifier | Mode | 영향 |
|---|---|---|
| coinbase_premium | **real** | 27 메이저 코인 (BTC/ETH 등) — 영향 있음 |
| ssr | **real** | CoinGecko Free — ⚠️ 90d buffer 런타임 누적 |
| exchange_netflow | stub | value=0, BBDX 영향 X |
| whale_alert | stub | value=0 |
| etf_flow | stub | value=0 |
| miner_outflow | stub | value=0 |
| lth_supply | stub | value=0 |

→ **effective = 2/7** — 백테스트 alpha 측정 시 "5 modifier 미작동 baseline".

### 2. `routers.ts` `onchain.providerStatus` tRPC 신규

```typescript
providerStatus: publicProcedure.query(() => ({
  modifiers: getOnchainProviderStatus(),
  summary: summarizeProviderStatus(),
}))
```

프론트엔드가 `trpc.onchain.providerStatus.useQuery()` 로 운영시점에 stub 상태
표시 가능.

### 3. `backtest/cli.ts` — 백테스트 시작 시 컨텍스트 출력

```
🚀 Tradelab Backtesting Engine Starting...

   Strategy: bbdx-short

[Onchain] effective=2/7 (real=2, mock=0, stub=5)
  ⚠ 5개 modifier 가 *영향 없음* — 백테스트 alpha 는
     "2개 modifier 만 작동하는 baseline" 으로 해석.
     ONCHAIN_MOCK=1 설정 시 stub 자리에 결정론 mock 주입 가능 (시각화/데모).
```

→ Wilson CI / winRate / Sharpe 결과 해석 시 **공정한 baseline 컨텍스트** 자동
표시. 헌장 R2 알파 측정의 정직성 (honest reporting).

### 4. `onchain/types.ts` MODIFIER_BOUNDS 주석 보강

`normalizationDenom = 1.4` 가 `score.ts:NORMALIZATION_DENOMINATOR=1.35` 와
다른 값임을 명시 + spec 우선 정책.

### 5. `score.ts` 주석 보강 (변경 없이)

`ONCHAIN_MULTIPLIERS` 표가 spec source of truth 임을 명시. `applyOnchainToEntry`
의 `1+score×0.30` 공식과 의도적 분리.

### 6. 단위테스트 9건 신규 (`__tests__/provider-status.test.ts`)

- `getOnchainProviderStatus` 4 케이스 (env 조합)
- `summarizeProviderStatus` 3 케이스
- `describeProviderStatusForBacktest` 2 케이스

## 헌장 검증

| 규칙 | 영향 | 검증 |
|---|---|---|
| **R1 차원 중복 X** | ✓ | 변경 없음 — provider-status 는 메타 정보 surface 만. |
| **R2 백테스트 알파** | ✓ **강화** | stub 환경 명시 출력으로 alpha 결과 해석 정직성 확보. "2 modifier baseline" 임을 사용자가 인지. |
| **R3 단독 시그널 X** | ✓ | 변경 없음. |
| **R4 자본 보호** | ✓ | 변경 없음. |
| **R5 Knife 차단** | ✓ | 변경 없음. |

## 사용법

### 운영자 검증 (운영시점)
```typescript
// frontend
const { data } = trpc.onchain.providerStatus.useQuery();
// data.summary.effective === 2 (real=2, stub=5)
// data.modifiers[0].mode === "real" (coinbase_premium)
```

### 백테스트 alpha 해석
```bash
# 기본 — stub 5개
pnpm backtest --strategy bbdx --calibrate
# 출력: [Onchain] effective=2/7 — winRate "2 modifier 작동" 환경의 baseline

# Mock 활성 — 5 stub 자리에 결정론 mock 주입
ONCHAIN_MOCK=1 pnpm backtest --strategy bbdx --calibrate
# 출력: [Onchain] effective=7/7 — 전체 7 modifier 영향 시 alpha
```

### 외부 API 키 활성화 (production 대비)
환경변수 설정 후 재배포:
```
CRYPTOQUANT_API_KEY=...    # exchange_netflow + miner_outflow real
WHALE_ALERT_API_KEY=...    # whale_alert real
GLASSNODE_API_KEY=...      # lth_supply real
ETF_FLOW_PROVIDER=farside  # etf_flow scraping 활성
```

각 modifier 의 *real 호출 코드* 는 P2 (`stub-modifiers.ts:TODO(v1.1)` 마커
참조) — 키만 설정하면 활성되는 게 아니라 호출 구현이 필요한 상태.

## 검증

- ✅ `pnpm check` 0 exit
- ✅ `pnpm build:types` 0 exit
- ✅ `pnpm test` **502/502 pass** (+9 신규)

## 잔여 P2/P3 작업 (audit 권고 중 spec 호환 가능 항목)

- [ ] **EXIT 이중 보정 검증** (O2): `applyOnchainToExit` + `decideReversal` ctx
  가 둘 다 호출되는지 grep + 통합. spec-violation 우선순위.
- [ ] **두 파이프라인 통합** (1.4): `score.ts` (raw) + `score-fetch.ts` (fetch)
  의 `score` 산출 결과가 동일한지 unit test 추가. 다르면 정합성 fix.
- [ ] **SSR 90d buffer 영속화** (P2): 서버 재시작 시 z-score reset 방지 — 파일
  / DB persist.
- [ ] **stub modifier 5개 실제 구현** (P2): CryptoQuant / Whale Alert /
  Glassnode / Farside API 호출 코드. 각각 v1.1 TODO.
- [ ] **MAJOR_ALT 화이트리스트 env 외출** (P2): `MAJOR_ALT_LIST` env var 또는
  DB 로 외출.

## 다음 단계

P1 4건 모두 완료. 다음 회차:
- P2 작업 (audit 의 8건)
- 또는 사용자 우선순위 재지정
