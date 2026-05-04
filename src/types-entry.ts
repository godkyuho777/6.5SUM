/**
 * Public type surface consumed by `tradelab-frontend` via the
 * "@tradelab/backend/router" exports map. Keep this list narrow — anything
 * exported here ships into the frontend's type-checker.
 */
export type { AppRouter } from "./routers";
export type {
  Candle,
  TechnicalIndicators,
  CoinScanResult,
  SignalDetail,
  PositionDetail,
  TimeframeValue,
} from "./shared/types";
export {
  TOP_COINS,
  TIMEFRAMES,
  BYBIT_INTERVAL_MAP,
  DEFAULT_ENTRY_CONDITIONS,
  DEFAULT_EXIT_CONDITIONS,
} from "./shared/types";
export type {
  Signal,
  Position,
  AlertSetting,
  InsertSignal,
  InsertPosition,
  InsertAlertSetting,
} from "../drizzle/schema";
