/**
 * 리서치 퍼블리싱 허브 — 모듈 barrel.
 * routers.ts 의 researchRouter 가 여기서 seed + 헬퍼 + 타입을 가져온다.
 */
export { RESEARCH_ARTICLES, listResearch, getResearchBySlug, getRelatedResearch, type ListResearchInput, } from "./articles";
export type { ResearchArticle, ResearchArticleSummary, ResearchSectorId, ResearchTocItem, ResearchType, } from "../shared/research-types";
