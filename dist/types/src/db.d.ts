import postgres from "postgres";
import { type InsertSignal, type InsertPosition, type InsertAlertSetting } from "../drizzle/schema";
export declare function getDb(): Promise<(import("drizzle-orm/postgres-js").PostgresJsDatabase<Record<string, unknown>> & {
    $client: postgres.Sql<{}>;
}) | null>;
export declare function createSignal(signal: InsertSignal): Promise<number | null>;
export declare function getActiveSignals(): Promise<{
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
}[]>;
export declare function getSignalHistory(limit?: number): Promise<{
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
}[]>;
export declare function updateSignalStatus(id: number, status: "active" | "target_hit" | "expired" | "closed", extra?: {
    currentPrice?: number;
    targetHitAt?: Date;
    closedAt?: Date;
    exitReason?: string;
}): Promise<void>;
export declare function createPosition(position: InsertPosition): Promise<number | null>;
export declare function getUserPositions(userId: string, status?: "open" | "closed" | "liquidated"): Promise<{
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
}[]>;
export declare function updatePosition(id: number, data: Partial<{
    currentPrice: number;
    pnlPercent: number;
    pnlAmount: number;
    status: "open" | "closed" | "liquidated";
    closedAt: Date;
    closePrice: number;
}>): Promise<void>;
export declare function closePosition(id: number, closePrice: number): Promise<void>;
export declare function getUserAlertSettings(userId: string): Promise<{
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
}[]>;
export declare function upsertAlertSetting(setting: InsertAlertSetting): Promise<number | null>;
export declare function deleteAlertSetting(id: number): Promise<void>;
/**
 * 백테스트 실행 목록 조회 (최신순)
 */
export declare function getBacktestRuns(limit?: number): Promise<{
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
}[]>;
/**
 * 특정 백테스트 run 상세 조회
 */
export declare function getBacktestRunDetail(runId: number): Promise<{
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
} | null>;
/**
 * 특정 run의 개별 트레이드 목록 조회
 */
export declare function getBacktestRunTrades(input: {
    runId: number;
    symbol?: string;
    win?: boolean;
    limit: number;
    offset: number;
}): Promise<{
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
}>;
