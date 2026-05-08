import { TOP_COINS } from "@shared/types";
import type {
  CoinScanResult,
  TechnicalIndicators,
  Candle,
  TimeframeValue,
  PatternConfluenceSummary,
  PatternContextDetail,
} from "@shared/types";
import { fetchKlines, fetchAll24hTickers } from "./bybit";
import {
  calculateAllIndicators,
  calculateBollingerBandsSeries,
  calculateRSISeries,
  calculateADXSeries,
  calculateSignalStrengthV2,
  decideEntry,
  decideExit,
  decideVwapSignal,
  detectAllCandlePatterns,
  detectBBStructure,
  detectPullback,
  emaPosition,
  isFallingKnife,
  isInFibZone,
  pressureLabel,
  reversalProbability,
  volumeConfirmationFromRatio,
  volumeRatio,
  vwapPosition,
  vwapToMultiplier,
} from "./indicators";
import { aggregatePatternScore } from "./patterns/aggregator";

/**
 * 거래량 baseline — 최근 50 캔들의 단순 평균.
 * aggregator 의 거래량 multiplier 계산용. 0 이면 multiplier=1 처리.
 */
function computeVolumeBaseline(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  const tail = candles.slice(-50);
  const sum = tail.reduce((acc, c) => acc + c.volume, 0);
  return sum / tail.length;
}

/**
 * Aggregator 결과 → CoinScanResult 의 PatternConfluenceSummary.
 * 헌장 규칙 3 준수 — BBDX multiplier 로만 사용, 단독 시그널 X.
 */
function buildPatternConfluence(
  candlePatterns: ReturnType<typeof detectAllCandlePatterns>,
  candles: Candle[],
  interval: TimeframeValue,
): PatternConfluenceSummary {
  const baselineVolume = computeVolumeBaseline(candles);
  const bull = aggregatePatternScore(
    candlePatterns,
    candles,
    baselineVolume,
    interval,
    "bullish",
  );
  const bear = aggregatePatternScore(
    candlePatterns,
    candles,
    baselineVolume,
    interval,
    "bearish",
  );
  const toContext = (
    p: typeof bull.primary,
  ): PatternContextDetail | null =>
    p == null
      ? null
      : {
          base: p.contextual.base,
          volumeMultiplier: p.contextual.volume.multiplier,
          volumeLabel: p.contextual.volume.label,
          volumeRatio: p.contextual.volume.ratio,
          trendMultiplier: p.contextual.trend.multiplier,
          trendLabel: p.contextual.trend.label,
          trendCumulativeReturn: p.contextual.trend.cumulativeReturn,
          ageDiscount: p.contextual.ageDiscount,
          contextualStrength: p.contextual.strength,
        };
  return {
    bullishScore: bull.score,
    bearishScore: bear.score,
    bullishCount: bull.count,
    bearishCount: bear.count,
    bullishBonus: bull.bonus,
    bearishBonus: bear.bonus,
    bullishPrimaryName: bull.primary?.name ?? null,
    bearishPrimaryName: bear.primary?.name ?? null,
    bullishContext: toContext(bull.primary),
    bearishContext: toContext(bear.primary),
    tf: interval,
  };
}

/** 캐시 구조 */
interface CacheEntry {
  data: CoinScanResult;
  timestamp: number;
}

interface KlinesCacheEntry {
  candles: Candle[];
  indicators: TechnicalIndicators;
  timestamp: number;
}

// 인메모리 캐시 - 키에 interval 포함
const scanCache = new Map<string, CacheEntry>();
const klinesCache = new Map<string, KlinesCacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10분

// 티커 캐시 (전체 심볼 가격 - 1분 TTL)
let tickerCache: { data: Map<string, { price: number; change24h: number; volume24h: number }>; timestamp: number } | null = null;
const TICKER_CACHE_TTL = 60 * 1000; // 1분

// 스캔 진행 상태 추적
interface ScanProgress {
  total: number;
  completed: number;
  isRunning: boolean;
  interval: TimeframeValue;
}

const scanProgressMap = new Map<TimeframeValue, ScanProgress>();

function cacheKey(symbol: string, interval: TimeframeValue): string {
  return `${symbol}:${interval}`;
}

/**
 * 캐시된 티커 데이터 가져오기 (1분 캐시)
 */
async function getCachedTickers() {
  if (tickerCache && Date.now() - tickerCache.timestamp < TICKER_CACHE_TTL) {
    return tickerCache.data;
  }
  const tickers = await fetchAll24hTickers();
  tickerCache = { data: tickers, timestamp: Date.now() };
  return tickers;
}

/**
 * 단일 코인 스캔 (ticker 데이터를 외부에서 주입 가능)
 */
export async function scanCoin(
  symbol: string,
  interval: TimeframeValue = "4h",
  tickerData?: { price: number; change24h: number; volume24h: number }
): Promise<CoinScanResult | null> {
  const key = cacheKey(symbol, interval);
  const cached = scanCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (tickerData) {
      // Refresh price-derived fields without recomputing patterns / strength.
      cached.data.price = tickerData.price;
      cached.data.change24h = tickerData.change24h;
      cached.data.volume24h = tickerData.volume24h;
      cached.data.isStopLossHit =
        tickerData.price <= cached.data.stopLossPrice;
      // VWAP/EMA positions are price-relative — recompute cheaply.
      cached.data.vwapPosition = vwapPosition(tickerData.price, cached.data.vwap);
      cached.data.emaPosition = emaPosition(tickerData.price, cached.data.ema9);
    }
    return cached.data;
  }

  try {
    const candles = await fetchKlines(symbol, interval, 100);
    if (!candles.length) return null;

    const indicators = calculateAllIndicators(candles);
    const price = tickerData?.price ?? candles[candles.length - 1].close;
    const change24h = tickerData?.change24h ?? 0;
    const volume24h = tickerData?.volume24h ?? 0;

    // 피보나치 및 빗각 시그널 추가 판단
    let fibSignal: CoinScanResult["fibSignal"];
    if (indicators.fibLevels) {
      for (const f of indicators.fibLevels) {
        if (f.isGoldenZone && isInFibZone(price, f.price)) {
          fibSignal = { level: f.level, price: f.price, type: f.level >= 0.5 ? "buy" : "sell" };
          break;
        }
      }
    }

    // BBDX-PATTERN v6.1 ──
    const closes = candles.map((c) => c.close);
    const bbSeries = calculateBollingerBandsSeries(closes);
    const candlePatterns = detectAllCandlePatterns(candles);
    const bbStructure = detectBBStructure(candles, bbSeries);
    const ratio = volumeRatio(candles);
    const volConfirmation = volumeConfirmationFromRatio(ratio);
    const reversalProb = reversalProbability(indicators.adx);
    const pressure = pressureLabel(indicators.plusDi, indicators.minusDi);
    const pressureStrong =
      Math.abs(indicators.plusDi - indicators.minusDi) > 5;
    const fallingKnife = isFallingKnife(
      indicators.plusDi,
      indicators.minusDi,
      indicators.adx
    );
    const entryDecision = fallingKnife
      ? null
      : decideEntry(candles, indicators, candlePatterns, bbStructure, ratio);
    const bearishPatterns = candlePatterns.filter(
      (p) => p.bias === "bearish"
    );
    const exitDecision = decideExit(price, indicators, bearishPatterns);
    const stopLossPrice = indicators.bbLower * 0.97;
    const isStopLossHit = price <= stopLossPrice;

    // Audit-권고 적용 패턴 합산 (multi-pattern + 거래량 + 추세 + TF 차등).
    const patternConfluence = buildPatternConfluence(
      candlePatterns,
      candles,
      interval,
    );

    // VWAP Strategy ──
    const vwap = indicators.vwap ?? 0;
    const ema9 = indicators.ema9 ?? 0;
    const vwapPos = vwapPosition(price, vwap);
    const emaPos = emaPosition(price, ema9);
    const pullbackDetected = detectPullback(candles, vwap, ema9);
    const vwapSignal = decideVwapSignal(price, vwap, ema9, pullbackDetected, ratio);

    // 헌장 규칙 3 — VwapSignal 을 BBDX EntryDecision 의 multiplier 로 통합.
    // entryDecision 이 null 이면 multiplier 도 의미 없음 → skip.
    if (entryDecision) {
      entryDecision.vwapMult = vwapToMultiplier(vwapSignal);
    }

    const result: CoinScanResult = {
      symbol,
      price,
      change24h,
      volume24h,
      indicators,
      // Legacy boolean fields — derived from the rich decisions for backward
      // compatibility with the current frontend.
      isEntrySignal: entryDecision != null || !!fibSignal,
      isExitSignal: exitDecision != null,
      signalStrength: calculateSignalStrengthV2(price, indicators, volConfirmation),
      fibSignal,
      // BBDX-PATTERN v6.1 fields
      pressure,
      pressureStrong,
      reversalProb,
      volumeRatio: ratio,
      volumeConfirmation: volConfirmation,
      candlePatterns,
      patternConfluence,
      bbStructure,
      entryDecision,
      exitDecision,
      stopLossPrice,
      isStopLossHit,
      isFallingKnife: fallingKnife,
      // VWAP Strategy fields
      vwap,
      ema9,
      vwapPosition: vwapPos,
      emaPosition: emaPos,
      pullbackDetected,
      vwapSignal,
    };

    scanCache.set(key, { data: result, timestamp: Date.now() });
    klinesCache.set(key, { candles, indicators, timestamp: Date.now() });

    return result;
  } catch (error: any) {
    console.error(`[Scanner] Failed to scan ${symbol}:`, error.message);
    return null;
  }
}

/**
 * 페이지 단위 코인 스캔 (10개씩)
 * - 먼저 전체 티커를 한번에 가져옴 (1 API call, 캐시됨)
 * - 요청된 페이지의 10개 코인만 klines 호출
 * - 캐시된 코인은 스킵하여 빠르게 반환
 */
export async function scanCoinsPage(
  page: number = 1,
  pageSize: number = 10,
  interval: TimeframeValue = "4h",
  symbols: string[] = TOP_COINS
): Promise<{ coins: CoinScanResult[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const total = symbols.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIdx = (page - 1) * pageSize;
  const pageSymbols = symbols.slice(startIdx, startIdx + pageSize);

  if (pageSymbols.length === 0) {
    return { coins: [], total, page, pageSize, totalPages };
  }

  // Step 1: 전체 티커 가져오기 (캐시됨, 1분 TTL)
  const tickers = await getCachedTickers();

  // Step 2: 이 페이지의 코인들만 klines 가져오기 (병렬)
  const results = await Promise.allSettled(
    pageSymbols.map((symbol) => {
      const ticker = tickers.get(symbol);
      return scanCoin(symbol, interval, ticker || undefined);
    })
  );

  const coins: CoinScanResult[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      coins.push(result.value);
    } else {
      // 실패한 코인은 티커 데이터라도 표시 (지표 없음)
      const symbol = pageSymbols[i];
      const ticker = tickers.get(symbol);
      if (ticker) {
        coins.push({
          symbol,
          price: ticker.price,
          change24h: ticker.change24h,
          volume24h: ticker.volume24h,
          indicators: { rsi: 0, bbUpper: 0, bbMiddle: 0, bbLower: 0, adx: 0, plusDi: 0, minusDi: 0 },
          isEntrySignal: false,
          isExitSignal: false,
          signalStrength: 0,
          // BBDX-PATTERN v6.1 — empty defaults so the response shape stays
          // consistent for the frontend even when klines fetch fails.
          pressure: "NEUTRAL",
          pressureStrong: false,
          reversalProb: 0,
          volumeRatio: 1,
          volumeConfirmation: 0,
          candlePatterns: [],
          patternConfluence: null,
          bbStructure: null,
          entryDecision: null,
          exitDecision: null,
          stopLossPrice: 0,
          isStopLossHit: false,
          isFallingKnife: false,
          // VWAP Strategy — empty defaults
          vwap: 0,
          ema9: 0,
          vwapPosition: "AT",
          emaPosition: "AT",
          pullbackDetected: false,
          vwapSignal: null,
        });
      }
    }
  }

  return { coins, total, page, pageSize, totalPages };
}

/**
 * 전체 코인 스캔 (백그라운드 워밍업용)
 */
export async function scanAllCoins(
  symbols: string[] = TOP_COINS,
  interval: TimeframeValue = "4h"
): Promise<CoinScanResult[]> {
  const progress = scanProgressMap.get(interval);
  if (progress?.isRunning) {
    // 이미 진행 중이면 캐시된 결과 반환
    const cached: CoinScanResult[] = [];
    for (const symbol of symbols) {
      const key = cacheKey(symbol, interval);
      const c = scanCache.get(key);
      if (c) cached.push(c.data);
    }
    return cached;
  }

  const scanProgress: ScanProgress = {
    total: symbols.length,
    completed: 0,
    isRunning: true,
    interval,
  };
  scanProgressMap.set(interval, scanProgress);

  const allResults: CoinScanResult[] = [];

  try {
    const tickers = await getCachedTickers();
    console.log(`[Scanner] Got ${tickers.size} tickers, scanning ${symbols.length} coins on ${interval}...`);

    // 10개씩 배치 처리
    const batchSize = 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((symbol) => {
          const ticker = tickers.get(symbol);
          return scanCoin(symbol, interval, ticker || undefined);
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value) {
          allResults.push(result.value);
        }
        scanProgress.completed++;
      }

      // 배치 간 딜레이
      if (i + batchSize < symbols.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    console.log(`[Scanner] Full scan complete: ${allResults.length}/${symbols.length} coins on ${interval}`);
  } catch (error: any) {
    console.error(`[Scanner] Scan failed:`, error.message);
  } finally {
    scanProgress.isRunning = false;
  }

  return allResults;
}

/**
 * 스캔 진행 상태 조회
 */
export function getScanProgress(interval: TimeframeValue = "4h"): {
  total: number;
  completed: number;
  isRunning: boolean;
} {
  const progress = scanProgressMap.get(interval);
  if (!progress) {
    return { total: TOP_COINS.length, completed: 0, isRunning: false };
  }
  return {
    total: progress.total,
    completed: progress.completed,
    isRunning: progress.isRunning,
  };
}

/**
 * 시그널이 있는 코인만 필터링
 */
export async function scanForSignals(
  symbols: string[] = TOP_COINS,
  interval: TimeframeValue = "4h"
): Promise<CoinScanResult[]> {
  const allResults = await scanAllCoins(symbols, interval);
  return allResults
    .filter((r) => r.isEntrySignal)
    .sort((a, b) => b.signalStrength - a.signalStrength);
}

/**
 * 개별 코인의 캔들 + 지표 데이터 조회 (차트용)
 */
export async function getCoinDetail(
  symbol: string,
  interval: TimeframeValue = "4h",
  limit = 100
) {
  const key = cacheKey(symbol, interval);
  const cached = klinesCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const closes = cached.candles.map((c) => c.close);
    const rsiSeries = calculateRSISeries(closes);
    const adxSeries = calculateADXSeries(cached.candles);
    return { candles: cached.candles, indicators: cached.indicators, rsiSeries, adxSeries };
  }

  const candles = await fetchKlines(symbol, interval, limit);
  if (!candles.length) return null;

  const indicators = calculateAllIndicators(candles);
  klinesCache.set(key, { candles, indicators, timestamp: Date.now() });

  const closes = candles.map((c) => c.close);
  const rsiSeries = calculateRSISeries(closes);
  const adxSeries = calculateADXSeries(candles);

  return { candles, indicators, rsiSeries, adxSeries };
}

/**
 * 캐시 초기화
 */
export function clearCache() {
  scanCache.clear();
  klinesCache.clear();
  scanProgressMap.clear();
  tickerCache = null;
}

/**
 * 서버 시작 시 백그라운드 워밍업
 * 첫 페이지(10개) 데이터를 미리 로드하여 즉시 응답 가능하게 함
 */
export function startBackgroundWarmup() {
  console.log("[Scanner] Starting background warmup...");
  // 첫 페이지 10개만 빠르게 로드
  scanCoinsPage(1, 10, "4h").then((result) => {
    console.log(`[Scanner] Quick warmup complete: ${result.coins.length} coins loaded`);
    // 나머지는 천천히 백그라운드에서
    scanAllCoins(TOP_COINS, "4h").then((results) => {
      console.log(`[Scanner] Full background warmup complete: ${results.length} coins`);
    }).catch(() => {});
  }).catch((err) => {
    console.error("[Scanner] Background warmup failed:", err.message);
  });
}
