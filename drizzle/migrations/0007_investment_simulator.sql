-- Investment Simulator (모의투자) — 2026-05-15
-- 가상 자금 $200,000 USD 로 모의 거래. 실제 자본 영향 X.
-- Charter: 본 테이블은 시뮬레이션 전용. BBDX 시그널 시스템과 분리.

-- Enums
DO $$ BEGIN
  CREATE TYPE "sim_position_status" AS ENUM ('open', 'closed', 'liquidated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sim_product_type" AS ENUM ('spot', 'perp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sim_tx_type" AS ENUM (
    'open', 'close', 'funding', 'commission', 'deposit', 'liquidation'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Accounts (1 user = 1 account)
CREATE TABLE IF NOT EXISTS "sim_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL UNIQUE,
  "cash" double precision NOT NULL DEFAULT 200000,
  "realized_pnl" double precision NOT NULL DEFAULT 0,
  "total_commission" double precision NOT NULL DEFAULT 0,
  "total_funding" double precision NOT NULL DEFAULT 0,
  "liquidation_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Positions
CREATE TABLE IF NOT EXISTS "sim_positions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "symbol" varchar(20) NOT NULL,
  "product_type" sim_product_type NOT NULL DEFAULT 'spot',
  "side" varchar(10) NOT NULL,
  "leverage" real NOT NULL DEFAULT 1,
  "entry_price" double precision NOT NULL,
  "quantity" double precision NOT NULL,
  "margin" double precision NOT NULL,
  "current_price" double precision,
  "liquidation_price" double precision,
  "accrued_funding" double precision NOT NULL DEFAULT 0,
  "accrued_commission" double precision NOT NULL DEFAULT 0,
  "status" sim_position_status NOT NULL DEFAULT 'open',
  "opened_at" timestamp with time zone NOT NULL DEFAULT now(),
  "closed_at" timestamp with time zone,
  "closed_pnl" double precision,
  "closed_price" double precision,
  "closed_reason" varchar(50)
);

CREATE INDEX IF NOT EXISTS "idx_sim_positions_user" ON "sim_positions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_sim_positions_status" ON "sim_positions" ("status");

-- Transactions (audit trail)
CREATE TABLE IF NOT EXISTS "sim_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "position_id" integer,
  "type" sim_tx_type NOT NULL,
  "symbol" varchar(20),
  "amount" double precision NOT NULL,
  "price" double precision,
  "note" text,
  "ts" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sim_transactions_user_ts"
  ON "sim_transactions" ("user_id", "ts" DESC);
CREATE INDEX IF NOT EXISTS "idx_sim_transactions_position"
  ON "sim_transactions" ("position_id");
