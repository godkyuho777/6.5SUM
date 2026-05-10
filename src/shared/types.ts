/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../../drizzle/schema";
export * from "./_core/errors";

/** 바이비트(Bybit) 거래량 상위 100개 USDT 페어 심볼 */
export const TOP_COINS: string[] = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "AAVEUSDT",
  "DOGEUSDT", "SUIUSDT", "PEPEUSDT", "AVAXUSDT", "ADAUSDT",
  "ENAUSDT", "NEARUSDT", "LINKUSDT", "BNBUSDT", "TONUSDT",
  "LTCUSDT", "DOTUSDT", "FILUSDT", "FETUSDT", "TRUMPUSDT",
  "RENDERUSDT", "TRXUSDT", "ALGOUSDT", "XLMUSDT", "WLDUSDT",
  "BONKUSDT", "HBARUSDT", "ICPUSDT", "ARBUSDT", "CRVUSDT",
  "OPUSDT", "UNIUSDT", "ONDOUSDT", "SHIBUSDT", "SEIUSDT",
  "GALAUSDT", "DYDXUSDT", "APTUSDT", "BCHUSDT", "ATOMUSDT",
  "APEUSDT", "JUPUSDT", "WUSDT", "IPUSDT", "WIFUSDT",
  "KASUSDT", "INJUSDT", "TIAUSDT", "RUNEUSDT", "PENDLEUSDT",
  "LDOUSDT", "GRTUSDT", "SANDUSDT", "MANAUSDT", "AXSUSDT",
  "CHZUSDT", "ENJUSDT", "HYPEUSDT", "SNXUSDT", "COMPUSDT",
  "GMXUSDT", "FLOWUSDT", "MINAUSDT", "XTZUSDT", "DRIFTUSDT",
  "KAVAUSDT", "ZROUSDT", "MASKUSDT", "ANKRUSDT", "LITUSDT",
  "ZILUSDT", "BATUSDT", "ZRXUSDT", "BASEDUSDT", "ONEUSDT",
  "XPLUSDT", "MONUSDT", "EDGEUSDT", "ZORAUSDT", "FIGHTUSDT",
  "FLOKIUSDT", "STXUSDT", "IMXUSDT", "VETUSDT",
  "THETAUSDT", "LRCUSDT", "QNTUSDT", "EGLDUSDT",
  "RVNUSDT", "GRASSUSDT", "POLUSDT",
  "VIRTUALUSDT", "PENGUUSDT", "ALTUSDT", "MNTUSDT", "XDCUSDT"
];

/** 캔들 데이터 */
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

/** 기술 지표 결과 */
export interface TechnicalIndicators {
  rsi: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  adx: number;
  plusDi: number;
  minusDi: number;
  /** VWAP across the loaded candle range. Optional for back-compat. */
  vwap?: number;
  /** 9-period EMA of close prices. */
  ema9?: number;
  fibLevels?: {
    level: number;
    price: number;
    isGoldenZone: boolean;
  }[];
  trendlines?: {
    type: "support" | "resistance";
    points: { time: number; price: number }[];
    isActive: boolean;
  }[];
}

// ─── BBDX-PATTERN v6.1 ──────────────────────────────────────────────────────

/** +DI / -DI 압력 라벨 */
export type PressureLabel =
  | "BULL_PRESSURE"
  | "WEAK_BULL"
  | "BEAR_PRESSURE"
  | "WEAK_BEAR"
  | "NEUTRAL";

/** 캔들 패턴 이름 */
export type CandlePatternName =
  | "engulfing"
  | "morningStar"
  | "hammer"
  | "invertedHammer"
  | "pinBar"
  | "doji"
  | "threeWhiteSoldiers"
  | "bearishEngulfing"
  | "eveningStar"
  | "threeBlackCrows";

/** 감지된 캔들 패턴 */
export interface CandlePatternMatch {
  name: CandlePatternName;
  bias: "bullish" | "bearish";
  /** 0 = 가장 최근 캔들에서 감지, 1~4 = N캔들 전 */
  candlesAgo: number;
  /** 패턴 강도 (60~100) */
  strength: number;
}

/**
 * 패턴 컨텍스트 요약 (PATTERN_SYSTEM_AUDIT 권고 #4 #6 #7 #8 적용 결과).
 *
 * 강세/약세 별로 다중 패턴 max + bonus 합산 + 거래량/추세 컨텍스트 + TF 차등.
 * 단독 시그널 X — BBDX 시그널 강도의 multiplier 로만 사용 (헌장 규칙 3 준수).
 */
export interface PatternConfluenceSummary {
  /** 합산된 strong 0~1. clamp(primary + bonus, 0, 1). */
  bullishScore: number;
  bearishScore: number;
  /** confluence 매치 개수 (UI 의 "n 개 동시 신호" 표시용) */
  bullishCount: number;
  bearishCount: number;
  /** confluence 보너스 (0 ~ 0.20) */
  bullishBonus: number;
  bearishBonus: number;
  /** 가장 강한 단일 매치의 이름 (UI 메인 표시용). null=매치 없음. */
  bullishPrimaryName: CandlePatternName | null;
  bearishPrimaryName: CandlePatternName | null;
  /** 가장 강한 매치의 컨텍스트 정보 (사용자 공개용) */
  bullishContext: PatternContextDetail | null;
  bearishContext: PatternContextDetail | null;
  /** 평가에 쓰인 TF (헌장 검증) */
  tf: TimeframeValue;
}

export interface PatternContextDetail {
  /** TF 별 base 신뢰도 (0~1) */
  base: number;
  /** 거래량 multiplier (0.80 ~ 1.40) */
  volumeMultiplier: number;
  /** 거래량 라벨 */
  volumeLabel: "very_high" | "high" | "elevated" | "normal" | "low";
  /** 거래량 비율 (실제값/baseline) */
  volumeRatio: number;
  /** 추세 multiplier (0.60 ~ 1.30) */
  trendMultiplier: number;
  /** 추세 라벨 */
  trendLabel: "strong_down" | "mild_down" | "sideways" | "mild_up" | "strong_up";
  /** 추세 누적 수익률 */
  trendCumulativeReturn: number;
  /** candlesAgo 지수 감쇠 */
  ageDiscount: number;
  /** 보정 후 컨텍스트 강도 (0~1) */
  contextualStrength: number;
}

/** BB 구조 패턴 (LONG 진입용) */
export type BBStructure =
  | "upperRiding"
  | "middleSupport"
  | "squeezeBreakout"
  | "lowerBounce";

/**
 * BB 구조 패턴 (SHORT 진입용). LONG 의 4가지 미러:
 *   lowerRiding       — 연속 3 캔들이 BB 하단 *아래* + 음봉 (long upperRiding 미러)
 *   middleResistance  — 5중 3 캔들이 중간선 ±1% 터치 + 종가 < 중간선 (middleSupport 미러)
 *   squeezeBreakdown  — BW 압축 후 음봉 + 종가 < 중간선 (squeezeBreakout 미러)
 *   upperRejection    — 직전 고가 ≥ BB상단×1.02 + 반전 음봉 (lowerBounce 미러)
 */
export type BBStructureShort =
  | "lowerRiding"
  | "middleResistance"
  | "squeezeBreakdown"
  | "upperRejection";

/** 매수/매도 진입 경로 */
export type EntryPath = "NUM" | "PTN" | "BB";

/** 매수 진입 결정 */
export interface EntryDecision {
  path: EntryPath;
  /** 사람이 읽을 수 있는 충족 조건 목록 */
  reasons: string[];
  /** PTN 경로일 때 사용된 강세 패턴들 */
  patterns?: CandlePatternMatch[];
  /** BB 경로일 때 사용된 BB 구조 */
  bbStructure?: BBStructure;
  /**
   * v6.5 dimensions integration — VWAP modifier (헌장 규칙 3 준수).
   * `final_confidence = base × confluence × wave × macro × onchain × (vwapMult ?? 1.0)`.
   * 다른 차원 multiplier (macroMult / onchainMult 등) 는 후속 머지로 추가 예정.
   */
  vwapMult?: number;

  // ── Additional Strategies (03_ADDITIONAL_STRATEGIES.md, 헌장 규칙 3) ──
  // 모두 optional. null/undefined = 미적용 (multiplier 1.0 동치).
  // BBDX 코어 final_confidence 곱셈 체인에 `combineAdditionalModifiers()` 로 합쳐
  // 통합 (v6.5 머지 후 `src/signals/confidence.ts` 의 곱셈 체인 끝에 추가).
  /** EMA Ribbon (3차원: trend) — 0.30~1.15 */
  emaRibbonMult?: number;
  /** Market Breadth (6차원: macro/sentiment) — 0.60~1.30 */
  marketBreadthMult?: number;
  /** MACD Divergence (1차원: momentum, RSI 와 다른 각도) — 0.80~1.20 */
  macdDivergenceMult?: number;
  /** Funding Extreme (6차원: macro/perp positioning) — 0.85~1.20 */
  fundingExtremeMult?: number;
  /** CVD Divergence (4차원: volume/liquidity, 베타) — 0.80~1.20 */
  cvdDivergenceMult?: number;
  /** Order Block (5차원: structure, 베타) — 0.95~1.05 */
  orderBlockMult?: number;
  /**
   * Wave Alignment (Trend Analysis Engine v2.0) — 0.30~1.30.
   * 멀티-TF 추세 정합. ADX/EMA 와 같은 3차원 지표를 사용하지만 측정 각도가
   * 다름 (단일 TF strength vs 멀티-TF alignment). 헌장 규칙 1 면제.
   * 헌장 규칙 3 준수: BBDX final_confidence × waveMult 곱셈에만 사용.
   */
  waveMult?: number;
}

/**
 * 매도(SHORT) 진입 결정. LONG `EntryDecision` 의 미러.
 *
 * 헌장 규칙 3 준수: SHORT 시그널도 BBDX 차원 안에서 작동, 단독 시그널 X.
 * 동일한 multiplier 체인을 통과하지만 자본 보호 분기는 LONG 의 *반대* —
 * `strong_accumulation` 환경에서 *평균회귀 SHORT* 진입 차단 (lowerRiding 외).
 */
export interface ShortEntryDecision {
  path: EntryPath;
  /** 사람이 읽을 수 있는 충족 조건 목록 */
  reasons: string[];
  /** PTN 경로일 때 사용된 약세 패턴들 */
  patterns?: CandlePatternMatch[];
  /** BB 경로일 때 사용된 BB 구조 (SHORT 용) */
  bbStructure?: BBStructureShort;
  /** v6.5 multiplier 체인 (long 과 동일 — 부호만 반대) */
  vwapMult?: number;
  emaRibbonMult?: number;
  marketBreadthMult?: number;
  macdDivergenceMult?: number;
  fundingExtremeMult?: number;
  cvdDivergenceMult?: number;
  orderBlockMult?: number;
}

/** v6.3 EXIT 카테고리 (Part II.1 §1.1). */
export type ExitCategory = "A" | "B" | "C" | "D" | "STOP";

/** v6.3 EXIT 액션. */
export type ExitAction = "full_exit" | "partial_exit" | "move_stop";

/**
 * v6.3 EXIT-B 반전 점수 컴포넌트 (debug/UI 표시용).
 *
 * v6.5 추가 필드: macroBoost / onchainBoost — 거시·온체인 환경
 * 가중. 기존 5개 컴포넌트 합 + 두 boost 의 부호 있는 가산.
 */
export interface ReversalScoreBreakdown {
  diCross: number;
  adxConfirmation: number;
  bearishPattern: number;
  trendlineBreak: number;
  macdDivergence: number;
  /** v6.5 §5.2 — non-zero when macroRegime ∈ {crisis, tight, flooded}. */
  macroBoost: number;
  /** v6.5 §5.2 — non-zero when onchainRegime ∈ {distribution, strong_distribution}; multiplicative damp via strong_accumulation. */
  onchainBoost: number;
  total: number;
}

/**
 * 매도(EXIT) 결정.
 *
 * v6.3 (Part II.1) 4-카테고리 분리:
 *   A = 목표 도달 (profit target)
 *   B = 방향성 반전 (reversal score)
 *   C = 수익 보호 (trailing/breakeven)
 *   D = 시간 손절 (time stop)
 *   STOP = 손절선 도달
 *
 * Legacy v6.1 4-조건 필드는 FE 호환을 위해 유지하며, v6.3 결과로부터
 * 도출. 새 코드는 category/action/ratio 를 사용.
 */
export interface ExitDecision {
  // ── v6.3 primary fields ──
  category: ExitCategory;
  action: ExitAction;
  /** 청산 비율 (1.0 = 전체 / 0.5 = 50% partial / 0 = stop 이동만). */
  ratio: number;
  reasons: string[];
  /** category=B 일 때만 의미 있음. [0, 1] 범위. */
  reversalScore?: number;
  reversalBreakdown?: ReversalScoreBreakdown;

  // ── v6.1 legacy compatibility (FE backward compat) ──
  /** 4개 조건 중 충족된 개수. v6.3 이후엔 reversal-score 의 트리거 카운트로 대체. */
  conditionsMet: number;
  total: 4;
  /** 약세 패턴 감지로 2/4 완화 적용 여부 (v6.1 호환). */
  relaxedToBearish: boolean;
  /** 어떤 조건들이 충족되었는지 (v6.1 호환). */
  triggers: ("bbMiddle" | "rsi65" | "adx30" | "plusDi25")[];
}

// ─── VWAP Strategy (Parker Brooks Style) ────────────────────────────────────

export type VwapPosition = "ABOVE" | "BELOW" | "AT";
export type EmaPosition = "ABOVE" | "BELOW" | "AT";

export interface VwapSignal {
  side: "LONG" | "SHORT";
  /** 0~100 composite */
  strength: number;
  /** Human-readable reasons (for click-detail dialogs) */
  reasons: string[];
}

/** VWAP 표준편차 밴드 (volume-weighted variance) — VWAP_STRATEGY.md §6.3 */
export interface VwapBands {
  vwap: number;
  /** Volume-weighted standard deviation of typical-price */
  sigma: number;
  upper1: number;
  upper2: number;
  upper3: number;
  lower1: number;
  lower2: number;
  lower3: number;
}

/**
 * Pullback v2 검증 결과 — VWAP_STRATEGY.md §8 의 "터치 + 반등" 패턴.
 * 헌장 규칙 3 준수: standalone 시그널 X, BBDX 보조 입력으로만 사용.
 */
export interface PullbackQuality {
  detected: boolean;
  /** Index in candles[] where the touch occurred (lookback window) */
  touchCandleIdx: number | null;
  /** Whether the next 1~2 candles after touch confirmed bounce in trend direction */
  bounceConfirmed: boolean;
  /** Closest distance to VWAP/EMA9 during the lookback window (0~1) */
  proximityRatio: number;
  /** Which line was touched */
  touchedLine: "vwap" | "ema9" | null;
}

/** 멀티 TF 정합 결과 — `vwap-multi-tf.ts` */
export type AlignmentLevel = "aligned" | "partial" | "mixed" | "neutral";

export interface MultiTfAlignmentPerTf {
  side: "LONG" | "SHORT" | null;
  strength: number;
}

export interface MultiTfAlignment {
  tfs: ("1h" | "4h" | "1d")[];
  alignmentLevel: AlignmentLevel;
  perTf: Record<string, MultiTfAlignmentPerTf>;
  /** Multiplier suggestion for caller (aligned 1.15, partial 1.05, mixed 0.95, neutral 1.0) */
  multiplier: number;
}

// ────────────────────────────────────────────────────────────────────────────

/** 스캔 결과 (개별 코인) */
export interface CoinScanResult {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  indicators: TechnicalIndicators;

  // Legacy boolean — kept for the current frontend (until PR B). Equivalent to
  // `entryDecision != null` and `exitDecision != null`.
  isEntrySignal: boolean;
  isExitSignal: boolean;

  signalStrength: number;
  fibSignal?: {
    level: number;
    price: number;
    type: "buy" | "sell";
  };
  trendSignal?: {
    type: "buy" | "sell";
    trendType: "support" | "resistance";
  };

  // BBDX-PATTERN v6.1 additions —
  pressure: PressureLabel;
  pressureStrong: boolean;
  /** 0~100, 100 - (ADX × 2.5) */
  reversalProb: number;
  /** 최근 5캔들 평균 / 전체 평균 */
  volumeRatio: number;
  /** -5 / 0 / +15 — strength 점수 기여분 */
  volumeConfirmation: number;
  /** 최근 5캔들 윈도우 내 감지된 모든 패턴 (dedup 없이 — confluence 정보 보존) */
  candlePatterns: CandlePatternMatch[];
  /**
   * Audit-권고 (multi-pattern + 거래량 + 추세 + TF) 적용한 합산 신뢰도.
   * 강세/약세 별로 0~1 score, primary 패턴, 거래량/추세 컨텍스트 포함.
   * 헌장 규칙 3 준수: BBDX multiplier 로만 사용, 단독 시그널 X.
   */
  patternConfluence: PatternConfluenceSummary | null;
  bbStructure: BBStructure | null;
  /** SHORT BB 구조 (4가지 미러). null = 미감지. */
  bbStructureShort: BBStructureShort | null;
  entryDecision: EntryDecision | null;
  /** SHORT 진입 결정 (LONG 시그널 없을 때 평가). */
  shortDecision: ShortEntryDecision | null;
  /** SHORT 진입 시 손절 = BB상단 × 1.03 */
  shortStopLossPrice: number;
  /** SHORT 진입 시그널 강도 (0~100, LONG 과 분리) */
  shortSignalStrength: number;
  exitDecision: ExitDecision | null;
  /** BB하단 × 0.97 */
  stopLossPrice: number;
  /** currentPrice ≤ stopLossPrice */
  isStopLossHit: boolean;
  /** -DI > +DI AND ADX > 25 — LONG 진입 차단 */
  isFallingKnife: boolean;
  /** +DI > -DI AND ADX > 25 — SHORT 진입 차단 (Rising Knife) */
  isRisingKnife: boolean;

  // ─── VWAP Strategy fields ───────────────────────────────────────────────
  /** Volume-weighted average price across the loaded candle range. */
  vwap: number;
  /** 9-period EMA of close prices. */
  ema9: number;
  vwapPosition: VwapPosition;
  emaPosition: EmaPosition;
  /** Price retraced toward VWAP/EMA(9) without crossing. */
  pullbackDetected: boolean;
  /** LONG/SHORT signal derived from VWAP+EMA confluence. null if neither. */
  vwapSignal: VwapSignal | null;
}

/** 시그널 상세 */
export interface SignalDetail {
  id: number;
  symbol: string;
  entryPrice: number;
  currentPrice: number | null;
  targetPrice: number | null;
  rsiValue: number;
  bbLower: number;
  bbMiddle: number;
  bbUpper: number;
  adxValue: number;
  plusDi: number;
  minusDi: number;
  status: "active" | "target_hit" | "expired" | "closed";
  detectedAt: Date;
  targetHitAt: Date | null;
  pnlPercent?: number;
}

/** 포지션 상세 */
export interface PositionDetail {
  id: number;
  symbol: string;
  entryPrice: number;
  targetPrice: number | null;
  currentPrice: number | null;
  quantity: number;
  leverage: number;
  pnlPercent: number | null;
  pnlAmount: number | null;
  status: "open" | "closed" | "liquidated";
  openedAt: Date;
  closedAt: Date | null;
}

/** 지원 타임프레임 */
export const TIMEFRAMES = [
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "6h", label: "6H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1M", label: "1M" },
] as const;

export type TimeframeValue = typeof TIMEFRAMES[number]["value"];

/** 바이비트 API interval 매핑 */
export const BYBIT_INTERVAL_MAP: Record<TimeframeValue, string> = {
  "1h": "60",
  "4h": "240",
  "6h": "360",
  "1d": "D",
  "1w": "W",
  "1M": "M",
};

/** 매수 진입 조건 기본값 */
export const DEFAULT_ENTRY_CONDITIONS = {
  rsiLow: 30,
  rsiHigh: 35,
  adxThreshold: 30,
  useBbLower: true,
} as const;

/** 목표가 조건 기본값 */
export const DEFAULT_EXIT_CONDITIONS = {
  targetRsi: 70,
  targetAdx: 30,
  targetPlusDi: 30,
  useBbMiddleTarget: true,
} as const;
