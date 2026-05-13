# Drizzle 0006 Migration 적용 가이드 — JEON_IN_GU Signal Tracker

> **이유**: drizzle-kit push 는 production DB 안전을 위해 자동 실행 차단됨.
> 사용자가 직접 Supabase Dashboard 또는 CLI 로 적용 필요.
>
> **명세**: `JEON_IN_GU_SIGNAL_TRACKER.md` §2 (DB Schema).
> **상태**: Phase 1.1 (스키마) 완료. Phase 1.3 ~ 7 은 외부 의존성 대기 (D-002 참조).

---

## 적용 대상

```
drizzle/migrations/0006_jeon_in_gu_signal_tracker.sql
```

생성 테이블 2개:
- `jeon_in_gu_contents`  — YouTube + 커뮤니티 raw 콘텐츠 + LLM 감정 분류 결과
- `jeon_in_gu_calibration_history`  — 가중치 ±0.50 자동 calibration archive

인덱스:
- `idx_jeon_in_gu_contents_published_at`
- `idx_jeon_in_gu_contents_processed_published`
- `idx_jeon_in_gu_cal_history_calibrated_at`

---

## 방법 1 — Supabase Dashboard (권장)

1. Supabase project 접속 → **SQL Editor**
2. `drizzle/migrations/0006_jeon_in_gu_signal_tracker.sql` 전체 SQL 복사
3. SQL Editor 에 붙여넣기 + **Run**
4. 성공 시 다음 검증 SQL 실행:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'jeon_in_gu_%';
```

→ `jeon_in_gu_contents`, `jeon_in_gu_calibration_history` 2 rows 반환되면 성공.

## 방법 2 — 로컬 drizzle-kit push (개발 환경만)

```powershell
cd tradelab-backend
# .env 에 DATABASE_URL 또는 DIRECT_URL 이 dev 환경 가리키는지 확인 후
pnpm db:push
```

⚠️ `db:push` 는 dev DB 에만 사용. Production DB 에는 Dashboard SQL Editor.

## 방법 3 — psql

```powershell
$env:DIRECT_URL = "postgres://..."
psql $env:DIRECT_URL -f drizzle/migrations/0006_jeon_in_gu_signal_tracker.sql
```

---

## 적용 후 다음 단계

1. Phase 1.3 (YouTube 클라이언트) 진행 — `YOUTUBE_API_KEY` 발급 후
2. Phase 2 (LLM 감정 분류) 진행 — `ANTHROPIC_API_KEY` 발급 후
3. Phase 3 (Contrarian Modifier) — Phase 2 완료 후
4. 변호사 검토 (명예훼손) — Phase 3 production 활성 전 필수

자세한 단계는 `docs/SCHEDULE_DEFERRED.md` D-002 참조.

---

## Rollback

```sql
DROP TABLE IF EXISTS jeon_in_gu_contents CASCADE;
DROP TABLE IF EXISTS jeon_in_gu_calibration_history CASCADE;
```
