import type { LiteCoinCard, LitePositionCard, LiteDashboard } from "./lite/types";
export declare const appRouter: import("@trpc/server").TRPCBuiltRouter<{
    ctx: import("./_core/context").TrpcContext;
    meta: object;
    errorShape: import("@trpc/server").TRPCDefaultErrorShape;
    transformer: true;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    system: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        health: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                timestamp: number;
            };
            output: {
                ok: boolean;
            };
            meta: object;
        }>;
    }>>;
    coins: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                symbol: string;
                name: string;
            }[];
            meta: object;
        }>;
    }>>;
    signals: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** 페이지 단위 코인 스캔 - 10개씩 빠르게 반환 */
        scan: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                page?: number | undefined;
                pageSize?: number | undefined;
                interval?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
            } | undefined;
            output: {
                coins: import("@shared/types").CoinScanResult[];
                total: number;
                page: number;
                pageSize: number;
                totalPages: number;
            };
            meta: object;
        }>;
        /** 스캔 진행 상태 */
        progress: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                interval?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
            } | undefined;
            output: {
                total: number;
                completed: number;
                isRunning: boolean;
            };
            meta: object;
        }>;
        /** 시그널 조건 충족 코인만 */
        activeSignals: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                interval?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
            } | undefined;
            output: import("@shared/types").CoinScanResult[];
            meta: object;
        }>;
        /** 개별 코인 상세 (차트 데이터 포함) */
        detail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                interval?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
                limit?: number | undefined;
            };
            output: {
                candles: import("@shared/types").Candle[];
                indicators: import("@shared/types").TechnicalIndicators;
                rsiSeries: number[];
                adxSeries: {
                    adx: number;
                    plusDi: number;
                    minusDi: number;
                }[];
            } | null;
            meta: object;
        }>;
        history: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
            } | undefined;
            output: {
                id: number;
                symbol: string;
                entryPrice: number;
                currentPrice: number | null;
                targetPrice: number | null;
                rsiValue: number;
                bbLower: number;
                bbMiddle: number;
                bbUpper: number;
                adxValue: number;
                plusDi: number;
                minusDi: number;
                status: "active" | "target_hit" | "expired" | "closed";
                detectedAt: Date;
                targetHitAt: Date | null;
                closedAt: Date | null;
                exitReason: string | null;
                createdAt: Date;
            }[];
            meta: object;
        }>;
        save: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                symbol: string;
                entryPrice: number;
                rsiValue: number;
                bbLower: number;
                bbMiddle: number;
                bbUpper: number;
                adxValue: number;
                plusDi: number;
                minusDi: number;
                targetPrice?: number | undefined;
            };
            output: {
                id: number | null;
            };
            meta: object;
        }>;
        updateStatus: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: number;
                status: "active" | "target_hit" | "expired" | "closed";
                exitReason?: string | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    positions: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "closed" | "open" | "liquidated" | undefined;
            } | undefined;
            output: {
                id: number;
                userId: string;
                signalId: number | null;
                symbol: string;
                entryPrice: number;
                targetPrice: number | null;
                currentPrice: number | null;
                quantity: number;
                leverage: number;
                pnlPercent: number | null;
                pnlAmount: number | null;
                status: "closed" | "open" | "liquidated";
                openedAt: Date;
                closedAt: Date | null;
                closePrice: number | null;
                createdAt: Date;
                updatedAt: Date;
            }[];
            meta: object;
        }>;
        refreshPrices: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbols: string[];
            };
            output: {
                symbol: string;
                currentPrice: number;
                pnlPercent: number;
                pnlAmount: number;
            }[];
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                symbol: string;
                entryPrice: number;
                quantity: number;
                targetPrice?: number | undefined;
                leverage?: number | undefined;
                signalId?: number | undefined;
            };
            output: {
                id: number | null;
            };
            meta: object;
        }>;
        close: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: number;
                closePrice: number;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    alerts: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        get: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                id: number;
                userId: string;
                symbol: string | null;
                rsiLow: number | null;
                rsiHigh: number | null;
                adxThreshold: number | null;
                targetRsi: number | null;
                targetAdx: number | null;
                targetPlusDi: number | null;
                useBbLower: boolean | null;
                useBbMiddleTarget: boolean | null;
                enabled: boolean | null;
                createdAt: Date;
                updatedAt: Date;
            }[];
            meta: object;
        }>;
        upsert: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id?: number | undefined;
                symbol?: string | undefined;
                rsiLow?: number | undefined;
                rsiHigh?: number | undefined;
                adxThreshold?: number | undefined;
                targetRsi?: number | undefined;
                targetAdx?: number | undefined;
                targetPlusDi?: number | undefined;
                useBbLower?: boolean | undefined;
                useBbMiddleTarget?: boolean | undefined;
                enabled?: boolean | undefined;
            };
            output: {
                id: number | null;
            };
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: number;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    ai: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        analyze: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                messages: {
                    role: "user" | "system" | "assistant";
                    content: string;
                }[];
                context?: string | undefined;
            };
            output: {
                response: string;
            };
            meta: object;
        }>;
        signalInsight: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                symbol: string;
                price: number;
                rsi: number;
                bbLower: number;
                bbMiddle: number;
                bbUpper: number;
                adx: number;
                plusDi: number;
                minusDi: number;
                interval?: string | undefined;
            };
            output: {
                insight: string;
            };
            meta: object;
        }>;
    }>>;
    backtest: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /**
         * 과거 백테스트 실행 목록 조회
         * 최신 20개 반환 (saveToDb=true 로 실행된 것만)
         */
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                id: number;
                runName: string | null;
                symbols: string;
                tf: string;
                startDate: Date;
                endDate: Date;
                totalTrades: number;
                winRate: number | null;
                avgReturn: number | null;
                sharpe: number | null;
                maxDrawdown: number | null;
                profitFactor: number | null;
                status: string;
                createdAt: Date;
                completedAt: Date | null;
            }[];
            meta: object;
        }>;
        /**
         * 특정 run의 집계 통계 + 설정 조회
         */
        detail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                runId: number;
            };
            output: {
                id: number;
                runName: string | null;
                symbols: string;
                tf: string;
                startDate: Date;
                endDate: Date;
                totalTrades: number;
                winRate: number | null;
                avgReturn: number | null;
                sharpe: number | null;
                maxDrawdown: number | null;
                profitFactor: number | null;
                status: string;
                createdAt: Date;
                completedAt: Date | null;
            } | null;
            meta: object;
        }>;
        /**
         * 특정 run의 개별 트레이드 목록 (최대 500건)
         */
        trades: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                runId: number;
                symbol?: string | undefined;
                win?: boolean | undefined;
                limit?: number | undefined;
                offset?: number | undefined;
            };
            output: {
                trades: {
                    id: number;
                    runId: number;
                    symbol: string;
                    tf: string;
                    signalTs: number;
                    entryPrice: number;
                    exitPrice: number;
                    stopLoss: number;
                    target: number;
                    rsi: number;
                    bbLower: number;
                    bbMiddle: number;
                    bbUpper: number;
                    adx: number;
                    plusDi: number;
                    minusDi: number;
                    signalStrength: number;
                    exitReason: string;
                    returnPct: number;
                    maxFavorable: number;
                    maxAdverse: number;
                    win: boolean;
                    holdingCandles: number;
                    createdAt: Date;
                }[];
                total: number;
            };
            meta: object;
        }>;
        /**
         * 백테스트 즉시 실행 (서버에서 동기 실행, 응답 최대 5분)
         * 결과는 saveToDb=true 일 때 DB에 저장됨
         *
         * 주의: 심볼 수 × 기간이 길면 타임아웃 가능.
         *       긴 백테스트는 CLI(pnpm backtest) 사용 권장.
         */
        run: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                startDate: string;
                endDate: string;
                symbols?: string[] | undefined;
                tf?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
                outcomeWindowCandles?: number | undefined;
                cooldownCandles?: number | undefined;
                saveToDb?: boolean | undefined;
                runName?: string | undefined;
            };
            output: {
                runId: number | undefined;
                overall: import("./backtest/types").BacktestMetrics;
                bySymbol: Record<string, import("./backtest/types").BacktestMetrics>;
                config: {
                    symbols: string[];
                    tf: "1h" | "4h" | "6h" | "1d" | "1w" | "1M";
                    startDate: string;
                    endDate: string;
                    outcomeWindowCandles: number;
                };
                runAt: string;
                durationMs: number;
                trades: import("./backtest/types").BacktestTrade[];
            };
            meta: object;
        }>;
    }>>;
    onchain: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** 단일 심볼의 7-modifier 점수 + regime + breakdown */
        score: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol?: string | undefined;
            };
            output: import("./onchain/types").OnchainScore;
            meta: object;
        }>;
        /** BBDX 진입 시그널에 온체인 multiplier 적용 결과 */
        applyToEntry: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                baseStrength: number;
                symbol?: string | undefined;
                path?: string | null | undefined;
            };
            output: {
                onchain: import("./onchain/types").OnchainScore;
                adjusted: import("./onchain/types").OnchainAdjustedEntry;
            };
            meta: object;
        }>;
        /** EXIT reversal_score 에 regime 보정 적용 결과 */
        applyToExit: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                baseReversalScore: number;
                symbol?: string | undefined;
            };
            output: {
                onchain: import("./onchain/types").OnchainScore;
                exit: {
                    adjustedScore: number;
                    delta: number;
                    reason: string;
                };
            };
            meta: object;
        }>;
    }>>;
    lite: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /**
         * Lite 대시보드: top buy / top sell + 시장 분위기.
         * scanForSignals → entryDecision/exitDecision 가진 코인만 골라
         * deriveRecommendation 으로 라벨 변환.
         */
        dashboard: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                interval?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
            } | undefined;
            output: LiteDashboard;
            meta: object;
        }>;
        /** 단일 코인의 Lite 추천 카드 + 메타 (Pro chip 매핑용). */
        coin: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                interval?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
            };
            output: {
                symbol: string;
                base: string;
                price: number;
                change24h: number;
                volume24h: number;
                recommendation: import("./lite/types").Recommendation;
                recommendationLabel: import("./lite/types").TranslatedLabel;
                riskLevel: import("./lite/types").RiskLevel;
                riskLabel: import("./lite/types").TranslatedLabel;
                reasons: string[];
                chartCandles: {
                    time: number;
                    close: number;
                    high: number;
                    low: number;
                    volume: number;
                }[];
                bb: {
                    upper: number;
                    middle: number;
                    lower: number;
                } | null;
                meta: {
                    finalStrength: number;
                    multiplier: number;
                    blocked: boolean;
                    regime: import("./onchain/types").OnchainRegime;
                    fallingKnife: boolean;
                };
                computedAt: string;
            } | null;
            meta: object;
        }>;
        /** 사용자 포지션 요약 (Lite Portfolio). 인증 필요. */
        portfolio: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                totalEquity: number;
                pnl24h: number;
                pnl7d: number;
                positions: LitePositionCard[];
                pendingAlerts: number;
                computedAt: string;
            };
            meta: object;
        }>;
        /** 학습 카드용 — 단일 raw 값을 자연어 라벨로 변환. */
        translate: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                kind: "rsi" | "adx" | "path" | "strength" | "regime" | "phase" | "bb_position";
                value: string | number;
            };
            output: {
                kind: "rsi" | "adx" | "path" | "strength" | "regime" | "phase" | "bb_position";
                inputValue: string | number;
                result: import("./lite/types").TranslatedLabel;
            };
            meta: object;
        }>;
        /**
         * Lite 단일 코인 카드 (Coin Detail Workstation 용 별칭).
         *
         * 기존 lite.coin 과 거의 동일하지만 입력 TF 가 대문자 ("1H","4H",...) 로
         * 들어와도 받도록 설계 + LiteCoinCard shape 으로 정규화 응답.
         * BBDX 시그널 산출은 scanForSignals 가 담당하고, 본 procedure 는 라벨 번역만.
         */
        translateCoin: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf?: "1h" | "1H" | "4h" | "4H" | "1d" | "1D" | "1w" | "1W" | undefined;
            };
            output: LiteCoinCard | null;
            meta: object;
        }>;
    }>>;
    /** 단일 코인의 시총·거래량·도미넌스·SSR 등 메타. CoinGecko Free 기반. */
    coin: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        meta: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
            };
            output: import("./coin-meta").CoinMeta;
            meta: object;
        }>;
    }>>;
    /** 캘린더 / 매크로 + 코인별 이벤트. */
    events: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol?: string | undefined;
                days?: number | undefined;
            };
            output: {
                events: {
                    symbol: string;
                    id: number;
                    createdAt: Date;
                    eventType: string;
                    title: string;
                    description: string | null;
                    scheduledAt: Date;
                    source: string | null;
                    createdBy: string | null;
                }[];
                count: number;
                horizonDays: number;
                computedAt: string;
            };
            meta: object;
        }>;
        /**
         * 새 이벤트 추가. 인증 필요 (createBy 는 ctx.user.id 강제 주입).
         * symbol === "GLOBAL" 은 매크로 / 시장 전체 이벤트.
         */
        add: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                symbol: string;
                eventType: "custom" | "macro" | "unlock" | "fork" | "halving" | "listing";
                title: string;
                scheduledAt: string;
                description?: string | undefined;
                source?: string | undefined;
            };
            output: {
                id: number | null;
                symbol: string;
                eventType: "custom" | "macro" | "unlock" | "fork" | "halving" | "listing";
                title: string;
                description: string | null;
                scheduledAt: string;
                source: string | null;
            };
            meta: object;
        }>;
    }>>;
    /** 백테스트 기반 rolling 승률 + Wilson 95% CI. */
    winRate: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        rolling: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf?: "1h" | "1H" | "4h" | "4H" | "1d" | "1D" | "1w" | "1W" | undefined;
                windows?: number[] | undefined;
            };
            output: import("./winrate-rolling").RollingWinRateResult;
            meta: object;
        }>;
    }>>;
}>>;
export type AppRouter = typeof appRouter;
