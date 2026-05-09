-- v6.3 EXIT redesign — Part II.1.
--
-- Adds structured exit metadata to signals so the FE can render the
-- 4-category (A/B/C/D/STOP) outcome instead of the prior monolithic
-- exit_reason string. Adds position state needed for EXIT-C protection
-- (trailing/breakeven) and EXIT-D time stop.

-- signals: capture which v6.3 EXIT category fired and the reversal score
-- when category=B.
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS exit_category    CHAR(1),
  ADD COLUMN IF NOT EXISTS exit_action      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS exit_ratio       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS exit_reversal_score DOUBLE PRECISION;

-- Widen the legacy exit_reason field — v6.3 reasons concatenate more text.
ALTER TABLE signals
  ALTER COLUMN exit_reason TYPE VARCHAR(200);

-- positions: state needed for EXIT-C and EXIT-D categories.
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS entry_bar_index             INTEGER,
  ADD COLUMN IF NOT EXISTS current_stop                DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS stop_moved_to_breakeven     BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS partial_exits_taken         JSONB    DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS tier1_partial_exit_taken    BOOLEAN  DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS signals_exit_category_idx
  ON signals (exit_category)
  WHERE exit_category IS NOT NULL;
