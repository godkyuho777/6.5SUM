/**
 * Risk Score — 순수 compute 함수 (Risk v1, calibratable).
 *
 * I/O 없음. raw 입력 → 차원별 0-100 점수 → 종합. fetch 는 score-fetch.ts 담당.
 *
 * ⚠ DISPLAY-ONLY (헌장 규칙 3 보존): 이 모듈의 결과는 BBDX 시그널/strength/
 * position sizing 어디에도 흘러가지 않는다. modifier 도 아니다.
 *
 * 모든 차원 공식은 "높을수록 위험" 으로 정규화. 임계값은 전부
 * UPPER_SNAKE_CASE 상수로 노출 — 백테스트/캘리브레이션으로 조정 가능.
 *
 * 각 차원은 입력이 없으면 null → 종합에서 *제외* + 남은 차원으로 가중치
 * 재정규화 (onchain 의 tier-disable 와 같은 graceful 정신).
 */

import type {
  RiskBand,
  RiskBreakdown,
  RiskDimensionName,
  RiskScoreResult,
  MarketRiskResult,
} from "./types";

// ─────────────────────────────────────────────────────────
// 입력 계약
// ─────────────────────────────────────────────────────────

/** Risk 차원 입력. 모두 optional — 해당 입력 없으면 그 차원은 skip. */
export interface RiskInputs {
  /** 일봉 ATR / price × 100 (%). volatility 차원. */
  atrPct?: number;
  /** 24h quote(USDT) 거래량. liquidity 차원. */
  volumeUsd?: number;
  /** USD 시가총액. liquidity 차원. */
  marketCapUsd?: number;
  /** per-8h funding rate (decimal, e.g. 0.0001). leverage 차원. */
  fundingRate?: number;
  /** long/short ratio (1.0 = 균형). leverage 차원. */
  longShortRatio?: number;
  /** 24h Open Interest 변화율 (%). leverage 차원. */
  oiChange24hPct?: number;
  /** 30일 고점 대비 낙폭 (%, 양수). trend 차원. */
  drawdownFromHigh30?: number;
  /** isFallingKnife OR (ADX>=25 && minusDI>plusDI). trend 차원. */
  fallingKnife?: boolean;
  /** Fear & Greed 0-100. regime 차원. */
  fearGreed?: number;
  /** macro 유동성 regime: crisis|tight|neutral|easing|flooded. regime 차원. */
  macroRegime?: string;
}

// ─────────────────────────────────────────────────────────
// 종합 가중치 + 밴드 경계 (Risk v1 — calibratable)
// ─────────────────────────────────────────────────────────

/**
 * Risk v1 종합 가중치 (calibratable).
 *
 * 산출된 차원만 사용하고 남은 차원 위에서 *재정규화* 하므로, 일부 차원이
 * 빠져도(예: scanner lightweight 4-dim, leverage 제외) 합이 1 로 보정된다.
 * 합은 1.00 (volatility 0.25 + liquidity 0.20 + leverage 0.20 + trend 0.20 + regime 0.15).
 */
export const RISK_WEIGHTS: Readonly<Record<RiskDimensionName, number>> = {
  volatility: 0.25,
  liquidity: 0.2,
  leverage: 0.2,
  trend: 0.2,
  regime: 0.15,
};

/** Risk v1 밴드 경계 (calibratable). score < 값 → 해당 밴드. */
export const RISK_BAND_THRESHOLDS = {
  low: 25,
  moderate: 50,
  high: 75,
} as const;

// ─────────────────────────────────────────────────────────
// 차원별 임계값 (Risk v1 — calibratable)
// ─────────────────────────────────────────────────────────

/** volatility: 일봉 ATR% 1.5% → 위험 0, 12% → 위험 100. */
export const VOLATILITY_ATR_PCT_LO = 1.5;
export const VOLATILITY_ATR_PCT_HI = 12;

/**
 * liquidity: 거래량/시총 모두 log10 스케일.
 *   거래량 log10 6 ($1M) → 위험 100, 9.3 (~$2B) → 위험 0.
 *   시총   log10 7.7 (~$50M) → 위험 100, 10 ($10B) → 위험 0.
 * 두 sub-part 가중 0.6/0.4. 한쪽만 있으면 그 값 단독 사용.
 */
export const LIQUIDITY_VOL_LOG10_LO = 6;
export const LIQUIDITY_VOL_LOG10_HI = 9.3;
export const LIQUIDITY_MCAP_LOG10_LO = 7.7;
export const LIQUIDITY_MCAP_LOG10_HI = 10;
export const LIQUIDITY_VOL_WEIGHT = 0.6;
export const LIQUIDITY_MCAP_WEIGHT = 0.4;

/**
 * leverage: 3개 sub-part (funding / long-short / OI), 존재하는 것만 가중
 *   재정규화 (0.45 / 0.35 / 0.20).
 *   |funding| 0.0002 → 위험 0, 0.0015 → 위험 100.
 *   |ln(LS)|  0.15   → 위험 0, 1.1    → 위험 100.
 *   |OI%|     5       → 위험 0, 40     → 위험 100.
 */
export const LEVERAGE_FUNDING_ABS_LO = 0.0002;
export const LEVERAGE_FUNDING_ABS_HI = 0.0015;
export const LEVERAGE_LS_LNABS_LO = 0.15;
export const LEVERAGE_LS_LNABS_HI = 1.1;
export const LEVERAGE_OI_ABS_LO = 5;
export const LEVERAGE_OI_ABS_HI = 40;
export const LEVERAGE_FUNDING_WEIGHT = 0.45;
export const LEVERAGE_LS_WEIGHT = 0.35;
export const LEVERAGE_OI_WEIGHT = 0.2;

/**
 * trend: 30일 고점 대비 낙폭 3% → 위험 0, 45% → 위험 100 (×0.7 가중) +
 *   falling-knife 시 +30 가산. clamp 0-100.
 */
export const TREND_DRAWDOWN_LO = 3;
export const TREND_DRAWDOWN_HI = 45;
export const TREND_DRAWDOWN_WEIGHT = 0.7;
export const TREND_FALLING_KNIFE_BONUS = 30;

/**
 * regime: Fear & Greed + macro regime.
 *   탐욕(>=50): linMap(fg, 50, 95) — 과열일수록 위험.
 *   공포(<50):  linMap(50-fg, 5, 45) × 0.8 — 극단 공포도 위험(낙폭/패닉) 이나
 *               탐욕 쪽보다 약하게.
 *   macro: 라벨 → 위험 맵 (아래). 둘 다 있으면 0.5/0.5, 한쪽만 있으면 단독.
 */
export const REGIME_FG_GREED_LO = 50;
export const REGIME_FG_GREED_HI = 95;
export const REGIME_FG_FEAR_LO = 5;
export const REGIME_FG_FEAR_HI = 45;
export const REGIME_FG_FEAR_WEIGHT = 0.8;
export const REGIME_FG_WEIGHT = 0.5;
export const REGIME_MACRO_WEIGHT = 0.5;

/**
 * macro regime → 위험 점수 맵 (Risk v1, calibratable).
 *
 * 주: macro 모듈은 "easy" 라벨을 쓰지만 spec/외부 호출에서 "easing" 이 올
 * 수도 있어 두 키 모두 등록. 알 수 없는 라벨 → MACRO_REGIME_RISK_DEFAULT.
 */
export const MACRO_REGIME_RISK: Readonly<Record<string, number>> = {
  crisis: 90,
  tight: 65,
  neutral: 40,
  easing: 25,
  easy: 25,
  flooded: 15,
};
export const MACRO_REGIME_RISK_DEFAULT = 40;

// notes 플래그 임계값 — 차원 점수가 이 값 이상이면 한글 플래그 노출.
const NOTE_HIGH_THRESHOLD = 60;

// ─────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * 선형 매핑 → 0-100.
 *   linMap(x, x0, x1) = clamp((x - x0) / (x1 - x0), 0, 1) × 100
 * x0 == x1 이면 0 (0 division 방어).
 */
export function linMap(x: number, x0: number, x1: number): number {
  if (x1 === x0) return 0;
  return clamp((x - x0) / (x1 - x0), 0, 1) * 100;
}

// ─────────────────────────────────────────────────────────
// 차원별 compute (각 → number(0-100) | null)
// ─────────────────────────────────────────────────────────

/** volatility 차원. atrPct 없으면 null. */
export function volatilityRisk(atrPct?: number): number | null {
  if (atrPct == null || !Number.isFinite(atrPct)) return null;
  return linMap(atrPct, VOLATILITY_ATR_PCT_LO, VOLATILITY_ATR_PCT_HI);
}

/** liquidity 차원. volumeUsd / marketCapUsd 둘 다 없으면 null. */
export function liquidityRisk(
  volumeUsd?: number,
  marketCapUsd?: number,
): number | null {
  const hasVol = volumeUsd != null && Number.isFinite(volumeUsd) && volumeUsd > 0;
  const hasMcap =
    marketCapUsd != null && Number.isFinite(marketCapUsd) && marketCapUsd > 0;
  if (!hasVol && !hasMcap) return null;

  const riskVol = hasVol
    ? 100 - linMap(Math.log10(volumeUsd as number), LIQUIDITY_VOL_LOG10_LO, LIQUIDITY_VOL_LOG10_HI)
    : null;
  const riskMcap = hasMcap
    ? 100 - linMap(Math.log10(marketCapUsd as number), LIQUIDITY_MCAP_LOG10_LO, LIQUIDITY_MCAP_LOG10_HI)
    : null;

  if (riskVol != null && riskMcap != null) {
    return clamp(
      LIQUIDITY_VOL_WEIGHT * riskVol + LIQUIDITY_MCAP_WEIGHT * riskMcap,
      0,
      100,
    );
  }
  return (riskVol ?? riskMcap) as number;
}

/** leverage 차원. funding/ls/oi 셋 다 없으면 null. 존재하는 것만 재정규화. */
export function leverageRisk(
  fundingRate?: number,
  longShortRatio?: number,
  oiChange24hPct?: number,
): number | null {
  const parts: Array<{ risk: number; weight: number }> = [];

  if (fundingRate != null && Number.isFinite(fundingRate)) {
    parts.push({
      risk: linMap(Math.abs(fundingRate), LEVERAGE_FUNDING_ABS_LO, LEVERAGE_FUNDING_ABS_HI),
      weight: LEVERAGE_FUNDING_WEIGHT,
    });
  }
  if (longShortRatio != null && Number.isFinite(longShortRatio) && longShortRatio > 0) {
    parts.push({
      risk: linMap(Math.abs(Math.log(longShortRatio)), LEVERAGE_LS_LNABS_LO, LEVERAGE_LS_LNABS_HI),
      weight: LEVERAGE_LS_WEIGHT,
    });
  }
  if (oiChange24hPct != null && Number.isFinite(oiChange24hPct)) {
    parts.push({
      risk: linMap(Math.abs(oiChange24hPct), LEVERAGE_OI_ABS_LO, LEVERAGE_OI_ABS_HI),
      weight: LEVERAGE_OI_WEIGHT,
    });
  }

  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return null;
  const weighted = parts.reduce((s, p) => s + p.risk * p.weight, 0) / totalWeight;
  return clamp(weighted, 0, 100);
}

/** trend 차원. drawdownFromHigh30 없으면 null. fallingKnife 는 가산만. */
export function trendRisk(
  drawdownFromHigh30?: number,
  fallingKnife?: boolean,
): number | null {
  if (drawdownFromHigh30 == null || !Number.isFinite(drawdownFromHigh30)) return null;
  const ddRisk =
    linMap(drawdownFromHigh30, TREND_DRAWDOWN_LO, TREND_DRAWDOWN_HI) * TREND_DRAWDOWN_WEIGHT;
  const knifeBonus = fallingKnife ? TREND_FALLING_KNIFE_BONUS : 0;
  return clamp(ddRisk + knifeBonus, 0, 100);
}

/** regime 차원. fearGreed / macroRegime 둘 다 없으면 null. */
export function regimeRisk(
  fearGreed?: number,
  macroRegime?: string,
): number | null {
  const hasFg = fearGreed != null && Number.isFinite(fearGreed);
  const hasMacro = macroRegime != null && macroRegime.length > 0;
  if (!hasFg && !hasMacro) return null;

  const fgRisk = hasFg
    ? (fearGreed as number) >= 50
      ? linMap(fearGreed as number, REGIME_FG_GREED_LO, REGIME_FG_GREED_HI)
      : linMap(50 - (fearGreed as number), REGIME_FG_FEAR_LO, REGIME_FG_FEAR_HI) *
        REGIME_FG_FEAR_WEIGHT
    : null;

  const macroRisk = hasMacro
    ? MACRO_REGIME_RISK[(macroRegime as string).toLowerCase()] ?? MACRO_REGIME_RISK_DEFAULT
    : null;

  if (fgRisk != null && macroRisk != null) {
    return clamp(REGIME_FG_WEIGHT * fgRisk + REGIME_MACRO_WEIGHT * macroRisk, 0, 100);
  }
  return clamp((fgRisk ?? macroRisk) as number, 0, 100);
}

// ─────────────────────────────────────────────────────────
// 밴드 분류
// ─────────────────────────────────────────────────────────

/** Risk v1 밴드 분류. <25 low / <50 moderate / <75 high / else extreme. */
export function classifyBand(score: number): RiskBand {
  if (score < RISK_BAND_THRESHOLDS.low) return "low";
  if (score < RISK_BAND_THRESHOLDS.moderate) return "moderate";
  if (score < RISK_BAND_THRESHOLDS.high) return "high";
  return "extreme";
}

// ─────────────────────────────────────────────────────────
// notes (한글 플래그)
// ─────────────────────────────────────────────────────────

function buildNotes(inputs: RiskInputs, breakdown: RiskBreakdown): string[] {
  const notes: string[] = [];

  if (breakdown.volatility != null && breakdown.volatility >= NOTE_HIGH_THRESHOLD) {
    notes.push(`고변동성 ATR ${(inputs.atrPct ?? 0).toFixed(1)}%`);
  }
  if (breakdown.liquidity != null && breakdown.liquidity >= NOTE_HIGH_THRESHOLD) {
    notes.push("저유동성");
  }
  if (breakdown.leverage != null && breakdown.leverage >= NOTE_HIGH_THRESHOLD) {
    if (inputs.fundingRate != null && Math.abs(inputs.fundingRate) >= LEVERAGE_FUNDING_ABS_HI * 0.6) {
      // funding 은 per-8h decimal → % 표기 (×100). 부호 보존.
      notes.push(`펀딩 과열 ${(inputs.fundingRate * 100 >= 0 ? "+" : "")}${(inputs.fundingRate * 100).toFixed(2)}%/8h`);
    } else {
      notes.push("레버리지 과열");
    }
  }
  if (breakdown.trend != null && breakdown.trend >= NOTE_HIGH_THRESHOLD) {
    if (inputs.drawdownFromHigh30 != null) {
      notes.push(`30일 고점 대비 -${Math.abs(inputs.drawdownFromHigh30).toFixed(0)}%`);
    }
    if (inputs.fallingKnife) {
      notes.push("하락 추세 (falling knife)");
    }
  }
  if (breakdown.regime != null && breakdown.regime >= NOTE_HIGH_THRESHOLD) {
    if (inputs.macroRegime) {
      notes.push(`거시 유동성 위험 (${inputs.macroRegime})`);
    } else if (inputs.fearGreed != null) {
      notes.push(`시장 심리 극단 (F&G ${Math.round(inputs.fearGreed)})`);
    }
  }

  return notes;
}

// ─────────────────────────────────────────────────────────
// 종합
// ─────────────────────────────────────────────────────────

/**
 * 단일 심볼의 종합 위험 점수를 raw 입력으로부터 산출.
 *
 * 산출된 차원만 사용 + 남은 차원 위에서 RISK_WEIGHTS 재정규화 → 가중 합 →
 * round → clamp 0-100. 모든 차원이 null 이면 score 0 + coverage 0.
 *
 * ⚠ DISPLAY-ONLY — 결과는 어떤 매매 결정에도 흘러가지 않는다 (헌장 규칙 3).
 */
export function computeRiskScore(
  symbol: string,
  inputs: RiskInputs = {},
): RiskScoreResult {
  const breakdown: RiskBreakdown = {
    volatility: volatilityRisk(inputs.atrPct),
    liquidity: liquidityRisk(inputs.volumeUsd, inputs.marketCapUsd),
    leverage: leverageRisk(inputs.fundingRate, inputs.longShortRatio, inputs.oiChange24hPct),
    trend: trendRisk(inputs.drawdownFromHigh30, inputs.fallingKnife),
    regime: regimeRisk(inputs.fearGreed, inputs.macroRegime),
  };

  const dimNames: RiskDimensionName[] = [
    "volatility",
    "liquidity",
    "leverage",
    "trend",
    "regime",
  ];

  const includedDimensions: RiskDimensionName[] = dimNames.filter(
    (d) => breakdown[d] != null,
  );

  // 산출된 차원의 가중치 합으로 재정규화.
  const totalWeight = includedDimensions.reduce((s, d) => s + RISK_WEIGHTS[d], 0);
  let score = 0;
  if (totalWeight > 0) {
    const weightedSum = includedDimensions.reduce(
      (s, d) => s + (breakdown[d] as number) * RISK_WEIGHTS[d],
      0,
    );
    score = clamp(Math.round(weightedSum / totalWeight), 0, 100);
  }

  const band = classifyBand(score);
  const coverage = includedDimensions.length / dimNames.length;
  const notes = buildNotes(inputs, breakdown);

  return {
    symbol,
    score,
    band,
    breakdown,
    includedDimensions,
    coverage,
    notes,
    asOf: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────
// Market-wide 위험 (systemic)
// ─────────────────────────────────────────────────────────

/**
 * 시장 전체 위험 — regime 차원 sub-score 재사용.
 *
 * score = regimeRisk(fearGreed, macroRegime). F&G / macro 둘 다 없으면 0.
 * ⚠ DISPLAY-ONLY (헌장 규칙 3).
 */
export function computeMarketRisk(inputs: {
  fearGreed?: number;
  fearGreedLabel?: string;
  macroRegime?: string;
}): MarketRiskResult {
  const fg = inputs.fearGreed;
  const macro = inputs.macroRegime;

  // 개별 sub-score (components 노출용) — regimeRisk 내부와 동일 공식.
  const fgRisk =
    fg != null && Number.isFinite(fg)
      ? fg >= 50
        ? linMap(fg, REGIME_FG_GREED_LO, REGIME_FG_GREED_HI)
        : linMap(50 - fg, REGIME_FG_FEAR_LO, REGIME_FG_FEAR_HI) * REGIME_FG_FEAR_WEIGHT
      : 0;
  const macroRisk =
    macro != null && macro.length > 0
      ? MACRO_REGIME_RISK[macro.toLowerCase()] ?? MACRO_REGIME_RISK_DEFAULT
      : 0;

  const combined = regimeRisk(fg, macro);
  const score = clamp(Math.round(combined ?? 0), 0, 100);

  return {
    score,
    band: classifyBand(score),
    fearGreed: fg != null && Number.isFinite(fg) ? fg : 0,
    fearGreedLabel: inputs.fearGreedLabel ?? "",
    macroRegime: macro ?? "",
    components: { fgRisk: Math.round(fgRisk), macroRisk: Math.round(macroRisk) },
    asOf: new Date().toISOString(),
  };
}
