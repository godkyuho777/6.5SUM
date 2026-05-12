/**
 * Weight + Threshold Fetch (WEIGHT_SYSTEM §3.2).
 *
 * 3-계층 fallback (Redis 미사용 — Map + TTL 자체 구현):
 *   1. In-memory cache (1h TTL)
 *   2. DB (production status 우선)
 *   3. External manifest
 *   4. Default (직관값) — review_required 라벨
 *
 * 캐시 invalidation: saveCalibratedWeights/Threshold 시 자동.
 */
import { type WeightSide, type WeightVector } from "./external-manifest";
export interface WeightFetchResult {
    weights: WeightVector;
    source: "self_backtest" | "external" | "default";
    externalSourceId?: string | null;
    metadata: Record<string, unknown>;
    rSquared: number | null;
    sampleSize: number | null;
    oosMatch: number | null;
    wilsonCiWidth: number | null;
    status: string;
    cached: boolean;
}
export interface ThresholdFetchResult {
    threshold: number;
    source: "self_backtest" | "external" | "default";
    f1Score: number | null;
    sampleSize: number | null;
    status: string;
    cached: boolean;
}
export interface WeightFetchInput {
    symbol: string;
    tf: string;
    path: string;
    side: WeightSide;
}
/**
 * getWeightsForSignal — cache → DB → external → default.
 */
export declare function getWeightsForSignal(input: WeightFetchInput): Promise<WeightFetchResult>;
/**
 * getThresholdForSignal — cache → DB → external (LONG=42, SHORT=45) → default.
 */
export declare function getThresholdForSignal(input: {
    symbol: string;
    tf: string;
    side: WeightSide;
}): Promise<ThresholdFetchResult>;
/**
 * saveCalibratedWeights — 이전 production → history archive, 새 가중치 insert,
 * 캐시 invalidate.
 */
export declare function saveCalibratedWeights(input: {
    symbol: string;
    tf: string;
    path: string;
    side: WeightSide;
    weights: WeightVector;
    source: "self_backtest" | "external" | "default";
    externalSourceId?: string | null;
    metadata: Record<string, unknown>;
    rSquared?: number | null;
    sampleSize?: number | null;
    oosMatch?: number | null;
    wilsonCiWidth?: number | null;
    status: "production" | "review_required";
}): Promise<{
    ok: boolean;
    error?: string;
}>;
export declare function saveCalibratedThreshold(input: {
    symbol: string;
    tf: string;
    side: WeightSide;
    threshold: number;
    f1Score?: number | null;
    precisionScore?: number | null;
    recallScore?: number | null;
    sampleSize?: number | null;
    source: "self_backtest" | "external" | "default";
    status: "production" | "review_required";
}): Promise<{
    ok: boolean;
    error?: string;
}>;
/** Weight + threshold history (admin view 용). */
export declare function getWeightsHistory(input: WeightFetchInput, limit?: number): Promise<{
    id: number;
    symbol: string;
    tf: string;
    path: string;
    side: string;
    weightMomentum: number;
    weightPosition: number;
    weightTrend: number;
    weightVolume: number;
    weightAction: number;
    source: string;
    externalSourceId: string | null;
    metadata: unknown;
    rSquared: number | null;
    sampleSize: number | null;
    oosMatch: number | null;
    wilsonCiWidth: number | null;
    status: string;
    calibratedAt: number;
    replacedAt: number;
}[]>;
/** Test helper — clear in-memory caches. */
export declare function clearWeightCaches(): void;
