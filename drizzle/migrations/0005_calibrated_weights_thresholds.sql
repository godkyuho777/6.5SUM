-- v6.6 Calibration tables (WEIGHT_SYSTEM §3.4 + BBDX_v66_PERP §4.4).
-- Apply via Supabase Dashboard SQL Editor (no automatic drizzle-kit push).
--
-- 3 tables:
--   1. calibrated_weights           — 현재 적용 가중치 (UNIQUE per status)
--   2. calibrated_weights_history   — 이전 가중치 archive (replaced_at 기록)
--   3. calibrated_thresholds        — F1-tuned 진입 임계 (LONG/SHORT 별)

CREATE TABLE IF NOT EXISTS calibrated_weights (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  tf VARCHAR(10) NOT NULL,
  path VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,
  weight_momentum REAL NOT NULL,
  weight_position REAL NOT NULL,
  weight_trend REAL NOT NULL,
  weight_volume REAL NOT NULL,
  weight_action REAL NOT NULL,
  source VARCHAR(20) NOT NULL,
  external_source_id VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  r_squared REAL,
  sample_size BIGINT,
  oos_match REAL,
  wilson_ci_width REAL,
  status VARCHAR(20) NOT NULL,
  calibrated_at BIGINT NOT NULL,
  UNIQUE(symbol, tf, path, side, status)
);

CREATE INDEX IF NOT EXISTS idx_cw_lookup
  ON calibrated_weights(symbol, tf, path, side, status);

CREATE TABLE IF NOT EXISTS calibrated_weights_history (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  tf VARCHAR(10) NOT NULL,
  path VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,
  weight_momentum REAL NOT NULL,
  weight_position REAL NOT NULL,
  weight_trend REAL NOT NULL,
  weight_volume REAL NOT NULL,
  weight_action REAL NOT NULL,
  source VARCHAR(20) NOT NULL,
  external_source_id VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  r_squared REAL,
  sample_size BIGINT,
  oos_match REAL,
  wilson_ci_width REAL,
  status VARCHAR(20) NOT NULL,
  calibrated_at BIGINT NOT NULL,
  replaced_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cwh_lookup
  ON calibrated_weights_history(symbol, tf, path, side, replaced_at DESC);

CREATE TABLE IF NOT EXISTS calibrated_thresholds (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  tf VARCHAR(10) NOT NULL,
  side VARCHAR(10) NOT NULL,
  threshold REAL NOT NULL,
  f1_score REAL,
  precision_score REAL,
  recall_score REAL,
  sample_size BIGINT,
  source VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  calibrated_at BIGINT NOT NULL,
  UNIQUE(symbol, tf, side, status)
);

CREATE INDEX IF NOT EXISTS idx_ct_lookup
  ON calibrated_thresholds(symbol, tf, side, status);
