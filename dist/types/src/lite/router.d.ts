/**
 * Lite mode tRPC sub-router (2026-05-24).
 *
 * 기존 src/routers.ts (2225 lines) 의 lite: router({...}) 블록을 별도 파일로
 * 추출. 기존 동작 100% 보존 — appRouter 에서는 `lite: liteRouter` 로 import.
 *
 * 헌장: lite translator 는 BBDX 시그널의 *번역* 만 — 새 시그널 산출 X.
 *   (Pro 와 Lite 는 같은 applyOnchainToEntry → translator 체인 공유)
 */
import type { LiteCoinCard, LitePositionCard, LiteDashboard } from "./types";
export declare const liteRouter: import("@trpc/server").TRPCBuiltRouter<{
    ctx: import("../_core/context").TrpcContext;
    meta: object;
    errorShape: {
        data: {
            tradelabContext?: any;
            tradelabCode?: any;
            code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
        };
        message: string;
        code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
    };
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
            recommendation: import("./types").Recommendation;
            recommendationLabel: import("./types").TranslatedLabel;
            riskLevel: import("./types").RiskLevel;
            riskLabel: import("./types").TranslatedLabel;
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
                regime: import("../onchain/types").OnchainRegime;
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
            result: import("./types").TranslatedLabel;
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
