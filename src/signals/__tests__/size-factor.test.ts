import { describe, expect, test } from "vitest";

import { computeSizeFactor } from "../size-factor";

describe("computeSizeFactor — boundary cases", () => {
  test("39 → reject", () => {
    expect(computeSizeFactor(39)).toBe("reject");
  });
  test("40 → small (lower boundary inclusive)", () => {
    expect(computeSizeFactor(40)).toBe("small");
  });
  test("59 → small", () => {
    expect(computeSizeFactor(59)).toBe("small");
  });
  test("60 → normal", () => {
    expect(computeSizeFactor(60)).toBe("normal");
  });
  test("100 → normal", () => {
    expect(computeSizeFactor(100)).toBe("normal");
  });

  test("0 → reject", () => {
    expect(computeSizeFactor(0)).toBe("reject");
  });

  test("non-finite → reject", () => {
    expect(computeSizeFactor(NaN)).toBe("reject");
    expect(computeSizeFactor(Infinity)).toBe("reject");
  });
});
