import { z } from "zod";
import { TOP_COINS } from "@shared/types";
import type { TimeframeValue } from "@shared/types";
import {
  listModifiers,
  getModifier,
  type TrackerLayer,
} from "./shared/tracker-taxonomy";
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
import { getCoinInfo } from "./coin-info";
import { computeRollingWinRate } from "./winrate-rolling";
import { fetchMultiplePrices, fetchKlines } from "./bybit";
import { runBacktest } from "./backtest/runner";
import { listStrategies } from "./backtest/strategies";
import {
  evaluateEmaAdxSignal,
  scanEmaAdxSignals,
  META as EMA_ADX_META,
  ENTRY_THRESHOLD as EMA_ADX_THRESHOLD,
  CONFIDENCE_WEIGHTS as EMA_ADX_WEIGHTS,
} from "./trackers/ema-adx-trend";
import { runSingleIndicatorBacktest } from "./backtest/engines/single-indicator";
import {
  runMultiStrategyBacktest,
  validateAgainstCharter,
} from "./backtest/engines/multi-strategy";
import { buildMacroLayer } from "./macro/layer-builder";
import { fetchFred } from "./macro/sources/fred";
import { fetchOnchainScore } from "./onchain/score-fetch";
import { applyOnchainToEntry, applyOnchainToExit } from "./onchain/bbdx-integration";
import {
  getOnchainProviderStatus,
  summarizeProviderStatus,
} from "./onchain/provider-status";
import { computeWaveTrackerData } from "./sentiment";
import { analyzeTrend } from "./trend/analyze";
import { getVwapDetail } from "./vwap-detail";
import {
  computeMarketBreadth,
  detectMacdDivergence,
  computeFundingExtreme,
  detectOrderBlock,
  combineAdditionalModifiers,
} from "./modifiers";
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

// ── v6.6 Calibration & BBDX evaluator (feature-flagged, v6.5 모듈 보존)
import {
  autoCorrectThreshold,
  autoCorrectWeights,
  getThresholdForSignal,
  getWeightsForSignal,
  getWeightsHistory,
} from "./strategies/weight-calibration";
import { evaluatePositionSignalsV66 } from "./strategies/bbdx-v66";
import { FEATURE_FLAGS } from "./config/feature-flags";
import { calculateAllIndicators } from "./indicators";

// ── JEON_IN_GU Signal Tracker (Phase 1.2 stub — Phase 1.3+ D-002 대기)
import { JEON_IN_GU_CONFIG, isJeonInGuEnabled } from "./jeon-in-gu/constants";
import { computeJeonInGuModifier } from "./jeon-in-gu/modifier";

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
     * 사용 가능한 백테스트 전략 목록
     * (BBDX, Fibonacci, VWAP, Trend Analysis)
     * 프론트엔드 dropdown 채우는 용도.
     */
    listStrategies: publicProcedure.query(() => {
      return listStrategies();
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
          strategy: z
            .enum([
              "bbdx",
              "bbdx-short",
              "bbdx-combined",
              "fibonacci",
              "vwap",
              "trend",
              "trend-follow",
            ])
            .default("bbdx"),
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
          runName: input.runName ?? `${input.strategy}_${input.tf}_${input.symbols.length}coins`,
          strategy: input.strategy,
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
          // bbdx-combined 전용 (2026-05-15): LONG / SHORT 분리 메트릭. 다른
          // strategy 에서는 undefined → 프론트가 optional chaining 으로 무시.
          metricsBySide: result.metricsBySide,
        };
      }),

    // ─── Phase A-2 (2026-05-11): 3-Layer Composite Backtest ─────────
    /**
     * Layer indicator + operator 카탈로그 — frontend builder dropdown 채우기.
     * GET 한 번이면 충분 (정적 메타).
     */
    compositeCatalog: publicProcedure.query(async () => {
      const { INDICATOR_CATALOG, OPERATOR_CATALOG, DEFAULT_COMPOSITE_CONFIG } =
        await import("./backtest/composite");
      return {
        indicators: INDICATOR_CATALOG,
        operators: OPERATOR_CATALOG,
        defaultConfig: DEFAULT_COMPOSITE_CONFIG,
      };
    }),

    /**
     * 3-Layer composite 백테스트 실행.
     *
     * 사용자 요구 #2: Signal + Macro + Wave 지표 조합으로 진입 게이트
     * 만들고 백테스트. 결과는 기존 single-strategy 결과와 *분리* 표시.
     */
    runComposite: publicProcedure
      .input(
        z.object({
          symbols: z
            .array(z.string())
            .min(1)
            .max(20)
            .default(TOP_COINS.slice(0, 5)),
          tf: z.enum(["1h", "4h", "6h", "1d", "1w", "1M"]).default("4h"),
          startDate: z.string(),
          endDate: z.string(),
          outcomeWindowCandles: z.number().min(5).max(200).optional(),
          cooldownCandles: z.number().min(1).max(50).default(5),
          /**
           * Composite config — 3 layer 의 condition 배열 + 결합 모드 +
           * R:R 설정. JSON-serializable (zod 가 검증).
           */
          config: z.any(),
          macroSnapshot: z.any().optional(),
          waveSnapshot: z.any().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { runCompositeBacktest } = await import(
          "./backtest/composite"
        );
        const defaultWindow: Record<string, number> = {
          "1h": 168,
          "4h": 42,
          "6h": 28,
          "1d": 14,
          "1w": 4,
          "1M": 2,
        };
        const result = await runCompositeBacktest({
          symbols: input.symbols,
          tf: input.tf as TimeframeValue,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          outcomeWindowCandles:
            input.outcomeWindowCandles ?? defaultWindow[input.tf] ?? 42,
          cooldownCandles: input.cooldownCandles,
          config: input.config,
          macroSnapshot: input.macroSnapshot,
          waveSnapshot: input.waveSnapshot,
        });
        return {
          overall: result.overall,
          bySymbol: result.bySymbol,
          layerStats: result.layerStats,
          runAt: result.runAt,
          durationMs: result.durationMs,
          trades: result.trades.slice(0, 200),
        };
      }),
  }),

  // ─── Investment Simulator (모의투자) — 2026-05-15 ────────────
  // 가상 자금 $200,000 USD 로 모의 거래. 실제 자본 영향 X.
  // 2026-05-15 (revision): 로그인 X — 닉네임 + 클라이언트 생성 UUID 기반.
  //   모든 procedure 는 publicProcedure 로 변환. simUserId 를 input 으로 받음.
  //   simUserId 는 frontend 의 localStorage 에 저장된 crypto.randomUUID().
  simulator: router({
    /** 현재 계정 잔액 + equity (mark-to-market). */
    account: publicProcedure
      .input(z.object({ simUserId: z.string().uuid() }))
      .query(async ({ input }) => {
        const { getOrCreateAccount, listOpenPositions } = await import(
          "./simulator/db"
        );
        const account = await getOrCreateAccount(input.simUserId);
        if (!account) {
          return {
            available: false,
            cash: 200000,
            realizedPnl: 0,
            totalCommission: 0,
            totalFunding: 0,
            liquidationCount: 0,
            openPositions: 0,
            unrealizedPnl: 0,
            equity: 200000,
          };
        }
        const positions = await listOpenPositions(input.simUserId);
        let unrealizedPnl = 0;
        for (const p of positions) {
          if (p.currentPrice == null) continue;
          const dir = p.side === "long" ? 1 : -1;
          unrealizedPnl += dir * (p.currentPrice - p.entryPrice) * p.quantity * p.leverage;
        }
        const equity = account.cash + unrealizedPnl;
        return {
          available: true,
          cash: account.cash,
          realizedPnl: account.realizedPnl,
          totalCommission: account.totalCommission,
          totalFunding: account.totalFunding,
          liquidationCount: account.liquidationCount,
          openPositions: positions.length,
          unrealizedPnl,
          equity,
        };
      }),

    /** 보유 포지션 목록 (open) */
    positions: publicProcedure
      .input(
        z.object({
          simUserId: z.string().uuid(),
          includeClosed: z.boolean().default(false),
          limit: z.number().min(1).max(200).default(50),
        }),
      )
      .query(async ({ input }) => {
        const { listOpenPositions, listAllPositions } = await import(
          "./simulator/db"
        );
        if (input.includeClosed) {
          return listAllPositions(input.simUserId, input.limit);
        }
        return listOpenPositions(input.simUserId);
      }),

    /** 거래 내역 (audit trail) */
    transactions: publicProcedure
      .input(
        z.object({
          simUserId: z.string().uuid(),
          limit: z.number().min(1).max(200).default(50),
        }),
      )
      .query(async ({ input }) => {
        const { listTransactions } = await import("./simulator/db");
        return listTransactions(input.simUserId, input.limit);
      }),

    /** 현재 시장 가격 + funding rate quote (포지션 진입 전 조회) */
    quote: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        const symbol = input.symbol.toUpperCase();
        try {
          const prices = await fetchMultiplePrices([symbol]);
          const price = prices.get(symbol) ?? 0;
          // Funding rate placeholder — Bybit perp funding fetch 별도 작업.
          // 현재는 BTC 평균 0.01% / 4h 추정값.
          const fundingRate = 0.0001;
          return {
            symbol,
            price,
            fundingRate,
            fundingHours: 4,
            commissionRate: 0.0001, // 0.01%
            available: price > 0,
          };
        } catch (err) {
          return {
            symbol,
            price: 0,
            fundingRate: 0,
            fundingHours: 4,
            commissionRate: 0.0001,
            available: false,
            error: (err as Error)?.message ?? "fetch failed",
          };
        }
      }),

    /** 포지션 진입 */
    openPosition: publicProcedure
      .input(
        z.object({
          simUserId: z.string().uuid(),
          symbol: z.string(),
          productType: z.enum(["spot", "perp"]).default("spot"),
          side: z.enum(["long", "short"]),
          leverage: z.number().min(1).max(125).default(1),
          quantity: z.number().positive(),
          /** 진입 가격 — 미지정 시 현재 시장가 fetch. */
          entryPrice: z.number().positive().optional(),
          /** 주문 유형 — limit 시 entryPrice 필수, market 시 미지정. */
          orderType: z.enum(["market", "limit"]).default("market"),
          /** Margin mode — perp 에서만 의미. spot 무시. */
          marginMode: z.enum(["cross", "isolated"]).default("cross"),
        }),
      )
      .mutation(async ({ input }) => {
        const { openPosition } = await import("./simulator/db");
        const symbol = input.symbol.toUpperCase();

        // spot 은 SHORT 불가
        if (input.productType === "spot" && input.side === "short") {
          return { error: "Spot 상품은 SHORT 불가" };
        }
        // spot 은 leverage = 1 강제
        const leverage = input.productType === "spot" ? 1 : input.leverage;

        let entryPrice = input.entryPrice;
        if (!entryPrice) {
          const prices = await fetchMultiplePrices([symbol]);
          entryPrice = prices.get(symbol) ?? 0;
        }
        if (!entryPrice || entryPrice <= 0) {
          return { error: `${symbol} 시장 가격 fetch 실패` };
        }

        return openPosition({
          userId: input.simUserId,
          symbol,
          productType: input.productType,
          side: input.side,
          leverage,
          entryPrice,
          quantity: input.quantity,
        });
      }),

    /** 포지션 청산 */
    closePosition: publicProcedure
      .input(
        z.object({
          simUserId: z.string().uuid(),
          positionId: z.number().int(),
          /** 청산 가격 — 미지정 시 현재 시장가 fetch. */
          exitPrice: z.number().positive().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { closePosition, listOpenPositions } = await import(
          "./simulator/db"
        );
        let exitPrice = input.exitPrice;
        if (!exitPrice) {
          // 포지션의 symbol 알아내서 fetch
          const positions = await listOpenPositions(input.simUserId);
          const target = positions.find((p) => p.id === input.positionId);
          if (!target) return { error: "Position not found" };
          const prices = await fetchMultiplePrices([target.symbol]);
          exitPrice = prices.get(target.symbol) ?? 0;
        }
        if (!exitPrice || exitPrice <= 0) {
          return { error: "Exit price fetch 실패" };
        }
        return closePosition({
          userId: input.simUserId,
          positionId: input.positionId,
          exitPrice,
          reason: "manual",
        });
      }),

    /** 계정 리셋 — 모든 open 포지션 강제 close + $200k 재입금 */
    reset: publicProcedure
      .input(z.object({ simUserId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const { resetAccount } = await import("./simulator/db");
        return resetAccount(input.simUserId);
      }),

    /** Mark-to-market 갱신 — open 포지션 현재가 + unrealized P&L 동기화 */
    refresh: publicProcedure
      .input(z.object({ simUserId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const { listOpenPositions, markToMarket } = await import("./simulator/db");
        const positions = await listOpenPositions(input.simUserId);
        if (positions.length === 0) return { updated: 0 };
        const symbols = Array.from(new Set(positions.map((p) => p.symbol)));
        const prices = await fetchMultiplePrices(symbols);
        await markToMarket(input.simUserId, prices);
        return { updated: positions.length };
      }),
  }),

  // ─── Simulator Leaderboard (opt-in, 익명) — 2026-05-21 ──────────
  // 시뮬레이터 사용자가 자발적으로 ranking 에 참여 (opt-in).  로그인 없음.
  // clientToken(UUID, frontend localStorage 발급) = 단순 ownership token.
  // 자세한 보안 정책: drizzle/APPLY_0008_INSTRUCTIONS.md.
  simulatorLeaderboard: router({
    /**
     * Opt-in — 시뮬레이터 사용자가 ranking 에 참여.
     * 같은 clientToken 재호출 시 nickname 갱신 + opt-out 상태 재활성화.
     */
    optIn: publicProcedure
      .input(
        z.object({
          clientToken: z.string().uuid(),
          nickname: z.string().min(1).max(24),
        }),
      )
      .mutation(async ({ input }) => {
        const { optInLeaderboard } = await import("./simulator/leaderboard");
        try {
          return await optInLeaderboard(input);
        } catch (err) {
          return {
            ok: false as const,
            code: "INTERNAL" as const,
            message: (err as Error)?.message ?? "optIn failed",
          };
        }
      }),

    /**
     * Opt-out — clientToken ownership 확인 후 opted_out_at 설정.
     * 이후 fetch 결과에서 제외, sync 시도 시 reject.
     */
    optOut: publicProcedure
      .input(z.object({ clientToken: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const { optOutLeaderboard } = await import("./simulator/leaderboard");
        try {
          return await optOutLeaderboard(input);
        } catch (err) {
          return {
            ok: false as const,
            code: "INTERNAL" as const,
            message: (err as Error)?.message ?? "optOut failed",
          };
        }
      }),

    /**
     * Sync stats — clientToken 으로 본인 row 찾아 갱신.
     * Rate limit: 5분에 1회.
     */
    sync: publicProcedure
      .input(
        z.object({
          clientToken: z.string().uuid(),
          currentCapital: z.number(),
          totalPnl: z.number(),
          pnlPct: z.number(),
          totalTrades: z.number().int().nonnegative(),
          wins: z.number().int().nonnegative(),
          losses: z.number().int().nonnegative(),
          winRate: z.number().min(0).max(1),
          maxDrawdownPct: z.number().min(-1).max(0),
        }),
      )
      .mutation(async ({ input }) => {
        const { syncLeaderboardStats } = await import(
          "./simulator/leaderboard"
        );
        try {
          return await syncLeaderboardStats(input);
        } catch (err) {
          return {
            ok: false as const,
            code: "INTERNAL" as const,
            message: (err as Error)?.message ?? "sync failed",
          };
        }
      }),

    /**
     * Fetch — opted-out 제외, pnlPct DESC 정렬, 익명화 응답.
     * clientToken 제공 시 본인 entry 에 isYou=true, yourRank 계산.
     */
    fetch: publicProcedure
      .input(
        z.object({
          clientToken: z.string().uuid().optional(),
          period: z.enum(["all", "30d", "7d", "24h"]).default("all"),
          limit: z.number().int().min(1).max(100).default(50),
        }),
      )
      .query(async ({ input }) => {
        const { fetchLeaderboard } = await import("./simulator/leaderboard");
        try {
          return await fetchLeaderboard(input);
        } catch (err) {
          return {
            ok: false as const,
            code: "INTERNAL" as const,
            message: (err as Error)?.message ?? "fetch failed",
          };
        }
      }),
  }),

  // ─── Cycle (BTC 200d MA regime) P1-④ 2026-05-11 ─────────────
  // bull / bear / neutral 분류. strategy 별 cycle-aware activation gate.
  cycle: router({
    /** BTC 200d MA cycle regime (bull / bear / neutral) */
    btc: publicProcedure.query(async () => {
      const { detectBtcCycleRegime } = await import("./cycle/btc-regime");
      return detectBtcCycleRegime();
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
        return fetchOnchainScore(symbol);
      }),

    /**
     * 7-modifier provider 상태 (P1-#4, 2026-05-10).
     *
     * 어떤 modifier 가 real / mock / stub 인지 운영시점 가시화.
     * 사용자 / 운영자가 BBDX 점수에 실제로 영향 주는 modifier 갯수를 확인 가능.
     * 헌장 R2 (백테스트 alpha) 결과 해석 시 컨텍스트.
     */
    providerStatus: publicProcedure.query(() => {
      return {
        modifiers: getOnchainProviderStatus(),
        summary: summarizeProviderStatus(),
      };
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
        const onchain = await fetchOnchainScore(symbol);
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
        const onchain = await fetchOnchainScore(symbol);
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

    /**
     * 단일 코인의 상세 정보 (description / category / supply / ATH / links).
     * CoinGecko Free 기반 + 23-coin 한국어 큐레이션. CoinDetail 페이지의
     * "코인 정보" 탭에서 사용. 1h in-memory 캐시.
     *
     * 헌장: modifier-only (정보 표시만, 단독 시그널 발행 X).
     */
    info: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        return getCoinInfo(input.symbol);
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

  // ─── Wave Tracker — Sentiment & Matrix (v4.1) ────────────
  // Fear&Greed + CoinGecko Global + Bybit OI/Funding + Bybit L/S 4-신호 종합.
  // 명세서 WAVE_SENTIMENT_MATRIX.md §3~§6. 4개 외부 API 모두 무료, 키 불필요.
  wave: router({
    /** Composite Sentiment + Wave Matrix 한 번에 받기 (가장 자주 쓰는 엔드포인트). */
    combined: publicProcedure
      .input(z.object({ symbol: z.string().default("BTCUSDT") }).optional())
      .query(async ({ input }) => {
        const symbol = (input?.symbol ?? "BTCUSDT").toUpperCase();
        return computeWaveTrackerData(symbol);
      }),

    /** Composite Sentiment 만 (Fear&Greed gauge / 시장 단계 / 분석 근거). */
    sentiment: publicProcedure
      .input(z.object({ symbol: z.string().default("BTCUSDT") }).optional())
      .query(async ({ input }) => {
        const symbol = (input?.symbol ?? "BTCUSDT").toUpperCase();
        const result = await computeWaveTrackerData(symbol);
        return result.sentiment;
      }),

    /** 4-신호 Wave Matrix 만 (OI 복합 해석 + 종합 편향 + 신뢰도). */
    matrix: publicProcedure
      .input(z.object({ symbol: z.string().default("BTCUSDT") }).optional())
      .query(async ({ input }) => {
        const symbol = (input?.symbol ?? "BTCUSDT").toUpperCase();
        const result = await computeWaveTrackerData(symbol);
        return result.matrix;
      }),
  }),

  // ─── VWAP Detail (v6.5) ─────────────────────────────────
  // 신규 VWAP 모듈 (Volume Profile, std-dev bands, Pullback v2, multi-TF,
  // 5-component signal) 의 결과를 한 라우트에서 일괄 반환.
  // 헌장 규칙 3 준수: vwapMult 만 BBDX 보조 multiplier 로 사용 (단독 시그널 X).
  vwap: router({
    detail: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.enum(["1h", "4h", "1d"]).default("4h"),
        })
      )
      .query(async ({ input }) => {
        try {
          return await getVwapDetail(input.symbol, input.tf);
        } catch (e: any) {
          // graceful failure: return minimal stub.
          // Modifier 계열 호출 체인을 깨지 않기 위해 throw 금지.
          return {
            symbol: input.symbol.toUpperCase(),
            tf: input.tf,
            candles: [],
            vwap: 0,
            ema9: 0,
            bands: {
              vwap: 0,
              sigma: 0,
              upper1: 0,
              upper2: 0,
              upper3: 0,
              lower1: 0,
              lower2: 0,
              lower3: 0,
            },
            volumeProfile: {
              bins: [],
              poc: 0,
              hvnList: [],
              lvnList: [],
              valueArea: { low: 0, high: 0, pct: 0 },
              totalVolume: 0,
            },
            pullbackV2: {
              detected: false,
              touchCandleIdx: null,
              bounceConfirmed: false,
              proximityRatio: 1,
              touchedLine: null,
            },
            signal: null,
            signalV2: null,
            vwapMult: 1.0,
            multiTfAlignment: {
              tfs: ["1h", "4h", "1d"] as ("1h" | "4h" | "1d")[],
              alignmentLevel: "neutral" as const,
              perTf: {},
              multiplier: 1.0,
            },
            computedAt: Date.now(),
            error: String(e?.message ?? e),
          };
        }
      }),
  }),

  // ─── Trend Analysis (TREND_ANALYSIS_ENGINE.md v2.0) ────────────────────
  // 멀티-TF 추세 정합 분석 → Wave Alignment multiplier (0.30~1.30).
  // 헌장 규칙 3 준수: BBDX final_confidence 곱셈 체인의 modifier 로만 사용.
  // graceful — fetchKlines 실패 시 SIDEWAYS fallback, throw X.
  trend: router({
    /**
     * 단일 심볼의 멀티-TF Trend 분석. 5-min 캐시 자동 적용.
     * default tfs: ["1h", "4h", "1d"] (15m 은 Bybit Spot 호환 위해 1h fallback).
     */
    analyze: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tfs: z
            .array(z.enum(["15m", "1h", "4h", "1d", "1w"]))
            .default(["1h", "4h", "1d"]),
        })
      )
      .query(async ({ input }) => {
        try {
          return await analyzeTrend(input.symbol, input.tfs);
        } catch (e: any) {
          // 헌장 규칙: 외부 modifier 실패가 라우터 체인을 깨뜨리면 안 됨.
          return {
            symbol: input.symbol.toUpperCase(),
            perTf: {},
            alignment: "mixed" as const,
            waveMult: 1.0,
            overallConfidence: 0,
            computedAt: Date.now(),
            error: String(e?.message ?? e),
          };
        }
      }),
  }),

  // ─── EMA + ADX 정배열 추세 (Signal Scanner standalone, 2026-05-11) ────
  // 사용자 요청: Wave Tracker 의 Trend Analysis 와 구분되는 별도 standalone
  // Signal Scanner 전략. 5 보조지표 (EMA9/21/50, ADX, ±DI, SMA50, HH/HL) 합성.
  // LONG/SHORT 양방향. BBDX/Fibonacci/VWAP 와 같은 primary signal layer.
  emaAdxTrend: router({
    /** 트래커 메타 (이름/설명/임계/가중치). 프론트엔드 Criteria 탭 용. */
    meta: publicProcedure.query(() => ({
      ...EMA_ADX_META,
      threshold: EMA_ADX_THRESHOLD,
      weights: EMA_ADX_WEIGHTS,
    })),

    /** 단일 심볼 시그널 평가. */
    evaluate: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: intervalSchema.optional(),
        }),
      )
      .query(async ({ input }) => {
        const tf = (input.tf ?? "4h") as TimeframeValue;
        try {
          return await evaluateEmaAdxSignal(input.symbol.toUpperCase(), tf);
        } catch (e: any) {
          return {
            symbol: input.symbol.toUpperCase(),
            tf,
            side: "NEUTRAL" as const,
            triggered: false,
            finalConfidence: 0,
            threshold: EMA_ADX_THRESHOLD,
            breakdown: { emaStack: 0, adx: 0, diDiff: 0, smaSlope: 0, structure: 0 },
            reasons: [String(e?.message ?? e)],
            prices: {
              price: 0, ema9: 0, ema21: 0, ema50: 0, sma50: 0,
              adx: 0, plusDi: 0, minusDi: 0,
              target1: 0, target2: 0, stopLoss: 0,
              target1Pct: 0, target2Pct: 0, stopPct: 0,
            },
            computedAt: Date.now(),
            error: String(e?.message ?? e),
          };
        }
      }),

    /** TOP 코인 스캔 — 시그널 트래커 페이지 리스트 표시 용. */
    scan: publicProcedure
      .input(
        z
          .object({
            tf: intervalSchema.optional(),
            symbols: z.array(z.string()).max(30).optional(),
          })
          .optional(),
      )
      .query(async ({ input }) => {
        const tf = (input?.tf ?? "4h") as TimeframeValue;
        const symbols = input?.symbols ?? TOP_COINS.slice(0, 10);
        const results = await scanEmaAdxSignals(symbols, tf);
        return {
          tf,
          results,
          computedAt: Date.now(),
        };
      }),
  }),

  // ─── Additional Strategies modifiers (03_ADDITIONAL_STRATEGIES.md) ─────
  // 6개 추가 modifier — BBDX 코어의 multiplier 보강 (헌장 규칙 3, modifier-only).
  // 각 modifier 는 외부 호출 실패 시 multiplier=1.0 graceful neutral 반환 (throw X).
  modifiers: router({
    /** Market Breadth (6차원: macro/sentiment) — 96 코인 일괄 RSI 분포 */
    marketBreadth: publicProcedure
      .input(
        z.object({
          symbols: z.array(z.string()).optional(),
          tf: z.enum(["1h", "4h", "1d"]).default("4h"),
        })
      )
      .query(async ({ input }) => {
        // 미지정 시 TOP_COINS 의 상위 30개 (성능 — 96 전체는 너무 무거움)
        const universe =
          input.symbols && input.symbols.length > 0
            ? input.symbols
            : TOP_COINS.slice(0, 30);
        return computeMarketBreadth(universe, input.tf);
      }),

    /** MACD Divergence (1차원: momentum, RSI 와 다른 각도) */
    macdDivergence: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.enum(["1h", "4h", "1d"]).default("4h"),
          lookback: z.number().min(20).max(200).default(50),
        })
      )
      .query(async ({ input }) => {
        const symbol = input.symbol.toUpperCase();
        try {
          const candles = await fetchKlines(symbol, input.tf, 200);
          return detectMacdDivergence(candles, input.lookback);
        } catch (err: any) {
          return detectMacdDivergence([]);
        }
      }),

    /** Funding Extreme (6차원: macro/perp positioning) */
    fundingExtreme: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        return computeFundingExtreme(input.symbol.toUpperCase());
      }),

    /** Order Block (5차원: structure, 베타) */
    orderBlock: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.enum(["1h", "4h", "1d"]).default("4h"),
        })
      )
      .query(async ({ input }) => {
        const symbol = input.symbol.toUpperCase();
        try {
          const candles = await fetchKlines(symbol, input.tf, 100);
          return detectOrderBlock(candles);
        } catch (err: any) {
          return detectOrderBlock([]);
        }
      }),

    /**
     * 통합 — 모든 modifier 한 번에. 가장 자주 쓰는 endpoint.
     * Market Breadth 는 30개 universe 호출이라 병렬 하지만 시간이 좀 걸림 (~3s).
     */
    all: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.enum(["1h", "4h", "1d"]).default("4h"),
          /** marketBreadth 를 포함할지 (false 시 빠른 응답 — 단일 코인용) */
          includeBreadth: z.boolean().default(true),
        })
      )
      .query(async ({ input }) => {
        const symbol = input.symbol.toUpperCase();
        // 병렬 호출 — 각 modifier 가 throw 하지 않으므로 Promise.all 안전.
        const [candles, breadth, funding] = await Promise.all([
          fetchKlines(symbol, input.tf, 250).catch(() => [] as Awaited<
            ReturnType<typeof fetchKlines>
          >),
          input.includeBreadth
            ? computeMarketBreadth(TOP_COINS.slice(0, 30), input.tf).catch(
                () => null
              )
            : Promise.resolve(null),
          computeFundingExtreme(symbol).catch(() => null),
        ]);

        const macd = candles.length ? detectMacdDivergence(candles) : null;
        const orderBlock = candles.length ? detectOrderBlock(candles) : null;

        const combinedMultiplier = combineAdditionalModifiers({
          marketBreadthMult: breadth?.multiplier,
          macdDivergenceMult: macd?.multiplier,
          fundingExtremeMult: funding?.multiplier,
          orderBlockMult: orderBlock?.multiplier,
        });

        return {
          symbol,
          tf: input.tf,
          marketBreadth: breadth,
          macdDivergence: macd,
          fundingExtreme: funding,
          orderBlock,
          combinedMultiplier,
          computedAt: Date.now(),
        };
      }),
  }),

  // ─── Tracker Taxonomy (3-Layer Tracker Hub SSoT) ──────────────────────
  // 프론트엔드가 modifier 메타데이터를 하드코드하지 않도록 백엔드를 단일
  // 진실 소스로 노출. 헌장 규칙 3 (modifier-only) 는 tracker-taxonomy.ts 의
  // validateTaxonomy 가 모듈 로드 시 강제.
  taxonomy: router({
    /** 모든 modifier 메타데이터 — layer 필터 없음 */
    list: publicProcedure.query(() => {
      return listModifiers();
    }),

    /** 특정 layer 의 modifier 만 (signal | wave | macro | onchain) */
    byLayer: publicProcedure
      .input(
        z.object({
          layer: z.enum(["signal", "wave", "macro", "onchain"]),
        })
      )
      .query(({ input }) => {
        return listModifiers(input.layer as TrackerLayer);
      }),

    /** 단일 slug 로 modifier 조회 (없으면 null) */
    bySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => {
        return getModifier(input.slug);
      }),
  }),

  // ─── Dual Engine (Engine A + Engine B) ────────────────────────────────
  // DUAL_BACKTEST_ENGINE_PLAN §2/§3.
  // Engine A: 단일 지표 + 단순 entry/exit → alpha 측정.
  // Engine B: AND/OR/NOT/Weighted DSL → 헌장 매핑 자동 검증.
  // 헌장 R3 (modifier-only) 는 본 라우트가 평가 도구라 위반 X.
  dualEngine: router({
    /** Engine A — 단일 지표 백테스트 실행 */
    singleIndicator: publicProcedure
      .input(
        z.object({
          config: z.any(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await runSingleIndicatorBacktest(input.config);
        } catch (err) {
          const detail = (err as Error).message ?? "unknown";
          console.warn(`[dualEngine.singleIndicator] failed: ${detail}`);
          return {
            status: "error" as const,
            detail,
          };
        }
      }),

    /** Engine B — DSL 다중 전략 백테스트 실행 */
    multiStrategy: publicProcedure
      .input(
        z.object({
          config: z.any(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await runMultiStrategyBacktest(input.config);
        } catch (err) {
          const detail = (err as Error).message ?? "unknown";
          console.warn(`[dualEngine.multiStrategy] failed: ${detail}`);
          return {
            status: "error" as const,
            detail,
          };
        }
      }),

    /** Engine B — DSL 표현식의 헌장 매핑 검증 (백테스트 실행 전) */
    validateStrategy: publicProcedure
      .input(
        z.object({
          expression: z.any(),
        }),
      )
      .query(({ input }) => {
        return validateAgainstCharter(input.expression);
      }),
  }),

  // ─── Macro v2 (MACRO_LIQUIDITY_TRACKER_v2) ────────────────────────────
  // C1/C2/C3/C4 composite signals + freshness multiplier + ALFRED dual-mode.
  // 본 라우트는 macro 단독 시그널이 아니라 layer 메타데이터 조회용.
  macroV2: router({
    /** 현재 시점 macro snapshot (단일 layer 객체) */
    snapshot: publicProcedure.query(async () => {
      try {
        const now = Date.now();
        const start = now - 90 * 24 * 60 * 60 * 1000;
        const layers = await buildMacroLayer(start, now, "realtime");
        return layers.length > 0 ? layers[layers.length - 1] : null;
      } catch (err) {
        console.warn(
          `[macroV2.snapshot] failed: ${(err as Error).message ?? "unknown"}`,
        );
        return null;
      }
    }),

    /**
     * FRED 시계열 raw observations (chart 렌더링 용).
     * mode 는 항상 realtime — backtest 모드는 dualEngine 경로로.
     */
    history: publicProcedure
      .input(
        z.object({
          seriesId: z.string(),
          period: z.enum(["30d", "90d", "1y", "5y"]).default("90d"),
        }),
      )
      .query(async ({ input }) => {
        const periodMs: Record<typeof input.period, number> = {
          "30d": 30 * 86400_000,
          "90d": 90 * 86400_000,
          "1y": 365 * 86400_000,
          "5y": 5 * 365 * 86400_000,
        };
        const end = new Date();
        const start = new Date(Date.now() - periodMs[input.period]);
        try {
          const r = await fetchFred({
            seriesId: input.seriesId,
            mode: "realtime",
            observationStart: start.toISOString().slice(0, 10),
            observationEnd: end.toISOString().slice(0, 10),
          });
          return {
            status: r.status,
            observations: r.observations,
            detail: r.detail,
          };
        } catch (err) {
          return {
            status: "error" as const,
            observations: [],
            detail: (err as Error).message ?? "unknown",
          };
        }
      }),
  }),

  // ─── BBDX v6.6 (feature-flagged, v6.5 모듈 보존) ───────────────────
  bbdxV66: router({
    /**
     * 단일 (symbol, tf) 의 v6.6 LONG/SHORT 양방향 평가.
     * BBDX_VERSION=v6.6 일 때만 실제 평가. v6.5 일 때는 fallback note 반환.
     */
    current: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.enum(["1h", "4h", "1d"]),
          /** indicators 계산용 캔들 개수 (default 200) */
          limit: z.number().min(60).max(500).optional(),
        }),
      )
      .query(async ({ input }) => {
        if (FEATURE_FLAGS.BBDX_VERSION !== "v6.6") {
          return {
            long: null,
            short: null,
            meta: {
              version: "v6.5",
              note: "BBDX_VERSION=v6.5 — v6.6 evaluator 비활성. 환경변수 설정 시 활성화.",
              bothTriggered: false,
            },
          };
        }
        try {
          const candles = await fetchKlines(input.symbol, input.tf, input.limit ?? 200);
          if (candles.length < 60) {
            return {
              long: null,
              short: null,
              meta: {
                version: "v6.6",
                note: `캔들 부족 (${candles.length} < 60)`,
                bothTriggered: false,
              },
            };
          }
          const indicators = calculateAllIndicators(candles);
          const result = await evaluatePositionSignalsV66({
            symbol: input.symbol,
            tf: input.tf,
            candles,
            windowCandles: candles,
            indicators,
          });
          return result;
        } catch (err) {
          return {
            long: null,
            short: null,
            meta: {
              version: "v6.6",
              note: `evaluate error: ${(err as Error).message}`,
              bothTriggered: false,
            },
          };
        }
      }),

    /** 특정 (symbol, tf, path, side) 의 현재 production 가중치 */
    weightsFor: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.string(),
          path: z.enum(["NUM", "PTN", "BB"]),
          side: z.enum(["long", "short"]),
        }),
      )
      .query(async ({ input }) => {
        return await getWeightsForSignal(input);
      }),

    /** 특정 (symbol, tf, side) 의 현재 production 임계 */
    thresholdFor: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.string(),
          side: z.enum(["long", "short"]),
        }),
      )
      .query(async ({ input }) => {
        return await getThresholdForSignal(input);
      }),

    /** 현재 feature flag 상태 (UI 진단용) */
    flags: publicProcedure.query(() => {
      return {
        bbdxVersion: FEATURE_FLAGS.BBDX_VERSION,
        bbdxMarket: FEATURE_FLAGS.BBDX_MARKET,
        enableShortSignals: FEATURE_FLAGS.ENABLE_SHORT_SIGNALS,
      };
    }),
  }),

  // ─── Calibration Admin (수동 재calibration + history) ───────────────
  // TODO(admin-procedure): adminProcedure (Supabase 사용자 ID 화이트리스트) 추가
  //                       필요. 현재는 publicProcedure — production 전에 protect.
  calibrationAdmin: router({
    triggerManualWeights: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.string(),
          path: z.enum(["NUM", "PTN", "BB"]),
          side: z.enum(["long", "short"]),
        }),
      )
      .mutation(async ({ input }) => {
        // signalsFetch 미공급 → external manifest / default 만 시도.
        // 실제 자체 백테스트 적용은 cron 또는 CLI 에서 (Bybit fetch 비용 ↑).
        return await autoCorrectWeights(input);
      }),

    triggerManualThreshold: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.string(),
          side: z.enum(["long", "short"]),
        }),
      )
      .mutation(async ({ input }) => {
        return await autoCorrectThreshold(input);
      }),

    history: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          tf: z.string(),
          path: z.enum(["NUM", "PTN", "BB"]),
          side: z.enum(["long", "short"]),
          limit: z.number().min(1).max(100).optional(),
        }),
      )
      .query(async ({ input }) => {
        const rows = await getWeightsHistory(
          {
            symbol: input.symbol,
            tf: input.tf,
            path: input.path,
            side: input.side,
          },
          input.limit ?? 20,
        );
        return rows;
      }),
  }),

  // ─── JEON_IN_GU Signal Tracker (Phase 1.2 stub — D-002 대기) ──────────
  // 명세: JEON_IN_GU_SIGNAL_TRACKER.md.
  // 현재는 stub-only — 외부 의존성 (YouTube API key, Anthropic key, Telegram
  // bot, 변호사 검토) 미해결. modifier 는 항상 0 반환 (BBDX 점수 영향 X).
  // Phase 1.3 ~ 7 활성화 후 본 라우터의 실제 데이터 fetch 추가 예정.
  jeonInGu: router({
    /** 트래커 설정 + 활성 상태 + Feature Flag. UI Criteria 탭에서 표시. */
    config: publicProcedure.query(() => {
      return {
        ...JEON_IN_GU_CONFIG,
        enabled: isJeonInGuEnabled(),
        featureFlag: FEATURE_FLAGS.ENABLE_JEON_IN_GU,
      };
    }),

    /**
     * 최근 처리된 콘텐츠 목록 — Phase 1.5 cron 활성 후 DB SELECT.
     * 현재는 빈 배열 + pending 메시지.
     */
    recentContents: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
      .query(async ({ input }) => {
        if (!isJeonInGuEnabled()) {
          return {
            contents: [] as Array<unknown>,
            message:
              "JEON_IN_GU integration pending — YOUTUBE_API_KEY + JEON_IN_GU_CHANNEL_ID 미설정 (D-002)",
            limit: input.limit,
          };
        }
        // TODO(Phase 1.5): db query — jeon_in_gu_contents
        //   WHERE processed = true
        //   ORDER BY published_at DESC LIMIT input.limit
        return {
          contents: [] as Array<unknown>,
          message: "Phase 1.5 pending — cron poller + DB rows 미존재",
          limit: input.limit,
        };
      }),

    /**
     * 현재 (symbol, side) 의 contrarian modifier 값.
     * Phase 3 활성 전까지 stub modifier (0) 반환 — 헌장 R3 안전.
     */
    currentModifier: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          side: z.enum(["long", "short"]),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await computeJeonInGuModifier(
            input.symbol.toUpperCase(),
            input.side,
          );
        } catch (err) {
          // 헌장 R3 graceful: modifier 실패가 라우터 체인 깨뜨리면 안 됨.
          const detail = (err as Error).message ?? "unknown";
          console.warn(`[jeonInGu.currentModifier] failed: ${detail}`);
          return {
            modifierValue: 0,
            source: "jeon_in_gu" as const,
            decay: 0,
            contrarianDirection: "neutral" as const,
            sourceCount: 0,
            reason: `error — ${detail}`,
          };
        }
      }),

    /**
     * 가중치 ±0.50 의 calibration 변경 history.
     * Phase 5 cron 활성 후 DB SELECT.
     */
    calibrationHistory: publicProcedure.query(async () => {
      if (!isJeonInGuEnabled()) {
        return {
          history: [] as Array<unknown>,
          message:
            "JEON_IN_GU integration pending — calibration cron 미활성 (D-002)",
        };
      }
      // TODO(Phase 5): db query — jeon_in_gu_calibration_history
      //   ORDER BY calibrated_at DESC LIMIT 50
      return {
        history: [] as Array<unknown>,
        message: "Phase 5 pending — calibration cron 미구현",
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
