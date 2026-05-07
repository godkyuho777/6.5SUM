import { describe, expect, test } from "vitest";

import { computeConfluence } from "../multi-path-confluence";

describe("computeConfluence", () => {
  test("empty array → 1.0 (no boost)", () => {
    expect(computeConfluence([])).toBe(1.0);
  });

  test("1 path → 1.00", () => {
    expect(computeConfluence(["NUM"])).toBe(1.0);
  });

  test("2 paths → 1.10", () => {
    expect(computeConfluence(["NUM", "PTN"])).toBe(1.1);
  });

  test("3 paths → 1.20", () => {
    expect(computeConfluence(["NUM", "PTN", "BB"])).toBeCloseTo(1.2, 5);
  });

  test("4+ paths clamped to 1.20", () => {
    expect(computeConfluence(["A", "B", "C", "D"])).toBe(1.2);
    expect(computeConfluence(["A", "B", "C", "D", "E"])).toBe(1.2);
  });

  test("duplicates are de-duped", () => {
    expect(computeConfluence(["NUM", "NUM"])).toBe(1.0);
    expect(computeConfluence(["NUM", "PTN", "NUM"])).toBe(1.1);
  });
});
