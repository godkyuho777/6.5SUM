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
export type CyclePhase = "pre_recession" | "recession_imminent" | "fed_pivot" | "crypto_rally" | "neutral";
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
/**
 * SOFR-IORB spread AND VIX (둘 다 높을 때만 1 에 가까움).
 * 명세 §3.2:
 *   sprNorm = clamp01((spread - 0) / 10)   // 10bp 이상이면 1
 *   vixNorm = clamp01((vix - 15) / 35)     // 15~50 매핑
 *   c1 = sprNorm × vixNorm
 */
export declare function c1_crisis(s: RawMacroData): number;
export declare function c2_riskOn(s: RawMacroData): number;
/**
 * `history[0]` 가 가장 오래된 점, `history[history.length-1]` 가 최신 점.
 * 명세 §3.2: now vs 30 days ago.
 *
 * 데이터 부족 (< 30 points) 시 0 반환 (graceful).
 */
export declare function c3_netLiquidity(history: RawMacroData[]): number;
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
export declare function c4_cyclePhase(history: RawMacroData[]): CyclePhase;
/**
 * 모든 composite signal 을 한 번에 계산.
 *
 * @param snapshot 현재 시점 raw 데이터
 * @param history  최근 90일+ 의 raw 데이터 (없으면 C3/C4 는 0/"neutral")
 */
export declare function computeCompositeSignals(snapshot: RawMacroData, history?: RawMacroData[]): CompositeSignals;
/**
 * Stale 데이터의 영향력 감쇠. age_hours 기반.
 *   < 24h  → 1.0
 *   < 72h  → 0.9
 *   < 168h → 0.7
 *   else   → 0.5
 */
export declare function macroFreshnessMult(age_hours: number): number;
/**
 * BBDX 등에 적용하는 effective macro multiplier.
 *   effective = 1 + (base - 1) × freshness
 * base=1.4 (flooded), freshness=0.5 (stale 7+ days) → 1.2 로 약화.
 */
export declare function effectiveMacroMultiplier(base: number, age_hours: number): number;
