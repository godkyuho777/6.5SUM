/**
 * BOK ECOS client tests — stub-first + fallback routing.
 * MACRO_LIQUIDITY_TRACKER_v2 §2.3.
 *
 * 본 테스트는 외부 네트워크를 호출하지 않음 — env 분기만 검증.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { fetchBOK, fetchBOKSeries } from "../sources/bok";

describe("fetchBOK — stub when BOK_API_KEY missing", () => {
  const oldKey = process.env.BOK_API_KEY;
  beforeEach(() => {
    delete process.env.BOK_API_KEY;
  });
  afterEach(() => {
    if (oldKey !== undefined) process.env.BOK_API_KEY = oldKey;
  });

  test("722Y001 (base rate) → stub (no fallback path)", async () => {
    const r = await fetchBOK({
      statCode: "722Y001",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      disableCache: true,
    });
    expect(r.status).toBe("stub");
    expect(r.values).toEqual([]);
  });

  test("901Y009 (CPI) → stub", async () => {
    const r = await fetchBOK({
      statCode: "901Y009",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      disableCache: true,
    });
    expect(r.status).toBe("stub");
  });
});

describe("fetchBOK — Yahoo fallback for 731Y004 (FX)", () => {
  const oldKey = process.env.BOK_API_KEY;
  beforeEach(() => {
    delete process.env.BOK_API_KEY;
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        chart: {
          result: [
            {
              timestamp: [1_704_067_200, 1_704_153_600],
              indicators: {
                quote: [
                  {
                    close: [1320.5, 1325.1],
                  },
                ],
              },
            },
          ],
        },
      },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (oldKey !== undefined) process.env.BOK_API_KEY = oldKey;
  });

  test("731Y004 routed to Yahoo, status=fallback", async () => {
    const r = await fetchBOK({
      statCode: "731Y004",
      startDate: "2024-01-01",
      endDate: "2024-01-02",
      disableCache: true,
    });
    expect(r.status).toBe("fallback");
    expect(r.source).toBe("yahoo");
    expect(r.values.length).toBe(2);
    expect(r.values[0].value).toBe(1320.5);
  });
});

describe("fetchBOK — graceful network failure", () => {
  const oldKey = process.env.BOK_API_KEY;
  beforeEach(() => {
    delete process.env.BOK_API_KEY;
    vi.spyOn(axios, "get").mockRejectedValue(new Error("network down"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (oldKey !== undefined) process.env.BOK_API_KEY = oldKey;
  });

  test("yahoo fallback fails → status=error, empty values, no throw", async () => {
    const r = await fetchBOK({
      statCode: "731Y004",
      startDate: "2024-01-01",
      endDate: "2024-01-02",
      disableCache: true,
    });
    expect(r.status).toBe("error");
    expect(r.values).toEqual([]);
    expect(r.detail).toContain("network down");
  });
});

describe("fetchBOKSeries — convenience alias", () => {
  const oldKey = process.env.BOK_API_KEY;
  beforeEach(() => {
    delete process.env.BOK_API_KEY;
  });
  afterEach(() => {
    if (oldKey !== undefined) process.env.BOK_API_KEY = oldKey;
  });

  test("returns just the values array", async () => {
    const v = await fetchBOKSeries("722Y001", "2024-01-01", "2024-12-31");
    expect(Array.isArray(v)).toBe(true);
    expect(v).toEqual([]);
  });
});
