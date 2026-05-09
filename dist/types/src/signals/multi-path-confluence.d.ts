/**
 * Multi-path confluence multiplier — v6.5 §1.1.
 *
 * When the same bar fires multiple BBDX paths (NUM, PTN, BB:Riding,
 * BB:Lower Bounce, BB:Squeeze), we credit the confluence with a small
 * boost. Range `[1.00, 1.20]`.
 *
 *   1 path  → 1.00
 *   2 paths → 1.10
 *   3 paths → 1.20
 *   4+      → 1.20 (clamped)
 */
import type { EntryPath } from "@shared/types";
/**
 * Compute the confluence multiplier from the set of paths firing
 * concurrently. Duplicate paths in the input are deduplicated so
 * callers don't need to be careful — passing `['NUM', 'NUM']`
 * returns the single-path multiplier.
 */
export declare function computeConfluence(paths: readonly (EntryPath | string)[]): number;
