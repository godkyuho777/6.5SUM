/**
 * Async onchain-score fetcher used by the v6.5 routers and lite-mode.
 *
 * Coexists with the synchronous, pure `score.ts` pipeline (v6.5 §3.1) that
 * the BBDX confidence orchestrator (`signals/confidence.ts`) consumes via
 * raw zscore inputs. This file fans out to the v6.5 modifier fetchers
 * (which handle stub/mock fallbacks and produce UI-ready
 * `OnchainModifierResult` objects), sums their already-converted
 * contributions, and classifies the regime via `REGIME_THRESHOLDS`.
 *
 * Why two pipelines: the pure `computeOnchainScore(symbol, inputs)` in
 * `score.ts` operates on raw metrics (zscores, USD net, %), while the
 * v6.5 fetchers expose pre-bucketed contributions plus status/detail
 * metadata the workstation panels need. Reconciling the two scoring
 * formulas is deferred — both pipelines run independently in their
 * respective callers (confidence.ts vs routers.ts).
 */
import { type OnchainRegime, type OnchainScore } from "./types";
export declare function classifyRegime(score: number): OnchainRegime;
/** Fetch onchain modifiers for a symbol and return the v6.5 router contract. */
export declare function fetchOnchainScore(symbol: string): Promise<OnchainScore>;
