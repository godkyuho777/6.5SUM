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
/**
 * z-score → modifier value 매핑.
 *
 * 거래소 netflow (BTC) — z 가 양수면 거래소로 유입 (매도 압력),
 * 음수면 거래소에서 유출 (보유/축적 의향).
 *
 *   z >= +2  → -0.25  (강한 유입, 매도 압력)
 *   z >= +1  → -0.10  (선형 보간)
 *   z <= -2  → +0.20  (강한 유출, 보유 의향)
 *   z <= -1  → +0.10  (선형 보간)
 *   |z| < 1  → 0  (중립)
 *
 * @internal — 테스트용 export.
 */
export declare function applyNetflowZscoreThreshold(z: number): number;
export declare function computeExchangeNetflow(symbol: string): Promise<OnchainModifierResult>;
export declare function computeWhaleAlert(symbol: string): Promise<OnchainModifierResult>;
export declare function computeEtfFlow(symbol: string): Promise<OnchainModifierResult>;
/**
 * Miner outflow z-score → modifier value 매핑.
 *
 * 채굴자 outflow (BTC) — 7d 합산을 30d 분포 대비 z-score 화. z 가 양수면
 * 채굴자가 평소보다 많이 출금 (거래소 이동 → 매도 압력 가능), 음수면 보유 의향.
 *
 *   z >= +2    → -0.15  (강한 매도 압력)
 *   z >= +1    → -0.05  (약한 매도 압력)
 *   z <= -1.5  → +0.10  (채굴자 holding, 공급 축소)
 *   그 외       → 0  (중립)
 *
 * @internal — 테스트용 export.
 */
export declare function applyMinerOutflowZscoreThreshold(z: number): number;
export declare function computeMinerOutflow(symbol: string): Promise<OnchainModifierResult>;
/**
 * LTH supply 30d 변화율 → modifier value 매핑.
 *
 * Long-Term Holder supply 의 30일 변화율 (소수, 예: 0.05 = +5%).
 * 양수면 장기 보유자 축적 (공급 잠김 → bullish), 음수면 분배 (매도 → bearish).
 *
 *   >= +2%  → +0.10  (강한 축적, cap)
 *   <= -2%  → -0.15  (강한 분배, cap)
 *   작은 양수 → value × 5  로 선형 보간 (+0.02 에서 +0.10 cap 도달)
 *   작은 음수 → value × 7.5 로 선형 보간 (-0.02 에서 -0.15 cap 도달)
 *   0       → 0
 *
 * @internal — 테스트용 export.
 */
export declare function applyLthSupplyChangeThreshold(changePct: number): number;
export declare function computeLthSupply(symbol: string): Promise<OnchainModifierResult>;
export declare const __testing: {
    simpleHash: typeof simpleHash;
    hashUnit: typeof hashUnit;
    mockValue: typeof mockValue;
    isMockMode: typeof isMockMode;
    applyNetflowZscoreThreshold: typeof applyNetflowZscoreThreshold;
    applyMinerOutflowZscoreThreshold: typeof applyMinerOutflowZscoreThreshold;
    applyLthSupplyChangeThreshold: typeof applyLthSupplyChangeThreshold;
};
export {};
