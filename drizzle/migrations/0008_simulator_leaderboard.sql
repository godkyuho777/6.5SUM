-- Simulator Leaderboard (opt-in, 익명) — 2026-05-21
-- INVESTMENT_SIMULATOR_AUDIT.md §5 Phase 2 — Backend wiring.
--
-- 시뮬레이터는 로그인 없는 익명 모드. opt-in 사용자만 ranking 참여.
-- clientToken (UUID v4, frontend localStorage 발급) 으로 단순 ownership 검증.
--
-- 2 tables:
--   1. simulator_leaderboard_users     — opt-in 사용자 + 현재 stats
--   2. simulator_leaderboard_snapshots — 히스토리 (period query 용, Phase 2)
--
-- Apply via Supabase Dashboard SQL Editor (자세한 안내: APPLY_0008_INSTRUCTIONS.md).

-- ── 1. simulator_leaderboard_users ────────────────────────────────
CREATE TABLE IF NOT EXISTS "simulator_leaderboard_users" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- frontend simUser.id (crypto.randomUUID) — UNIQUE ownership token
  "client_token"       uuid             NOT NULL UNIQUE,
  -- 익명 닉네임 (중복 가능)
  "nickname"           varchar(24)      NOT NULL,
  "opted_in_at"        timestamptz      NOT NULL DEFAULT now(),
  -- NOT NULL → fetch 결과에서 영구 제외 (opt-out)
  "opted_out_at"       timestamptz,
  "last_synced_at"     timestamptz,
  -- 현재 stats (sync 마다 갱신)
  "current_capital"    double precision NOT NULL DEFAULT 200000,
  "initial_capital"    double precision NOT NULL DEFAULT 200000,
  "total_pnl"          double precision NOT NULL DEFAULT 0,
  "pnl_pct"            double precision NOT NULL DEFAULT 0,
  "total_trades"       integer          NOT NULL DEFAULT 0,
  "wins"               integer          NOT NULL DEFAULT 0,
  "losses"             integer          NOT NULL DEFAULT 0,
  "win_rate"           double precision NOT NULL DEFAULT 0,
  "max_drawdown_pct"   double precision NOT NULL DEFAULT 0,
  "created_at"         timestamptz      NOT NULL DEFAULT now()
);

-- leaderboard 정렬 (pnl_pct DESC) — opt-in 활성 사용자만 부분 인덱스
CREATE INDEX IF NOT EXISTS "sim_lb_pnl_idx"
  ON "simulator_leaderboard_users" ("pnl_pct" DESC)
  WHERE "opted_out_at" IS NULL;

-- opt-out 사용자 빠른 제외용
CREATE INDEX IF NOT EXISTS "sim_lb_opted_out_idx"
  ON "simulator_leaderboard_users" ("opted_out_at");

-- ── 2. simulator_leaderboard_snapshots ────────────────────────────
CREATE TABLE IF NOT EXISTS "simulator_leaderboard_snapshots" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"          uuid             NOT NULL REFERENCES "simulator_leaderboard_users"("id") ON DELETE CASCADE,
  "snapshot_at"      timestamptz      NOT NULL DEFAULT now(),
  "current_capital"  double precision NOT NULL,
  "pnl_pct"          double precision NOT NULL,
  "total_trades"     integer          NOT NULL
);

-- period query 가속: 특정 user 의 최근 N일 snapshot lookup
CREATE INDEX IF NOT EXISTS "sim_lb_snap_user_time_idx"
  ON "simulator_leaderboard_snapshots" ("user_id", "snapshot_at" DESC);
