/**
 * Risk Score — async fetch 래퍼 (DISPLAY-ONLY).
 *
 * 순수 compute (`score.ts`) 에 넣을 raw 입력을 외부 소스에서 수집한다.
 * onchain/score-fetch.ts 의 stub-first 정신을 그대로 미러:
 *   - 모든 소스 호출은 try/catch (또는 Promise.allSettled) 로 격리.
 *   - 실패/미가용 소스 → 해당 입력 undefined → 그 차원만 graceful skip.
 *   - 절대 throw 로 라우터 체인을 깨지 않는다.
 *   - 실패 로그는 `[risk]` prefix 로 console.warn.
 *
 * ⚠ 헌장 규칙 3 보존 — 결과는 UI 표시 전용. BBDX 시그널/strength/포지션
 * 어디에도 사용되지 않는다.
 *
 * 데이터 소스:
 *   - 일봉 캔들 (Bybit): ATR% / 30일 낙폭 / falling-knife (ADX)
 *   - coin-meta (CoinGecko): 시총 / 24h USD 거래량
 *   - bybit-derivatives: funding rate / OI 24h 변화
 *   - bybit-long-short: long/short ratio
 *   - fear-greed (alternative.me): F&G 0-100
 *   - macro/layer-builder (FRED): 유동성 regime 라벨 (key 없으면 미가용)
 *
 * market-wide 입력(F&G + macro regime)은 짧게 캐시 → per-coin 호출이 싸도록.
 */
import type { RiskScoreResult, MarketRiskResult } from "./types";
/**
 * 단일 심볼의 5-차원 위험 점수를 외부 소스에서 수집해 산출.
 *
 * 모든 소스를 병렬 + 격리 수집 → computeRiskScore. 어떤 소스가 빠져도
 * 해당 차원만 skip 되고 나머지로 재정규화된다. ⚠ DISPLAY-ONLY.
 */
export declare function fetchRiskScore(symbol: string): Promise<RiskScoreResult>;
/**
 * 시장 전체(systemic) 위험 — F&G + macro 유동성 regime.
 * ⚠ DISPLAY-ONLY.
 */
export declare function fetchMarketRisk(): Promise<MarketRiskResult>;
