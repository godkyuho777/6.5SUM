/**
 * JEON_IN_GU Signal Tracker — 상수 + Feature gate.
 *
 * 명세: JEON_IN_GU_SIGNAL_TRACKER.md §1.
 *
 * Phase 1.2 (env 등록 / Feature Flag) 만 본 파일에서 활성. 실제 호출 경로
 * (Phase 1.3 ~ 7) 는 외부 의존성 대기 (D-002).
 *
 * ⚠️ 가중치 ±0.50 = BBDX 100점 시스템 의 최대 ±50점 영향. 안전 장치 4개
 * (confidence ≥ 0.7, 36h decay, BBDX 최종 ≥ 50, 매주 auto-calibration)
 * 를 모든 활성 경로에서 반드시 검증.
 */
export declare const JEON_IN_GU_CONFIG: {
    /** ±0.50 가중치 — BBDX 100점 시스템에서 최대 ±50점 영향. */
    readonly WEIGHT: 0.5;
    /** sentiment_confidence 임계. < 0.7 이면 modifier 산출 X. */
    readonly MIN_CONFIDENCE: 0.7;
    /** 콘텐츠 publishedAt 이후 N 시간 까지만 modifier 영향. */
    readonly DECAY_HOURS: 36;
    /** BBDX final_confidence 임계. < 50 이면 진입 차단. */
    readonly MIN_FINAL_CONFIDENCE: 50;
    /** 매주 자동 calibration 활성. R² < 0.10 시 가중치 자동 감소. */
    readonly AUTO_CALIBRATION_ENABLED: true;
    readonly CALIBRATION_INTERVAL_DAYS: 7;
    /** R² 임계 — Phase 5 calibration cron 사용. */
    readonly ALPHA_THRESHOLD: 0.1;
    /** alpha 검증 실패 시 자동 하향 단계 — 0.50 → 0.40 → 0.30 → FALLBACK 0.20. */
    readonly FALLBACK_WEIGHT: 0.2;
    /** Phase 1.5 cron 폴링 주기 (분). */
    readonly POLLING_INTERVAL_MINUTES: 5;
    /** Phase 2 LLM 분류 모델. */
    readonly LLM_MODEL: "claude-haiku-4-5-20251001";
    /** transcript 토큰 절약 — 8000자 제한. */
    readonly TRANSCRIPT_MAX_LENGTH: 8000;
};
/**
 * 본 트래커가 production 호출 경로를 활성화할 조건.
 *
 * 두 개의 핵심 env (`YOUTUBE_API_KEY` + `JEON_IN_GU_CHANNEL_ID`) 가 모두 있어야
 * Phase 1.3 (수집) ~ Phase 3 (modifier 산출) 경로가 깨어난다. 둘 중 하나라도
 * 비어있으면 stub modifier 가 0 을 반환 (BBDX 점수에 영향 없음).
 *
 * Phase 2 (LLM 분류) 는 `ANTHROPIC_API_KEY` 추가 필요. 본 함수는 그것까지
 * 검사하지 않고 데이터 수집 가능 여부만 확인 — Phase 별 활성 조건은
 * 각 모듈에서 별도 검사.
 */
export declare function isJeonInGuEnabled(): boolean;
