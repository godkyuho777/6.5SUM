/**
 * Macro composite signals — C1~C4 (MACRO_LIQUIDITY_TRACKER_v2 §3.2).
 *
 * 네 개의 합성 시그널이 단일 지표들 위에 얹혀, regime/score 에 가중을 더한다.
 *
 *   C1 (crisis)        — SOFR-IORB spread AND VIX (곱셈으로 AND 의미)
 *   C2 (risk-on)       — DXY ↓ + real-rate ↓ + VIX ↓ (덧셈으로 OR-weighted)
 *   C3 (net liquidity) — Fed 순공급 (WALCL - RRP - TGA) 30일 변화율
 *   C4 (cycle phase)   — yield-curve + real-rate 의 5단계 분류
 *
 * Pure 함수. RawMacroData / RawMacroHistory 입력 → 결과 객체.
 * 입력 누락 시 0 또는 "neutral" 로 graceful fallback.
 */

// ─────────────────────────────────────────────────────────
// Raw inputs (single point + history)
// ─────────────────────────────────────────────────────────

export interface RawMacroData {
  /** SOFR (overnight financing rate), %. */
  sofr?: number;
  /** IORB (interest on reserve balances), %. */
  iorb?: number;
  /** Fed Funds rate, %. */
  fed_funds?: number;
  /** CPI YoY (for real-rate calc), %. */
  cpi_yoy?: number;
  /** 10Y treasury yield, %. */
  dgs10?: number;
  /** 2Y treasury yield, %. */
  dgs2?: number;
  /** Fed balance sheet (WALCL), $M. */
  walcl?: number;
  /** Reverse repo balance, $B. */
  rrp?: number;
  /** Treasury General Account, $M. */
  tga?: number;
  /** DXY (dollar index), level. */
  dxy?: number;
  /** DXY 30d change, fraction (e.g. -0.02 = -2%). */
  dxy_change_30d_pct?: number;
  /** VIX, level. */
  vix?: number;
  /** Korea — BOK base rate change in 90d, fraction. */
  bok_rate_change_90d?: number;
  /** Korea — KRW/USD change 30d, fraction (positive = KRW weaken). */
  krw_change_30d_pct?: number;
  /** Korea — current BOK rate, %. */
  bok_rate?: number;
  /** Korea — current KRW/USD level. */
  krw_usd?: number;
  /** WALCL 30d change, fraction. */
  walcl_change_30d_pct?: number;
  /** RRP+TGA 30d change, fraction. */
  rrp_tga_change_30d_pct?: number;
}

export type CyclePhase =
  | "pre_recession"
  | "recession_imminent"
  | "fed_pivot"
  | "crypto_rally"
  | "neutral";

export interface CompositeSignals {
  /** Liquidity crisis composite, 0~1 (1 = full crisis). */
  c1_crisis: number;
  /** Global risk-on composite, 0~1 (1 = strong risk-on). */
  c2_riskOn: number;
  /** Fed net supply 30d change (%, fraction). */
  c3_net_liquidity_30d_pct: number;
  /** Macro cycle phase classification. */
  c4_cycle_phase: CyclePhase;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ─────────────────────────────────────────────────────────
// C1 — Liquidity crisis (AND, 곱셈)
// ─────────────────────────────────────────────────────────

/**
 * SOFR-IORB spread AND VIX (둘 다 높을 때만 1 에 가까움).
 * 명세 §3.2:
 *   sprNorm = clamp01((spread - 0) / 10)   // 10bp 이상이면 1
 *   vixNorm = clamp01((vix - 15) / 35)     // 15~50 매핑
 *   c1 = sprNorm × vixNorm
 */
export function c1_crisis(s: RawMacroData): number {
  if (s.sofr == null || s.iorb == null || s.vix == null) return 0;
  const spreadBp = (s.sofr - s.iorb) * 100;
  const sprNorm = clamp01((spreadBp - 0) / 10);
  const vixNorm = clamp01((s.vix - 15) / 35);
  return sprNorm * vixNorm;
}

// ─────────────────────────────────────────────────────────
// C2 — Global risk-on (덧셈, OR-weighted)
// ─────────────────────────────────────────────────────────

export function c2_riskOn(s: RawMacroData): number {
  let score = 0;

  // DXY 약세
  if (s.dxy_change_30d_pct != null) {
    if (s.dxy_change_30d_pct < -0.02) score += 0.35;
    else if (s.dxy_change_30d_pct < 0) score += 0.15;
  }

  // 실질 금리 음수
  if (s.fed_funds != null && s.cpi_yoy != null) {
    const real = s.fed_funds - s.cpi_yoy;
    if (real < -1) score += 0.4;
    else if (real < 0) score += 0.2;
  }

  // VIX 낮음
  if (s.vix != null) {
    if (s.vix < 15) score += 0.25;
    else if (s.vix < 20) score += 0.1;
  }

  return clamp01(score);
}

// ─────────────────────────────────────────────────────────
// C3 — Fed net liquidity (WALCL - RRP - TGA) 30d change
// ─────────────────────────────────────────────────────────

/**
 * `history[0]` 가 가장 오래된 점, `history[history.length-1]` 가 최신 점.
 * 명세 §3.2: now vs 30 days ago.
 *
 * 데이터 부족 (< 30 points) 시 0 반환 (graceful).
 */
export function c3_netLiquidity(history: RawMacroData[]): number {
  if (!Array.isArray(history) || history.length < 30) return 0;
  const now = history[history.length - 1];
  const past = history[history.length - 30];
  if (
    now.walcl == null ||
    now.rrp == null ||
    now.tga == null ||
    past.walcl == null ||
    past.rrp == null ||
    past.tga == null
  ) {
    return 0;
  }
  const netNow = now.walcl - now.rrp - now.tga;
  const netPast = past.walcl - past.rrp - past.tga;
  if (netPast === 0) return 0;
  return (netNow - netPast) / Math.abs(netPast);
}

// ─────────────────────────────────────────────────────────
// C4 — Macro cycle phase (5-way classification)
// ─────────────────────────────────────────────────────────

/**
 * yield-curve + real-rate 의 5단계 분류 (명세 §3.2):
 *   pre_recession      — yc 가 양수에서 좁혀짐 (90d 전 대비 0.5%+ 감소)
 *   recession_imminent — yc 음수 + 실질금리 > 1.5%
 *   fed_pivot          — yc 양수 + 90d 전엔 음수였음
 *   crypto_rally       — 실질금리 < 0 + yc > 0.5%
 *   neutral            — 위 조건 미충족
 *
 * 데이터 부족 시 "neutral".
 */
export function c4_cyclePhase(history: RawMacroData[]): CyclePhase {
  if (!Array.isArray(history) || history.length < 90) return "neutral";
  const now = history[history.length - 1];
  const past = history[history.length - 90];
  if (now.dgs10 == null || now.dgs2 == null) return "neutral";

  const ycNow = now.dgs10 - now.dgs2;
  const ycPast =
    past.dgs10 != null && past.dgs2 != null ? past.dgs10 - past.dgs2 : ycNow;
  const realRate =
    now.fed_funds != null && now.cpi_yoy != null
      ? now.fed_funds - now.cpi_yoy
      : 0;

  if (ycNow > 0 && ycPast > ycNow + 0.5) return "pre_recession";
  if (ycNow < 0 && realRate > 1.5) return "recession_imminent";
  if (ycNow > 0 && ycPast < 0) return "fed_pivot";
  if (realRate < 0 && ycNow > 0.5) return "crypto_rally";
  return "neutral";
}

// ─────────────────────────────────────────────────────────
// Aggregator
// ─────────────────────────────────────────────────────────

/**
 * 모든 composite signal 을 한 번에 계산.
 *
 * @param snapshot 현재 시점 raw 데이터
 * @param history  최근 90일+ 의 raw 데이터 (없으면 C3/C4 는 0/"neutral")
 */
export function computeCompositeSignals(
  snapshot: RawMacroData,
  history: RawMacroData[] = [],
): CompositeSignals {
  return {
    c1_crisis: c1_crisis(snapshot),
    c2_riskOn: c2_riskOn(snapshot),
    c3_net_liquidity_30d_pct: c3_netLiquidity(history),
    c4_cycle_phase: c4_cyclePhase(history),
  };
}

// ─────────────────────────────────────────────────────────
// Freshness multiplier (§3.4)
// ─────────────────────────────────────────────────────────

/**
 * Stale 데이터의 영향력 감쇠. age_hours 기반.
 *   < 24h  → 1.0
 *   < 72h  → 0.9
 *   < 168h → 0.7
 *   else   → 0.5
 */
export function macroFreshnessMult(age_hours: number): number {
  if (age_hours < 24) return 1.0;
  if (age_hours < 72) return 0.9;
  if (age_hours < 168) return 0.7;
  return 0.5;
}

/**
 * BBDX 등에 적용하는 effective macro multiplier.
 *   effective = 1 + (base - 1) × freshness
 * base=1.4 (flooded), freshness=0.5 (stale 7+ days) → 1.2 로 약화.
 */
export function effectiveMacroMultiplier(
  base: number,
  age_hours: number,
): number {
  const f = macroFreshnessMult(age_hours);
  return 1 + (base - 1) * f;
}
