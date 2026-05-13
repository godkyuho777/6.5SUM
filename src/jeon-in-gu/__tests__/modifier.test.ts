/**
 * JEON_IN_GU Modifier — Phase 1.2 stub 동작 검증.
 *
 * 검증 항목:
 *   1. 활성 조건 (YOUTUBE_API_KEY + JEON_IN_GU_CHANNEL_ID) 미설정 시 0 반환
 *      + reason 에 "D-002" / "API keys" 문자열 포함.
 *   2. 활성 조건 충족 시에도 현재 stub 단계 → 여전히 0 반환 (Phase 3 미구현).
 *   3. side="long" / side="short" 모두 modifierValue=0, contrarianDirection="neutral".
 *   4. modifierValue 가 안전 한계 [-WEIGHT, +WEIGHT] = [-0.5, +0.5] 내.
 *   5. source 항상 "jeon_in_gu".
 *   6. isJeonInGuEnabled 가 env 두 개 모두 있을 때만 true.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeJeonInGuModifier } from "../modifier";
import { isJeonInGuEnabled, JEON_IN_GU_CONFIG } from "../constants";

const JG_KEY_VARS = [
  "YOUTUBE_API_KEY",
  "JEON_IN_GU_CHANNEL_ID",
  "ANTHROPIC_API_KEY",
  "ENABLE_JEON_IN_GU",
] as const;

let envBackup: Record<string, string | undefined> = {};

function clearJgEnv() {
  for (const k of JG_KEY_VARS) {
    delete process.env[k];
  }
}

beforeEach(() => {
  envBackup = {};
  for (const k of JG_KEY_VARS) {
    envBackup[k] = process.env[k];
  }
  clearJgEnv();
});

afterEach(() => {
  clearJgEnv();
  for (const k of JG_KEY_VARS) {
    if (envBackup[k] !== undefined) {
      process.env[k] = envBackup[k];
    }
  }
});

describe("isJeonInGuEnabled", () => {
  it("false when YOUTUBE_API_KEY 미설정", () => {
    process.env.JEON_IN_GU_CHANNEL_ID = "UCfakechannel";
    expect(isJeonInGuEnabled()).toBe(false);
  });

  it("false when JEON_IN_GU_CHANNEL_ID 미설정", () => {
    process.env.YOUTUBE_API_KEY = "fake-yt-key";
    expect(isJeonInGuEnabled()).toBe(false);
  });

  it("true when 둘 다 설정", () => {
    process.env.YOUTUBE_API_KEY = "fake-yt-key";
    process.env.JEON_IN_GU_CHANNEL_ID = "UCfakechannel";
    expect(isJeonInGuEnabled()).toBe(true);
  });
});

describe("computeJeonInGuModifier (stub)", () => {
  it("키 미설정 → modifierValue=0 + reason 에 D-002 명시", async () => {
    const r = await computeJeonInGuModifier("BTCUSDT", "long");
    expect(r.modifierValue).toBe(0);
    expect(r.contrarianDirection).toBe("neutral");
    expect(r.source).toBe("jeon_in_gu");
    expect(r.sourceCount).toBe(0);
    expect(r.decay).toBe(0);
    expect(r.reason).toMatch(/D-002|API keys|pending/i);
  });

  it("side=long stub 결과", async () => {
    const r = await computeJeonInGuModifier("BTCUSDT", "long");
    expect(r.modifierValue).toBe(0);
    expect(r.contrarianDirection).toBe("neutral");
  });

  it("side=short stub 결과", async () => {
    const r = await computeJeonInGuModifier("ETHUSDT", "short");
    expect(r.modifierValue).toBe(0);
    expect(r.contrarianDirection).toBe("neutral");
  });

  it("키 모두 설정해도 Phase 3 미구현 → 여전히 modifierValue=0", async () => {
    process.env.YOUTUBE_API_KEY = "fake-yt-key";
    process.env.JEON_IN_GU_CHANNEL_ID = "UCfakechannel";
    process.env.ANTHROPIC_API_KEY = "fake-anthropic-key";
    const r = await computeJeonInGuModifier("BTCUSDT", "long");
    expect(r.modifierValue).toBe(0);
    expect(r.source).toBe("jeon_in_gu");
    // Phase 3 가 활성되면 본 케이스의 reason 이 "stub" 외 값이 나와야 함.
    expect(r.reason).toMatch(/stub|pending/i);
  });

  it("modifierValue 항상 [-WEIGHT, +WEIGHT] 안전 한계 내", async () => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT"];
    const sides: Array<"long" | "short"> = ["long", "short"];
    for (const sym of symbols) {
      for (const side of sides) {
        const r = await computeJeonInGuModifier(sym, side);
        expect(r.modifierValue).toBeGreaterThanOrEqual(-JEON_IN_GU_CONFIG.WEIGHT);
        expect(r.modifierValue).toBeLessThanOrEqual(JEON_IN_GU_CONFIG.WEIGHT);
      }
    }
  });
});

describe("JEON_IN_GU_CONFIG", () => {
  it("핵심 임계값이 명세 §1 과 일치", () => {
    expect(JEON_IN_GU_CONFIG.WEIGHT).toBe(0.5);
    expect(JEON_IN_GU_CONFIG.MIN_CONFIDENCE).toBe(0.7);
    expect(JEON_IN_GU_CONFIG.DECAY_HOURS).toBe(36);
    expect(JEON_IN_GU_CONFIG.MIN_FINAL_CONFIDENCE).toBe(50);
    expect(JEON_IN_GU_CONFIG.FALLBACK_WEIGHT).toBe(0.2);
    expect(JEON_IN_GU_CONFIG.LLM_MODEL).toBe("claude-haiku-4-5-20251001");
  });
});
