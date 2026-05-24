/**
 * Lite mode tRPC sub-router (2026-05-24).
 *
 * 기존 src/routers.ts (2225 lines) 의 lite: router({...}) 블록을 별도 파일로
 * 추출. 기존 동작 100% 보존 — appRouter 에서는 `lite: liteRouter` 로 import.
 *
 * 헌장: lite translator 는 BBDX 시그널의 *번역* 만 — 새 시그널 산출 X.
 *   (Pro 와 Lite 는 같은 applyOnchainToEntry → translator 체인 공유)
 */

import { z } from "zod";
import { TOP_COINS } from "@shared/types";
import type { TimeframeValue } from "@shared/types";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { scanForSignals, getCoinDetail } from "../scanner";
import { getUserPositions } from "../db";
import { fetchMultiplePrices } from "../bybit";
import { fetchOnchainScore } from "../onchain/score-fetch";
import { applyOnchainToEntry } from "../onchain/bbdx-integration";
import {
  deriveRecommendation,
  deriveRiskLevel,
  deriveMarketMood,
  recommendationLabel,
  riskLabel,
  moodLabel,
  buildReasons,
  translateByKind,
} from "./translator";
import type {
  LiteCoinCard,
  LitePositionCard,
  LiteDashboard,
  TranslateKind,
} from "./types";

// 본 라우터 전용 interval enum — routers.ts 의 intervalSchema 와 동일.
// 후속 작업으로 _core/schemas.ts 추출 가능 (현재는 lite-local 로 유지).
const intervalSchema = z
  .enum(["1h", "4h", "6h", "1d", "1w", "1M"])
  .default("4h");

export const liteRouter = router({
  /**
   * Lite 대시보드: top buy / top sell + 시장 분위기.
   * scanForSignals → entryDecision/exitDecision 가진 코인만 골라
   * deriveRecommendation 으로 라벨 변환.
   */
  dashboard: publicProcedure
    .input(z.object({ interval: intervalSchema.optional() }).optional())
    .query(async ({ input }): Promise<LiteDashboard> => {
      const interval = (input?.interval ?? "4h") as TimeframeValue;
      // BBDX 시그널이 발생한 코인만 (raw scan)
      const coins = await scanForSignals(TOP_COINS, interval);

      // BTC 기준 시장 regime 도 함께 (시장 분위기용)
      const btcOnchain = await fetchOnchainScore("BTCUSDT").catch(() => null);

      // 각 코인의 onchain multiplier 적용 → recommendation 도출
      // (성능: 7-modifier × N 코인 → 무거우면 캐시 권장. 우선 직렬 호출)
      const cards: LiteCoinCard[] = [];
      for (const coin of coins) {
        if (!coin.entryDecision && !coin.exitDecision) continue;
        let onchain = btcOnchain;
        if (coin.symbol !== "BTCUSDT") {
          onchain = await fetchOnchainScore(coin.symbol).catch(() => btcOnchain);
        }
        if (!onchain) continue;

        const adjusted = coin.entryDecision
          ? applyOnchainToEntry(
              { strength: coin.signalStrength, path: coin.entryDecision.path },
              onchain
            )
          : null;
        const recommendation = deriveRecommendation(
          adjusted,
          coin.entryDecision,
          coin.exitDecision
        );
        const recLabel = recommendationLabel(recommendation);
        const risk = deriveRiskLevel(
          adjusted?.finalStrength ?? coin.signalStrength,
          onchain.regime,
          coin.isFallingKnife
        );
        const reasons = buildReasons(
          recommendation,
          adjusted,
          coin.entryDecision,
          coin.exitDecision,
          onchain
        );

        cards.push({
          symbol: coin.symbol,
          base: coin.symbol.replace(/USDT$/, ""),
          price: coin.price,
          change24h: coin.change24h,
          recommendation,
          recommendationLabel: recLabel.label,
          recommendationTone: recLabel.tone,
          riskLevel: risk,
          riskLabel: riskLabel(risk).label,
          reasons,
          strength: adjusted?.finalStrength ?? coin.signalStrength,
        });
      }

      const buyKinds = new Set(["STRONG_BUY", "BUY", "WATCH"]);
      const sellKinds = new Set(["STRONG_SELL", "SELL"]);
      const buys = cards
        .filter((c) => buyKinds.has(c.recommendation))
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5);
      const sells = cards
        .filter((c) => sellKinds.has(c.recommendation))
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5);

      const avgStrength =
        buys.length > 0
          ? buys.reduce((s, c) => s + c.strength, 0) / buys.length
          : 0;
      const mood = btcOnchain
        ? deriveMarketMood(avgStrength, btcOnchain.regime)
        : "neutral";
      const moodMeta = moodLabel(mood);

      return {
        topBuy: buys,
        topSell: sells,
        marketMood: mood,
        marketMoodLabel: moodMeta.label,
        marketMoodOneLiner: moodMeta.oneLiner,
        computedAt: new Date().toISOString(),
      };
    }),

  /** 단일 코인의 Lite 추천 카드 + 메타 (Pro chip 매핑용). */
  coin: publicProcedure
    .input(
      z.object({
        symbol: z.string(),
        interval: intervalSchema.optional(),
      })
    )
    .query(async ({ input }) => {
      const symbol = input.symbol.toUpperCase();
      const interval = (input.interval ?? "4h") as TimeframeValue;
      const detail = await getCoinDetail(symbol, interval, 100);
      const onchain = await fetchOnchainScore(symbol).catch(() => null);

      if (!detail) {
        return null;
      }

      // detail 은 candles + indicators 를 가지지만 BBDX 결과는 scan 에서만 옴.
      // 단일 코인 호출이라 빠르게 즉석에서 다시 한 번 시그널 평가.
      const scanned = (await scanForSignals([symbol], interval))[0] ?? null;

      const adjusted =
        scanned?.entryDecision && onchain
          ? applyOnchainToEntry(
              { strength: scanned.signalStrength, path: scanned.entryDecision.path },
              onchain
            )
          : null;
      const recommendation = deriveRecommendation(
        adjusted,
        scanned?.entryDecision ?? null,
        scanned?.exitDecision ?? null
      );
      const recLabel = recommendationLabel(recommendation);
      const risk = deriveRiskLevel(
        adjusted?.finalStrength ?? scanned?.signalStrength ?? 0,
        onchain?.regime ?? "neutral",
        scanned?.isFallingKnife ?? false
      );
      const reasons = buildReasons(
        recommendation,
        adjusted,
        scanned?.entryDecision ?? null,
        scanned?.exitDecision ?? null,
        onchain
      );

      const lastCandle = detail.candles[detail.candles.length - 1];
      return {
        symbol,
        base: symbol.replace(/USDT$/, ""),
        price: lastCandle?.close ?? 0,
        change24h: scanned?.change24h ?? 0,
        volume24h: scanned?.volume24h ?? 0,
        recommendation,
        recommendationLabel: recLabel,
        riskLevel: risk,
        riskLabel: riskLabel(risk),
        reasons,
        // 차트용 단순 캔들 (고가/저가/종가만)
        chartCandles: detail.candles.slice(-60).map((c) => ({
          time: c.openTime,
          close: c.close,
          high: c.high,
          low: c.low,
          volume: c.volume,
        })),
        bb: detail.indicators
          ? {
              upper: detail.indicators.bbUpper,
              middle: detail.indicators.bbMiddle,
              lower: detail.indicators.bbLower,
            }
          : null,
        meta: {
          finalStrength: adjusted?.finalStrength ?? scanned?.signalStrength ?? 0,
          multiplier: adjusted?.multiplier ?? 1,
          blocked: adjusted?.blocked ?? false,
          regime: onchain?.regime ?? "neutral",
          fallingKnife: scanned?.isFallingKnife ?? false,
        },
        computedAt: new Date().toISOString(),
      };
    }),

  /** 사용자 포지션 요약 (Lite Portfolio). 인증 필요. */
  portfolio: protectedProcedure.query(async ({ ctx }) => {
    const positions = await getUserPositions(ctx.user.id, "open");
    if (positions.length === 0) {
      return {
        totalEquity: 0,
        pnl24h: 0,
        pnl7d: 0,
        positions: [] as LitePositionCard[],
        pendingAlerts: 0,
        computedAt: new Date().toISOString(),
      };
    }

    // 최신 가격으로 PnL 갱신
    const symbols = Array.from(new Set(positions.map((p) => p.symbol)));
    const prices = await fetchMultiplePrices(symbols);

    const cards: LitePositionCard[] = positions.map((pos) => {
      const currentPrice = prices.get(pos.symbol) ?? null;
      const pnlPercent =
        currentPrice != null
          ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * pos.leverage
          : null;
      const pnlAmount =
        currentPrice != null
          ? (currentPrice - pos.entryPrice) * pos.quantity * pos.leverage
          : null;

      // 추천 액션 — PnL 기반 단순 룰
      let suggestedAction = "계속 보유";
      let suggestedActionTone: "good" | "caution" | "bad" | "neutral" | "muted" =
        "neutral";
      if (pnlPercent != null) {
        if (pnlPercent <= -5) {
          suggestedAction = "손절 고려";
          suggestedActionTone = "bad";
        } else if (pnlPercent >= 8) {
          suggestedAction = "익절 고려";
          suggestedActionTone = "good";
        } else if (pnlPercent >= 3) {
          suggestedAction = "관찰";
          suggestedActionTone = "caution";
        }
      }

      return {
        positionId: pos.id,
        symbol: pos.symbol,
        base: pos.symbol.replace(/USDT$/, ""),
        entryPrice: pos.entryPrice,
        currentPrice,
        pnlPercent,
        pnlAmount,
        suggestedAction,
        suggestedActionTone,
      };
    });

    const totalPnl = cards.reduce((s, c) => s + (c.pnlAmount ?? 0), 0);
    const totalEntry = positions.reduce(
      (s, p) => s + p.entryPrice * p.quantity * p.leverage,
      0
    );

    return {
      totalEquity: totalEntry + totalPnl,
      pnl24h: totalPnl, // TODO: 실제 24h pnl 은 historical price 필요 — v1 stub
      pnl7d: totalPnl, // TODO: 동일
      positions: cards,
      pendingAlerts: 0, // TODO: alert 시스템 통합
      computedAt: new Date().toISOString(),
    };
  }),

  /** 학습 카드용 — 단일 raw 값을 자연어 라벨로 변환. */
  translate: publicProcedure
    .input(
      z.object({
        kind: z.enum([
          "strength",
          "path",
          "regime",
          "phase",
          "adx",
          "rsi",
          "bb_position",
        ]),
        value: z.union([z.number(), z.string()]),
      })
    )
    .query(({ input }) => {
      const result = translateByKind(input.kind as TranslateKind, input.value);
      return {
        kind: input.kind,
        inputValue: input.value,
        result,
      };
    }),

  /**
   * Lite 단일 코인 카드 (Coin Detail Workstation 용 별칭).
   *
   * 기존 lite.coin 과 거의 동일하지만 입력 TF 가 대문자 ("1H","4H",...) 로
   * 들어와도 받도록 설계 + LiteCoinCard shape 으로 정규화 응답.
   * BBDX 시그널 산출은 scanForSignals 가 담당하고, 본 procedure 는 라벨 번역만.
   */
  translateCoin: publicProcedure
    .input(
      z.object({
        symbol: z.string(),
        tf: z.enum(["1H", "4H", "1D", "1W", "1h", "4h", "1d", "1w"]).default("4H"),
      })
    )
    .query(async ({ input }): Promise<LiteCoinCard | null> => {
      const symbol = input.symbol.toUpperCase();
      // 대문자 TF 를 시스템 표준 (소문자) 으로 정규화.
      const tfMap: Record<string, TimeframeValue> = {
        "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w",
        "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w",
      };
      const interval = tfMap[input.tf];

      // 1. BBDX 시그널 산출 (scanForSignals 단일 호출).
      const scanned = (await scanForSignals([symbol], interval))[0] ?? null;
      if (!scanned) return null;

      // 2. 온체인 점수 (실패해도 graceful fallback).
      const onchain = await fetchOnchainScore(symbol).catch(() => null);

      // 3. BBDX path 결과 + 온체인 multiplier 적용.
      const adjusted =
        scanned.entryDecision && onchain
          ? applyOnchainToEntry(
              { strength: scanned.signalStrength, path: scanned.entryDecision.path },
              onchain
            )
          : null;

      // 4. 라벨 번역 (deriveRecommendation / deriveRiskLevel / buildReasons).
      const recommendation = deriveRecommendation(
        adjusted,
        scanned.entryDecision ?? null,
        scanned.exitDecision ?? null
      );
      const recLabel = recommendationLabel(recommendation);
      const risk = deriveRiskLevel(
        adjusted?.finalStrength ?? scanned.signalStrength,
        onchain?.regime ?? "neutral",
        scanned.isFallingKnife ?? false
      );
      const reasons = buildReasons(
        recommendation,
        adjusted,
        scanned.entryDecision ?? null,
        scanned.exitDecision ?? null,
        onchain
      );

      const card: LiteCoinCard = {
        symbol,
        base: symbol.replace(/USDT$/, ""),
        price: scanned.price,
        change24h: scanned.change24h,
        recommendation,
        recommendationLabel: recLabel.label,
        recommendationTone: recLabel.tone,
        riskLevel: risk,
        riskLabel: riskLabel(risk).label,
        reasons,
        strength: adjusted?.finalStrength ?? scanned.signalStrength,
      };
      return card;
    }),
});
