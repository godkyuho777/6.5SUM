/**
 * macro/cache-policy.ts unit tests (P2-#13, 2026-05-23).
 */

import { describe, test, expect } from "vitest";
import { MACRO_CACHE_TTL, isMacroCacheExpired } from "../cache-policy";

describe("MACRO_CACHE_TTL — production default", () => {
  test("realtime = 12h", () => {
    expect(MACRO_CACHE_TTL.realtime).toBe(12 * 60 * 60 * 1000);
  });

  test("backtestVintage = 영구 (Infinity)", () => {
    expect(MACRO_CACHE_TTL.backtestVintage).toBe(Number.POSITIVE_INFINITY);
  });

  test("intraday = 1h", () => {
    expect(MACRO_CACHE_TTL.intraday).toBe(60 * 60 * 1000);
  });

  test("fallback = 6h", () => {
    expect(MACRO_CACHE_TTL.fallback).toBe(6 * 60 * 60 * 1000);
  });
});

describe("isMacroCacheExpired", () => {
  test("realtime: 12h 미만은 valid", () => {
    const mtime = Date.now() - 6 * 60 * 60 * 1000; // 6h 전
    expect(isMacroCacheExpired(mtime, "realtime")).toBe(false);
  });

  test("realtime: 12h 초과 = expired", () => {
    const mtime = Date.now() - 13 * 60 * 60 * 1000; // 13h 전
    expect(isMacroCacheExpired(mtime, "realtime")).toBe(true);
  });

  test("backtestVintage: 어떤 mtime 도 expired 안 됨 (영구)", () => {
    const ancientMtime = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1년 전
    expect(isMacroCacheExpired(ancientMtime, "backtestVintage")).toBe(false);
  });

  test("intraday: 1h 초과 = expired", () => {
    const mtime = Date.now() - 90 * 60 * 1000; // 90분 전
    expect(isMacroCacheExpired(mtime, "intraday")).toBe(true);
  });

  test("intraday: 30분 = valid", () => {
    const mtime = Date.now() - 30 * 60 * 1000;
    expect(isMacroCacheExpired(mtime, "intraday")).toBe(false);
  });

  test("fallback: 7h = expired (TTL 6h)", () => {
    const mtime = Date.now() - 7 * 60 * 60 * 1000;
    expect(isMacroCacheExpired(mtime, "fallback")).toBe(true);
  });

  test("default tier = realtime", () => {
    const mtime = Date.now() - 6 * 60 * 60 * 1000;
    // tier 미지정 → realtime 으로 처리
    expect(isMacroCacheExpired(mtime)).toBe(false);
  });
});
