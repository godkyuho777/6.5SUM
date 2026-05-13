# 2026-05-13 백엔드 작업 인덱스

> 오늘 백엔드 (`tradelab-backend`) 에서 진행한 작업.
> 프론트엔드 작업은 `tradelab-frontend/docs/2026-05-13/` 참조.

---

## 작업 목록

| # | 파일 | 영역 | 핵심 |
|---|---|---|---|
| 01 | [SCHEDULE_DEFERRED.md](./01_SCHEDULE_DEFERRED.md) | 일정/Defer | D-001~D-008 미룬 결정 사항 + 외부 의존성 |
| 02 | [JEON_IN_GU_PHASE1_BACKEND.md](./02_JEON_IN_GU_PHASE1_BACKEND.md) | 시그널 | 전인구 시그널 Phase 1.1+1.2 — DB 스키마 + 타입 + Feature Flag + stub modifier + 4 tRPC |
| 03 | [COIN_INFO_TRPC.md](./03_COIN_INFO_TRPC.md) | API | `coin.info` 라우트 — CoinGecko + 23-코인 한국어 큐레이션 |

---

## 통계 (백엔드)

### Commits
```
e317acb build: rebuild dist/types for coin.info route
004efd0 feat(api): add coin.info tRPC route (CoinGecko detailed info + Korean curation)
20e08e8 build: rebuild dist/types for jeonInGu route
1d0484e feat(api): jeonInGu tRPC router (stub — Phase 1.3+ pending)
9439ce4 feat(jeon-in-gu): types + constants + Feature Flag + stub modifier + 9 tests
03f2d56 feat(db): add jeon_in_gu schema (contents + calibration_history) + migration 0006
```

### 테스트
- 신규: 9 (JEON_IN_GU modifier) + 6 (coin.info) = **15 신규**
- 총 vitest: 712 → **737 PASS** (회귀 0)

### 신규 모듈
- `src/jeon-in-gu/{types, constants, modifier}.ts` (총 222 lines)
- `src/jeon-in-gu/__tests__/modifier.test.ts` (124 lines)
- `src/coin-info.ts` (522 lines)
- `src/coin-info.test.ts` (139 lines)
- `drizzle/migrations/0006_jeon_in_gu_signal_tracker.sql` (59 lines)

### 신규 tRPC 라우트 (5)
- `jeonInGu.config`
- `jeonInGu.recentContents`
- `jeonInGu.currentModifier`
- `jeonInGu.calibrationHistory`
- `coin.info` ← CoinMarketCap-style detail

### DB 변경
- `jeon_in_gu_contents` 테이블 (drizzle 0006)
- `jeon_in_gu_calibration_history` 테이블

### 환경변수 (`.env.example`)
```env
ENABLE_JEON_IN_GU=false  # Feature Flag
JEON_IN_GU_CHANNEL_ID=
YOUTUBE_API_KEY=
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=
```

---

## 5-Ref Push 완료

| Repo | 브랜치 | SHA |
|---|---|---|
| `tradelab-hq/tradelab-backend` | `dev` | `e317acb` |
| `tradelab-hq/tradelab-backend` | `feat/v6.5-merge` | `e317acb` |
| `godkyuho777/6.5SUM` | `dev` | `e317acb` |
| `godkyuho777/6.5SUM` | `feat/v6.5-merge` | `e317acb` |
| `godkyuho777/6.5SUM` | `main` | `e317acb` |

---

## 헌장 준수 (R1/R2/R3)

| 영역 | R1 (차원 중복 X) | R2 (백테스트 알파) | R3 (단독 시그널 X) |
|---|---|---|---|
| JEON_IN_GU stub modifier | ✅ 6차원 (거시) | ⚠ Phase 5 대기 | ✅ multiplier-only |
| coin.info | N/A (정보 표시) | N/A | N/A |

---

## 후속 (D-002 외부 의존성)

JEON_IN_GU Phase 1.3 ~ 7 활성:
1. 변호사 검토 (명예훼손)
2. YouTube Data API v3 key 발급
3. Anthropic API key (Claude Haiku 4.5)
4. Telegram bot + chat ID
5. 전인구 채널 ID 확인

→ 사용자 액션 후 Phase 1.3 부터 순차 진행.

작성: 2026-05-13
