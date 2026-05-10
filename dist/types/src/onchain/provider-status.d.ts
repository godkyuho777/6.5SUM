/**
 * Onchain Provider Status — P1-#4 (2026-05-10).
 *
 * Audit `02-ONCHAIN-AUDIT.md` §2 의 "5/7 modifier stub" 가시화.
 * 사용자가 라이브 환경에서 어떤 onchain modifier 가 실데이터로 작동하고
 * 어떤 게 stub/mock 인지 명확히 알 수 있도록 status 를 운영시점에 노출.
 *
 * 사용처:
 *   - `routers.ts` `onchain.providerStatus` tRPC procedure (프론트엔드 surface)
 *   - 백테스트 시작 시 console 로그 (헌장 R2 알파 측정 시점에 컨텍스트 노출)
 *   - admin/health endpoint (운영자 검증)
 *
 * 헌장 R2 (백테스트 알파):
 *   stub modifier 가 알파 측정에 영향을 주지 않도록 명시 — Wilson CI 결과
 *   해석 시 "modifier=0 환경의 baseline" 을 의미.
 */
import type { OnchainModifierKey } from "./types";
/** Modifier 의 데이터 소스 모드. */
export type ProviderMode = "real" | "stub" | "mock" | "partial";
export interface ProviderStatus {
    key: OnchainModifierKey;
    /** 사람이 읽을 수 있는 라벨. */
    label: string;
    mode: ProviderMode;
    /** 어떤 환경변수 / 외부 source 가 필요한지. */
    requires: string;
    /** 활성화 조건 detail. */
    detail: string;
}
/**
 * 현재 환경에서 각 modifier 의 provider 상태 산출.
 *
 * 환경변수 검사:
 *   - `CRYPTOQUANT_API_KEY` → exchange_netflow / miner_outflow real
 *   - `WHALE_ALERT_API_KEY` → whale_alert real
 *   - `GLASSNODE_API_KEY` → lth_supply real
 *   - `ETF_FLOW_PROVIDER=farside` → etf_flow scraping 활성
 *   - `ONCHAIN_MOCK=1` → stub 자리에 mock 값 주입
 */
export declare function getOnchainProviderStatus(): ProviderStatus[];
/** real / stub / mock 카운트 요약. */
export declare function summarizeProviderStatus(): {
    total: number;
    real: number;
    mock: number;
    stub: number;
    partial: number;
    /** 헌장 R2 알파 측정에 *영향 있는* modifier 갯수 (real + mock). */
    effective: number;
};
/**
 * 백테스트 시작 시 권고 헬퍼 — Wilson CI 결과 해석 시 컨텍스트 출력.
 *
 * 출력 예시:
 *   "[Onchain] effective=2/7 (real=2, mock=0, stub=5).
 *    백테스트 alpha 는 *5개 modifier 미작동 환경의 baseline*.
 *    ONCHAIN_MOCK=1 또는 외부 키 설정 시 추가 alpha 측정 가능."
 */
export declare function describeProviderStatusForBacktest(): string;
