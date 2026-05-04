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
} from "./db";
import { fetchMultiplePrices } from "./bybit";

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
        const positionList = await getUserPositions(ctx.user.id, input?.status);

        if (!input?.status || input.status === "open") {
          const openPositions = positionList.filter((p) => p.status === "open");
          if (openPositions.length > 0) {
            const symbols = Array.from(new Set(openPositions.map((p) => p.symbol)));
            const prices = await fetchMultiplePrices(symbols);

            for (const pos of openPositions) {
              const currentPrice = prices.get(pos.symbol);
              if (currentPrice) {
                const pnlPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * pos.leverage;
                const pnlAmount = (currentPrice - pos.entryPrice) * pos.quantity * pos.leverage;
                pos.currentPrice = currentPrice;
                pos.pnlPercent = pnlPercent;
                pos.pnlAmount = pnlAmount;
                updatePosition(pos.id, { currentPrice, pnlPercent, pnlAmount }).catch(() => {});
              }
            }
          }
        }

        return positionList;
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
});

export type AppRouter = typeof appRouter;
