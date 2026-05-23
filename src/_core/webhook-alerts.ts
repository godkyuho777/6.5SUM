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

import { childLogger } from "./logger";

const log = childLogger("webhook");

type AlertLevel = "info" | "warn" | "error" | "fatal";

interface AlertParams {
  level: AlertLevel;
  source: string;
  title: string;
  message: string;
  context?: Record<string, unknown>;
}

// ─── Rate limiting ─────────────────────────────────────────

/** 동일 source + level 알림은 5분 내 1회만 발송 (스팸 방지) */
const RATE_LIMIT_MS = 5 * 60 * 1000;
const lastSentMap = new Map<string, number>();

function shouldThrottle(source: string, level: AlertLevel): boolean {
  const key = `${source}:${level}`;
  const last = lastSentMap.get(key) ?? 0;
  const now = Date.now();
  if (now - last < RATE_LIMIT_MS) return true;
  lastSentMap.set(key, now);
  return false;
}

// ─── Discord webhook ───────────────────────────────────────

const LEVEL_COLORS: Record<AlertLevel, number> = {
  info: 0x00bfff, // cyan
  warn: 0xffa500, // orange
  error: 0xff4444, // red
  fatal: 0x8b0000, // dark red
};

const LEVEL_EMOJIS: Record<AlertLevel, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "🚨",
  fatal: "💀",
};

/**
 * Discord webhook 으로 알림 발송.
 *
 * 절대 throw X — webhook 실패가 호출자 (cron 등) 흐름을 깨면 안 됨.
 */
async function sendDiscordWebhook(params: AlertParams): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;

  const payload = {
    username: "Tradelab Alert",
    avatar_url:
      "https://raw.githubusercontent.com/tradelab-hq/tradelab-frontend/main/public/favicon.ico",
    embeds: [
      {
        title: `${LEVEL_EMOJIS[params.level]} ${params.title}`,
        description: params.message,
        color: LEVEL_COLORS[params.level],
        fields: [
          { name: "Source", value: params.source, inline: true },
          { name: "Level", value: params.level.toUpperCase(), inline: true },
          { name: "Time", value: new Date().toISOString(), inline: true },
          ...(params.context
            ? Object.entries(params.context)
                .slice(0, 10) // Discord embed 25 fields limit
                .map(([k, v]) => ({
                  name: k,
                  value: String(v).slice(0, 1024), // Discord field value 1024 char limit
                  inline: false,
                }))
            : []),
        ],
        footer: {
          text: `Tradelab Backend · ${process.env.NODE_ENV ?? "unknown"} · ${
            process.env.RAILWAY_GIT_BRANCH ?? process.env.BACKEND_BRANCH ?? "local"
          }`,
        },
      },
    ],
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      log.warn(
        { status: response.status, source: params.source },
        "Discord webhook returned non-2xx",
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn({ err, source: params.source }, "Discord webhook fetch failed");
    return false;
  }
}

// ─── Public API ────────────────────────────────────────────

/**
 * Webhook alert 발송 (지원되는 모든 채널). 현재는 Discord 만.
 *
 * @returns true = 1개 이상 채널로 발송 성공, false = throttled / 실패
 */
export async function sendAlert(params: AlertParams): Promise<boolean> {
  if (shouldThrottle(params.source, params.level)) {
    log.info(
      { source: params.source, level: params.level },
      "alert throttled (5min cooldown)",
    );
    return false;
  }
  // 향후 Slack / Telegram 추가 가능 — 현재는 Discord 만
  return sendDiscordWebhook(params);
}

/**
 * Slack/Discord 등 어느 webhook 도 설정 안 되어 있는지 확인 (startup-validation 용).
 */
export function hasAnyWebhookConfigured(): boolean {
  return !!process.env.DISCORD_WEBHOOK_URL;
}
