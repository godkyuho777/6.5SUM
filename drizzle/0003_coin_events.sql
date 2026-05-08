-- Tradelab: Coin Detail Workstation — Calendar Events
-- Migration 0003 — coin_events
--
-- Per-symbol or global market events (macro, unlock, fork, halving, listing,
-- custom). Used by the CoinDetail calendar panel + global market overview.
--
-- 적용 절차:
--   1. Supabase Dashboard → SQL Editor 에 본 파일 내용 그대로 붙여넣기
--   2. Run
--   3. drizzle/meta/_journal.json 은 drizzle-kit 이 갱신하므로 수동 편집 X
--      (`pnpm db:push` 또는 `pnpm db:migrate` 사용 시 자동)

CREATE TABLE IF NOT EXISTS "coin_events" (
  "id"            serial PRIMARY KEY,
  "symbol"        text NOT NULL,
  "event_type"    text NOT NULL,
  "title"         text NOT NULL,
  "description"   text,
  "scheduled_at"  timestamp with time zone NOT NULL,
  "source"        text,
  "created_by"    uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now()
);

-- 조회 성능 인덱스 — symbol+scheduled_at 으로 캘린더 페치 최적화.
CREATE INDEX IF NOT EXISTS "coin_events_symbol_scheduled_idx"
  ON "coin_events" ("symbol", "scheduled_at");

-- 단독 scheduled_at 인덱스 — global 뷰 (모든 symbol) 시간 범위 조회 용.
CREATE INDEX IF NOT EXISTS "coin_events_scheduled_at_idx"
  ON "coin_events" ("scheduled_at");
