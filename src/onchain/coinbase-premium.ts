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

import axios from "axios";
import type { OnchainModifierResult } from "./types";

interface CoinbaseTicker {
  price: string;
  bid: string;
  ask: string;
  time: string;
}

interface BybitTickerListItem {
  lastPrice: string;
  symbol: string;
}

/** Bybit symbol (BTCUSDT) → Coinbase product (BTC-USD). USDT 페어만 매핑. */
function toCoinbaseProduct(bybitSymbol: string): string | null {
  if (!bybitSymbol.endsWith("USDT")) return null;
  const base = bybitSymbol.replace(/USDT$/, "");
  // Coinbase 가 지원하는 메이저만 매핑. 알트는 Coinbase 미상장 다수.
  const supported = new Set([
    "BTC", "ETH", "SOL", "XRP", "ADA", "AVAX", "DOGE", "LINK", "DOT",
    "LTC", "BCH", "ATOM", "UNI", "AAVE", "ALGO", "FIL", "ICP", "NEAR",
    "OP", "ARB", "INJ", "TIA", "SUI", "RUNE", "SEI", "JUP", "WLD",
  ]);
  return supported.has(base) ? `${base}-USD` : null;
}

async function fetchCoinbasePrice(product: string): Promise<number> {
  const url = `https://api.exchange.coinbase.com/products/${product}/ticker`;
  const resp = await axios.get<CoinbaseTicker>(url, {
    timeout: 5000,
    headers: { "User-Agent": "tradelab-onchain/1.0" },
  });
  return Number(resp.data.price);
}

async function fetchBybitPrice(symbol: string): Promise<number> {
  const url = "https://api.bybit.com/v5/market/tickers";
  const resp = await axios.get(url, {
    params: { category: "spot", symbol },
    timeout: 5000,
  });
  const list = resp.data?.result?.list as BybitTickerListItem[] | undefined;
  const item = list?.find((t) => t.symbol === symbol);
  if (!item) throw new Error(`Bybit ticker not found for ${symbol}`);
  return Number(item.lastPrice);
}

export async function computeCoinbasePremium(
  symbol: string
): Promise<OnchainModifierResult> {
  const product = toCoinbaseProduct(symbol);
  if (!product) {
    return {
      key: "coinbase_premium",
      value: 0,
      status: "stub",
      detail: `${symbol}는 Coinbase 미상장 — 영향 없음`,
    };
  }

  try {
    const [coinbasePrice, bybitPrice] = await Promise.all([
      fetchCoinbasePrice(product),
      fetchBybitPrice(symbol),
    ]);

    if (!coinbasePrice || !bybitPrice) {
      return {
        key: "coinbase_premium",
        value: 0,
        status: "error",
        detail: "가격 데이터 누락",
      };
    }

    const premium = coinbasePrice / bybitPrice - 1; // ratio
    const premiumPct = premium * 100;

    let value = 0;
    if (premium > 0.002) value = +0.15;
    else if (premium > 0.0005) value = +0.05;
    else if (premium < -0.002) value = -0.20;
    else if (premium < -0.0005) value = -0.05;

    const sign = premiumPct >= 0 ? "+" : "";
    return {
      key: "coinbase_premium",
      value,
      status: "ok",
      detail: `${product} ${sign}${premiumPct.toFixed(3)}% vs Bybit (${value >= 0 ? "+" : ""}${value.toFixed(2)})`,
      raw: { coinbasePrice, bybitPrice, premiumPct },
    };
  } catch (err: any) {
    return {
      key: "coinbase_premium",
      value: 0,
      status: "error",
      detail: `호출 실패: ${err.message ?? err}`,
    };
  }
}
