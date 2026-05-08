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
 *   ONCHAIN_MOCK         → "1" 이면 키 미설정 stub 자리에 결정론 mock 값 주입
 *                          (UI 시각화 검증 용도. status="mock" 으로 식별).
 *
 * 각 함수는 명세서의 임계값을 그대로 적용한다. 진짜 호출 경로는 v1 에서
 * "key 있으면 호출, 없으면 stub" 만 분기. 실제 구현은 키 발급 후 한 곳에서.
 *
 * Mock 모드 우선순위:
 *   1. 실제 API 키 존재 → 실데이터 경로 (TBD, 현재는 stub 그대로 반환)
 *   2. ONCHAIN_MOCK=1 → 결정론 mock (symbol+key hash 기반)
 *   3. 그 외 → status: "stub", value: 0
 */
import type { OnchainModifierKey, OnchainModifierResult } from "./types";
/**
 * 결정론적 32-bit 해시 (FNV-1a 변형). 같은 입력은 항상 같은 출력.
 * symbol+modifierKey 조합으로 modifier 마다 다른 mock 값이 나오도록 한다.
 */
declare function simpleHash(input: string): number;
/** [0, 1) 범위 결정론 0~1 float. */
declare function hashUnit(input: string): number;
/**
 * Mock 값 산출 — 각 modifier 의 정상 ±max 한계 내에서 결정론적으로 분포.
 * coin 마다 다른 값이 나오도록 symbol+key 를 모두 해시 입력으로 사용.
 *
 * 분포: |signed| < 0.1 인 영역은 0 (영향 없음) 으로 dead-zone 처리,
 *       나머지는 [-maxAbs, +maxAbs] 정상 분포.
 * 시각화 용도로 코인마다 색이 다르게 나오도록 한다.
 */
declare function mockValue(symbol: string, key: OnchainModifierKey, maxAbs: number): number;
declare function isMockMode(): boolean;
export declare function computeExchangeNetflow(symbol: string): Promise<OnchainModifierResult>;
export declare function computeWhaleAlert(symbol: string): Promise<OnchainModifierResult>;
export declare function computeEtfFlow(symbol: string): Promise<OnchainModifierResult>;
export declare function computeMinerOutflow(symbol: string): Promise<OnchainModifierResult>;
export declare function computeLthSupply(symbol: string): Promise<OnchainModifierResult>;
export declare const __testing: {
    simpleHash: typeof simpleHash;
    hashUnit: typeof hashUnit;
    mockValue: typeof mockValue;
    isMockMode: typeof isMockMode;
};
export {};
