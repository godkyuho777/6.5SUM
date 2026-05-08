/**
 * Unified type exports
 * Import shared types from this single entry point.
 */
export type * from "../../drizzle/schema";
export * from "./_core/errors";
/** 바이비트(Bybit) 거래량 상위 100개 USDT 페어 심볼 */
export declare const TOP_COINS: string[];
/** 캔들 데이터 */
export interface Candle {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
}
/** 기술 지표 결과 */
export interface TechnicalIndicators {
    rsi: number;
    bbUpper: number;
    bbMiddle: number;
    bbLower: number;
    adx: number;
    plusDi: number;
    minusDi: number;
    /** VWAP across the loaded candle range. Optional for back-compat. */
    vwap?: number;
    /** 9-period EMA of close prices. */
    ema9?: number;
    fibLevels?: {
        level: number;
        price: number;
        isGoldenZone: boolean;
    }[];
    trendlines?: {
        type: "support" | "resistance";
        points: {
            time: number;
            price: number;
        }[];
        isActive: boolean;
    }[];
}
/** +DI / -DI 압력 라벨 */
export type PressureLabel = "BULL_PRESSURE" | "WEAK_BULL" | "BEAR_PRESSURE" | "WEAK_BEAR" | "NEUTRAL";
/** 캔들 패턴 이름 */
export type CandlePatternName = "engulfing" | "morningStar" | "hammer" | "invertedHammer" | "pinBar" | "doji" | "threeWhiteSoldiers" | "bearishEngulfing" | "eveningStar" | "threeBlackCrows";
/** 감지된 캔들 패턴 */
export interface CandlePatternMatch {
    name: CandlePatternName;
    bias: "bullish" | "bearish";
    /** 0 = 가장 최근 캔들에서 감지, 1~4 = N캔들 전 */
    candlesAgo: number;
    /** 패턴 강도 (60~100) */
    strength: number;
}
/** BB 구조 패턴 */
export type BBStructure = "upperRiding" | "middleSupport" | "squeezeBreakout" | "lowerBounce";
/** 매수 진입 경로 */
export type EntryPath = "NUM" | "PTN" | "BB";
/** 매수 진입 결정 */
export interface EntryDecision {
    path: EntryPath;
    /** 사람이 읽을 수 있는 충족 조건 목록 */
    reasons: string[];
    /** PTN 경로일 때 사용된 강세 패턴들 */
    patterns?: CandlePatternMatch[];
    /** BB 경로일 때 사용된 BB 구조 */
    bbStructure?: BBStructure;
}
/** 매도(EXIT) 결정 */
export interface ExitDecision {
    /** 4개 조건 중 충족된 개수 */
    conditionsMet: number;
    total: 4;
    /** 약세 패턴 감지로 2/4 완화 적용 여부 */
    relaxedToBearish: boolean;
    /** 어떤 조건들이 충족되었는지 */
    triggers: ("bbMiddle" | "rsi65" | "adx30" | "plusDi25")[];
}
export type VwapPosition = "ABOVE" | "BELOW" | "AT";
export type EmaPosition = "ABOVE" | "BELOW" | "AT";
export interface VwapSignal {
    side: "LONG" | "SHORT";
    /** 0~100 composite */
    strength: number;
    /** Human-readable reasons (for click-detail dialogs) */
    reasons: string[];
}
/** 스캔 결과 (개별 코인) */
export interface CoinScanResult {
    symbol: string;
    price: number;
    change24h: number;
    volume24h: number;
    indicators: TechnicalIndicators;
    isEntrySignal: boolean;
    isExitSignal: boolean;
    signalStrength: number;
    fibSignal?: {
        level: number;
        price: number;
        type: "buy" | "sell";
    };
    trendSignal?: {
        type: "buy" | "sell";
        trendType: "support" | "resistance";
    };
    pressure: PressureLabel;
    pressureStrong: boolean;
    /** 0~100, 100 - (ADX × 2.5) */
    reversalProb: number;
    /** 최근 5캔들 평균 / 전체 평균 */
    volumeRatio: number;
    /** -5 / 0 / +15 — strength 점수 기여분 */
    volumeConfirmation: number;
    /** dedup된, 최근 5캔들 윈도우 내 감지된 패턴들 */
    candlePatterns: CandlePatternMatch[];
    bbStructure: BBStructure | null;
    entryDecision: EntryDecision | null;
    exitDecision: ExitDecision | null;
    /** BB하단 × 0.97 */
    stopLossPrice: number;
    /** currentPrice ≤ stopLossPrice */
    isStopLossHit: boolean;
    /** -DI > +DI AND ADX > 25 — LONG 진입 차단 */
    isFallingKnife: boolean;
    /** Volume-weighted average price across the loaded candle range. */
    vwap: number;
    /** 9-period EMA of close prices. */
    ema9: number;
    vwapPosition: VwapPosition;
    emaPosition: EmaPosition;
    /** Price retraced toward VWAP/EMA(9) without crossing. */
    pullbackDetected: boolean;
    /** LONG/SHORT signal derived from VWAP+EMA confluence. null if neither. */
    vwapSignal: VwapSignal | null;
}
/** 시그널 상세 */
export interface SignalDetail {
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
    pnlPercent?: number;
}
/** 포지션 상세 */
export interface PositionDetail {
    id: number;
    symbol: string;
    entryPrice: number;
    targetPrice: number | null;
    currentPrice: number | null;
    quantity: number;
    leverage: number;
    pnlPercent: number | null;
    pnlAmount: number | null;
    status: "open" | "closed" | "liquidated";
    openedAt: Date;
    closedAt: Date | null;
}
/** 지원 타임프레임 */
export declare const TIMEFRAMES: readonly [{
    readonly value: "1h";
    readonly label: "1H";
}, {
    readonly value: "4h";
    readonly label: "4H";
}, {
    readonly value: "6h";
    readonly label: "6H";
}, {
    readonly value: "1d";
    readonly label: "1D";
}, {
    readonly value: "1w";
    readonly label: "1W";
}, {
    readonly value: "1M";
    readonly label: "1M";
}];
export type TimeframeValue = typeof TIMEFRAMES[number]["value"];
/** 바이비트 API interval 매핑 */
export declare const BYBIT_INTERVAL_MAP: Record<TimeframeValue, string>;
/** 매수 진입 조건 기본값 */
export declare const DEFAULT_ENTRY_CONDITIONS: {
    readonly rsiLow: 30;
    readonly rsiHigh: 35;
    readonly adxThreshold: 30;
    readonly useBbLower: true;
};
/** 목표가 조건 기본값 */
export declare const DEFAULT_EXIT_CONDITIONS: {
    readonly targetRsi: 70;
    readonly targetAdx: 30;
    readonly targetPlusDi: 30;
    readonly useBbMiddleTarget: true;
};
