-- Strategy Charter audit log.
--
-- Captures the result of every validateAgainstCharter() invocation that
-- runs in CI or at runtime. Used by:
--   * CI script BE/scripts/charter-validate.ts — comments on PRs and
--     blocks merge when violations are blocking/critical.
--   * runtime — every signal can be tagged with the audit row id so
--     the FE can show the validation panel inline.
--
-- userId follows the existing convention (no FK on auth.users —
-- integrity enforced at app layer from the verified JWT).

CREATE TABLE IF NOT EXISTS charter_audits (
  id              SERIAL PRIMARY KEY,
  strategy_name   VARCHAR(100) NOT NULL,
  charter_version VARCHAR(20)  NOT NULL,
  pr_or_commit    VARCHAR(120),
  passed          BOOLEAN      NOT NULL,
  coverage_count  INTEGER      NOT NULL,
  coverage_total  INTEGER      NOT NULL DEFAULT 7,
  violations      JSONB        NOT NULL DEFAULT '[]'::jsonb,
  missing_dimensions TEXT[]    NOT NULL DEFAULT '{}',
  dimensions_covered JSONB     NOT NULL DEFAULT '{}'::jsonb,
  user_id         UUID,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS charter_audits_strategy_idx
  ON charter_audits (strategy_name, created_at DESC);

CREATE INDEX IF NOT EXISTS charter_audits_pr_idx
  ON charter_audits (pr_or_commit)
  WHERE pr_or_commit IS NOT NULL;
