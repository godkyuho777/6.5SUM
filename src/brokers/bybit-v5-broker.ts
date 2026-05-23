/**
 * BybitV5Broker — Broker 어댑터 (P2-#16, 2026-05-23).
 *
 * 기존 `src/bybit.ts` 의 export 함수들을 Broker interface 로 래핑한다.
 * 함수 자체를 새로 작성하지 않고 *위임* 만 함 — 기존 11개 callers 가
 * 영향받지 않고 점진 마이그레이션 가능.
 *
 * 헌장 검증:
 *   - 본 어댑터는 시장 데이터만 fetch (시그널 결정 X)
 *   - 실패 graceful — 절대 throw X
 *   - Zod validation 은 bybit.ts 가 이미 보장 (P2-#2)
 */

import {
  fetchKlines as bybitFetchKlines,
  fetch24hTicker as bybitFetch24hTicker,
  fetchAll24hTickers as bybitFetchAll24hTickers,
  fetchMultiplePrices as bybitFetchMultiplePrices,
  validateSymbol as bybitValidateSymbol,
} from "../bybit";
import type { Candle, TimeframeValue } from "@shared/types";
import type { Broker, TickerSnapshot } from "./broker.interface";

export class BybitV5Broker implements Broker {
  readonly name = "bybit-v5";

  async fetchKlines(
    symbol: string,
    interval: TimeframeValue,
    limit = 100,
  ): Promise<Candle[]> {
    return bybitFetchKlines(symbol, interval, limit);
  }

  async fetch24hTicker(symbol: string): Promise<TickerSnapshot | null> {
    return bybitFetch24hTicker(symbol);
  }

  async fetchAllTickers(): Promise<Map<string, TickerSnapshot>> {
    return bybitFetchAll24hTickers();
  }

  async fetchMultiplePrices(
    symbols: string[],
  ): Promise<Map<string, number>> {
    return bybitFetchMultiplePrices(symbols);
  }

  async validateSymbol(symbol: string): Promise<boolean> {
    return bybitValidateSymbol(symbol);
  }
}
