/**
 * Tracker Taxonomy — 3-Layer Tracker Hub 의 단일 진실 소스(SSoT).
 *
 * 백엔드/프론트엔드가 공통으로 참조하는 modifier 메타데이터.
 * 프론트엔드는 본 파일의 데이터를 tRPC (`taxonomy.list` 등) 로 받아 라우팅/UI 를
 * 동적으로 구성한다. 새 modifier 추가 시 본 파일만 갱신하면 프론트가 자동 반영.
 *
 * 헌장 규칙 3 (modifier-only):
 *   모든 항목은 `modifierOnly: true` 여야 한다.
 *   `validateTaxonomy` 가 모듈 로드 시 즉시 검증 → 위반 시 부팅 거부.
 *
 * 차원 매핑 (BBDX 7-dimensional framework):
 *   1=모멘텀, 2=변동성, 3=추세, 4=거래량, 5=구조, 6=매크로, 7=온체인.
 */

export type TrackerLayer = "signal" | "wave" | "macro" | "onchain";
export type ModifierStatus = "active" | "beta" | "bbdx_internal" | "planned";

export interface TrackerModifier {
  /** URL slug (kebab-case) */
  slug: string;
  /** UI 표시명 */
  displayName: string;
  layer: TrackerLayer;
  /** 헌장 1~7 차원 (배열, 보통 1개) */
  dimensions: number[];
  status: ModifierStatus;
  /** 헌장 규칙 3 — 항상 true (false 박으면 부팅 거부) */
  modifierOnly: true;
  /** 프론트 라우트 (`/trackers/{layer}/{slug}`) */
  route: string;
  /** 기존 `/strategies/...` (있으면 redirect 대상) */
  legacyRoute?: string;
  /** 1줄 설명 (한국어 OK) */
  description: string;
  source: "bbdx_internal" | "tRPC" | "client";
}

export const TRACKER_MODIFIERS: readonly TrackerModifier[] = [
  // ─── Signal Tracker (Layer 1 — 4H 캔들 단위) ────────────────
  {
    slug: "bbdx",
    displayName: "BBDX 진입 룰",
    layer: "signal",
    dimensions: [1, 2, 3, 4],
    status: "active",
    modifierOnly: true,
    route: "/trackers/signal/bbdx",
    description: "RSI + BB + ADX 3-path (NUM/PTN/BB) 통합 진입 룰 — 핵심 코어",
    source: "tRPC",
  },
  {
    slug: "rsi",
    displayName: "RSI",
    layer: "signal",
    dimensions: [1],
    status: "bbdx_internal",
    modifierOnly: true,
    route: "/trackers/signal/rsi",
    description: "1차원 모멘텀 — BBDX 내부 사용",
    source: "bbdx_internal",
  },
  {
    slug: "macd-divergence",
    displayName: "MACD Divergence",
    layer: "signal",
    dimensions: [1],
    status: "active",
    modifierOnly: true,
    route: "/trackers/signal/macd-divergence",
    legacyRoute: "/strategies/macd-divergence",
    description: "1차원 모멘텀 — 가격 swing vs MACD hist swing 다이버전스",
    source: "tRPC",
  },
  {
    slug: "bb-position",
    displayName: "BB Position",
    layer: "signal",
    dimensions: [2],
    status: "bbdx_internal",
    modifierOnly: true,
    route: "/trackers/signal/bb-position",
    description: "2차원 변동성 — BBDX 내부 사용",
    source: "bbdx_internal",
  },
  {
    slug: "atr",
    displayName: "ATR",
    layer: "signal",
    dimensions: [2],
    status: "bbdx_internal",
    modifierOnly: true,
    route: "/trackers/signal/atr",
    description: "2차원 변동성 — BBDX STOP 계산용",
    source: "bbdx_internal",
  },
  {
    slug: "adx",
    displayName: "ADX",
    layer: "signal",
    dimensions: [3],
    status: "bbdx_internal",
    modifierOnly: true,
    route: "/trackers/signal/adx",
    description: "3차원 추세 (캔들) — BBDX Falling Knife 필터",
    source: "bbdx_internal",
  },
  {
    slug: "volume-ratio",
    displayName: "Volume Ratio",
    layer: "signal",
    dimensions: [4],
    status: "bbdx_internal",
    modifierOnly: true,
    route: "/trackers/signal/volume-ratio",
    description: "4차원 거래량 — EMA50 baseline 대비 비율",
    source: "bbdx_internal",
  },
  {
    slug: "cvd-divergence",
    displayName: "CVD Divergence",
    layer: "signal",
    dimensions: [4],
    status: "beta",
    modifierOnly: true,
    route: "/trackers/signal/cvd-divergence",
    legacyRoute: "/strategies/cvd",
    description:
      "4차원 거래량 — 누적 거래량 델타 다이버전스 (BETA, WebSocket 통합 대기)",
    source: "tRPC",
  },

  // ─── Wave Tracker (Layer 2 — 며칠~몇주 파동) ─────────────────
  {
    slug: "ema-ribbon",
    displayName: "EMA Ribbon",
    layer: "wave",
    dimensions: [3],
    status: "active",
    modifierOnly: true,
    route: "/trackers/wave/ema-ribbon",
    legacyRoute: "/strategies/ema-ribbon",
    description: "3차원 추세 (파동) — 다중 EMA 정렬",
    source: "tRPC",
  },
  {
    slug: "order-block",
    displayName: "Order Block",
    layer: "wave",
    dimensions: [5],
    status: "active",
    modifierOnly: true,
    route: "/trackers/wave/order-block",
    legacyRoute: "/strategies/order-block",
    description: "5차원 구조 — 기관 매수/매도 영역",
    source: "tRPC",
  },

  // ─── Macro Tracker (Layer 3 — 수개월+ 거시) ──────────────────
  {
    slug: "funding-extreme",
    displayName: "Funding Extreme",
    layer: "macro",
    dimensions: [6],
    status: "active",
    modifierOnly: true,
    route: "/trackers/macro/funding-extreme",
    legacyRoute: "/strategies/funding-extreme",
    description: "6차원 매크로 — 펀딩 비율 극단치 reversal",
    source: "tRPC",
  },
  {
    slug: "market-breadth",
    displayName: "Market Breadth",
    layer: "macro",
    dimensions: [6],
    status: "active",
    modifierOnly: true,
    route: "/trackers/macro/market-breadth",
    legacyRoute: "/strategies/market-breadth",
    description: "6차원 매크로 — 시장 폭/참여도",
    source: "tRPC",
  },
] as const;

/**
 * 헌장 검증 — 모듈 로드 시 즉시 실행 (위반 시 throw).
 *   - modifierOnly === true (헌장 규칙 3)
 *   - dimensions 비어있지 않고, 각 차원이 [1,7] 범위
 *   - route 가 `/trackers/{layer}/` 로 시작
 */
export function validateTaxonomy(items: readonly TrackerModifier[]): void {
  for (const m of items) {
    if (m.modifierOnly !== true) {
      throw new Error(
        `[taxonomy] modifierOnly must be true (헌장 규칙 3) — ${m.slug}`
      );
    }
    if (m.dimensions.length < 1) {
      throw new Error(`[taxonomy] dimensions must have >=1 — ${m.slug}`);
    }
    for (const d of m.dimensions) {
      if (d < 1 || d > 7) {
        throw new Error(
          `[taxonomy] dimension out of [1,7] — ${m.slug}: ${d}`
        );
      }
    }
    if (!m.route.startsWith(`/trackers/${m.layer}/`)) {
      throw new Error(`[taxonomy] route mismatch with layer — ${m.slug}`);
    }
  }
}
validateTaxonomy(TRACKER_MODIFIERS);

// ─── 조회 헬퍼 ─────────────────────────────────────────────
export function listModifiers(layer?: TrackerLayer): readonly TrackerModifier[] {
  return layer
    ? TRACKER_MODIFIERS.filter((m) => m.layer === layer)
    : TRACKER_MODIFIERS;
}

export function getModifier(slug: string): TrackerModifier | null {
  return TRACKER_MODIFIERS.find((m) => m.slug === slug) ?? null;
}
