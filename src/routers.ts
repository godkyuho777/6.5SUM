import { z } from "zod";
import { TOP_COINS } from "@shared/types";
import type { TimeframeValue } from "@shared/types";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { scanCoinsPage, scanForSignals, getCoinDetail, getScanProgress } from "./scanner";
import {
  createSignal,
  getActiveSignals,
  getSignalHistory,
  updateSignalStatus,
  createPosition,
  getUserPositions,
  updatePosition,
  closePosition,
  getUserAlertSettings,
  upsertAlertSetting,
  deleteAlertSetting,
  getBacktestRuns,
  getBacktestRunDetail,
  getBacktestRunTrades,
  listCoinEvents,
  addCoinEvent,
} from "./db";
import { getCoinMeta } from "./coin-meta";
import { computeRollingWinRate } from "./winrate-rolling";
import { fetchMultiplePrices } from "./bybit";
import { runBacktest } from "./backtest/runner";
import { computeOnchainScore } from "./onchain/score";
import { applyOnchainToEntry, applyOnchainToExit } from "./onchain/bbdx-integration";
import {
  deriveRecommendation,
  deriveRiskLevel,
  deriveMarketMood,
  recommendationLabel,
  riskLabel,
  moodLabel,
  buildReasons,
  translateByKind,
} from "./lite/translator";
import type {
  LiteCoinCard,
  LitePositionCard,
  LiteDashboard,
  TranslateKind,
} from "./lite/types";

const intervalSchema = z.enum(["1h", "4h", "6h", "1d", "1w", "1M"]).default("4h");

export const appRouter = router({
  system: systemRouter,

  // ─── Coins ─────────────────────────────────────────────
  coins: router({
    list: publicProcedure.query(() => {
      return TOP_COINS.map((symbol) => ({
        symbol,
        name: symbol.replace("USDT", ""),
      }));
    }),
  }),

  // ─── Signals ───────────────────────────────────────────
  signals: router({
    /** 페이지 단위 코인 스캔 - 10개씩 빠르게 반환 */
    scan: publicProcedure
      .input(
        z
          .object({
            page: z.number().min(1).default(1),
            pageSize: z.number().min(1).max(50).default(10),
            interval: intervalSchema.optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 10;
        const interval = (input?.interval ?? "4h") as TimeframeValue;
        return scanCoinsPage(page, pageSize, interval);
      }),

    /** 스캔 진행 상태 */
    progress: publicProcedure
      .input(
        z.object({ interval: intervalSchema.optional() }).optional()
      )
      .query(({ input }) => {
        const interval = (input?.interval ?? "4h") as TimeframeValue;
        return getScanProgress(interval);
      }),

    /** 시그널 조건 충족 코인만 */
    activeSignals: publicProcedure
      .input(
        z.object({ interval: intervalSchema.optional() }).optional()
      )
      .query(async ({ input }) => {
        const interval = (input?.interval ?? "4h") as TimeframeValue;
        return scanForSignals(TOP_COINS, interval);
      }),

    /** 개별 코인 상세 (차트 데이터 포함) */
    detail: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          interval: intervalSchema.optional(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        const interval = (input.interval ?? "4h") as TimeframeValue;
        const detail = await getCoinDetail(input.symbol, interval, input.limit ?? 100);
        return detail;
      }),

    history: publicProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return getSignalHistory(input?.limit ?? 50);
      }),

    save: protectedProcedure
      .input(
        z.object({
          symbol: z.string(),
          entryPrice: z.number(),
          targetPrice: z.number().optional(),
          rsiValue: z.number(),
          bbLower: z.number(),
          bbMiddle: z.number(),
          bbUpper: z.number(),
          adxValue: z.number(),
          plusDi: z.number(),
          minusDi: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const id = await createSignal({
          ...input,
          targetPrice: input.targetPrice ?? null,
          currentPrice: input.entryPrice,
          status: "active",
        });
        return { id };
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["active", "target_hit", "expired", "closed"]),
          exitReason: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await updateSignalStatus(input.id, input.status, {
          exitReason: input.exitReason,
          ...(input.status === "target_hit" ? { targetHitAt: new Date() } : {}),
          ...(input.status === "closed" ? { closedAt: new Date() } : {}),
        });
        return { success: true };
      }),
  }),

  // ─── Positions ─────────────────────────────────────────
  positions: router({
    list: protectedProcedure
      .input(z.object({ status: z.enum(["open", "closed", "liquidated"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        return getUserPositions(ctx.user.id, input?.status);
      }),

    refreshPrices: protectedProcedure
      .input(z.object({ symbols: z.array(z.string()) }))
      .query(async ({ ctx, input }) => {
        if (input.symbols.length === 0) return [];
        const symbols = Array.from(new Set(input.symbols));
        const [prices, openPositions] = await Promise.all([
          fetchMultiplePrices(symbols),
          getUserPositions(ctx.user.id, "open"),
        ]);

        const updates: Array<{
          symbol: string;
          currentPrice: number;
          pnlPercent: number;
          pnlAmount: number;
        }> = [];

        await Promise.all(
          openPositions.map(async (pos) => {
            const currentPrice = prices.get(pos.symbol);
            if (currentPrice == null) return;
            const pnlPercent =
              ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * pos.leverage;
            const pnlAmount =
              (currentPrice - pos.entryPrice) * pos.quantity * pos.leverage;
            await updatePosition(pos.id, { currentPrice, pnlPercent, pnlAmount });
            updates.push({ symbol: pos.symbol, currentPrice, pnlPercent, pnlAmount });
          })
        );

        return updates;
      }),

    create: protectedProcedure
      .input(
        z.object({
          symbol: z.string(),
          entryPrice: z.number(),
          targetPrice: z.number().optional(),
          quantity: z.number(),
          leverage: z.number().default(1),
          signalId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await createPosition({
          userId: ctx.user.id,
          ...input,
          targetPrice: input.targetPrice ?? null,
          signalId: input.signalId ?? null,
          currentPrice: input.entryPrice,
          pnlPercent: 0,
          pnlAmount: 0,
          status: "open",
        });
        return { id };
      }),

    close: protectedProcedure
      .input(z.object({ id: z.number(), closePrice: z.number() }))
      .mutation(async ({ input }) => {
        await closePosition(input.id, input.closePrice);
        return { success: true };
      }),
  }),

  // ─── Alert Settings ────────────────────────────────────
  alerts: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getUserAlertSettings(ctx.user.id);
    }),

    upsert: protectedProcedure
      .input(
        z.object({
          id: z.number().optional(),
          symbol: z.string().optional(),
          rsiLow: z.number().optional(),
          rsiHigh: z.number().optional(),
          adxThreshold: z.number().optional(),
          targetRsi: z.number().optional(),
          targetAdx: z.number().optional(),
          targetPlusDi: z.number().optional(),
          useBbLower: z.boolean().optional(),
          useBbMiddleTarget: z.boolean().optional(),
          enabled: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await upsertAlertSetting({
          ...input,
          id: input.id ?? undefined,
          userId: ctx.user.id,
          symbol: input.symbol ?? null,
        });
        return { id };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteAlertSetting(input.id);
        return { success: true };
      }),
  }),

  // ─── AI Insights ───────────────────────────────────────
  ai: router({
    analyze: publicProcedure
      .input(
        z.object({
          messages: z.array(
            z.object({
              role: z.enum(["system", "user", "assistant"]),
              content: z.string(),
            })
          ),
          context: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const systemMessage = {
          role: "system" as const,
          content: `You are an expert cryptocurrency trading analyst specializing in technical analysis.
You analyze market conditions using RSI, Bollinger Bands, and ADX indicators on multiple timeframes (1H, 4H, 8H, 1D, 1W, 1M).
Your role is to provide actionable trading insights, explain signal conditions, and help users understand market dynamics.
Always be specific with numbers and provide clear reasoning.
Respond in Korean when the user writes in Korean.
${input.context ? `\nCurrent market context:\n${input.context}` : ""}`,
        };

        const messages = [systemMessage, ...input.messages];
        const result = await invokeLLM({ messages });
        const content = result.choices[0]?.message?.content;
        return { response: typeof content === "string" ? content : JSON.stringify(content) };
      }),

    signalInsight: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          price: z.number(),
          rsi: z.number(),
          bbLower: z.number(),
          bbMiddle: z.number(),
          bbUpper: z.number(),
          adx: z.number(),
          plusDi: z.number(),
          minusDi: z.number(),
          interval: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const tf = input.interval ?? "4h";
        const prompt = `다음 코인의 기술적 분석 인사이트를 제공해주세요:

심볼: ${input.symbol}
타임프레임: ${tf}
현재가: $${input.price}
RSI(14): ${input.rsi.toFixed(2)}
볼린저밴드: 상단 $${input.bbUpper.toFixed(2)} / 기준선 $${input.bbMiddle.toFixed(2)} / 하단 $${input.bbLower.toFixed(2)}
ADX(14): ${input.adx.toFixed(2)}
+DI: ${input.plusDi.toFixed(2)} / -DI: ${input.minusDi.toFixed(2)}

${tf} 기준으로 매수 진입 조건(RSI 30~35, BB 하단선, ADX 30 이하)과 목표가 조건(BB 기준선, RSI 70+, ADX 30+, +DI 30+)을 기반으로 분석해주세요.
현재 시장 상황, 진입 적절성, 리스크 요인, 예상 시나리오를 간결하게 설명해주세요.`;

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are an expert cryptocurrency technical analyst. Provide concise, actionable insights in Korean.",
            },
            { role: "user", content: prompt },
          ],
        });

        const content = result.choices[0]?.message?.content;
        return { insight: typeof content === "string" ? content : JSON.stringify(content) };
      }),
  }),

  // ─── Backtest ──────────────────────────────────────────
  backtest: router({
    /**
     * 과거 백테스트 실행 목록 조회
     * 최신 20개 반환 (saveToDb=true 로 실행된 것만)
     */
    list: publicProcedure.query(async () => {
      return await getBacktestRuns(20);
    }),

    /**
     * 특정 run의 집계 통계 + 설정 조회
     */
    detail: publicProcedure
      .input(z.object({ runId: z.number() }))
      .query(async ({ input }) => {
        return await getBacktestRunDetail(input.runId);
      }),

    /**
     * 특정 run의 개별 트레이드 목록 (최대 500건)
     */
    trades: publicProcedure
      .input(
        z.object({
          runId: z.number(),
          symbol: z.string().optional(),
          win: z.boolean().optional(),
          limit: z.number().min(1).max(500).default(200),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ input }) => {
        return await getBacktestRunTrades(input);
      }),

    /**
     * 백테스트 즉시 실행 (서버에서 동기 실행, 응답 최대 5분)
     * 결과는 saveToDb=true 일 때 DB에 저장됨
     *
     * 주의: 심볼 수 × 기간이 길면 타임아웃 가능.
     *       긴 백테스트는 CLI(pnpm backtest) 사용 권장.
     */
    run: publicProcedure
      .input(
        z.object({
          symbols: z.array(z.string()).min(1).max(20).default(TOP_COINS.slice(0, 5)),
          tf: z.enum(["1h", "4h", "6h", "1d", "1w", "1M"]).default("4h"),
          startDate: z.string(), // ISO date string e.g. "2024-01-01"
          endDate: z.string(),
          outcomeWindowCandles: z.number().min(5).max(200).optional(),
          cooldownCandles: z.number().min(1).max(50).default(5),
          saveToDb: z.boolean().default(true),
          runName: z.string().max(100).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const defaultWindow: Record<string, number> = {
          "1h": 168, "4h": 42, "6h": 28, "1d": 14, "1w": 4, "1M": 2,
        };

        const result = await runBacktest({
          symbols: input.symbols,
          tf: input.tf as TimeframeValue,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          outcomeWindowCandles: input.outcomeWindowCandles ?? defaultWindow[input.tf] ?? 42,
          cooldownCandles: input.cooldownCandles,
          saveToDb: input.saveToDb,
          runName: input.runName,
        });

        return {
          runId: result.runId,
          overall: result.overall,
          bySymbol: result.bySymbol,
          config: {
            symbols: result.config.symbols,
            tf: result.config.tf,
            startDate: result.config.startDate.toISOString(),
            endDate: result.config.endDate.toISOString(),
            outcomeWindowCandles: result.config.outcomeWindowCandles,
          },
          runAt: result.runAt,
          durationMs: result.durationMs,
          trades: result.trades.slice(0, 200),
        };
      }),
  }),

  // ─── Onchain (Tradelab 7번 차원) ─────────────────────────
  // 7개 modifier 합산 → -1.0 ~ +1.0 정규화 → 5단계 regime 분류.
  // 각 modifier 는 BBDX 시그널의 가중치(multiplier)로만 작동, 단독 시그널 X.
  onchain: router({
    /** 단일 심볼의 7-modifier 점수 + regime + breakdown */
    score: publicProcedure
      .input(z.object({ symbol: z.string().default("BTCUSDT") }))
      .query(async ({ input }) => {
        const symbol = input.symbol.toUpperCase();
        return computeOnchainScore(symbol);
      }),

    /** BBDX 진입 시그널에 온체인 multiplier 적용 결과 */
    applyToEntry: publicProcedure
      .input(z.object({
        symbol: z.string().default("BTCUSDT"),
        baseStrength: z.number().min(0).max(100),
        path: z.string().nullable().optional(),
      }))
      .query(async ({ input }) => {
        const symbol = input.symbol.toUpperCase();
        const onchain = await computeOnchainScore(symbol);
        const adjusted = applyOnchainToEntry(
          { strength: input.baseStrength, path: input.path ?? null },
          onchain
        );
        return { onchain, adjusted };
      }),

    /** EXIT reversal_score 에 regime 보정 적용 결과 */
    applyToExit: publicProcedure
      .input(z.object({
        symbol: z.string().default("BTCUSDT"),
        baseReversalScore: z.number(),
      }))
      .query(async ({ input }) => {
        const symbol = input.symbol.toUpperCase();
        const onchain = await computeOnchainScore(symbol);
        const exitAdj = applyOnchainToExit(input.baseReversalScore, onchain);
        return { onchain, exit: exitAdj };
      }),
  }),

  // ─── Lite Mode (일반인 친화) ─────────────────────────────
  // 헌장 규칙 3 준수: 모든 procedure 는 BBDX 시그널 결과를 *번역*만 한다.
  // 새 시그널 산출 X. raw 지표는 응답에 포함하지 않고 자연어 라벨만 노출.
  lite: router({
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
        const btcOnchain = await computeOnchainScore("BTCUSDT").catch(() => null);

        // 각 코인의 onchain multiplier 적용 → recommendation 도출
        // (성능: 7-modifier × N 코인 → 무거우면 캐시 권장. 우선 직렬 호출)
        const cards: LiteCoinCard[] = [];
        for (const coin of coins) {
          if (!coin.entryDecision && !coin.exitDecision) continue;
          let onchain = btcOnchain;
          if (coin.symbol !== "BTCUSDT") {
            onchain = await computeOnchainScore(coin.symbol).catch(() => btcOnchain);
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
        const onchain = await computeOnchainScore(symbol).catch(() => null);

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
        const onchain = await computeOnchainScore(symbol).catch(() => null);

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
  }),

  // ─── Coin Detail Workstation ─────────────────────────────
  // C4 — CoinDetail 워크스테이션의 백엔드 라우트 묶음.
  // 모두 append-only 추가, 기존 라우트 영향 X.

  /** 단일 코인의 시총·거래량·도미넌스·SSR 등 메타. CoinGecko Free 기반. */
  coin: router({
    meta: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        return getCoinMeta(input.symbol);
      }),
  }),

  /** 캘린더 / 매크로 + 코인별 이벤트. */
  events: router({
    list: publicProcedure
      .input(
        z.object({
          symbol: z.string().optional(),
          days: z.number().min(1).max(365).default(30),
        })
      )
      .query(async ({ input }) => {
        const events = await listCoinEvents({
          symbol: input.symbol ? input.symbol.toUpperCase() : undefined,
          days: input.days,
          includeGlobal: true,
        });
        return {
          events,
          count: events.length,
          horizonDays: input.days,
          computedAt: new Date().toISOString(),
        };
      }),

    /**
     * 새 이벤트 추가. 인증 필요 (createBy 는 ctx.user.id 강제 주입).
     * symbol === "GLOBAL" 은 매크로 / 시장 전체 이벤트.
     */
    add: protectedProcedure
      .input(
        z.object({
          symbol: z.string(),
          eventType: z.enum([
            "macro",
            "unlock",
            "fork",
            "halving",
            "listing",
            "custom",
          ]),
          title: z.string().min(1).max(200),
          description: z.string().max(2000).optional(),
          scheduledAt: z.string(), // ISO timestamp
          source: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scheduledAt = new Date(input.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) {
          throw new Error("scheduledAt must be a valid ISO timestamp");
        }
        const id = await addCoinEvent({
          symbol: input.symbol.toUpperCase(),
          eventType: input.eventType,
          title: input.title,
          description: input.description ?? null,
          scheduledAt,
          source: input.source ?? null,
          createdBy: ctx.user.id,
        });
        return {
          id,
          symbol: input.symbol.toUpperCase(),
          eventType: input.eventType,
          title: input.title,
          description: input.description ?? null,
          scheduledAt: scheduledAt.toISOString(),
          source: input.source ?? null,
        };
      }),
  }),

  /** 백테스트 기반 rolling 승률 + Wilson 95% CI. */
  winRate: router({
    rolling: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.enum(["1H", "4H", "1D", "1W", "1h", "4h", "1d", "1w"]).default("4H"),
          windows: z
            .array(z.number().min(1).max(3650))
            .min(1)
            .max(10)
            .default([30, 90, 365]),
        })
      )
      .query(async ({ input }) => {
        const tfMap: Record<string, TimeframeValue> = {
          "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w",
          "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w",
        };
        const tf = tfMap[input.tf];
        return computeRollingWinRate({
          symbol: input.symbol.toUpperCase(),
          tf,
          windows: input.windows,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
