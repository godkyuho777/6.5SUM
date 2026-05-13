# SCHEDULE_DEFERRED — 일정 / 미룬 결정 사항

> **출처**: `Trade LAB/docs/SCHEDULE_DEFERRED.md` (워크스페이스 레벨)
> 본 사본은 양쪽 repo 의 검색성을 위해 복제됨.

---

## 🔴 즉시 결정 대기 (사용자 응답 필요)

### D-001 — v6.6 finalScore 에 4 modifier 통합 여부
**상태**: 답변 대기

**질문**: Funding Extreme / Market Breadth / Order Block / MACD Divergence 를 v6.6 `evaluatePositionSignalsV66` 의 finalScore 곱셈에 자동 통합할지?

**현재**: 백엔드 모듈 + tRPC 라우트 + UI 페이지로 노출됨. 그러나 v6.6 finalScore 계산에는 미반영. 호출자가 `modifiersMult` 파라미터로 직접 곱해야 함.

**옵션**:
- **(A)** 합치기 — `evaluatePositionSignalsV66` 가 직접 fetch 해서 `modifiersMult` 자동 계산
- **(B)** 현 상태 유지 — 4 modifier 는 컨텍스트 정보로만
- **(C)** 선택적 — Feature Flag (`MODIFIERS_IN_V66=true`)

---

## 🟠 외부 의존성 대기

### D-002 — JEON_IN_GU Phase 1.3 ~ Phase 7
**상태**: Phase 1.1 (DB 스키마) + Phase 6 (UI placeholder) 완료. Phase 1.3 ~ 7 대기

**필요 사용자 액션**:
1. **변호사 검토** — 명예훼손 위험. 한국 가상자산법 + 미디어 인용 법적 검토
2. **API key 발급**:
   - YouTube Data API v3 (`YOUTUBE_API_KEY`)
   - Anthropic API key (`ANTHROPIC_API_KEY`)
   - Telegram Bot Token + Chat ID
3. **전인구 채널 ID 확인** (`JEON_IN_GU_CHANNEL_ID`)
4. **약관·면책 업데이트** — "제3자 의견 인용 / 역지표 / 가중치 ±0.50" 명시

**위험 (사용자 본인 인지)**:
- 가중치 ±0.50 = BBDX 100점에 ±50 영향 → 한 명 의견이 7차원보다 큰 영향
- LLM 분류 정확도 ~80% → 20% 확률로 50점 잘못 적용
- 표본 부족 (1년 30~50 영상)

**완화 장치**:
- `confidence ≥ 0.7` 만 적용
- 36시간 시간 감쇠
- BBDX 최종 신뢰도 ≥ 50 만 진입
- 매주 자동 calibration → R² < 0.10 시 가중치 자동 감소 (0.50 → 0.40 → 0.30 → 0.20)

---

### D-003 — Drizzle Migration Production 적용
**상태**: 0005 + 0006 commit 됨, Supabase 적용 미실행

**필요**:
1. Supabase Dashboard → SQL Editor
2. `drizzle/migrations/0005_calibrated_weights_thresholds.sql` 적용
3. `drizzle/migrations/0006_jeon_in_gu_signal_tracker.sql` 적용
4. 검증 SQL (`drizzle/APPLY_*_INSTRUCTIONS.md` 참조)

---

### D-004 — 환경변수 production 등록
**상태**: `.env.example` 갱신 완료. Railway/Vercel 변수 등록 미실행

**필요 (Railway tradelab-backend → Variables)**:
- `BBDX_VERSION=v6.6`
- `BBDX_MARKET=perp`
- `ENABLE_SHORT_SIGNALS=true`
- (D-002 후) YOUTUBE_API_KEY / ANTHROPIC_API_KEY / JEON_IN_GU_CHANNEL_ID / TELEGRAM_* 등록

**GitHub repo Secrets** (cron):
- `DATABASE_URL`, `DIRECT_URL`

---

## 🟡 후속 작업 (인프라 충분)

### D-005 — Phase α calibration 자체 데이터 누적
- `signals.publish` mutation 활성 (P0-3) → 3~6 개월 누적
- 매주 cron 이 self_backtest weights 도출

### D-006 — `vwap_compose` / `wave_compose` macro modifier 통합
- D-001 결정 후 자연 통합

### D-007 — BBDX v6.5 deprecation
- v6.6 production 3개월 안정 운영 후
- 사용자 점진 마이그레이션 (10% → 50% → 100%)

### D-008 — 트래커 마이그레이션 (TRACKER_TAB_STANDARD)
**완료**:
- ✅ JEON_IN_GU 신규 (TrackerTabs 사용)
- ✅ CoinDetail 6-탭 (코인 정보 + 5 표준)
- ✅ 트래커 컨텍스트 인식 (`?tracker=` URL 파라미터)

**대기**:
- BBDX v6.6 / VP+Trend / Macro / Wave / Onchain Tracker 5-탭 마이그레이션

---

### D-009 — Fibonacci + VWAP 백테스트 strategy 파라미터 (NEW)
**상태**: CoinBacktestTab 에 트래커 컨텍스트 전달됨. 백엔드 `trpc.backtest.run` 이 strategy 파라미터 미지원 → Fib/VWAP 는 placeholder

**필요**: 백엔드 `trpc.backtest.run.input` 에 `strategy: z.enum(["bbdx","fibonacci","vwap"])` 추가 + runner 가 strategy 별 진입 룰 분기. 1~2시간 작업.

---

## ✅ 완료 / 폐기

### ~~D-DONE-001~~ — v6.5 vs v6.6 비교 백테스팅 (2026-05-13 폐기)
사용자 결정으로 삭제. v6.6 production 인프라만 유지.

---

## 📅 권장 일정

| 시기 | 작업 |
|---|---|
| **이번 주** | D-001 결정 / D-003 SQL 적용 / D-004 환경변수 |
| **2주** | D-002 외부 준비 (변호사 + API key) |
| **3주** | JEON_IN_GU Phase 1.3 ~ 5 구현 |
| **1개월** | JEON_IN_GU internal test |
| **3개월** | Phase α calibration 실데이터 반영 / v6.5 deprecation |

---

작성: 2026-05-13
