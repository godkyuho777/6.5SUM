/**
 * Trend Analysis orchestrator (v2.0 명세서 §4 + §7 + §8).
 *
 * 4 TF 동시 분석 → per-TF deep trend (4-tier confirmation) →
 * Wave Alignment (5-state) → BBDX multiplier.
 *
 * 캐시: in-memory 5-min TTL per (symbol, tfs). scanner hot path 가
 * 매번 호출해도 외부 API 폭주 안 하도록.
 *
 * 외부 호출 (fetchKlines) 실패는 graceful — SIDEWAYS fallback 으로 떨어져
 * 전체 result 가 깨지지 않음 (헌장 규칙: modifier 단독 실패가 BBDX 깨면 X).
 */

import type { Candle } from "@shared/types";
import { fetchKlines } from "../bybit";
import {
  analyzeTimeframeTrendDeep,
  type DeepTimeframeTrend,
} from "./multi-tf";
import {
  classifyWaveAlignment,
  waveAlignmentToMultiplier,
  type WaveAlignment,
} from "./wave-alignment";

export interface TrendAnalysisResult {
  symbol: string;
  /** Per-TF deep analysis. Key = tf string. */
  perTf: Record<string, DeepTimeframeTrend>;
  alignment: WaveAlignment;
  /** Multiplier for BBDX final_confidence chain (헌장 규칙 3). */
  waveMult: number;
  /** Aggregate confidence — average of perTf confidenceScore (0~100). */
  overallConfidence: number;
  computedAt: number;
}

const CACHE = new Map<string, { data: TrendAnalysisResult; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const KLINES_LIMIT = 200;

/** Map TF string → fetchKlines 가 받는 표준 TimeframeValue. */
function normalizeTf(tf: string): string {
  const map: Record<string, string> = {
    "1H": "1h", "4H": "4h", "6H": "6h", "1D": "1d", "1W": "1w",
    "15m": "1h", // 15m 은 Bybit V5 Spot 에서 60min 으로 fallback (단순화).
                  //  v6.5 추가 후 별도 매핑 가능.
  };
  return map[tf] ?? tf;
}

/** SIDEWAYS fallback DeepTimeframeTrend — fetch 실패 시 사용. */
function sidewaysFallback(tf: string): DeepTimeframeTrend {
  return {
    tf,
    side: "SIDEWAYS",
    confirmations: {
      trendline: false,
      emaArray: "MIXED",
      adxStrength: "WEAK",
      hhHlStructure: "MIXED",
      volumeConfirm: "FLAT",
    },
    confidenceScore: 0,
    emas: { ema9: 0, ema21: 0, ema50: 0 },
    adx: 0,
    diPlus: 0,
    diMinus: 0,
  };
}

/**
 * 단일 심볼의 멀티-TF Trend 분석. 5-min 캐시.
 *
 * @param symbol 예: "BTCUSDT"
 * @param tfs 분석할 TF 목록 (default 4개). "15m" 은 Bybit Spot 호환을 위해
 *   현재 1h 로 fallback (v6.5 후 perp 도입 시 정규 매핑 추가).
 */
export async function analyzeTrend(
  symbol: string,
  tfs: string[] = ["15m", "1h", "4h", "1d"]
): Promise<TrendAnalysisResult> {
  const sym = symbol.toUpperCase();
  const cacheKey = `${sym}:${tfs.join(",")}`;
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const perTfResults = await Promise.all(
    tfs.map(async (tf): Promise<readonly [string, DeepTimeframeTrend]> => {
      try {
        const normTf = normalizeTf(tf) as any;
        const candles: Candle[] = await fetchKlines(sym, normTf, KLINES_LIMIT);
        if (!candles || candles.length === 0) {
          return [tf, sidewaysFallback(tf)] as const;
        }
        return [tf, analyzeTimeframeTrendDeep(candles, tf)] as const;
      } catch {
        // graceful — fetchKlines 실패 시 SIDEWAYS fallback.
        return [tf, sidewaysFallback(tf)] as const;
      }
    })
  );

  const perTf: Record<string, DeepTimeframeTrend> = Object.fromEntries(perTfResults);

  // classifyWaveAlignment 는 TimeframeTrend[] 형태를 받음 → adapt.
  const legacyTrends = perTfResults.map(([tf, deep]) => ({
    tf,
    direction: deep.side,
    adx: deep.adx,
    plusDi: deep.diPlus,
    minusDi: deep.diMinus,
    emaAlignment:
      deep.confirmations.emaArray === "BULLISH_ALIGNED" ||
      deep.confirmations.emaArray === "GOLDEN"
        ? ("bullish" as const)
        : deep.confirmations.emaArray === "BEARISH_ALIGNED" ||
          deep.confirmations.emaArray === "DEATH"
        ? ("bearish" as const)
        : ("mixed" as const),
  }));

  const alignmentResult = classifyWaveAlignment(legacyTrends);
  const waveMult = waveAlignmentToMultiplier(alignmentResult.alignment);

  const sumConfidence = perTfResults.reduce(
    (sum, [, d]) => sum + d.confidenceScore,
    0
  );
  const overallConfidence =
    perTfResults.length > 0
      ? Math.round(sumConfidence / perTfResults.length)
      : 0;

  const result: TrendAnalysisResult = {
    symbol: sym,
    perTf,
    alignment: alignmentResult.alignment,
    waveMult,
    overallConfidence,
    computedAt: Date.now(),
  };

  CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** 테스트 / 디버깅용 — 캐시 비우기. */
export function clearTrendAnalysisCache(): void {
  CACHE.clear();
}
