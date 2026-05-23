# tradelab-backend

Express + tRPC API server for **Tradelab** — BBDX(RSI+BB+ADX) signal tracker,
7-차원 onchain modifier, lookahead-free 백테스팅, multi-TF trend analysis.

- **Runtime**: Node.js v18+, TypeScript 5.9.3, ESM, `pnpm@10.4.1`
- **Stack**: Express 4 · tRPC 11 · Drizzle ORM 0.44 · Supabase Postgres ·
  Bybit V5 (broker abstraction P2-#16) · OpenRouter + Anthropic LLM
- **Deploy**: Railway (Dockerfile + nixpacks)
- **Frontend pair**: `tradelab-frontend` (this repo emits `@tradelab/backend/router` types)

---

## Local development

```bash
cp .env.example .env       # fill in DATABASE_URL / SUPABASE_* 등
SKIP_PREPARE=1 pnpm install
pnpm build:types           # frontend 가 import 할 .d.ts emit
pnpm db:generate           # offline — emits SQL into ./drizzle
pnpm db:migrate            # online — DIRECT_URL 에 적용
pnpm dev                   # http://localhost:3000
```

`SKIP_PREPARE=1` 는 prepare 훅 무한 루프 방지 (CLAUDE.md).

Health check: `GET /api/health` → `{ ok: true, branch: "..." }`.
Metrics: `GET /metrics` (Prometheus, P2-#11).

### Tests

```bash
pnpm check          # tsc --noEmit
pnpm test           # vitest (전체)
pnpm vitest run src/_core   # 특정 모듈
```

### Backtest CLI

```bash
pnpm backtest:quick     # 빠른 회귀 (소수 심볼)
pnpm backtest           # 전체 파이프라인
```

---

## Type sharing with `tradelab-frontend`

frontend 는 본 repo 를 git URL 의존성으로 install:

```jsonc
// tradelab-frontend/package.json
"@tradelab/backend": "github:OWNER/REPO#main"
```

`dist/types/` 디렉토리가 git 에 commit 되어 있어 frontend 가 prepare 훅 없이도
바로 `AppRouter` 타입을 resolve 한다:

```ts
import type { AppRouter } from "@tradelab/backend/router";
```

로컬 개발 시 `file:../tradelab-backend` 로 link 하고, 푸시 전 git URL 로 되돌린다.
`pre-push` 훅이 `file:..` 잔존을 차단 (Vercel 빌드 보호).

---

## 아키텍처 (P1 + P2 후)

### 디렉토리 구조

```
src/
├── _core/                     # 인프라 코어
│   ├── auth.ts                # Supabase JWT verifier
│   ├── env.ts                 # 환경변수 단일 진입점
│   ├── llm.ts                 # OpenRouter + Anthropic fallback (P2-#4)
│   ├── trpc.ts                # tRPC 초기화 + errorFormatter (P1-#4)
│   ├── logger.ts              # pino structured logging (P1-#3)
│   ├── errors.ts              # TradelabErrorCode (P1-#4)
│   ├── metrics.ts             # Prometheus metricsRegistry (P2-#11)
│   ├── startup-validation.ts  # env / API key / charter 검증 (P2-#12)
│   └── webhook-alerts.ts      # Discord webhook (P2-#14)
├── shared/                    # frontend 와 공유 타입
├── brokers/                   # 거래소 추상화 (P2-#16)
│   ├── broker.interface.ts    # Broker + TickerSnapshot
│   ├── bybit-v5-broker.ts     # 기존 bybit.ts 위임 어댑터
│   └── index.ts               # getDefaultBroker() singleton
├── backtest/                  # 백테스팅 엔진
│   ├── lookahead-auditor.ts   # 7 violation types (P1-#1)
│   ├── data-loader.ts         # Bybit 시간 페이지네이션
│   ├── signal-extractor.ts    # Lookahead-free BBDX 재생
│   ├── metrics.ts             # winRate / Sharpe / MDD / PF
│   └── runner.ts              # 파이프라인
├── onchain/                   # 7번 차원 (modifier-only, 헌장 R3)
├── macro/                     # FRED / BOK / 매크로 트래커
│   └── cache-policy.ts        # TTL 일관화 (P2-#13)
├── config/
│   └── signal-thresholds.ts   # BBDX 임계값 단일 소스 (P2-#1)
├── cron/
│   └── v66-weight-calibration.ts  # 주간 cron + Discord alert (P2-#7, P2-#14)
├── simulator/
│   └── db.ts                  # openPosition/closePosition (db.transaction, P2-#3)
├── bybit.ts                   # Bybit V5 client + Zod validation (P2-#2)
├── scanner.ts                 # 스캔 + per-key Mutex (P1-#5)
├── routers.ts                 # 9 sub-router (system/coins/signals/...)
├── db.ts                      # Drizzle 헬퍼
└── index.ts                   # Express + helmet + rate-limit + 종료 핸들러 (P1-#2, P1-#6)
```

### 헌장 4대 규칙

| 규칙 | 의미 | 본 백엔드 코드 |
|---|---|---|
| R1 차원중복 X | 신호 차원은 독립 — 같은 정보 두 번 X | `validateAgainstCharter.ts` |
| R2 백테스트 알파 | 모든 변경은 백테스트로 검증 가능 | `backtest/` + `lookahead-auditor` |
| R3 단독시그널 X | modifier 는 BBDX 의 multiplier 만 — 단독 매매 신호 X | `onchain/bbdx-integration.ts` |
| R4 자본 보호 | strong_distribution + 평균회귀 환경에서 진입 차단 | `decideEntry` + lite translator |

---

## 운영자 가이드 (Production)

### 환경변수 (필수 / 선택)

`.env.example` 참고. 카테고리별 핵심:

| 카테고리 | 변수 | 필수 | 설명 |
|---|---|---|---|
| **infra** | `PORT` | ✓ | 기본 3000, Railway 자동 주입 |
| | `NODE_ENV` | ✓ | `production` |
| | `DATABASE_URL` | ✓ | Supabase pooled (6543) |
| | `DIRECT_URL` | ✓ | Drizzle migrate 용 (5432) |
| | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | ✓ | JWT 검증 + 서버 접근 |
| | `CORS_ORIGIN` | 권장 | frontend 도메인 |
| **macro** | `FRED_API_KEY` | 선택 | 미설정 시 macro 페이지 빈 차트 (stub-first) |
| | `BOK_API_KEY` | 선택 | 환율은 Yahoo fallback, 기준금리/CPI 는 stub |
| **llm** | `OPENROUTER_API_KEY` | 선택 | AI Insight 기능 |
| | `OPENROUTER_MODEL` | 선택 | default 명시값 |
| | `ANTHROPIC_API_KEY` | 선택 | OpenRouter fallback (P2-#4) |
| **onchain** | `CRYPTOQUANT_API_KEY` 등 | 선택 | 미설정 시 score=0, BBDX 영향 0 |
| | `ONCHAIN_MOCK=1` | 선택 | 5개 stub 자리에 mock 값 (시각 검증용) |
| **signals** | `BBDX_VERSION` | 선택 | default "v6.5" |
| | `ENABLE_SHORT_SIGNALS=0` | 선택 | SHORT signal UI 비활성 |
| | `BROADCAST_SHORT_ALERTS=1` | 선택 | SHORT alert push (default off) |
| **alerts** | `DISCORD_WEBHOOK_URL` | 권장 | cron health=degraded/fatal 알림 (P2-#14) |
| **broker** | `BROKER` | 선택 | default `bybit` (P2-#16) |
| **logging** | `LOG_LEVEL` | 선택 | `debug`/`info`/`warn`/`error`. default `info` (prod) / `debug` (dev) |

서버 시작 시 `logStartupValidation()` 가 모든 항목을 평가하고 `info`/`warn`/`error`
로 로그. critical 누락은 `error` 로 표시 (production 에서 운영자가 즉시 인지).

### 모니터링 엔드포인트

- **`/api/health`** — JSON `{ ok, branch }` (load balancer health check 용)
- **`/metrics`** — Prometheus exposition (httpRequestsTotal, bybitApiDurationMs,
  cacheAccessTotal, signalsGeneratedTotal 등)
- **Discord webhook** — `DISCORD_WEBHOOK_URL` 설정 시 cron health=degraded/fatal,
  outer fatal 모두 즉시 알림 발송. rate limit: 동일 source+level 5분 1회.

### 알려진 fail modes & 대응

| 증상 | 진단 | 대응 |
|---|---|---|
| `/api/trpc/coins.list` 가 빈 배열 | Bybit rate limit (429) | 1-2분 대기, scanner 캐시 갱신 후 회복 |
| Backtest 결과의 `lookaheadAudit.violations.length > 0` | signal-extractor 가 미래 데이터 참조 (P1-#1) | 즉시 PR revert. lookahead-auditor 가 차단했다는 의미 |
| Cron health=degraded | weights/threshold autoCorrect 일부 실패 | Discord 알림 context 의 `firstErrors` 확인 — 보통 Bybit 일시 outage |
| Onchain score 가 항상 0 | API key 미설정 또는 modifier provider 5/7 stub | `/api/trpc/system.providerStatus` 로 어느 provider 가 down 인지 확인 |
| `pnpm install` 무한 루프 | prepare 훅 → build:types → install 재귀 | `SKIP_PREPARE=1 pnpm install` |
| Vercel build 실패 (frontend) | `@tradelab/backend` 가 `file:..` 으로 남음 | pre-push 훅이 차단 — `git URL #branch` 로 변경 후 재푸시 |
| Investment simulator 청산 무한 루프 | 가격 fetch 실패 후 fallback price 가 entryPrice 와 동일 | scanner / bybit tickers 캐시 강제 invalidate |

### 배포 (Railway)

1. **Backend repo** push → Railway service 자동 빌드.
2. `pnpm build` (esbuild bundle + tsc d.ts emit) → `pnpm start` (`dist/index.js`).
3. SIGTERM 수신 시 graceful shutdown (P1-#6): 30s 한도 내에서 in-flight 요청 종료 +
   DB pool close.

### 보안 layer

- **helmet** — XSS / clickjacking / MIME-sniff 보호 (P1-#2)
- **express-rate-limit** — 60 req/min/IP, `/api/health` 제외 (P1-#2)
- **CORS** — `CORS_ORIGIN` env 명시 (production 한정 strict)
- **Zod validation** — Bybit 응답 NaN/null 차단 (P2-#2)
- **Prompt sanitization** — LLM 호출 전 markdown fence/System escape 차단 (P2-#4)

---

## 변경 이력 (P1 + P2 audit 후속)

| 항목 | 코드 / 파일 | 목적 |
|---|---|---|
| P1-#1 | `backtest/lookahead-auditor.ts` | 7 violation type 자동 검출 |
| P1-#2 | `index.ts` (helmet + rate-limit) | 보안 미들웨어 |
| P1-#3 | `_core/logger.ts` (pino) | 구조화 로깅 (Railway/Datadog 파싱) |
| P1-#4 | `_core/errors.ts` (TRPC 매핑) | 17 error code + HTTP semantics |
| P1-#5 | `scanner.ts` (async-mutex) | 동일 key 동시 fetch race 차단 |
| P1-#6 | `index.ts` (SIGTERM handler) | 30s graceful shutdown + DB close |
| P2-#1 | `config/signal-thresholds.ts` | 임계값 magic number 제거 |
| P2-#2 | `bybit.ts` (Zod) | Bybit 응답 형식 검증 |
| P2-#3 | `simulator/db.ts` (transaction) | openPosition/closePosition atomic |
| P2-#4 | `_core/llm.ts` (Anthropic fallback) | OpenRouter 장애 시 폴백 |
| P2-#5 | `.github/workflows/test.yml` | push/PR CI |
| P2-#6 | `drizzle/migrations/0009_*` | 8 composite index + FK |
| P2-#7 | `cron/v66-weight-calibration.ts` (pino) | jobId 부여 + 구조화 로그 |
| P2-#8 | frontend `.github/workflows/test.yml` | frontend CI |
| P2-#9 | `scanner.ts` / `db.ts` (pino) | 로깅 일관화 |
| P2-#10 | frontend `lib/verify-deps.ts` | dev-only `file:..` 감지 |
| P2-#11 | `_core/metrics.ts` (`/metrics`) | Prometheus exposition |
| P2-#12 | `_core/startup-validation.ts` | 시작 시 10개 검증 항목 |
| P2-#13 | `macro/cache-policy.ts` | TTL 단일 출처 (realtime/vintage/intraday/fallback) |
| P2-#14 | `_core/webhook-alerts.ts` | Discord 알림 (cron health=degraded/fatal) |
| P2-#15 | frontend `vitest.config.ts` | sim-pnl 45 unit tests |
| P2-#16 | `brokers/` | Broker interface + bybit-v5 어댑터 |
| P2-#17 | 본 README + `.env.example` | 운영자 가이드 |

---

## 헌장 4대 규칙 (Reference)

본 백엔드의 모든 변경은 아래 4 규칙을 위반하지 않아야 한다 (CLAUDE.md, 헌장 문서):

1. **차원중복 X** — 신호 차원은 독립. RSI 와 RSI-derived 차원 동시 사용 X.
2. **백테스트 알파** — 모든 임계값 변경은 `pnpm backtest` 로 검증 가능해야 함.
3. **단독 시그널 X** — modifier 는 BBDX 점수의 multiplier 로만. 단독 매매 신호 발행 X.
4. **자본 보호** — strong_distribution + 평균회귀 시 자본 보호 우선 (BUY 차단).

CI / lookahead-auditor / charter-validator 가 R2/R3 위반 자동 차단.
R1/R4 는 코드 리뷰 시점 검증 (signal-engineer 에이전트 영역).
