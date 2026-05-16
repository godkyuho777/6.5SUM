# 2026-05-17 백엔드 일일 작업 인덱스

> 어제(2026-05-16) ~ 오늘(2026-05-17) 까지 `tradelab-backend` 에서 진행한 작업.
> 프론트엔드 작업은 `tradelab-frontend/docs/2026-05-17/` (있다면) 참조.

---

## 작업 목록

| # | 파일 | 영역 | 핵심 |
|---|---|---|---|
| 01 | [01_MACRO_LAYER_BUILDER.md](./01_MACRO_LAYER_BUILDER.md) | Macro / FRED | `buildMacroLayerRange` — 12 FRED 시리즈 병렬 fetch, 7 single-indicator 필드 활성화 |
| 02 | [02_MACRO_HISTORY_SEQUENCE.md](./02_MACRO_HISTORY_SEQUENCE.md) | Macro / Composite | `buildMacroRawHistory` — 120일 일별 grid + forward-fill, C3/C4 composite 활성화 |
| 03 | [03_BBDX_COMBINED_STRATEGY.md](./03_BBDX_COMBINED_STRATEGY.md) | Backtest | `bbdx-combined` strategy (LONG+SHORT 통합) + Trend-Follow → EMA+ADX 정배열 label rename |
| 04 | [04_ONCHAIN_ETF_FLOW_PHASE1.md](./04_ONCHAIN_ETF_FLOW_PHASE1.md) | Onchain / 진행 중 | Farside HTML 파싱 ETF Flow modifier — backend agent 작업 완료 직전 (미커밋) |

---

## Commits 통계

### 오늘 (2026-05-17)
신규 commit 없음. 본 docs 추가 commit 만 예정.
work-in-progress: ETF Flow Phase 1 (`04_ONCHAIN_ETF_FLOW_PHASE1.md` 참조 — 미커밋).

### 어제 (2026-05-16)
```
c2302f0 build: rebuild dist/types for buildMacroRawHistory
e36d2fd test(macro): history sequence + composite C3/C4 계산 6 케이스
5c1bf2e feat(macro): buildMacroLayerRange — history 전달로 C3/C4 활성화
a907610 feat(macro): buildMacroRawHistory — 12 시리즈 일별 grid + forward-fill
```
→ 02_MACRO_HISTORY_SEQUENCE.md 영역. 4 commits.

### 그저께 (2026-05-15)
```
ba52b31 chore: gitignore .macro-cache/ (FRED disk cache, runtime only)
befc698 build: rebuild dist/types for buildMacroLayerRange expansion
4e7890a test(macro): layer-builder multi-series fetch coverage
173eaaf feat(macro): expand buildMacroLayerRange — 12 FRED series parallel fetch
f6b5ed7 feat(simulator): public auth (nickname-based) — no login required
617c6f1 feat(simulator): Investment Simulator (모의투자) — Phase 1 backend
db94c7a feat(backtest): CLI --strategy 에 bbdx-combined 추가
8801205 build: rebuild dist/types for bbdx-combined
5e8377a feat(backtest): rename Trend-Follow label to "EMA+ADX 정배열"
817378c feat(backtest): add bbdx-combined strategy (LONG+SHORT unified)
```
→ 01_MACRO_LAYER_BUILDER.md (4) + 03_BBDX_COMBINED_STRATEGY.md (4) + Simulator (2, 본 인덱스 범위 외).

### 통합 (어제~오늘, 본 인덱스 범위)
- Macro 영역 (01+02): 8 commits, +962 insertions
- Backtest 영역 (03): 4 commits, +596 insertions
- 진행 중 (04): 미커밋, 6 신규 테스트 + 1 신규 파일 + .env.example 수정

---

## 신규/수정 파일 목록

### Macro (01 + 02 영역)
- 수정: `src/macro/layer-builder.ts` (+356 lines 총합, 173eaaf+a907610+5c1bf2e+c2302f0)
- 수정: `src/macro/__tests__/layer-builder.test.ts` (+651 lines, 4e7890a+e36d2fd) — 10 → 31 tests
- 신규: `dist/types/src/macro/layer-builder.d.ts` 갱신 (`FRED_SERIES_FOR_LAYER`, `BuildMacroRangeOpts.disableCache`, `buildMacroRawHistory` export 추가)
- 수정: `.gitignore` (+1 line, `.macro-cache/`)

### Backtest (03 영역)
- 신규: `src/backtest/strategies/bbdx-combined.ts` (73 lines)
- 신규: `src/backtest/strategies/bbdx-combined.test.ts` (357 lines, 20 tests)
- 수정: `src/backtest/strategies/index.ts` (+2 lines, registry)
- 수정: `src/backtest/strategies/types.ts` (+9 lines, side: "both" 지원)
- 수정: `src/backtest/strategies/trend-follow.ts` (1 line, label rename only)
- 수정: `src/backtest/runner.ts` (+59 lines, bbdx-combined 분기 + metricsBySide)
- 수정: `src/backtest/types.ts` (+18 lines, `BacktestSideMetrics`)
- 수정: `src/backtest/signal-extractor.ts` (+4 lines, strategy hand-off)
- 수정: `src/routers.ts` (+5 lines, zod enum 확장)
- 수정: `src/backtest/cli.ts` (+7 lines, --strategy bbdx-combined)
- 신규: `dist/types/src/backtest/strategies/bbdx-combined.d.ts` (26 lines)
- 수정: `dist/types/src/backtest/strategies/{index,types}.d.ts`, `dist/types/src/backtest/types.d.ts`, `dist/types/src/routers.d.ts`

### Onchain (04 영역, 진행 중 / 미커밋)
- 신규: `src/onchain/etf-flow.ts`
- 신규: `src/onchain/__tests__/etf-flow.test.ts` (6+ tests)
- 수정: `src/onchain/stub-modifiers.ts` (`computeEtfFlow` 갱신)
- 수정: `.env.example` (`ETF_FLOW_PROVIDER=farside` 주석)
- 신규: `dist/types/src/onchain/etf-flow.d.ts`

---

## 5-Ref Push 결과

본 세션에서 docs commit 후 push 예정. 어제까지의 코드 commits (`c2302f0` 등) 는
이전 세션에서 이미 푸시됨:

| Repo | 브랜치 | 마지막 코드 SHA |
|---|---|---|
| `tradelab-hq/tradelab-backend` (origin) | `dev` | `c2302f0` |
| `godkyuho777/6.5SUM` (v65sum) | `dev` | `c2302f0` |
| `godkyuho777/6.5SUM` (v65sum) | `main` | (이전 push 기준) |

본 docs commit 푸시는 orchestrator + qa 게이트 통과 후 본 세션 마지막 단계.

---

## 핵심 변경 요약

### 1) Macro Layer 의 실제 데이터 활성화 (01 + 02)
어제까지 `macroV2.snapshot` 의 7 single-indicator 필드 + 일부 composite 필드가 모두 0/neutral 더미값이었음. 이번 이틀 작업으로:
- 7 single-indicator 필드 모두 실값 (sofr_iorb_spread_bp, yield_curve_10_2, walcl_change_30d_pct, ...)
- C3 (net liquidity 30d 변화): 0 → -1.08% 실값
- C4 (cycle phase): 항상 "neutral" → 실 분류 (pre_recession / recession_imminent / fed_pivot / crypto_rally / neutral)

### 2) 백테스트 통합 분석 시야 (03)
기존엔 LONG 백테스트, SHORT 백테스트를 따로 돌려야 했음. `bbdx-combined` 추가로:
- 한 번 실행으로 LONG + SHORT 트레이드 시간 순 병합
- `metricsBySide: { long, short, combined }` 출력
- 사용자 예제: LONG 6/10 + SHORT 2/5 → combined 8/15 = 53.3%

### 3) Trend-Follow strategy label 일관성 (03)
strategy ID `"trend-follow"` 는 backward-compat 유지하되 UI/리포트 label 만
"EMA+ADX 정배열" 로 갱신.

### 4) ETF Flow modifier 실측 데이터 진행 중 (04)
어제까지 ETF Flow 는 stub modifier (env 미설정 시 0). Phase 1 으로 Farside.co.uk
HTML 직접 파싱 → 3일 누적 net flow → ±$1.5B / ∓$1B 임계값 매핑. backend agent
완료 직전.

---

## 헌장 준수 (R1 / R2 / R3)

| 영역 | R1 (차원 중복 X) | R2 (백테스트 알파) | R3 (단독 시그널 X) |
|---|---|---|---|
| Macro layer 12 시리즈 확장 (01) | ✅ 6차원 (거시) 내부 raw 확장 | N/A (raw 데이터 단계) | ✅ composite 합산만 BBDX 외부에 노출 |
| Macro history + C3/C4 (02) | ✅ 동일 6차원 | N/A | ✅ composite 단계만 노출, modifier 직접 발행 X |
| BBDX Combined 백테스트 (03) | ✅ 기존 LONG/SHORT 결합만 | ✅ 백테스트 회귀 757→777 PASS | ✅ sentinel — `shouldEnter` 항상 false, 진입 결정은 LONG/SHORT 본체에 위임 |
| ETF Flow (04, 진행 중) | ✅ 7차원 (온체인) 단일 modifier | ⚠ 본격 calibration 은 데이터 누적 후 | ✅ modifier-only (`computeEtfFlow` multiplier 경로) |

---

## 후속 작업

### 즉시 (다음 세션)
1. **04 ETF Flow Phase 1 commit + push** — backend agent 작업 완료 + qa 검증 (812 tests PASS) 확인 후 push.
2. **02 후속 — DFII10 wiring** — 10Y TIPS (`DFII10`) 시리즈는 fetch 되지만 `MacroLayerSnapshot` 에 wiring 누락. real_yield_change_30d 필드 활성화 작업.
3. **본 docs 5개 push** — `tradelab-hq/tradelab-backend dev` 1차 push.

### 중기 (1~2주)
1. **03 후속 — bbdx-combined UI 통합** — frontend-engineer 가 `BacktestPage` 에 strategy 옵션 추가.
2. **04 후속 — ETF Flow disk cache 검증** — 24h TTL 가 production 에서 정상 작동하는지 모니터링 (Farside 가 rate-limit 걸 가능성).
3. **01 후속 — FRED API key rate limit 모니터링** — 12 시리즈 병렬 fetch 가 무료 티어 (120 req/min) 에 안전한지 production 로그 확인.

### 장기 (1개월+)
- D-002 (JEON_IN_GU 외부 의존성) 와 동일하게 ETF Flow calibration 데이터 누적 (3~6 개월).
- v6.6 finalScore 에 ETF Flow modifier 통합 결정 (D-001 연장).

---

작성: 2026-05-17
