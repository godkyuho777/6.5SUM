/**
 * v6.6 Weight + Threshold Calibration — 주간 cron (WEIGHT_SYSTEM §2.4).
 *
 * 본 모듈은 cron 로직만 제공. 실제 스케줄 활성화는 별도 작업 (production 인프라
 * 결정 후). 권고 옵션:
 *   - node-cron 설치 후 `'0 14 * * 0'` (매주 일요일 14:00 UTC = 23:00 KST)
 *   - GitHub Actions schedule (cron syntax 동일, server-less)
 *   - Railway cron job
 *
 * 본 cron 은 자체 백테스트 signalsFetch 를 제공하지 않으므로 (Bybit fetch 비용 ↑)
 * 모든 (symbol, tf, path, side) 조합에 대해 external manifest → default fallback
 * 적용. 자체 백테스트 기반 calibration 은 별도 CLI (cli-compare-v65-v66.ts) 또는
 * admin 수동 트리거에서 처리.
 *
 * 결과 alerting: 텔레그램/Discord 미구현. console.log 만 — production 시 별도 추가.
 */
export interface WeeklyCalibrationReport {
    startedAt: number;
    endedAt: number;
    totalCombinations: number;
    weightResults: {
        symbol: string;
        tf: string;
        path: string;
        side: string;
        source: string;
        status: string;
        saved: boolean;
        reason: string;
    }[];
    thresholdResults: {
        symbol: string;
        tf: string;
        side: string;
        source: string;
        status: string;
        saved: boolean;
        threshold: number;
        reason: string;
    }[];
    appliedCount: number;
    fallbackCount: number;
    /** D-5 (2026-05-12): 실패한 조합 상세 — graceful 추적. */
    failedCount: number;
    errors: Array<{
        kind: "weights" | "threshold" | "outer";
        symbol?: string;
        tf?: string;
        path?: string;
        side?: string;
        message: string;
    }>;
    /** D-5: 전체 fatal error (outer try/catch — runWeeklyCalibration 자체는 never throw). */
    fatalError?: string;
    /** D-5: 50% 이상 실패 시 'degraded', 100% 시 'fatal'. */
    health: "ok" | "degraded" | "fatal";
}
/**
 * runWeeklyCalibration — 모든 조합 calibration 시도.
 *
 * 호출 시점: cron / 수동 admin trigger / CLI.
 *
 * D-5 (2026-05-12): graceful failure 강화.
 *   - 외부 try/catch 추가 → runWeeklyCalibration *never throw*
 *   - 개별 실패 (weights/threshold) 는 errors[] 에 누적
 *   - 50% 이상 실패 시 health=degraded, 100% 시 health=fatal
 *   - production cron 이 실패해도 다음 주 cron 까지 영향 X
 */
export declare function runWeeklyCalibration(): Promise<WeeklyCalibrationReport>;
