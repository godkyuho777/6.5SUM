-- JEON_IN_GU Signal Tracker — Phase 1.1 DB schema.
-- 명세: JEON_IN_GU_SIGNAL_TRACKER.md §2.
-- Apply via Supabase Dashboard SQL Editor (no automatic drizzle-kit push).
--
-- 2 tables:
--   1. jeon_in_gu_contents             — YouTube + 커뮤니티 raw 콘텐츠 + LLM 감정 분류 결과
--   2. jeon_in_gu_calibration_history  — 가중치 ±0.50 자동 calibration archive
--
-- 본 마이그레이션은 스키마만 생성. 실제 데이터 누적은 Phase 1.3+ (외부 API key 발급 후) 시작.

-- ── 1. jeon_in_gu_contents ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jeon_in_gu_contents (
  id                    BIGINT PRIMARY KEY,
  content_id            VARCHAR(100) UNIQUE NOT NULL,
  source                VARCHAR(20)  NOT NULL,
  channel_name          VARCHAR(100),
  title                 TEXT         NOT NULL,
  description           TEXT,
  transcript            TEXT,
  published_at          BIGINT       NOT NULL,

  -- 감정 분류 결과 (Phase 2 에서 채워짐. NULL = 미처리)
  sentiment_score       REAL,
  market_direction      VARCHAR(20),
  sentiment_confidence  REAL,
  detected_assets       JSONB,
  detected_keywords     JSONB,
  reasoning             TEXT,

  processed             BOOLEAN      NOT NULL DEFAULT FALSE,
  processed_at          BIGINT,
  bbdx_signals_affected JSONB
);

-- content_id 는 UNIQUE 제약으로 이미 인덱스 생김 (PRIMARY KEY 외).
-- published_at 단독 인덱스 — Phase 3 의 36h decay 윈도우 SELECT 가속용.
CREATE INDEX IF NOT EXISTS idx_jeon_in_gu_contents_published_at
  ON jeon_in_gu_contents (published_at DESC);

-- (processed, published_at) 복합 인덱스 — Phase 2 의 batch 미처리 콘텐츠 fetch
-- + Phase 3 의 활성 modifier 윈도우 SELECT 두 패턴 모두 가속.
CREATE INDEX IF NOT EXISTS idx_jeon_in_gu_contents_processed_published
  ON jeon_in_gu_contents (processed, published_at DESC);

-- ── 2. jeon_in_gu_calibration_history ─────────────────────────────
CREATE TABLE IF NOT EXISTS jeon_in_gu_calibration_history (
  id                  BIGINT PRIMARY KEY,
  calibrated_at       BIGINT NOT NULL,
  weight_before       REAL   NOT NULL,
  weight_after        REAL   NOT NULL,
  r_squared           REAL,
  sample_size         BIGINT,
  oos_match           REAL,
  reason              TEXT,
  passed_validation   BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_jeon_in_gu_cal_history_calibrated_at
  ON jeon_in_gu_calibration_history (calibrated_at DESC);
