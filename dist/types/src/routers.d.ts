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
                exitCategory: string | null;
                exitAction: string | null;
                exitRatio: number | null;
                exitReversalScore: number | null;
                exitReason: string | null;
                macroScore: number | null;
                macroRegime: string | null;
                macroMult: number | null;
                onchainScore: number | null;
                onchainRegime: string | null;
                onchainMult: number | null;
                confluenceMult: number | null;
                waveMult: number | null;
                finalConfidence: number | null;
                sizeFactor: string | null;
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
                entryBarIndex: number | null;
                currentStop: number | null;
                stopMovedToBreakeven: boolean;
                partialExitsTaken: unknown;
                tier1PartialExitTaken: boolean;
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
         * 사용 가능한 백테스트 전략 목록
         * (BBDX, Fibonacci, VWAP, Trend Analysis)
         * 프론트엔드 dropdown 채우는 용도.
         */
        listStrategies: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                name: string;
                label: string;
                description: string;
                dimensionsCovered: number[];
            }[];
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
                strategy?: "vwap" | "bbdx" | "bbdx-short" | "bbdx-combined" | "fibonacci" | "trend" | "trend-follow" | undefined;
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
                metricsBySide: {
                    long: import("./backtest/types").BacktestMetrics | null;
                    short: import("./backtest/types").BacktestMetrics | null;
                    combined: import("./backtest/types").BacktestMetrics;
                } | undefined;
            };
            meta: object;
        }>;
        /**
         * Layer indicator + operator 카탈로그 — frontend builder dropdown 채우기.
         * GET 한 번이면 충분 (정적 메타).
         */
        compositeCatalog: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                indicators: import("./backtest/composite").IndicatorMeta[];
                operators: import("./backtest/composite").OperatorMeta[];
                defaultConfig: import("./backtest/composite").CompositeStrategyConfig;
            };
            meta: object;
        }>;
        /**
         * 3-Layer composite 백테스트 실행.
         *
         * 사용자 요구 #2: Signal + Macro + Wave 지표 조합으로 진입 게이트
         * 만들고 백테스트. 결과는 기존 single-strategy 결과와 *분리* 표시.
         */
        runComposite: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                startDate: string;
                endDate: string;
                config: any;
                symbols?: string[] | undefined;
                tf?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
                outcomeWindowCandles?: number | undefined;
                cooldownCandles?: number | undefined;
                macroSnapshot?: any;
                waveSnapshot?: any;
            };
            output: {
                overall: import("./backtest/types").BacktestMetrics;
                bySymbol: Record<string, import("./backtest/types").BacktestMetrics>;
                layerStats: {
                    signalPassRate: number;
                    macroPassRate: number;
                    wavePassRate: number;
                    allPassRate: number;
                };
                runAt: string;
                durationMs: number;
                trades: import("./backtest/types").BacktestTrade[];
            };
            meta: object;
        }>;
    }>>;
    simulator: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** 현재 계정 잔액 + equity (mark-to-market). */
        account: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                simUserId: string;
            };
            output: {
                available: boolean;
                cash: number;
                realizedPnl: number;
                totalCommission: number;
                totalFunding: number;
                liquidationCount: number;
                openPositions: number;
                unrealizedPnl: number;
                equity: number;
            };
            meta: object;
        }>;
        /** 보유 포지션 목록 (open) */
        positions: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                simUserId: string;
                includeClosed?: boolean | undefined;
                limit?: number | undefined;
            };
            output: {
                symbol: string;
                id: number;
                entryPrice: number;
                currentPrice: number | null;
                status: "closed" | "open" | "liquidated";
                closedAt: Date | null;
                userId: string;
                quantity: number;
                leverage: number;
                openedAt: Date;
                side: string;
                productType: "spot" | "perp";
                margin: number;
                liquidationPrice: number | null;
                accruedFunding: number;
                accruedCommission: number;
                closedPnl: number | null;
                closedPrice: number | null;
                closedReason: string | null;
            }[];
            meta: object;
        }>;
        /** 거래 내역 (audit trail) */
        transactions: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                simUserId: string;
                limit?: number | undefined;
            };
            output: {
                symbol: string | null;
                id: number;
                userId: string;
                ts: Date;
                positionId: number | null;
                type: "open" | "close" | "funding" | "commission" | "deposit" | "liquidation";
                amount: number;
                price: number | null;
                note: string | null;
            }[];
            meta: object;
        }>;
        /** 현재 시장 가격 + funding rate quote (포지션 진입 전 조회) */
        quote: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
            };
            output: {
                symbol: string;
                price: number;
                fundingRate: number;
                fundingHours: number;
                commissionRate: number;
                available: boolean;
                error?: undefined;
            } | {
                symbol: string;
                price: number;
                fundingRate: number;
                fundingHours: number;
                commissionRate: number;
                available: boolean;
                error: string;
            };
            meta: object;
        }>;
        /** 포지션 진입 */
        openPosition: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                simUserId: string;
                symbol: string;
                side: "long" | "short";
                quantity: number;
                productType?: "spot" | "perp" | undefined;
                leverage?: number | undefined;
                entryPrice?: number | undefined;
                orderType?: "limit" | "market" | undefined;
                marginMode?: "cross" | "isolated" | undefined;
            };
            output: import("./simulator/db").OpenPositionResult | {
                error: string;
            };
            meta: object;
        }>;
        /** 포지션 청산 */
        closePosition: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                simUserId: string;
                positionId: number;
                exitPrice?: number | undefined;
            };
            output: import("./simulator/db").ClosePositionResult | {
                error: string;
            };
            meta: object;
        }>;
        /** 계정 리셋 — 모든 open 포지션 강제 close + $200k 재입금 */
        reset: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                simUserId: string;
            };
            output: {
                reset: true;
            };
            meta: object;
        }>;
        /** Mark-to-market 갱신 — open 포지션 현재가 + unrealized P&L 동기화 */
        refresh: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                simUserId: string;
            };
            output: {
                updated: number;
            };
            meta: object;
        }>;
    }>>;
    cycle: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** BTC 200d MA cycle regime (bull / bear / neutral) */
        btc: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: import("./cycle/btc-regime").BtcCycleResult;
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
        /**
         * 7-modifier provider 상태 (P1-#4, 2026-05-10).
         *
         * 어떤 modifier 가 real / mock / stub 인지 운영시점 가시화.
         * 사용자 / 운영자가 BBDX 점수에 실제로 영향 주는 modifier 갯수를 확인 가능.
         * 헌장 R2 (백테스트 alpha) 결과 해석 시 컨텍스트.
         */
        providerStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                modifiers: import("./onchain").ProviderStatus[];
                summary: {
                    total: number;
                    real: number;
                    mock: number;
                    stub: number;
                    partial: number;
                    effective: number;
                };
            };
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
                kind: "regime" | "rsi" | "adx" | "path" | "strength" | "phase" | "bb_position";
                value: string | number;
            };
            output: {
                kind: "regime" | "rsi" | "adx" | "path" | "strength" | "phase" | "bb_position";
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
        /**
         * 단일 코인의 상세 정보 (description / category / supply / ATH / links).
         * CoinGecko Free 기반 + 23-coin 한국어 큐레이션. CoinDetail 페이지의
         * "코인 정보" 탭에서 사용. 1h in-memory 캐시.
         *
         * 헌장: modifier-only (정보 표시만, 단독 시그널 발행 X).
         */
        info: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
            };
            output: import("./coin-info").CoinInfo;
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
    wave: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** Composite Sentiment + Wave Matrix 한 번에 받기 (가장 자주 쓰는 엔드포인트). */
        combined: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol?: string | undefined;
            } | undefined;
            output: import("./sentiment").CombinedSentiment;
            meta: object;
        }>;
        /** Composite Sentiment 만 (Fear&Greed gauge / 시장 단계 / 분석 근거). */
        sentiment: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol?: string | undefined;
            } | undefined;
            output: import("./sentiment").SentimentSnapshot;
            meta: object;
        }>;
        /** 4-신호 Wave Matrix 만 (OI 복합 해석 + 종합 편향 + 신뢰도). */
        matrix: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol?: string | undefined;
            } | undefined;
            output: import("./sentiment").WaveMatrixState;
            meta: object;
        }>;
    }>>;
    vwap: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        detail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf?: "1h" | "4h" | "1d" | undefined;
            };
            output: import("./vwap-detail").VwapDetail | {
                symbol: string;
                tf: "1h" | "4h" | "1d";
                candles: never[];
                vwap: number;
                ema9: number;
                bands: {
                    vwap: number;
                    sigma: number;
                    upper1: number;
                    upper2: number;
                    upper3: number;
                    lower1: number;
                    lower2: number;
                    lower3: number;
                };
                volumeProfile: {
                    bins: never[];
                    poc: number;
                    hvnList: never[];
                    lvnList: never[];
                    valueArea: {
                        low: number;
                        high: number;
                        pct: number;
                    };
                    totalVolume: number;
                };
                pullbackV2: {
                    detected: boolean;
                    touchCandleIdx: null;
                    bounceConfirmed: boolean;
                    proximityRatio: number;
                    touchedLine: null;
                };
                signal: null;
                signalV2: null;
                vwapMult: number;
                multiTfAlignment: {
                    tfs: ("1h" | "4h" | "1d")[];
                    alignmentLevel: "neutral";
                    perTf: {};
                    multiplier: number;
                };
                computedAt: number;
                error: string;
            };
            meta: object;
        }>;
    }>>;
    trend: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /**
         * 단일 심볼의 멀티-TF Trend 분석. 5-min 캐시 자동 적용.
         * default tfs: ["1h", "4h", "1d"] (15m 은 Bybit Spot 호환 위해 1h fallback).
         */
        analyze: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tfs?: ("1h" | "4h" | "1d" | "1w" | "15m")[] | undefined;
            };
            output: import("./trend").TrendAnalysisResult | {
                symbol: string;
                perTf: {};
                alignment: "mixed";
                waveMult: number;
                overallConfidence: number;
                computedAt: number;
                error: string;
            };
            meta: object;
        }>;
    }>>;
    emaAdxTrend: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** 트래커 메타 (이름/설명/임계/가중치). 프론트엔드 Criteria 탭 용. */
        meta: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                threshold: number;
                weights: {
                    readonly emaStack: 0.3;
                    readonly adx: 0.25;
                    readonly diDiff: 0.2;
                    readonly smaSlope: 0.15;
                    readonly structure: 0.1;
                };
                id: "ema-adx-trend";
                labelKo: string;
                labelEn: string;
                subtitle: string;
                description: string;
            };
            meta: object;
        }>;
        /** 단일 심볼 시그널 평가. */
        evaluate: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
            };
            output: import("./trackers/ema-adx-trend").EmaAdxSignal | {
                symbol: string;
                tf: "1h" | "4h" | "6h" | "1d" | "1w" | "1M";
                side: "NEUTRAL";
                triggered: boolean;
                finalConfidence: number;
                threshold: number;
                breakdown: {
                    emaStack: number;
                    adx: number;
                    diDiff: number;
                    smaSlope: number;
                    structure: number;
                };
                reasons: string[];
                prices: {
                    price: number;
                    ema9: number;
                    ema21: number;
                    ema50: number;
                    sma50: number;
                    adx: number;
                    plusDi: number;
                    minusDi: number;
                    target1: number;
                    target2: number;
                    stopLoss: number;
                    target1Pct: number;
                    target2Pct: number;
                    stopPct: number;
                };
                computedAt: number;
                error: string;
            };
            meta: object;
        }>;
        /** TOP 코인 스캔 — 시그널 트래커 페이지 리스트 표시 용. */
        scan: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                tf?: "1h" | "4h" | "6h" | "1d" | "1w" | "1M" | undefined;
                symbols?: string[] | undefined;
            } | undefined;
            output: {
                tf: "1h" | "4h" | "6h" | "1d" | "1w" | "1M";
                results: import("./trackers/ema-adx-trend").EmaAdxSignal[];
                computedAt: number;
            };
            meta: object;
        }>;
    }>>;
    modifiers: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** Market Breadth (6차원: macro/sentiment) — 96 코인 일괄 RSI 분포 */
        marketBreadth: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbols?: string[] | undefined;
                tf?: "1h" | "4h" | "1d" | undefined;
            };
            output: import("./modifiers").MarketBreadthResult;
            meta: object;
        }>;
        /** MACD Divergence (1차원: momentum, RSI 와 다른 각도) */
        macdDivergence: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf?: "1h" | "4h" | "1d" | undefined;
                lookback?: number | undefined;
            };
            output: import("./modifiers").MacdDivergenceResult;
            meta: object;
        }>;
        /** Funding Extreme (6차원: macro/perp positioning) */
        fundingExtreme: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
            };
            output: import("./modifiers").FundingExtremeResult;
            meta: object;
        }>;
        /** Order Block (5차원: structure, 베타) */
        orderBlock: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf?: "1h" | "4h" | "1d" | undefined;
            };
            output: import("./modifiers").OrderBlockResult;
            meta: object;
        }>;
        /**
         * 통합 — 모든 modifier 한 번에. 가장 자주 쓰는 endpoint.
         * Market Breadth 는 30개 universe 호출이라 병렬 하지만 시간이 좀 걸림 (~3s).
         */
        all: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf?: "1h" | "4h" | "1d" | undefined;
                includeBreadth?: boolean | undefined;
            };
            output: {
                symbol: string;
                tf: "1h" | "4h" | "1d";
                marketBreadth: import("./modifiers").MarketBreadthResult | null;
                macdDivergence: import("./modifiers").MacdDivergenceResult | null;
                fundingExtreme: import("./modifiers").FundingExtremeResult | null;
                orderBlock: import("./modifiers").OrderBlockResult | null;
                combinedMultiplier: number;
                computedAt: number;
            };
            meta: object;
        }>;
    }>>;
    taxonomy: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** 모든 modifier 메타데이터 — layer 필터 없음 */
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: readonly import("./types-entry").TrackerModifier[];
            meta: object;
        }>;
        /** 특정 layer 의 modifier 만 (signal | wave | macro | onchain) */
        byLayer: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                layer: "signal" | "wave" | "macro" | "onchain";
            };
            output: readonly import("./types-entry").TrackerModifier[];
            meta: object;
        }>;
        /** 단일 slug 로 modifier 조회 (없으면 null) */
        bySlug: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                slug: string;
            };
            output: import("./types-entry").TrackerModifier | null;
            meta: object;
        }>;
    }>>;
    dualEngine: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** Engine A — 단일 지표 백테스트 실행 */
        singleIndicator: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                config: any;
            };
            output: import("./backtest/engines/single-indicator").SingleIndicatorResult | {
                status: "error";
                detail: string;
            };
            meta: object;
        }>;
        /** Engine B — DSL 다중 전략 백테스트 실행 */
        multiStrategy: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                config: any;
            };
            output: import("./backtest/engines/multi-strategy").MultiStrategyResult | {
                status: "error";
                detail: string;
            };
            meta: object;
        }>;
        /** Engine B — DSL 표현식의 헌장 매핑 검증 (백테스트 실행 전) */
        validateStrategy: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                expression: any;
            };
            output: import("./backtest/engines/multi-strategy").CharterValidation;
            meta: object;
        }>;
    }>>;
    macroV2: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** 현재 시점 macro snapshot (단일 layer 객체) */
        snapshot: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: import("./macro").MacroLayer | null;
            meta: object;
        }>;
        /**
         * FRED 시계열 raw observations (chart 렌더링 용).
         * mode 는 항상 realtime — backtest 모드는 dualEngine 경로로.
         */
        history: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                seriesId: string;
                period?: "30d" | "90d" | "1y" | "5y" | undefined;
            };
            output: {
                status: import("./macro/sources/fred").FredFetchStatus;
                observations: import("./macro").FredObservation[];
                detail: string | undefined;
            };
            meta: object;
        }>;
    }>>;
    bbdxV66: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /**
         * 단일 (symbol, tf) 의 v6.6 LONG/SHORT 양방향 평가.
         * BBDX_VERSION=v6.6 일 때만 실제 평가. v6.5 일 때는 fallback note 반환.
         */
        current: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf: "1h" | "4h" | "1d";
                limit?: number | undefined;
            };
            output: import("./strategies/bbdx-v66").V66EvaluateOutput | {
                long: null;
                short: null;
                meta: {
                    version: string;
                    note: string;
                    bothTriggered: boolean;
                };
            };
            meta: object;
        }>;
        /** 특정 (symbol, tf, path, side) 의 현재 production 가중치 */
        weightsFor: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf: string;
                path: "NUM" | "PTN" | "BB";
                side: "long" | "short";
            };
            output: import("./strategies/weight-calibration").WeightFetchResult;
            meta: object;
        }>;
        /** 특정 (symbol, tf, side) 의 현재 production 임계 */
        thresholdFor: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf: string;
                side: "long" | "short";
            };
            output: import("./strategies/weight-calibration").ThresholdFetchResult;
            meta: object;
        }>;
        /** 현재 feature flag 상태 (UI 진단용) */
        flags: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                bbdxVersion: "v6.5" | "v6.6";
                bbdxMarket: "spot" | "perp";
                enableShortSignals: boolean;
            };
            meta: object;
        }>;
    }>>;
    calibrationAdmin: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        triggerManualWeights: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                symbol: string;
                tf: string;
                path: "NUM" | "PTN" | "BB";
                side: "long" | "short";
            };
            output: import("./strategies/weight-calibration").AutoCorrectionResult;
            meta: object;
        }>;
        triggerManualThreshold: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                symbol: string;
                tf: string;
                side: "long" | "short";
            };
            output: import("./strategies/weight-calibration").ThresholdAutoCorrectionResult;
            meta: object;
        }>;
        history: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                tf: string;
                path: "NUM" | "PTN" | "BB";
                side: "long" | "short";
                limit?: number | undefined;
            };
            output: {
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
            }[];
            meta: object;
        }>;
    }>>;
    jeonInGu: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("./_core/context").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        /** 트래커 설정 + 활성 상태 + Feature Flag. UI Criteria 탭에서 표시. */
        config: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                enabled: boolean;
                featureFlag: boolean;
                WEIGHT: 0.5;
                MIN_CONFIDENCE: 0.7;
                DECAY_HOURS: 36;
                MIN_FINAL_CONFIDENCE: 50;
                AUTO_CALIBRATION_ENABLED: true;
                CALIBRATION_INTERVAL_DAYS: 7;
                ALPHA_THRESHOLD: 0.1;
                FALLBACK_WEIGHT: 0.2;
                POLLING_INTERVAL_MINUTES: 5;
                LLM_MODEL: "claude-haiku-4-5-20251001";
                TRANSCRIPT_MAX_LENGTH: 8000;
            };
            meta: object;
        }>;
        /**
         * 최근 처리된 콘텐츠 목록 — Phase 1.5 cron 활성 후 DB SELECT.
         * 현재는 빈 배열 + pending 메시지.
         */
        recentContents: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
            };
            output: {
                contents: Array<unknown>;
                message: string;
                limit: number;
            };
            meta: object;
        }>;
        /**
         * 현재 (symbol, side) 의 contrarian modifier 값.
         * Phase 3 활성 전까지 stub modifier (0) 반환 — 헌장 R3 안전.
         */
        currentModifier: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                symbol: string;
                side: "long" | "short";
            };
            output: import("./jeon-in-gu/types").JeonInGuModifierResult;
            meta: object;
        }>;
        /**
         * 가중치 ±0.50 의 calibration 변경 history.
         * Phase 5 cron 활성 후 DB SELECT.
         */
        calibrationHistory: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                history: Array<unknown>;
                message: string;
            };
            meta: object;
        }>;
    }>>;
}>>;
export type AppRouter = typeof appRouter;
