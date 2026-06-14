/**
 * 리서치 퍼블리싱 허브 — seed 데이터 + 조회 헬퍼 (2026-06-14).
 *
 * stub-first: DB 테이블/마이그레이션 없이 in-memory seed 를 서빙한다. 향후
 * `research_articles` 테이블이 붙으면 아래 RESEARCH_ARTICLES / 헬퍼를 DB 조회로
 * 교체한다(`routers.ts` 의 TODO 참고).
 *
 * 내용은 프론트엔드 mock(`tradelab-frontend/src/lib/research-types.ts`) 과
 * *동일*하게 유지한다 — 프론트가 mock 을 tRPC 응답으로 교체할 때 화면이
 * 불변이어야 하기 때문.
 *
 * 헌장: 리서치는 *디스커버리/교육* 콘텐츠. BBDX 시그널 시스템과 무관하며
 * 단독 매매 시그널을 발행하지 않는다.
 */
import type { ResearchArticle, ResearchArticleSummary, ResearchSectorId, ResearchType } from "../shared/research-types";
export declare const RESEARCH_ARTICLES: ResearchArticle[];
export interface ListResearchInput {
    type?: ResearchType;
    sector?: ResearchSectorId;
    /** 제목/dek/태그 부분 일치(대소문자 무시) */
    q?: string;
}
/**
 * 목록 조회 — type/sector/q 필터 적용 후 최신순 정렬, bodyHtml 제외 요약 반환.
 * 카드 그리드용. featured 판별·요약 표시에 필요한 필드는 모두 포함.
 */
export declare function listResearch(input?: ListResearchInput): ResearchArticleSummary[];
/** 단일 기사(본문 포함) 조회 — 없으면 null (throw 금지) */
export declare function getResearchBySlug(slug: string): ResearchArticle | null;
/**
 * 연관 기사 — 같은 섹터 우선, 부족하면 최신순으로 채워 최대 n개(요약, 본문 제외).
 * 기준 slug 자신은 제외. slug 미존재 시 빈 배열.
 */
export declare function getRelatedResearch(slug: string, n?: number): ResearchArticleSummary[];
