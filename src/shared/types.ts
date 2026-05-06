/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../../drizzle/schema";
export * from "./_core/errors";

/** 바이비트(Bybit) 거래량 상위 100개 USDT 페어 심볼 */
export const TOP_COINS: string[] = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "AAVEUSDT",
  "DOGEUSDT", "SUIUSDT", "PEPEUSDT", "AVAXUSDT", "ADAUSDT",
  "ENAUSDT", "NEARUSDT", "LINKUSDT", "BNBUSDT", "TONUSDT",
  "LTCUSDT", "DOTUSDT", "FILUSDT", "FETUSDT", "TRUMPUSDT",
  "RENDERUSDT", "TRXUSDT", "ALGOUSDT", "XLMUSDT", "WLDUSDT",
  "BONKUSDT", "HBARUSDT", "ICPUSDT", "ARBUSDT", "CRVUSDT",
  "OPUSDT", "UNIUSDT", "ONDOUSDT", "SHIBUSDT", "SEIUSDT",
  "GALAUSDT", "DYDXUSDT", "APTUSDT", "BCHUSDT", "ATOMUSDT",
  "APEUSDT", "JUPUSDT", "WUSDT", "IPUSDT", "WIFUSDT",
  "KASUSDT", "INJUSDT", "TIAUSDT", "RUNEUSDT", "PENDLEUSDT",
  "LDOUSDT", "GRTUSDT", "SANDUSDT", "MANAUSDT", "AXSUSDT",
  "CHZUSDT", "ENJUSDT", "HYPEUSDT", "SNXUSDT", "COMPUSDT",
  "GMXUSDT", "FLOWUSDT", "MINAUSDT", "XTZUSDT", "DRIFTUSDT",
  "KAVAUSDT", "ZROUSDT", "MASKUSDT", "ANKRUSDT", "LITUSDT",
  "ZILUSDT", "BATUSDT", "ZRXUSDT", "BASEDUSDT", "ONEUSDT",
  "XPLUSDT", "MONUSDT", "EDGEUSDT", "ZORAUSDT", "FIGHTUSDT",
  "FLOKIUSDT", "STXUSDT", "IMXUSDT", "VETUSDT",
  "THETAUSDT", "LRCUSDT", "QNTUSDT", "EGLDUSDT",
  "RVNUSDT", "GRASSUSDT", "POLUSDT",
  "VIRTUALUSDT", "PENGUUSDT", "ALTUSDT", "MNTUSDT", "XDCUSDT"
];

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
    points: { time: number; price: number }[];
    isActive: boolean;
  }[];
}

// ─── BBDX-PATTERN v6.1 ──────────────────────────────────────────────────────

/** +DI / -DI 압력 라벨 */
export type PressureLabel =
  | "BULL_PRESSURE"
  | "WEAK_BULL"
  | "BEAR_PRESSURE"
  | "WEAK_BEAR"
  | "NEUTRAL";

/** 캔들 패턴 이름 */
export type CandlePatternName =
  | "engulfing"
  | "morningStar"
  | "hammer"
  | "invertedHammer"
  | "pinBar"
  | "doji"
  | "threeWhiteSoldiers"
  | "bearishEngulfing"
  | "eveningStar"
  | "threeBlackCrows";

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
export type BBStructure =
  | "upperRiding"
  | "middleSupport"
  | "squeezeBreakout"
  | "lowerBounce";

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

/** v6.3 EXIT 카테고리 (Part II.1 §1.1). */
export type ExitCategory = "A" | "B" | "C" | "D" | "STOP";

/** v6.3 EXIT 액션. */
export type ExitAction = "full_exit" | "partial_exit" | "move_stop";

/** v6.3 EXIT-B 반전 점수 컴포넌트 (debug/UI 표시용). */
export interface ReversalScoreBreakdown {
  diCross: number;
  adxConfirmation: number;
  bearishPattern: number;
  trendlineBreak: number;
  macdDivergence: number;
  total: number;
}

/**
 * 매도(EXIT) 결정.
 *
 * v6.3 (Part II.1) 4-카테고리 분리:
 *   A = 목표 도달 (profit target)
 *   B = 방향성 반전 (reversal score)
 *   C = 수익 보호 (trailing/breakeven)
 *   D = 시간 손절 (time stop)
 *   STOP = 손절선 도달
 *
 * Legacy v6.1 4-조건 필드는 FE 호환을 위해 유지하며, v6.3 결과로부터
 * 도출. 새 코드는 category/action/ratio 를 사용.
 */
export interface ExitDecision {
  // ── v6.3 primary fields ──
  category: ExitCategory;
  action: ExitAction;
  /** 청산 비율 (1.0 = 전체 / 0.5 = 50% partial / 0 = stop 이동만). */
  ratio: number;
  reasons: string[];
  /** category=B 일 때만 의미 있음. [0, 1] 범위. */
  reversalScore?: number;
  reversalBreakdown?: ReversalScoreBreakdown;

  // ── v6.1 legacy compatibility (FE backward compat) ──
  /** 4개 조건 중 충족된 개수. v6.3 이후엔 reversal-score 의 트리거 카운트로 대체. */
  conditionsMet: number;
  total: 4;
  /** 약세 패턴 감지로 2/4 완화 적용 여부 (v6.1 호환). */
  relaxedToBearish: boolean;
  /** 어떤 조건들이 충족되었는지 (v6.1 호환). */
  triggers: ("bbMiddle" | "rsi65" | "adx30" | "plusDi25")[];
}

// ─── VWAP Strategy (Parker Brooks Style) ────────────────────────────────────

export type VwapPosition = "ABOVE" | "BELOW" | "AT";
export type EmaPosition = "ABOVE" | "BELOW" | "AT";

export interface VwapSignal {
  side: "LONG" | "SHORT";
  /** 0~100 composite */
  strength: number;
  /** Human-readable reasons (for click-detail dialogs) */
  reasons: string[];
}

// ────────────────────────────────────────────────────────────────────────────

/** 스캔 결과 (개별 코인) */
export interface CoinScanResult {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  indicators: TechnicalIndicators;

  // Legacy boolean — kept for the current frontend (until PR B). Equivalent to
  // `entryDecision != null` and `exitDecision != null`.
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

  // BBDX-PATTERN v6.1 additions —
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

  // ─── VWAP Strategy fields ───────────────────────────────────────────────
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
export const TIMEFRAMES = [
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "6h", label: "6H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1M", label: "1M" },
] as const;

export type TimeframeValue = typeof TIMEFRAMES[number]["value"];

/** 바이비트 API interval 매핑 */
export const BYBIT_INTERVAL_MAP: Record<TimeframeValue, string> = {
  "1h": "60",
  "4h": "240",
  "6h": "360",
  "1d": "D",
  "1w": "W",
  "1M": "M",
};

/** 매수 진입 조건 기본값 */
export const DEFAULT_ENTRY_CONDITIONS = {
  rsiLow: 30,
  rsiHigh: 35,
  adxThreshold: 30,
  useBbLower: true,
} as const;

/** 목표가 조건 기본값 */
export const DEFAULT_EXIT_CONDITIONS = {
  targetRsi: 70,
  targetAdx: 30,
  targetPlusDi: 30,
  useBbMiddleTarget: true,
} as const;
