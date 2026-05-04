-- Indexes for hot query paths exposed via tRPC.
--
-- positions:
--   * trpc.positions.list filters by `user_id` and (optionally) `status`,
--     ordered by `opened_at DESC`.
--   * trpc.positions.refreshPrices fetches `WHERE user_id = ? AND status = 'open'`.
-- alert_settings:
--   * trpc.alerts.get fetches by `user_id`.
-- signals:
--   * trpc.signals.history is `ORDER BY detected_at DESC LIMIT n` (no predicate).
--
-- Applied to both Supabase projects via mcp `apply_migration` (name:
-- `add_indexes_for_user_queries`); this file mirrors the change in-repo
-- as the source of truth for future migrations.

CREATE INDEX IF NOT EXISTS positions_user_id_status_idx
  ON positions (user_id, status);

CREATE INDEX IF NOT EXISTS positions_opened_at_idx
  ON positions (opened_at DESC);

CREATE INDEX IF NOT EXISTS alert_settings_user_id_idx
  ON alert_settings (user_id);

CREATE INDEX IF NOT EXISTS signals_detected_at_idx
  ON signals (detected_at DESC);
