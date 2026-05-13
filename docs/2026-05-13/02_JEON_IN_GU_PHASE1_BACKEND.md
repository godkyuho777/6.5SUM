# JEON_IN_GU Phase 1.1 + 1.2 백엔드 Scaffolding

> **명세서**: `JEON_IN_GU_SIGNAL_TRACKER.md` (사용자 다운로드)
> **본 작업**: Phase 1.1 (DB 스키마) + Phase 1.2 (env 등록) + stub modifier + 4 tRPC
> **Phase 1.3 ~ 7**: D-002 deferred (변호사 + YouTube/Anthropic/Telegram API key 필요)

---

## 1. 작업 요약

전인구경제연구소 YouTube 콘텐츠 → LLM 감정 분류 → BBDX **Contrarian Modifier (±0.50)** 의 백엔드 인프라 구축. 실제 외부 API 호출은 보류 (stub-only).

---

## 2. DB Schema (drizzle 0006)

### `jeon_in_gu_contents`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | BIGSERIAL PK | |
| content_id | VARCHAR(100) UNIQUE | YouTube video ID 등 |
| source | VARCHAR(20) | 'youtube' / 'community' |
| channel_name | VARCHAR(100) | |
| title, description, transcript | TEXT | |
| published_at | BIGINT | |
| **sentiment_score** | REAL | -1.0 ~ +1.0 (Phase 2) |
| **market_direction** | VARCHAR(20) | bullish/bearish/neutral/unclear |
| sentiment_confidence | REAL | 0~1 |
| detected_assets | JSONB | ["BTC", "ETH"] |
| detected_keywords | JSONB | |
| reasoning | TEXT | LLM 한 줄 |
| processed | BOOLEAN | default false |
| bbdx_signals_affected | JSONB | |

**Indexes**: `(content_id)` unique, `(published_at)`, `(processed, published_at)`

### `jeon_in_gu_calibration_history`
매주 자동 calibration 결과 (Phase 5):
- weight_before / weight_after (0.50 → 0.40 등 감소 기록)
- r_squared / sample_size / oos_match
- passed_validation

---

## 3. 모듈

### `src/jeon-in-gu/types.ts` (82L)
- `JeonInGuContent` — DB row 매핑
- `SentimentResult` — LLM 출력 (score / direction / confidence / assets / keywords / reasoning)
- `JeonInGuModifierResult` — `{ modifierValue, decay, contrarianDirection, sourceCount, reason }`
- `MarketDirection` — "bullish" | "bearish" | "neutral" | "unclear"

### `src/jeon-in-gu/constants.ts` (55L)
```ts
export const JEON_IN_GU_CONFIG = {
  WEIGHT: 0.50,             // ⚠ BBDX 100점에 ±50 영향
  MIN_CONFIDENCE: 0.7,
  DECAY_HOURS: 36,
  MIN_FINAL_CONFIDENCE: 50,
  AUTO_CALIBRATION_ENABLED: true,
  CALIBRATION_INTERVAL_DAYS: 7,
  ALPHA_THRESHOLD: 0.10,    // R² < 이면 가중치 자동 감소
  FALLBACK_WEIGHT: 0.20,
  POLLING_INTERVAL_MINUTES: 5,
  LLM_MODEL: "claude-haiku-4-5-20251001",
  TRANSCRIPT_MAX_LENGTH: 8000,
};
```

`isJeonInGuEnabled()` — `YOUTUBE_API_KEY + JEON_IN_GU_CHANNEL_ID` 확인.

### `src/jeon-in-gu/modifier.ts` (85L, stub-only)
```ts
export async function computeJeonInGuModifier(symbol, side): Promise<JeonInGuModifierResult>
```

**현재**: API keys 미설정 → `modifierValue: 0` 반환 (BBDX 영향 X).

**Phase 3 구현 예정**:
1. DB `jeon_in_gu_contents` fetch (processed=true, published >= now-36h, confidence >= 0.7)
2. Decay calculation: `max(0, 1 - age_hours / 36)`
3. Contrarian inversion: `-sentiment_score`
4. side matching:
   - long: `modifier = contrarian * 0.50 * decay * confidence`
   - short: `modifier = -contrarian * 0.50 * decay * confidence`
5. 다중 콘텐츠 평균화 (최근 60%, 평균 40%)
6. clamp [-0.50, +0.50]

---

## 4. Feature Flag

`src/config/feature-flags.ts`:
```ts
ENABLE_JEON_IN_GU: process.env.ENABLE_JEON_IN_GU === "true",
```

Default `false` — 안전 fallback.

---

## 5. tRPC 라우트 (4)

`src/routers.ts` 끝에 append-only:

```ts
trpc.jeonInGu.config.useQuery()
// → { ...JEON_IN_GU_CONFIG, enabled, featureFlag }

trpc.jeonInGu.recentContents.useQuery({ limit })
// → { contents: [], message: "Phase 1.5 pending" } (Phase 1.5 활성 후 DB query)

trpc.jeonInGu.currentModifier.useQuery({ symbol, side })
// → JeonInGuModifierResult (stub — modifierValue: 0)

trpc.jeonInGu.calibrationHistory.useQuery()
// → { history: [], message: "Phase 5 pending" }
```

모든 라우트 graceful — keys 없어도 throw 없음, 빈 데이터 + 안내 메시지.

---

## 6. 환경변수 (.env.example)

```env
# === JEON_IN_GU Signal Tracker (Phase 1.3+ 대기) ===
ENABLE_JEON_IN_GU=false
JEON_IN_GU_CHANNEL_ID=
YOUTUBE_API_KEY=
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=
```

---

## 7. 안전 장치 (Phase 3 활성 시)

가중치 ±0.50 의 위험을 완화하는 4 안전장치 (코드에 명시):

1. **Confidence Gate** — LLM `confidence < 0.7` → modifier 0
2. **시간 감쇠** — `decay = max(0, 1 - age_hours/36)` 36h 후 0
3. **BBDX 최종 임계** — `MIN_FINAL_CONFIDENCE = 50` 미달 시 진입 X
4. **자동 calibration** — R² < 0.10 시 weight 자동 감소 (0.50→0.40→0.30→0.20)

---

## 8. 헌장 준수

| 규칙 | 결과 | 근거 |
|---|---|---|
| R1 (차원 중복 X) | ✅ | 6차원 (거시 — sentiment) 단일 |
| R2 (백테스트 알파) | ⚠ Phase 5 대기 | calibration history 인프라 준비 |
| R3 (단독 시그널 X) | ✅ | modifier 형태 (multiplier) |

---

## 9. Commits

```
20e08e8 build: rebuild dist/types for jeonInGu route
1d0484e feat(api): jeonInGu tRPC router (stub — Phase 1.3+ pending)
9439ce4 feat(jeon-in-gu): types + constants + Feature Flag + stub modifier + 9 tests
03f2d56 feat(db): add jeon_in_gu schema (contents + calibration_history) + migration 0006
```

---

## 10. 후속 — Phase 1.3 ~ 7 (D-002)

| Phase | 작업 | 외부 의존성 |
|---|---|---|
| 1.3 | YouTube 클라이언트 (`youtube-monitor.ts`) | YOUTUBE_API_KEY |
| 1.4 | 자막 fetcher (`transcript-fetcher.ts`) | youtube-transcript npm |
| 1.5 | 폴링 cron (5분 주기) | node-cron |
| 1.6 | Telegram 알람 | TELEGRAM_BOT_TOKEN |
| 2 | LLM 감정 분류 (`sentiment-classifier.ts`) | ANTHROPIC_API_KEY |
| 3 | Contrarian Modifier 실 구현 (computeJeonInGuModifier Phase 3 TODO) | Phase 2 완료 후 |
| 4 | VP + Trend 통합 전략 | |
| 5 | 백테스트 + Calibration cron | DB 데이터 누적 |
| 7 | 모니터링 + 사용자 알람 구독 | |

→ 사용자가 D-002 외부 액션 (변호사 + API key) 완료 후 순차 진행.

작성: 2026-05-13
