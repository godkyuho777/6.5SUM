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

import { and, desc, eq } from "drizzle-orm";
import {
  calibratedWeights,
  calibratedWeightsHistory,
  calibratedThresholds,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  getExternalWeights,
  weightsFromSource,
  type WeightPath,
  type WeightSide,
  type WeightVector,
} from "./external-manifest";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const weightCache = new Map<string, CacheEntry<WeightFetchResult>>();
const thresholdCache = new Map<string, CacheEntry<ThresholdFetchResult>>();

function cacheKey(symbol: string, tf: string, path: string, side: string): string {
  return `${symbol}:${tf}:${path}:${side}`;
}

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
export async function getWeightsForSignal(
  input: WeightFetchInput,
): Promise<WeightFetchResult> {
  const key = cacheKey(input.symbol, input.tf, input.path, input.side);
  const cached = weightCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cached: true };
  }

  // DB lookup (production 우선, 없으면 review_required)
  try {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(calibratedWeights)
        .where(
          and(
            eq(calibratedWeights.symbol, input.symbol),
            eq(calibratedWeights.tf, input.tf),
            eq(calibratedWeights.path, input.path),
            eq(calibratedWeights.side, input.side),
          ),
        )
        .orderBy(desc(calibratedWeights.calibratedAt))
        .limit(1);

      const row = rows[0];
      if (row) {
        const result: WeightFetchResult = {
          weights: {
            momentum: row.weightMomentum,
            position: row.weightPosition,
            trend: row.weightTrend,
            volume: row.weightVolume,
            action: row.weightAction,
          },
          source: row.source as "self_backtest" | "external" | "default",
          externalSourceId: row.externalSourceId ?? null,
          metadata: (row.metadata as Record<string, unknown>) ?? {},
          rSquared: row.rSquared ?? null,
          sampleSize: row.sampleSize ?? null,
          oosMatch: row.oosMatch ?? null,
          wilsonCiWidth: row.wilsonCiWidth ?? null,
          status: row.status,
          cached: false,
        };
        weightCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    }
  } catch (err) {
    console.warn(
      `[weight-fetch] DB lookup failed for ${key}: ${(err as Error).message}`,
    );
  }

  // External manifest
  const ext = getExternalWeights(input.symbol, input.tf, input.path, input.side);
  if (ext) {
    const result: WeightFetchResult = {
      weights: weightsFromSource(ext),
      source: "external",
      externalSourceId: ext.source_id,
      metadata: {
        citation: ext.citation,
        ...ext.weights.metadata,
      },
      rSquared: ext.weights.metadata.r_squared,
      sampleSize: ext.weights.metadata.sample_size,
      oosMatch: null,
      wilsonCiWidth: null,
      status: "production",
      cached: false,
    };
    weightCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  // Default fallback
  const defaultW = DEFAULT_WEIGHTS[input.path as WeightPath] ?? DEFAULT_WEIGHTS.BB;
  const result: WeightFetchResult = {
    weights: defaultW,
    source: "default",
    externalSourceId: null,
    metadata: { warning: "직관값 fallback — 검증 X (review_required)" },
    rSquared: null,
    sampleSize: null,
    oosMatch: null,
    wilsonCiWidth: null,
    status: "review_required",
    cached: false,
  };
  weightCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/**
 * getThresholdForSignal — cache → DB → external (LONG=42, SHORT=45) → default.
 */
export async function getThresholdForSignal(input: {
  symbol: string;
  tf: string;
  side: WeightSide;
}): Promise<ThresholdFetchResult> {
  const key = cacheKey(input.symbol, input.tf, "_", input.side);
  const cached = thresholdCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cached: true };
  }

  try {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(calibratedThresholds)
        .where(
          and(
            eq(calibratedThresholds.symbol, input.symbol),
            eq(calibratedThresholds.tf, input.tf),
            eq(calibratedThresholds.side, input.side),
          ),
        )
        .orderBy(desc(calibratedThresholds.calibratedAt))
        .limit(1);

      const row = rows[0];
      if (row) {
        const result: ThresholdFetchResult = {
          threshold: row.threshold,
          source: row.source as "self_backtest" | "external" | "default",
          f1Score: row.f1Score ?? null,
          sampleSize: row.sampleSize ?? null,
          status: row.status,
          cached: false,
        };
        thresholdCache.set(key, {
          value: result,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return result;
      }
    }
  } catch (err) {
    console.warn(
      `[threshold-fetch] DB lookup failed for ${key}: ${(err as Error).message}`,
    );
  }

  // Default
  const result: ThresholdFetchResult = {
    threshold: DEFAULT_THRESHOLDS[input.side],
    source: "default",
    f1Score: null,
    sampleSize: null,
    status: "review_required",
    cached: false,
  };
  thresholdCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/**
 * saveCalibratedWeights — 이전 production → history archive, 새 가중치 insert,
 * 캐시 invalidate.
 */
export async function saveCalibratedWeights(input: {
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
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[weight-save] DB unavailable — skipping persist");
      // 캐시 invalidate 만이라도
      const key = cacheKey(input.symbol, input.tf, input.path, input.side);
      weightCache.delete(key);
      return { ok: false, error: "DB unavailable" };
    }

    // 이전 production 행 archive
    const existing = await db
      .select()
      .from(calibratedWeights)
      .where(
        and(
          eq(calibratedWeights.symbol, input.symbol),
          eq(calibratedWeights.tf, input.tf),
          eq(calibratedWeights.path, input.path),
          eq(calibratedWeights.side, input.side),
          eq(calibratedWeights.status, input.status),
        ),
      );

    if (existing.length > 0) {
      const prev = existing[0];
      await db.insert(calibratedWeightsHistory).values({
        symbol: prev.symbol,
        tf: prev.tf,
        path: prev.path,
        side: prev.side,
        weightMomentum: prev.weightMomentum,
        weightPosition: prev.weightPosition,
        weightTrend: prev.weightTrend,
        weightVolume: prev.weightVolume,
        weightAction: prev.weightAction,
        source: prev.source,
        externalSourceId: prev.externalSourceId ?? null,
        metadata: prev.metadata,
        rSquared: prev.rSquared ?? null,
        sampleSize: prev.sampleSize ?? null,
        oosMatch: prev.oosMatch ?? null,
        wilsonCiWidth: prev.wilsonCiWidth ?? null,
        status: prev.status,
        calibratedAt: prev.calibratedAt,
        replacedAt: Date.now(),
      });
      await db
        .delete(calibratedWeights)
        .where(eq(calibratedWeights.id, prev.id));
    }

    // 새 가중치 insert
    await db.insert(calibratedWeights).values({
      symbol: input.symbol,
      tf: input.tf,
      path: input.path,
      side: input.side,
      weightMomentum: input.weights.momentum,
      weightPosition: input.weights.position,
      weightTrend: input.weights.trend,
      weightVolume: input.weights.volume,
      weightAction: input.weights.action,
      source: input.source,
      externalSourceId: input.externalSourceId ?? null,
      metadata: input.metadata,
      rSquared: input.rSquared ?? null,
      sampleSize: input.sampleSize ?? null,
      oosMatch: input.oosMatch ?? null,
      wilsonCiWidth: input.wilsonCiWidth ?? null,
      status: input.status,
      calibratedAt: Date.now(),
    });

    // Cache invalidate
    const key = cacheKey(input.symbol, input.tf, input.path, input.side);
    weightCache.delete(key);

    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[weight-save] failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

export async function saveCalibratedThreshold(input: {
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
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await getDb();
    if (!db) {
      const key = cacheKey(input.symbol, input.tf, "_", input.side);
      thresholdCache.delete(key);
      return { ok: false, error: "DB unavailable" };
    }

    // delete existing (same status)
    await db
      .delete(calibratedThresholds)
      .where(
        and(
          eq(calibratedThresholds.symbol, input.symbol),
          eq(calibratedThresholds.tf, input.tf),
          eq(calibratedThresholds.side, input.side),
          eq(calibratedThresholds.status, input.status),
        ),
      );

    await db.insert(calibratedThresholds).values({
      symbol: input.symbol,
      tf: input.tf,
      side: input.side,
      threshold: input.threshold,
      f1Score: input.f1Score ?? null,
      precisionScore: input.precisionScore ?? null,
      recallScore: input.recallScore ?? null,
      sampleSize: input.sampleSize ?? null,
      source: input.source,
      status: input.status,
      calibratedAt: Date.now(),
    });

    const key = cacheKey(input.symbol, input.tf, "_", input.side);
    thresholdCache.delete(key);
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[threshold-save] failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

/** Weight + threshold history (admin view 용). */
export async function getWeightsHistory(input: WeightFetchInput, limit = 20) {
  try {
    const db = await getDb();
    if (!db) return [];
    return await db
      .select()
      .from(calibratedWeightsHistory)
      .where(
        and(
          eq(calibratedWeightsHistory.symbol, input.symbol),
          eq(calibratedWeightsHistory.tf, input.tf),
          eq(calibratedWeightsHistory.path, input.path),
          eq(calibratedWeightsHistory.side, input.side),
        ),
      )
      .orderBy(desc(calibratedWeightsHistory.replacedAt))
      .limit(limit);
  } catch (err) {
    console.warn(`[weight-history] failed: ${(err as Error).message}`);
    return [];
  }
}

/** Test helper — clear in-memory caches. */
export function clearWeightCaches(): void {
  weightCache.clear();
  thresholdCache.clear();
}
