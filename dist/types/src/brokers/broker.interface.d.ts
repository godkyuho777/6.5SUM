/**
 * Broker abstraction (P2-#16, 2026-05-23).
 *
 * AUDIT.md 권장: `bybit.ts` 가 11개 모듈에서 직접 import 되어 거래소 변경 시
 * 전면 수정 필요. 본 interface 가 시장 데이터 fetcher 의 공통 계약을 정의한다.
 *
 * 도입 정책:
 *   - 본 단계 (P2-#16): interface + BybitV5Broker 어댑터 도입.
 *     기존 callers 의 `from "../bybit"` 는 그대로 유지 — 점진 마이그레이션.
 *   - 후속 단계 (P3+): scanner / routers / vwap / trackers 가 broker
 *     인스턴스를 주입받도록 리팩토링. Binance/OKX 추가 시 새 어댑터만 작성.
 *
 * 헌장:
 *   - 본 interface 는 *시장 데이터 fetch 만* 정의. 시그널 결정 X.
 *     (헌장 규칙 3: modifier-only — 거래소 어댑터도 단독 시그널 발행 X)
 *   - 모든 메소드는 graceful degradation — 실패 시 빈 컨테이너 / null 반환.
 *     절대 throw 로 호출 체인을 깨지 않음.
 */
import type { Candle, TimeframeValue } from "@shared/types";
/** 시장가 + 24h 변동률 + 24h 거래량 (turnover 단위). */
export interface TickerSnapshot {
    /** 현재가 (USDT 표시). */
    price: number;
    /** 24h 변동률 (%, 양수 = 상승). */
    change24h: number;
    /** 24h turnover (거래대금 USDT). */
    volume24h: number;
}
/**
 * 시장 데이터 broker 의 공통 계약.
 *
 * 구현체는 거래소 V5/V4 endpoint 차이를 모두 흡수해야 한다. 호출자는
 * 거래소를 알 필요 없이 candle/ticker 만 받는다.
 */
export interface Broker {
    /** 사람이 읽을 수 있는 broker 식별자 (예: "bybit-v5", "binance-v3"). */
    readonly name: string;
    /**
     * 캔들 데이터 — 오름차순 정렬 (오래된 것부터).
     *
     * 실패 시 빈 배열 (절대 throw X). limit default 100.
     */
    fetchKlines(symbol: string, interval: TimeframeValue, limit?: number): Promise<Candle[]>;
    /**
     * 단일 심볼의 24h ticker.
     *
     * 실패 / 심볼 미상장 시 null. 절대 throw X.
     */
    fetch24hTicker(symbol: string): Promise<TickerSnapshot | null>;
    /**
     * 모든 USDT 페어의 24h ticker (스캐너 / market breadth 용 대량 fetch).
     *
     * 실패 시 빈 Map. 절대 throw X.
     */
    fetchAllTickers(): Promise<Map<string, TickerSnapshot>>;
    /**
     * 여러 심볼의 현재가만 fetch (lightweight).
     *
     * 실패 시 빈 Map. 절대 throw X.
     */
    fetchMultiplePrices(symbols: string[]): Promise<Map<string, number>>;
    /**
     * 거래소에 상장된 USDT 페어인지 확인.
     *
     * 빠른 응답을 위해 internal timeout 짧게 (~5s). 실패 시 false.
     */
    validateSymbol(symbol: string): Promise<boolean>;
}
