/**
 * env-driven stub modifiers
 *
 * 다음 5개 modifier 는 외부 API 키가 필요하므로, 키 미설정 시 status="stub"
 * value=0 을 반환하여 BBDX 점수에 영향이 없도록 한다. 키가 설정되면 자동으로
 * 진짜 호출 경로가 활성화되며, 명세서의 임계값/공식이 그대로 적용된다.
 *
 * 환경 변수:
 *   CRYPTOQUANT_API_KEY  → exchange_netflow, miner_outflow
 *   WHALE_ALERT_API_KEY  → whale_alert
 *   GLASSNODE_API_KEY    → lth_supply
 *   ETF_FLOW_PROVIDER    → etf_flow ("farside" 면 스크래핑, 미설정이면 stub)
 *
 * 각 함수는 명세서의 임계값을 그대로 적용한다. 진짜 호출 경로는 v1 에서
 * "key 있으면 호출, 없으면 stub" 만 분기. 실제 구현은 키 발급 후 한 곳에서.
 */
import type { OnchainModifierResult } from "./types";
export declare function computeExchangeNetflow(symbol: string): Promise<OnchainModifierResult>;
export declare function computeWhaleAlert(symbol: string): Promise<OnchainModifierResult>;
export declare function computeEtfFlow(symbol: string): Promise<OnchainModifierResult>;
export declare function computeMinerOutflow(symbol: string): Promise<OnchainModifierResult>;
export declare function computeLthSupply(symbol: string): Promise<OnchainModifierResult>;
