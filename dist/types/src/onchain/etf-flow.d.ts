/**
 * ETF Flow modifier (Farside Investors HTML 스크래핑)
 *
 * Phase 1 (무료) 구현 — BTC/ETH spot ETF 의 일별 net flow 를 Farside 페이지에서
 * 추출, 가장 최근 3 거래일 누적값으로 BBDX modifier 산출.
 *
 *   ETF 3-day cumulative net flow ($USD millions)
 *     > +$1.5B  → +0.20   (강한 기관 매수)
 *     > +$750M  → 선형 보간 ( +0.10 ~ +0.20 )
 *     > +0M     → 선형 보간 ( 0 ~ +0.10 )
 *     < -$1B    → -0.25   (강한 기관 매도)
 *     < -$500M  → 선형 보간 ( -0.125 ~ -0.25 )
 *     < 0M      → 선형 보간 ( 0 ~ -0.125 )
 *
 *   가이드 명세 (체크리스트):
 *     - 3d > +$1.5B → +0.20
 *     - 3d < -$1B   → -0.25
 *     - 사이는 선형 보간
 *
 * 데이터 소스:
 *   - https://farside.co.uk/btc/  (Bitcoin Spot ETF)
 *   - https://farside.co.uk/eth/  (Ethereum Spot ETF)
 *   - 무료, 키 불필요, 일 1회 (장 마감 후) 업데이트.
 *   - 응답: HTML 페이지에 `<table class="etf">` 1개 — 일별 행 + Total/Average/...
 *     요약 행으로 끝남.
 *
 * 파싱 전략:
 *   - cheerio 미사용 (의존성 추가 회피) — 정규식 기반 단순 파서.
 *   - 행 식별: 첫 `<td>` 셀에 "DD MMM YYYY" 형식 날짜 → 데이터 행.
 *   - 값 추출: 행의 마지막 `<td>` 가 Total ($M).
 *   - 음수 표기: `<span class="redFont">(123.4)</span>` → -123.4
 *   - 0 표기: `0.0`, `-`, 빈 셀 모두 0 처리.
 *
 * 캐싱:
 *   - `.macro-cache/etf-flow-<symbol>-<YYYYMMDD>.json`  (24h 기준 — 일자 stamp 로
 *     자동 invalidate). 동일 일자 내 재호출은 cache hit.
 *
 * Graceful error:
 *   - 네트워크 실패 / HTML 구조 변경 / 파싱 실패 → status="error", value=0.
 *   - BTC/ETH 외 symbol → status="stub", value=0.
 */
import type { OnchainModifierResult } from "./types";
export interface FarsideDailyFlow {
    /** YYYY-MM-DD ISO date (UTC, Farside 표기를 그대로 변환). */
    date: string;
    /** 일별 net flow in USD millions (음수 = 순유출). */
    netFlow: number;
}
export interface FarsideFetchResult {
    status: "ok" | "stub" | "error";
    /** 가장 최근 3 거래일 누적 net flow ($USD millions). */
    netFlow3d: number;
    /** 최근 5 거래일 (parse 가능했던) 일별 flow. */
    dailyFlows: FarsideDailyFlow[];
    detail?: string;
}
/**
 * Farside cell 의 raw 값 문자열 → 숫자 (USD millions).
 *
 * 처리:
 *   - "123.4" → 123.4
 *   - "(123.4)" → -123.4
 *   - "0.0" → 0
 *   - "-" / "" → 0
 *   - "1,234.5" → 1234.5  (천 단위 콤마, Total row 등에서 출현)
 *   - 그 외 (e.g. "n/a") → 0
 *
 * @internal — 테스트용 export.
 */
export declare function parseFarsideValue(raw: string): number;
/**
 * "27 Apr 2026" → "2026-04-27" (ISO YYYY-MM-DD).
 *
 * @internal — 테스트용 export.
 */
export declare function parseFarsideDate(raw: string): string | null;
/**
 * Farside HTML 문자열에서 일별 net flow 추출.
 *
 * 알고리즘:
 *   1. `<tr>...</tr>` 단위로 분리.
 *   2. 각 `<tr>` 의 모든 `<td>...</td>` 추출.
 *   3. 첫 `<td>` 의 텍스트가 "DD MMM YYYY" 매치 → 데이터 행.
 *   4. 마지막 `<td>` 의 텍스트를 Total 로 파싱 ($M).
 *   5. parse 가능한 모든 데이터 행을 ISO date 순서 (오래 → 최신) 로 반환.
 *
 * 안정성 가설:
 *   - Farside 가 매일 새 행을 *추가* 하고 column 구조를 바꾸지 않는 한 동작.
 *   - "Total" / "Average" / "Maximum" / "Minimum" 행은 첫 `<td>` 가 단어이므로
 *     날짜 정규식에서 자동 배제.
 *   - 행 사이 `<tr>` 가 비어있어도 (e.g. <tr> 가 닫히기 전 새 <tr> 시작) 다음
 *     <tr> 들이 잘 잡힘 — split 기반이라 robust.
 *
 * @internal — 테스트용 export.
 */
export declare function parseFarsideHtml(html: string): FarsideDailyFlow[];
/** `<span class="redFont">(123)</span>` 같은 내부 태그를 제거하고 텍스트만 남긴다. */
declare function stripHtml(s: string): string;
/**
 * 3일 누적 net flow ($M) → modifier value (-0.25 ~ +0.20).
 *
 * 매핑:
 *   - >= +1500M → +0.20
 *   - 0 ~ +1500M → 선형 보간 (0 → 0, 1500 → 0.20)
 *   - 0 ~ -1000M → 선형 보간 (0 → 0, -1000 → -0.25)
 *   - <= -1000M → -0.25
 *
 * @internal — 테스트용 export.
 */
export declare function applyEtfFlowThreshold(netFlow3dM: number): number;
declare function cacheFilePath(symbol: string): string;
/**
 * Farside 페이지에서 ETF flow 를 fetch + parse + 3d 누적.
 *
 * 캐시 우선 (24h). 실패는 throw 하지 않고 `status: "error"` 반환.
 */
export declare function fetchFarsideEtfFlow(symbol: "BTCUSDT" | "ETHUSDT"): Promise<FarsideFetchResult>;
/**
 * `OnchainModifierResult` 로 변환된 ETF Flow modifier.
 *
 * 호출 흐름:
 *   - BTC/ETH 외 → status="stub" (이 함수 호출 전 stub-modifiers 가 거름).
 *   - fetch error / parse 실패 → status="error", value=0.
 *   - 정상 → 임계값 적용된 value (-0.25 ~ +0.20).
 */
export declare function computeFarsideEtfFlow(symbol: "BTCUSDT" | "ETHUSDT"): Promise<OnchainModifierResult>;
export declare const __testing: {
    THRESHOLD_HIGH_M: number;
    THRESHOLD_LOW_M: number;
    MAX_POSITIVE: number;
    MAX_NEGATIVE: number;
    stripHtml: typeof stripHtml;
    cacheFilePath: typeof cacheFilePath;
};
export {};
