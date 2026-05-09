-- v6.5 — full-dimension integration (Part II.5 / Part III.2).
--
-- Adds the macro and onchain snapshot tables that feed the
-- confidence orchestrator, plus the multiplier columns on `signals`
-- so every emitted signal stores its v6.5 breakdown alongside the
-- legacy v6.1/v6.3 fields.

-- ── Macro snapshots — daily cadence
CREATE TABLE IF NOT EXISTS macro_snapshots (
  id                          SERIAL PRIMARY KEY,
  ts                          TIMESTAMPTZ      NOT NULL DEFAULT now(),
  sofr                        DOUBLE PRECISION,
  iorb                        DOUBLE PRECISION,
  rrp_change_30d              DOUBLE PRECISION,
  tga_change_30d              DOUBLE PRECISION,
  fed_balance_change_30d      DOUBLE PRECISION,
  real_fed_funds_rate         DOUBLE PRECISION,
  score                       DOUBLE PRECISION NOT NULL,
  regime                      VARCHAR(20)      NOT NULL,
  breakdown                   JSONB            NOT NULL DEFAULT '{}'::jsonb,
  korea_modifier              DOUBLE PRECISION DEFAULT 0,
  krw_change_30d              DOUBLE PRECISION,
  bok_rate_change_90d         DOUBLE PRECISION,
  created_at                  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS macro_snapshots_ts_idx
  ON macro_snapshots (ts DESC);

-- ── Onchain snapshots — 1h cadence per symbol
CREATE TABLE IF NOT EXISTS onchain_snapshots (
  id          SERIAL PRIMARY KEY,
  symbol      VARCHAR(20)      NOT NULL,
  ts          TIMESTAMPTZ      NOT NULL DEFAULT now(),
  tier        VARCHAR(20)      NOT NULL,
  score       DOUBLE PRECISION NOT NULL,
  regime      VARCHAR(30)      NOT NULL,
  breakdown   JSONB            NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onchain_snapshots_symbol_ts_idx
  ON onchain_snapshots (symbol, ts DESC);

-- ── Add v6.5 multiplier breakdown to `signals`.
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS macro_score        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS macro_regime       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS macro_mult         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS onchain_score      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS onchain_regime     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS onchain_mult       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS confluence_mult    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS wave_mult          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS final_confidence   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS size_factor        VARCHAR(10);

CREATE INDEX IF NOT EXISTS signals_final_confidence_idx
  ON signals (final_confidence DESC)
  WHERE final_confidence IS NOT NULL;
