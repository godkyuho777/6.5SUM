/**
 * Onchain Score — 7개 modifier 합산 → 정규화 → regime 분류.
 *
 * 명세서 ONCHAIN_INTEGRATION.md §3 그대로 구현:
 *   total = sum(modifiers)               // ~ -1.75 ~ +1.40
 *   normalized = clamp(total / 1.4, -1, +1)
 *
 *   regime = strong_accumulation  if score > 0.6
 *          = accumulation         if score > 0.2
 *          = neutral              if score > -0.2
 *          = distribution         if score > -0.6
 *          = strong_distribution  otherwise
 */
import { type OnchainRegime, type OnchainScore } from "./types";
export declare function classifyRegime(score: number): OnchainRegime;
/** Compute onchain score for a symbol. Runs all 7 modifiers in parallel. */
export declare function computeOnchainScore(symbol: string): Promise<OnchainScore>;
