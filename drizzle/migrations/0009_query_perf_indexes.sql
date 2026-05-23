-- P2-#6 (2026-05-23, AUDIT.md): 누락된 composite indexes + FK 명시.
--
-- 분석: 자주 쓰이는 쿼리 패턴
--   signals:        WHERE symbol = ? AND createdAt > ?
--                   WHERE status = 'active' ORDER BY createdAt DESC
--   positions:      WHERE userId = ? AND status = 'open' ORDER BY openedAt DESC
--                   WHERE userId = ? AND symbol = ? AND status = 'open'
--   alertSettings:  WHERE userId = ? AND enabled = true
--   charterAudits:  WHERE strategyName = ? AND passed = ? ORDER BY createdAt DESC
--
-- 기존 인덱스: PRIMARY KEY (id) 만 → 위 쿼리들은 전체 테이블 스캔.
-- 본 마이그레이션 후: 1.7K-row 기준 query 시간 ~ms.
--
-- 추가: positions.signalId → signals.id FK constraint (ON DELETE SET NULL).
--   signal 이 삭제되어도 position 자체는 보존 (audit trail 위함).

-- ── signals 인덱스 ──────────────────────────────────────────

-- 가장 빈번한 쿼리: 특정 symbol 의 최근 시그널들
CREATE INDEX IF NOT EXISTS "idx_signals_symbol_created"
  ON "signals" ("symbol", "created_at" DESC);

-- status 별 active 시그널 모니터링 (real-time scanner)
CREATE INDEX IF NOT EXISTS "idx_signals_status_created"
  ON "signals" ("status", "created_at" DESC)
  WHERE "status" = 'active';

-- ── positions 인덱스 ────────────────────────────────────────

-- 사용자별 open 포지션 조회 (most common — UI 우측 패널)
CREATE INDEX IF NOT EXISTS "idx_positions_user_status_opened"
  ON "positions" ("user_id", "status", "opened_at" DESC);

-- 사용자별 특정 심볼 포지션 조회 (충돌 체크 / 마진 합산)
CREATE INDEX IF NOT EXISTS "idx_positions_user_symbol_status"
  ON "positions" ("user_id", "symbol", "status");

-- signal_id → 시그널이 발생시킨 모든 포지션 추적 (백테스트 검증)
CREATE INDEX IF NOT EXISTS "idx_positions_signal_id"
  ON "positions" ("signal_id")
  WHERE "signal_id" IS NOT NULL;

-- ── alert_settings 인덱스 ───────────────────────────────────

-- 사용자별 enabled alert 조회 (cron 의 alert dispatcher)
CREATE INDEX IF NOT EXISTS "idx_alert_settings_user_enabled"
  ON "alert_settings" ("user_id", "enabled")
  WHERE "enabled" = true;

-- ── charter_audits 인덱스 ───────────────────────────────────

-- strategy 별 최근 audit 조회 (validation 결과 확인)
CREATE INDEX IF NOT EXISTS "idx_charter_audits_strategy_created"
  ON "charter_audits" ("strategy_name", "created_at" DESC);

-- 실패한 audit 만 조회 (운영 모니터링)
CREATE INDEX IF NOT EXISTS "idx_charter_audits_failed"
  ON "charter_audits" ("created_at" DESC)
  WHERE "passed" = false;

-- ── FK constraint: positions.signal_id → signals.id ────────

-- IF NOT EXISTS pattern — DO 블록으로 idempotent
DO $$ BEGIN
  ALTER TABLE "positions"
    ADD CONSTRAINT "positions_signal_id_fkey"
    FOREIGN KEY ("signal_id") REFERENCES "signals"("id")
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION
  WHEN duplicate_object THEN
    -- 이미 존재 → 무시
    NULL;
  WHEN invalid_foreign_key THEN
    -- 기존 데이터에 dangling signal_id 가 있으면 ALTER 실패.
    -- 운영자가 수동으로 정리 후 재시도 필요. 본 마이그레이션은 skip.
    RAISE WARNING 'positions.signal_id FK 추가 실패 — dangling reference 정리 필요';
END $$;

-- ── 분석 통계 갱신 (PostgreSQL planner 가 새 인덱스 인식) ────
-- 마이그레이션 직후 ANALYZE 권장 (Supabase 가 주기적으로 자동 실행하나 명시).
ANALYZE "signals";
ANALYZE "positions";
ANALYZE "alert_settings";
ANALYZE "charter_audits";
