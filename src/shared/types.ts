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
