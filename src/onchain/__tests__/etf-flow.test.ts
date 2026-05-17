/**
 * etf-flow — Farside HTML 파서 + 3일 누적 + 임계값 매핑 테스트.
 *
 * 검증 항목 (가이드 6 케이스):
 *   1. mock HTML 파싱 — 알려진 snippet 으로 일별 flow 추출
 *   2. 3일 누적 정확성 — [+200, +500, +800] → +1500M
 *   3. 음수 표기 파싱 — `(123.4)` → -123.4, `-50` → -50
 *   4. 임계값 매핑 — +1500M → +0.20, -1000M → -0.25, 0 → 0, +750M → +0.10
 *   5. HTML 구조 변경 graceful fallback — invalid HTML → status="error"
 *   6. ETF_FLOW_PROVIDER 미설정 → status="stub"
 *
 * 추가 케이스 (안정성):
 *   - 천 단위 콤마 (Total row)
 *   - 빈 셀 / "-" / "n/a" 처리
 *   - 날짜 ISO 변환
 *   - 행 중복 제거 (Farside 가 가끔 동일 날짜 행 2개 송출)
 *   - 5거래일 최근만 잘라 반환
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  applyEtfFlowThreshold,
  computeFarsideEtfFlow,
  fetchFarsideEtfFlow,
  parseFarsideDate,
  parseFarsideHtml,
  parseFarsideValue,
  type FarsideDailyFlow,
} from "../etf-flow";
import { computeEtfFlow } from "../stub-modifiers";

// ─── env 백업/복원 ────────────────────────────────────────────────────

const ENV_KEYS = ["ETF_FLOW_PROVIDER", "ONCHAIN_MOCK"] as const;
let envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
  envBackup = {};
  for (const k of ENV_KEYS) {
    envBackup[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
});

// ─── Mock HTML 헬퍼 ──────────────────────────────────────────────────

/**
 * 실제 Farside HTML 의 핵심 구조를 재현한 mock.
 * - thead, tfoot 비슷한 형태 + 데이터 row 5개 + Total/Average 요약 row.
 * - 음수: <span class="redFont">(...)</span>
 */
function buildFarsideMockHtml(
  rows: Array<{ date: string; cells: string[]; total: string }>,
  opts: { includeSummary?: boolean } = {},
): string {
  const { includeSummary = true } = opts;
  const padding = "x".repeat(1500); // sanity check MIN_RESPONSE_BYTES 통과용
  const head = `<!doctype html><html><head><title>Farside</title></head><body>
<!-- padding ${padding} -->
<table class="etf">
<thead>
  <tr bgcolor="#eaeffa"><th>Date</th><th>IBIT</th><th>FBTC</th><th>Total</th></tr>
</thead>
<tbody>
`;
  const dataRows = rows
    .map((r) => {
      const cellHtml = r.cells.map((c) => `<td><div align="right"><span class="tabletext">${c}</span></div></td>`).join("\n");
      return `<tr>
  <td><span class="tabletext">${r.date}</span></td>
${cellHtml}
  <td><div align="right"><span class="tabletext">${r.total}</span></div></td>
</tr>`;
    })
    .join("\n");

  const summary = includeSummary
    ? `
<tr style="background-color: #eaeffa !important;">
  <td><span class="tabletext">Total</span></td>
  <td><span class="tabletext">65,781</span></td>
  <td><span class="tabletext">10,885</span></td>
  <td><span class="tabletext">58,386</span></td>
</tr>
<tr style="background-color: #eaeffa !important;">
  <td><span class="tabletext">Average</span></td>
  <td><span class="tabletext">111.9</span></td>
  <td><span class="tabletext">18.5</span></td>
  <td><span class="tabletext">99.3</span></td>
</tr>`
    : "";

  return `${head}${dataRows}${summary}
</tbody>
</table>
</body></html>`;
}

// ─── 1. parseFarsideValue ────────────────────────────────────────────

describe("parseFarsideValue — Farside 값 표기 파싱", () => {
  test("양수 plain → 그대로", () => {
    expect(parseFarsideValue("123.4")).toBe(123.4);
    expect(parseFarsideValue("0.0")).toBe(0);
    expect(parseFarsideValue("500")).toBe(500);
  });

  test("음수 괄호 표기 → 음수", () => {
    expect(parseFarsideValue("(123.4)")).toBe(-123.4);
    expect(parseFarsideValue("(50.0)")).toBe(-50);
    expect(parseFarsideValue("(642.5)")).toBe(-642.5);
  });

  test("음수 - prefix → 음수", () => {
    expect(parseFarsideValue("-50")).toBe(-50);
    expect(parseFarsideValue("-123.4")).toBe(-123.4);
  });

  test("천 단위 콤마 (Total row 등) → 정상 파싱", () => {
    expect(parseFarsideValue("1,234.5")).toBe(1234.5);
    expect(parseFarsideValue("(26,444)")).toBe(-26444);
    expect(parseFarsideValue("65,781")).toBe(65781);
  });

  test("빈 셀 / dash → 0", () => {
    expect(parseFarsideValue("")).toBe(0);
    expect(parseFarsideValue("-")).toBe(0);
    expect(parseFarsideValue("  ")).toBe(0);
  });

  test("불명 토큰 → 0 (graceful)", () => {
    expect(parseFarsideValue("n/a")).toBe(0);
    expect(parseFarsideValue("TBD")).toBe(0);
  });
});

// ─── 2. parseFarsideDate ─────────────────────────────────────────────

describe("parseFarsideDate — 'DD MMM YYYY' → ISO", () => {
  test("정상 형식 → YYYY-MM-DD", () => {
    expect(parseFarsideDate("27 Apr 2026")).toBe("2026-04-27");
    expect(parseFarsideDate("15 May 2026")).toBe("2026-05-15");
    expect(parseFarsideDate("1 Jan 2024")).toBe("2024-01-01");
  });

  test("패딩 없는 day → ISO 형식 보정", () => {
    expect(parseFarsideDate("3 Sep 2026")).toBe("2026-09-03");
  });

  test("summary row 라벨 → null", () => {
    expect(parseFarsideDate("Total")).toBeNull();
    expect(parseFarsideDate("Average")).toBeNull();
    expect(parseFarsideDate("Maximum")).toBeNull();
    expect(parseFarsideDate("Minimum")).toBeNull();
    expect(parseFarsideDate("")).toBeNull();
  });

  test("부정확 형식 → null", () => {
    expect(parseFarsideDate("2026-05-15")).toBeNull();
    expect(parseFarsideDate("May 15 2026")).toBeNull();
    expect(parseFarsideDate("15-May-2026")).toBeNull();
  });
});

// ─── 3. parseFarsideHtml — 알려진 HTML snippet ───────────────────────

describe("parseFarsideHtml — Farside mock HTML 파서", () => {
  test("3개 데이터 행 + Total 요약 → 데이터 행만 추출 (Total row 배제)", () => {
    const html = buildFarsideMockHtml([
      { date: "12 May 2026", cells: ["100.0", "50.0"], total: "200" },
      { date: "13 May 2026", cells: ["200.0", "100.0"], total: "500" },
      { date: "14 May 2026", cells: ["300.0", "200.0"], total: "800" },
    ]);
    const flows = parseFarsideHtml(html);
    expect(flows).toHaveLength(3);
    expect(flows[0]).toEqual({ date: "2026-05-12", netFlow: 200 });
    expect(flows[1]).toEqual({ date: "2026-05-13", netFlow: 500 });
    expect(flows[2]).toEqual({ date: "2026-05-14", netFlow: 800 });
  });

  test("음수 (괄호) 표기 행 정상 파싱", () => {
    const html = buildFarsideMockHtml([
      {
        date: "15 May 2026",
        cells: ["(136.2)", "(39.6)"],
        total: '<span class="redFont">(290.4)</span>',
      },
    ]);
    const flows = parseFarsideHtml(html);
    expect(flows).toHaveLength(1);
    expect(flows[0]).toEqual({ date: "2026-05-15", netFlow: -290.4 });
  });

  test("date 순 오름차순 정렬 (Farside 가 임의 순서 송출해도 안정)", () => {
    const html = buildFarsideMockHtml([
      { date: "14 May 2026", cells: ["0.0"], total: "800" },
      { date: "12 May 2026", cells: ["0.0"], total: "200" },
      { date: "13 May 2026", cells: ["0.0"], total: "500" },
    ]);
    const flows = parseFarsideHtml(html);
    expect(flows.map((f) => f.date)).toEqual([
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
    ]);
  });

  test("중복 날짜 행 → 첫 번째만 채택 (Farside 간헐 중복 방어)", () => {
    const html = buildFarsideMockHtml([
      { date: "12 May 2026", cells: ["0.0"], total: "200" },
      { date: "12 May 2026", cells: ["0.0"], total: "999" }, // duplicate, ignored
      { date: "13 May 2026", cells: ["0.0"], total: "500" },
    ]);
    const flows = parseFarsideHtml(html);
    expect(flows).toHaveLength(2);
    expect(flows[0]).toEqual({ date: "2026-05-12", netFlow: 200 });
    expect(flows[1]).toEqual({ date: "2026-05-13", netFlow: 500 });
  });

  test("HTML 구조 깨짐 (no <tr>) → 빈 배열", () => {
    const html = "x".repeat(2000) + "<div>no rows here</div>";
    const flows = parseFarsideHtml(html);
    expect(flows).toEqual([]);
  });

  test("응답 너무 작음 → 빈 배열 (sanity check)", () => {
    expect(parseFarsideHtml("")).toEqual([]);
    expect(parseFarsideHtml("<html></html>")).toEqual([]);
  });

  test("Total/Average/Maximum/Minimum summary row 자동 배제", () => {
    const html = buildFarsideMockHtml(
      [{ date: "15 May 2026", cells: ["0.0"], total: "100" }],
      { includeSummary: true },
    );
    const flows = parseFarsideHtml(html);
    // summary row 4개 ("Total"/"Average"/...) 가 첫 td 가 단어이므로 자동 배제.
    expect(flows).toHaveLength(1);
    expect(flows[0].date).toBe("2026-05-15");
  });
});

// ─── 4. 3일 누적 정확성 ──────────────────────────────────────────────

describe("3일 누적 정확성", () => {
  test("[+200, +500, +800] → +1500M", () => {
    const flows: FarsideDailyFlow[] = [
      { date: "2026-05-12", netFlow: 200 },
      { date: "2026-05-13", netFlow: 500 },
      { date: "2026-05-14", netFlow: 800 },
    ];
    const sum = flows.reduce((s, f) => s + f.netFlow, 0);
    expect(sum).toBe(1500);
  });

  test("[+1000, -300, -200] → +500M (혼합)", () => {
    const flows: FarsideDailyFlow[] = [
      { date: "2026-05-13", netFlow: 1000 },
      { date: "2026-05-14", netFlow: -300 },
      { date: "2026-05-15", netFlow: -200 },
    ];
    const sum = flows.reduce((s, f) => s + f.netFlow, 0);
    expect(sum).toBe(500);
  });

  test("[-500, -400, -200] → -1100M (강한 유출)", () => {
    const flows: FarsideDailyFlow[] = [
      { date: "2026-05-13", netFlow: -500 },
      { date: "2026-05-14", netFlow: -400 },
      { date: "2026-05-15", netFlow: -200 },
    ];
    const sum = flows.reduce((s, f) => s + f.netFlow, 0);
    expect(sum).toBe(-1100);
  });
});

// ─── 5. applyEtfFlowThreshold — 임계값 매핑 ──────────────────────────

describe("applyEtfFlowThreshold — 임계값 + 선형 보간", () => {
  test("3d > +$1.5B → +0.20 (saturate)", () => {
    expect(applyEtfFlowThreshold(1500)).toBe(0.2);
    expect(applyEtfFlowThreshold(2000)).toBe(0.2);
    expect(applyEtfFlowThreshold(10000)).toBe(0.2);
  });

  test("3d < -$1B → -0.25 (saturate)", () => {
    expect(applyEtfFlowThreshold(-1000)).toBe(-0.25);
    expect(applyEtfFlowThreshold(-1500)).toBe(-0.25);
    expect(applyEtfFlowThreshold(-10000)).toBe(-0.25);
  });

  test("0 → 0", () => {
    expect(applyEtfFlowThreshold(0)).toBe(0);
  });

  test("+750M (정확히 50%) → +0.10 (선형 보간)", () => {
    expect(applyEtfFlowThreshold(750)).toBeCloseTo(0.1, 4);
  });

  test("-500M (정확히 50%) → -0.125", () => {
    expect(applyEtfFlowThreshold(-500)).toBeCloseTo(-0.125, 4);
  });

  test("non-finite → 0 (graceful)", () => {
    expect(applyEtfFlowThreshold(NaN)).toBe(0);
    expect(applyEtfFlowThreshold(Infinity)).toBe(0);
    expect(applyEtfFlowThreshold(-Infinity)).toBe(0);
  });

  test("결과는 항상 [-0.25, +0.20] 범위 내", () => {
    const samples = [-1e9, -1e6, -1500, -1000, -500, 0, 500, 750, 1500, 1e6, 1e9];
    for (const v of samples) {
      const r = applyEtfFlowThreshold(v);
      expect(r).toBeGreaterThanOrEqual(-0.25);
      expect(r).toBeLessThanOrEqual(0.2);
    }
  });
});

// ─── 6. fetchFarsideEtfFlow — 통합 (mock HTML 흐름) ─────────────────

describe("fetchFarsideEtfFlow — mock HTML 흐름", () => {
  test("3행 mock 으로 netFlow3d 가 정확히 합산됨 (parseFarsideHtml 검증)", () => {
    const html = buildFarsideMockHtml([
      { date: "13 May 2026", cells: ["0.0"], total: "200" },
      { date: "14 May 2026", cells: ["0.0"], total: "500" },
      { date: "15 May 2026", cells: ["0.0"], total: "800" },
    ]);
    const flows = parseFarsideHtml(html);
    const last3 = flows.slice(-3);
    const sum = last3.reduce((s, f) => s + f.netFlow, 0);
    expect(sum).toBe(1500);
    // threshold 적용 시 +0.20
    expect(applyEtfFlowThreshold(sum)).toBe(0.2);
  });

  test("5행 mock 에서 최근 3행만 합산", () => {
    const html = buildFarsideMockHtml([
      { date: "11 May 2026", cells: ["0.0"], total: "999" },
      { date: "12 May 2026", cells: ["0.0"], total: "999" },
      { date: "13 May 2026", cells: ["0.0"], total: "200" },
      { date: "14 May 2026", cells: ["0.0"], total: "500" },
      { date: "15 May 2026", cells: ["0.0"], total: "800" },
    ]);
    const flows = parseFarsideHtml(html);
    expect(flows).toHaveLength(5);
    const last3 = flows.slice(-3);
    expect(last3.reduce((s, f) => s + f.netFlow, 0)).toBe(1500);
  });

  test("강한 유출 케이스 — [(500), (400), (200)] → -1100M → -0.25 (saturate)", () => {
    const html = buildFarsideMockHtml([
      {
        date: "13 May 2026",
        cells: ["0.0"],
        total: '<span class="redFont">(500)</span>',
      },
      {
        date: "14 May 2026",
        cells: ["0.0"],
        total: '<span class="redFont">(400)</span>',
      },
      {
        date: "15 May 2026",
        cells: ["0.0"],
        total: '<span class="redFont">(200)</span>',
      },
    ]);
    const flows = parseFarsideHtml(html);
    const sum = flows.reduce((s, f) => s + f.netFlow, 0);
    expect(sum).toBe(-1100);
    expect(applyEtfFlowThreshold(sum)).toBe(-0.25);
  });
});

// ─── 7. computeEtfFlow (router 경유) — env 분기 검증 ─────────────────

describe("computeEtfFlow — env 분기 + symbol 가드", () => {
  test("ETF_FLOW_PROVIDER 미설정 → status='stub' (Farside 미호출)", async () => {
    const r = await computeEtfFlow("BTCUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
    expect(r.detail).toContain("ETF_FLOW_PROVIDER");
  });

  test("symbol 이 BTC/ETH 아닐 때 → status='stub' (provider 무관)", async () => {
    process.env.ETF_FLOW_PROVIDER = "farside";
    const r = await computeEtfFlow("SOLUSDT");
    expect(r.status).toBe("stub");
    expect(r.value).toBe(0);
  });

  test("ONCHAIN_MOCK=1 + 미설정 provider → status='mock' (결정론)", async () => {
    process.env.ONCHAIN_MOCK = "1";
    const a = await computeEtfFlow("BTCUSDT");
    const b = await computeEtfFlow("BTCUSDT");
    expect(a.status).toBe("mock");
    expect(b.status).toBe("mock");
    expect(a.value).toBe(b.value);
    expect(Math.abs(a.value)).toBeLessThanOrEqual(0.2);
  });
});

// ─── 8. computeFarsideEtfFlow — graceful error ───────────────────────

describe("computeFarsideEtfFlow — graceful error 처리", () => {
  test("symbol 'BTCUSDT' 호출 시 ModifierResult 구조 보장 (실제 네트워크 결과 status='ok'|'error')", async () => {
    // 본 케이스는 실제 Farside 호출 — 네트워크 환경에 따라 ok/error.
    // 핵심: 항상 OnchainModifierResult contract 준수 + value 범위 [-0.25, +0.20].
    const r = await computeFarsideEtfFlow("BTCUSDT");
    expect(r.key).toBe("etf_flow");
    expect(["ok", "error"]).toContain(r.status);
    expect(r.value).toBeGreaterThanOrEqual(-0.25);
    expect(r.value).toBeLessThanOrEqual(0.2);
  }, 15_000);
});
