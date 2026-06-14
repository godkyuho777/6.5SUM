/**
 * Risk Score — 타입 정의 (Tradelab per-coin / market-wide 위험 지표).
 *
 * ⚠ DISPLAY-ONLY / informational metric (헌장 규칙 3 보존).
 * Risk Score 는 BBDX 진입/청산 시그널, signalStrength, position sizing,
 * 또는 어떤 매매 결정에도 절대 영향을 주지 않는다. modifier 조차 아니다 —
 * BBDX 점수를 전혀 건드리지 않으며, 오직 UI 표시 용으로 산출/반환한다.
 *
 * 구조는 onchain/* 모듈을 미러: 순수 compute 함수(score.ts) + fetch 래퍼
 * (score-fetch.ts) + 테스트(__tests__/score.test.ts).
 *
 * 5개 차원 (각 0-100, 높을수록 위험):
 *   - volatility: 일봉 ATR / price 기반 변동성
 *   - liquidity:  24h 거래량 + 시총 기반 (낮을수록 위험)
 *   - leverage:   funding / long-short / OI 변화 기반 파생 과열
 *   - trend:      30일 고점 대비 낙폭 + falling-knife
 *   - regime:     Fear & Greed + macro 유동성 regime 기반 시장 환경
 */

/** 위험 밴드 (score 경계: <25 low, <50 moderate, <75 high, else extreme). */
export type RiskBand = "low" | "moderate" | "high" | "extreme";

/** 5개 위험 차원 이름. */
export type RiskDimensionName =
  | "volatility"
  | "liquidity"
  | "leverage"
  | "trend"
  | "regime";

/** 차원별 점수 분해. null = 입력 부재로 산출 불가(합산에서 제외). */
export interface RiskBreakdown {
  /** 0-100, null = 데이터 미가용. */
  volatility: number | null;
  liquidity: number | null;
  leverage: number | null;
  trend: number | null;
  regime: number | null;
}

/** 단일 심볼의 종합 위험 결과. */
export interface RiskScoreResult {
  symbol: string;
  /** 0-100 종합 점수. 높을수록 위험. 산출된 차원만 가중 합산 후 재정규화. */
  score: number;
  band: RiskBand;
  breakdown: RiskBreakdown;
  /** 실제 합산에 포함된 차원 목록. */
  includedDimensions: RiskDimensionName[];
  /** includedDimensions.length / 5 (0~1). */
  coverage: number;
  /** 사람이 읽을 수 있는 한글 플래그 (비어 있을 수 있음). */
  notes: string[];
  /** new Date().toISOString(). */
  asOf: string;
}

/** 시장 전체(systemic) 위험 결과. */
export interface MarketRiskResult {
  /** 0-100 systemic/market-wide 위험. */
  score: number;
  band: RiskBand;
  /** 0-100 Fear & Greed. */
  fearGreed: number;
  fearGreedLabel: string;
  /** macro 모듈의 유동성 regime 라벨. */
  macroRegime: string;
  components: { fgRisk: number; macroRisk: number };
  asOf: string;
}
