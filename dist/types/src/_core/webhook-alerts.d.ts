/**
 * Webhook alerts (P2-#14, 2026-05-23).
 *
 * AUDIT.md 권장: cron 의 graceful failure 가 console log 만 남기고 운영자가
 * 모를 수 있음 → Discord webhook 알림 발송.
 *
 * 정책:
 *   - DISCORD_WEBHOOK_URL 환경변수로 활성화 (선택)
 *   - 미설정 시 silent skip (production 차단 X)
 *   - level: "info" / "warn" / "error" / "fatal"
 *   - rate limit: 동일 source + level 5분 내 중복 알림 차단
 *
 * 사용 예:
 *   await sendAlert({
 *     level: "error",
 *     source: "cron:v66",
 *     title: "Weekly calibration 부분 실패",
 *     message: "5/60 combinations failed",
 *     context: { failedCount: 5, totalCount: 60 },
 *   });
 *
 * 헌장: 본 알림은 *운영 모니터링* 용도 — 사용자 facing 기능 아님.
 */
type AlertLevel = "info" | "warn" | "error" | "fatal";
interface AlertParams {
    level: AlertLevel;
    source: string;
    title: string;
    message: string;
    context?: Record<string, unknown>;
}
/**
 * Webhook alert 발송 (지원되는 모든 채널). 현재는 Discord 만.
 *
 * @returns true = 1개 이상 채널로 발송 성공, false = throttled / 실패
 */
export declare function sendAlert(params: AlertParams): Promise<boolean>;
/**
 * Slack/Discord 등 어느 webhook 도 설정 안 되어 있는지 확인 (startup-validation 용).
 */
export declare function hasAnyWebhookConfigured(): boolean;
export {};
