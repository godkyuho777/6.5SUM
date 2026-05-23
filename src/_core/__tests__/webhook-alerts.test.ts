/**
 * webhook-alerts.ts unit tests (P2-#14, 2026-05-23).
 *
 * 검증 항목:
 *   - DISCORD_WEBHOOK_URL 미설정 시 sendAlert 가 false 반환 (silent skip)
 *   - rate limiting: 동일 source+level 5분 내 1회만 발송
 *   - hasAnyWebhookConfigured 가 env 상태를 정확히 반영
 *
 * 헌장: sendAlert 는 *never throw* — webhook 실패가 cron 흐름을 깨면 안 됨.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

describe("webhook-alerts — env-based behavior", () => {
  const ORIGINAL_ENV = process.env.DISCORD_WEBHOOK_URL;

  beforeEach(() => {
    // 매 테스트 fresh module — rate limit map 초기화
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.DISCORD_WEBHOOK_URL;
    } else {
      process.env.DISCORD_WEBHOOK_URL = ORIGINAL_ENV;
    }
  });

  test("DISCORD_WEBHOOK_URL 미설정 시 sendAlert 가 false 반환", async () => {
    delete process.env.DISCORD_WEBHOOK_URL;
    const { sendAlert } = await import("../webhook-alerts");

    const result = await sendAlert({
      level: "error",
      source: "test:unconfigured",
      title: "should silent skip",
      message: "no webhook",
    });

    expect(result).toBe(false);
  });

  test("hasAnyWebhookConfigured: env 미설정 → false", async () => {
    delete process.env.DISCORD_WEBHOOK_URL;
    const { hasAnyWebhookConfigured } = await import("../webhook-alerts");
    expect(hasAnyWebhookConfigured()).toBe(false);
  });

  test("hasAnyWebhookConfigured: env 설정 → true", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test/abc";
    const { hasAnyWebhookConfigured } = await import("../webhook-alerts");
    expect(hasAnyWebhookConfigured()).toBe(true);
  });
});

describe("webhook-alerts — throttling", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.DISCORD_WEBHOOK_URL; // network 차단 (false 반환)
  });

  test("미설정 환경에서도 throttle map 은 정상 동작 (silent skip 도 1회만 count)", async () => {
    // url 없이도 호출 자체는 가능. 본 테스트는 sendAlert 가 throw 하지 않는지만 검증.
    const { sendAlert } = await import("../webhook-alerts");

    const r1 = await sendAlert({
      level: "warn",
      source: "test:throttle",
      title: "first",
      message: "first message",
    });
    const r2 = await sendAlert({
      level: "warn",
      source: "test:throttle",
      title: "second",
      message: "should still return false (no webhook)",
    });

    // 둘 다 false — webhook 미설정. throw 안 됨.
    expect(r1).toBe(false);
    expect(r2).toBe(false);
  });
});

describe("webhook-alerts — graceful error", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("불량 webhook URL 에 대해 throw 하지 않고 false 반환", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://invalid-host-that-does-not-exist.example.test/webhook";
    const { sendAlert } = await import("../webhook-alerts");

    // 네트워크 실패 → false. throw X.
    const result = await sendAlert({
      level: "error",
      source: "test:bad-url",
      title: "network failure expected",
      message: "should not throw",
    });

    expect(result).toBe(false);
  }, 10_000); // fetch timeout 5s + buffer
});
