/**
 * Broker registry + default selector (P2-#16, 2026-05-23).
 *
 * 환경변수 `BROKER` 로 선택. 미설정 시 bybit (현재 production 기본).
 *
 * 사용:
 *   import { getDefaultBroker } from "./brokers";
 *   const broker = getDefaultBroker();
 *   const candles = await broker.fetchKlines("BTCUSDT", "4h", 100);
 *
 * 미래 확장:
 *   - BROKER=binance → BinanceBroker
 *   - BROKER=okx     → OkxBroker
 *   - BROKER=mock    → MockBroker (테스트 / Sandbox)
 *
 * 헌장: broker 변경은 단일 진입점에서만 가능 (`BROKER` env). 임의 코드 path
 *   에서 `new BinanceBroker()` 직접 호출 X — 헌장 일관성 위배 가능성 차단.
 */
import { BybitV5Broker } from "./bybit-v5-broker";
import type { Broker } from "./broker.interface";
export type { Broker, TickerSnapshot } from "./broker.interface";
export { BybitV5Broker };
/**
 * 환경변수 기반 default broker 인스턴스 (singleton).
 *
 * 첫 호출 시 BROKER 환경변수 평가 후 캐시.
 * BROKER 미설정 또는 unknown → BybitV5Broker (graceful fallback).
 */
export declare function getDefaultBroker(): Broker;
/**
 * 테스트용 broker 교체. production 코드 path 에서 호출 금지.
 */
export declare function setDefaultBrokerForTests(broker: Broker | null): void;
