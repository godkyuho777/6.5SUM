CREATE TYPE "public"."position_status" AS ENUM('open', 'closed', 'liquidated');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('active', 'target_hit', 'expired', 'closed');--> statement-breakpoint
CREATE TABLE "alert_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" varchar(20),
	"rsi_low" double precision DEFAULT 30,
	"rsi_high" double precision DEFAULT 35,
	"adx_threshold" double precision DEFAULT 30,
	"target_rsi" double precision DEFAULT 70,
	"target_adx" double precision DEFAULT 30,
	"target_plus_di" double precision DEFAULT 30,
	"use_bb_lower" boolean DEFAULT true,
	"use_bb_middle_target" boolean DEFAULT true,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"signal_id" integer,
	"symbol" varchar(20) NOT NULL,
	"entry_price" double precision NOT NULL,
	"target_price" double precision,
	"current_price" double precision,
	"quantity" double precision NOT NULL,
	"leverage" integer DEFAULT 1 NOT NULL,
	"pnl_percent" double precision,
	"pnl_amount" double precision,
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"close_price" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"entry_price" double precision NOT NULL,
	"current_price" double precision,
	"target_price" double precision,
	"rsi_value" double precision NOT NULL,
	"bb_lower" double precision NOT NULL,
	"bb_middle" double precision NOT NULL,
	"bb_upper" double precision NOT NULL,
	"adx_value" double precision NOT NULL,
	"plus_di" double precision NOT NULL,
	"minus_di" double precision NOT NULL,
	"status" "signal_status" DEFAULT 'active' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_hit_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"exit_reason" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
