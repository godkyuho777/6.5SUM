/**
 * Onchain composite score — v6.5 §3.1.
 *
 * Combines per-modifier contributions into a single normalized
 * score in `[-1, 1]`, classifies the regime, and emits the
 * multiplier the entry orchestrator consumes.
 *
 * Pure: takes raw inputs, returns the result. Source fetchers in
 * `sources/*.ts` populate the inputs.
 */
import { type ModifierName } from "./modifiers";
import { type OnchainTier } from "./symbol-tier";
/** Raw inputs collected by `sources/*.ts`. All optional — modifier returns 0 when absent. */
export interface OnchainInputs {
    /** Exchange netflow z-score over the last 24h (negative = outflow = bullish). */
    netflowZscore?: number;
    /** Whale Alert net USD over last ~12h (signed). */
    whaleNetUsd?: number;
    /** SSR z-score over last 90d. */
    ssrZscore?: number;
    /** Coinbase / Binance price ratio - 1, dimensionless. */
    coinbasePremium?: number;
    /** ETF 3-day cumulative net flow in USD. */
    etfFlowThreeDayUsd?: number;
    /** Miner outflow z-score over 90d. */
    minerOutflowZscore?: number;
    /** Long-term holder supply 30d change as a fraction. */
    lthSupplyThirtyDayChange?: number;
}
export type OnchainRegime = "strong_accumulation" | "accumulation" | "neutral" | "distribution" | "strong_distribution";
/**
 * v6.5 §3.1.2 multiplier table — spec source of truth.
 *
 * `BBDX_v6.5_FULL_DIMENSION.md` 의 명시 표. `OnchainScoreResult.mult` 는
 * regime → 표 lookup 으로 산출.
 *
 * 주: `bbdx-integration.ts:applyOnchainToEntry` 의 `1 + score × 0.30` 공식과
 * *수치적으로 다름* (e.g. score=0.4 면 표=1.15, 공식=1.12). 두 값은 *서로
 * 다른 곱셈 경로* 에 사용:
 *   - 표 (이 항목): `OnchainScoreResult.mult` → `signals/confidence.ts` 의
 *     `final_confidence = base × ... × onchain × ...` 곱셈 체인.
 *   - 공식: `applyOnchainToEntry(signal, onchain)` → entry-time 별도 보정
 *     (`scanner.ts` 등에서 호출).
 *
 * Audit `02-ONCHAIN-AUDIT.md` §1 의 "두 파이프라인 통합" 권고는 *spec 의
 * 의도된 분리* 일 가능성 — 후속 spec 명확화까지 두 경로 보존 (P2).
 */
export declare const ONCHAIN_MULTIPLIERS: Readonly<Record<OnchainRegime, number>>;
export interface OnchainBreakdown {
    netflow: number;
    whale: number;
    ssr: number;
    coinbasePremium: number;
    etfFlow: number;
    minerOutflow: number;
    lthSupply: number;
}
export interface OnchainScoreResult {
    symbol: string;
    tier: OnchainTier;
    /** Sum of enabled modifiers, normalized to [-1, 1]. */
    score: number;
    regime: OnchainRegime;
    /** Multiplier applied to base_strength downstream. */
    mult: number;
    breakdown: OnchainBreakdown;
    /** Names of modifiers that were enabled by the tier. */
    enabledModifiers: readonly ModifierName[];
}
/**
 * Compute the full onchain score for a symbol given raw inputs.
 *
 * Modifiers not enabled for the symbol's tier are recorded as `0`
 * in the breakdown. This way the FE can show "5/7 enabled — small
 * cap" without separate logic for each tier.
 */
export declare function computeOnchainScore(symbol: string, inputs?: OnchainInputs): OnchainScoreResult;
