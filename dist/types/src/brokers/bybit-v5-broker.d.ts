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
import type { Candle, TimeframeValue } from "@shared/types";
import type { Broker, TickerSnapshot } from "./broker.interface";
export declare class BybitV5Broker implements Broker {
    readonly name = "bybit-v5";
    fetchKlines(symbol: string, interval: TimeframeValue, limit?: number): Promise<Candle[]>;
    fetch24hTicker(symbol: string): Promise<TickerSnapshot | null>;
    fetchAllTickers(): Promise<Map<string, TickerSnapshot>>;
    fetchMultiplePrices(symbols: string[]): Promise<Map<string, number>>;
    validateSymbol(symbol: string): Promise<boolean>;
}
