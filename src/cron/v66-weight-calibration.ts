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
 * 결과 alerting (P2-#14, 2026-05-23):
 *   - health=degraded/fatal 시 Discord webhook 알림 발송 (DISCORD_WEBHOOK_URL 환경변수)
 *   - webhook 미설정 시 silent skip — 운영자가 startup-validation 로 미설정 인지
 */

import { autoCorrectThreshold, autoCorrectWeights } from "../strategies/weight-calibration";
import { childLogger } from "../_core/logger";
import { sendAlert } from "../_core/webhook-alerts";

// P2-#7 (2026-05-23): pino structured logging — Railway / Datadog parsing.
//   각 cron 실행에 jobId 부여 → log 전체에 자동 첨부 (`module: "cron:v66"`).
const log = childLogger("cron:v66");

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT"];
const TFS = ["1h", "4h", "1d"] as const;
const PATHS = ["NUM", "PTN", "BB"] as const;
const SIDES = ["long", "short"] as const;

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
export async function runWeeklyCalibration(): Promise<WeeklyCalibrationReport> {
  const startedAt = Date.now();
  // P2-#7: 각 실행마다 unique jobId — 분산 로그 추적 가능
  const jobId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `cron-${startedAt}`;
  const jobLog = log.child({ jobId, cronName: "weekly_calibration" });

  const totalCombinations =
    SYMBOLS.length * TFS.length * SIDES.length * PATHS.length;
  const weightResults: WeeklyCalibrationReport["weightResults"] = [];
  const thresholdResults: WeeklyCalibrationReport["thresholdResults"] = [];
  const errors: WeeklyCalibrationReport["errors"] = [];

  jobLog.info({ totalCombinations }, "v6.6 주간 calibration 시작");

  try {
    for (const symbol of SYMBOLS) {
      for (const tf of TFS) {
        for (const side of SIDES) {
          for (const path of PATHS) {
            try {
              const r = await autoCorrectWeights({ symbol, tf, path, side });
              weightResults.push({
                symbol,
                tf,
                path,
                side,
                source: r.source,
                status: r.status,
                saved: r.saved,
                reason: r.reason,
              });
            } catch (err) {
              const message = (err as Error)?.message ?? String(err);
              jobLog.error(
                { err, symbol, tf, path, side, kind: "weights" },
                `weights calibration failed: ${message}`,
              );
              errors.push({
                kind: "weights",
                symbol,
                tf,
                path,
                side,
                message,
              });
            }
          }

          // threshold (path 무관, side 별)
          try {
            const t = await autoCorrectThreshold({ symbol, tf, side });
            thresholdResults.push({
              symbol,
              tf,
              side,
              source: t.source,
              status: t.status,
              saved: t.saved,
              threshold: t.threshold,
              reason: t.reason,
            });
          } catch (err) {
            const message = (err as Error)?.message ?? String(err);
            jobLog.error(
              { err, symbol, tf, side, kind: "threshold" },
              `threshold calibration failed: ${message}`,
            );
            errors.push({
              kind: "threshold",
              symbol,
              tf,
              side,
              message,
            });
          }
        }
      }
    }

    const endedAt = Date.now();
    const total = weightResults.length + thresholdResults.length;
    const appliedCount = [
      ...weightResults.filter((r) => r.source !== "default" && r.saved),
      ...thresholdResults.filter((r) => r.source !== "default" && r.saved),
    ].length;
    const fallbackCount = total - appliedCount;
    const failedCount = errors.length;

    // D-5 health 분류
    const expectedTotal = totalCombinations + SYMBOLS.length * TFS.length * SIDES.length;
    let health: "ok" | "degraded" | "fatal" = "ok";
    if (failedCount >= expectedTotal) {
      health = "fatal";
    } else if (failedCount >= expectedTotal * 0.5) {
      health = "degraded";
    }

    if (health !== "ok") {
      jobLog.warn(
        { health, failedCount, expectedTotal },
        `⚠ health=${health} — ${failedCount}/${expectedTotal} combinations failed`,
      );

      // P2-#14: cron health=degraded/fatal 시 Discord webhook 알림 발송.
      // sendAlert 는 never throw — webhook 실패가 cron 흐름을 깨지 않음.
      const alertLevel = health === "fatal" ? "fatal" : "error";
      await sendAlert({
        level: alertLevel,
        source: "cron:v66",
        title: `Weekly calibration ${health}`,
        message:
          `${failedCount}/${expectedTotal} combinations failed ` +
          `(applied=${appliedCount}, fallback=${fallbackCount}).`,
        context: {
          jobId,
          failedCount,
          expectedTotal,
          appliedCount,
          fallbackCount,
          durationMs: endedAt - startedAt,
          // 첫 3개 에러만 — Discord embed field 한도 보호
          firstErrors: errors
            .slice(0, 3)
            .map((e) => `[${e.kind}] ${e.symbol ?? "-"}/${e.tf ?? "-"}: ${e.message}`)
            .join("\n"),
        },
      });
    }

    jobLog.info(
      {
        appliedCount,
        total,
        fallbackCount,
        failedCount,
        durationMs: endedAt - startedAt,
        health,
      },
      `완료. ${appliedCount}/${total} calibrated, ${fallbackCount} fallback, ${failedCount} failed`,
    );

    return {
      startedAt,
      endedAt,
      totalCombinations,
      weightResults,
      thresholdResults,
      appliedCount,
      fallbackCount,
      failedCount,
      errors,
      health,
    };
  } catch (err) {
    // D-5: outer try/catch — runWeeklyCalibration 자체 never throw
    const message = (err as Error)?.message ?? String(err);
    jobLog.fatal({ err }, `🚨 FATAL: cron 자체 실패 — ${message}`);

    errors.push({ kind: "outer", message });

    // P2-#14: outer fatal — 최우선 알림
    await sendAlert({
      level: "fatal",
      source: "cron:v66",
      title: "Weekly calibration FATAL — cron 자체 throw",
      message,
      context: {
        jobId,
        stage: "outer",
        partialResults: `${weightResults.length} weights + ${thresholdResults.length} threshold logged before crash`,
      },
    });

    return {
      startedAt,
      endedAt: Date.now(),
      totalCombinations,
      weightResults,
      thresholdResults,
      appliedCount: 0,
      fallbackCount: weightResults.length + thresholdResults.length,
      failedCount: errors.length,
      errors,
      fatalError: message,
      health: "fatal",
    };
  }
}
