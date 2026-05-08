/**
 * Stablecoin Supply Ratio (SSR) modifier
 *
 *   SSR = BTC 시총 / (USDT + USDC + DAI 시총)
 *     z < -1.5 → +0.15 (매수 대기 자금 풍부 = 바닥 신호)
 *     z < -0.5 → +0.05
 *     z > +1.5 → -0.20 (매수 여력 부족 = 천장 신호)
 *     z > +0.5 → -0.05
 *
 * 90일 이동평균/표준편차로 z-score 계산.
 *
 * 데이터 소스:
 *   - CoinGecko Free: /coins/markets?ids=bitcoin,tether,usd-coin,dai
 *   - 키 불필요. rate limit ~30 req/min (in-memory 5분 캐시로 회피).
 *
 * 명세서가 90일 SSR 시계열을 요구하지만 무료 CoinGecko 는 최근 marketcap 만
 * 1시간 단위로 반환. 90일 통계는 in-memory 누적치(rolling buffer)로 근사.
 * 첫 호출 시 90일 buffer 가 비어있으므로 보수적 z=0 (영향 없음) 처리.
 */
import type { OnchainModifierResult } from "./types";
export declare function computeSSR(): Promise<OnchainModifierResult>;
