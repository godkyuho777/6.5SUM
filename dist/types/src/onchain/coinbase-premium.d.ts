/**
 * Coinbase Premium modifier
 *
 *   premium = (Coinbase USD price / Bybit USDT price) - 1
 *     +0.2% 이상 → +0.15 (미국 기관 매수 우위 = 강세)
 *     +0.05% 이상 → +0.05
 *     -0.2% 이하 → -0.20 (미국 기관 매도 우위 = 약세)
 *     -0.05% 이하 → -0.05
 *
 * 데이터 소스:
 *   - Coinbase: https://api.exchange.coinbase.com/products/{PAIR}/ticker (무료, 키 불필요)
 *   - Bybit: api.bybit.com/v5/market/tickers (이미 시스템 내 사용 중)
 *
 * 즉시 진짜 데이터로 동작 가능 ✓
 */
import type { OnchainModifierResult } from "./types";
export declare function computeCoinbasePremium(symbol: string): Promise<OnchainModifierResult>;
