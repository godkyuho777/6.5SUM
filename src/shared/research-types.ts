/**
 * 리서치 퍼블리싱 허브 — 백/프론트 공유 타입 (2026-06-14).
 *
 * 프론트엔드(`tradelab-frontend/src/lib/research-types.ts`) 의 `ResearchArticle`
 * 모양과 *동일*하게 유지한다. 프론트가 mock 데이터를 tRPC 응답으로 교체할 때
 * 화면이 불변이어야 하므로 필드 이름/타입이 일치해야 한다.
 *
 * 주의: 색맵(RESEARCH_SECTORS)·라벨·날짜 포맷 등 presentation 메타는 프론트에
 * 남긴다. 백엔드는 데이터 + 타입만 보유.
 *
 * 헌장: 리서치는 *디스커버리/교육* 콘텐츠. BBDX 시그널 시스템과 무관하며
 * 단독 매매 시그널을 발행하지 않는다.
 */

// ── 리서치 타입 ──────────────────────────────────────────────────
export type ResearchType = "weekly" | "deepdive" | "flash";

/**
 * 리서치 섹터 키 — 프론트엔드 `ResearchSectorId` (`SectorId | "btc" | "depin"`)
 * 와 동일한 멤버를 self-contained literal union 으로 보유한다. 백엔드는
 * lucide-react 에 의존하는 `sector-taxonomy.ts` 를 import 하지 않으므로, 같은
 * 멤버 집합을 여기 직접 나열해 타입 shape 을 프론트와 일치시킨다.
 */
export type ResearchSectorId =
  | "layer-1"
  | "layer-2"
  | "defi"
  | "meme"
  | "ai"
  | "gaming"
  | "solana-eco"
  | "cosmos-eco"
  | "perp-dex"
  | "oracle-data"
  | "rwa"
  | "zk-privacy"
  | "other"
  | "btc"
  | "depin";

/** 목차 항목 */
export interface ResearchTocItem {
  no: string;
  title: string;
}

// ── 리서치 기사 ──────────────────────────────────────────────────
export interface ResearchArticle {
  slug: string;
  type: ResearchType;
  title: string;
  /** 1~2줄 요약 (목록 카드 dek) */
  dek: string;
  sector: ResearchSectorId;
  /** 중복 내러티브 태그 */
  tags: string[];
  /** 관련 자산 티커 (예: ["BTC"]) */
  assets: string[];
  author: string;
  readMinutes: number;
  /** ISO 발행 일시 */
  publishedAt: string;
  featured?: boolean;
  /** 핵심 요약 불릿 */
  takeaways: string[];
  /** 목차 */
  toc: ResearchTocItem[];
  /** 본문 HTML — 카드용 list 응답에서는 제외, detail 응답에만 포함 */
  bodyHtml?: string;
  /** 네이버 원문 (있으면 "네이버 원문" 버튼 노출) */
  naverUrl?: string;
  /** 정본(canonical) 전략 보류 — 필드만 유지 */
  canonical?: string | null;
}

/**
 * 카드/목록용 요약 — bodyHtml 을 제외한 ResearchArticle.
 * payload 절감용. featured 판별·요약 표시에 필요한 필드는 모두 포함.
 */
export type ResearchArticleSummary = Omit<ResearchArticle, "bodyHtml">;
