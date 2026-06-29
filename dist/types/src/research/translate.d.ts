/**
 * 리서치 영어 번역 — 온디맨드 LLM 번역 + 서버 캐시 (2026-06-25).
 *
 * KO→EN 언어 토글용. 기사 메타(title/dek/takeaways/toc)와 본문(bodyHtml)을
 * OpenRouter LLM 으로 번역해 in-memory 캐시(slug+lang)에 둔다. 본문은 HTML
 * 구조·href·id/class·티커·숫자를 그대로 보존하고 텍스트 노드만 번역하도록 강제.
 *
 * graceful (헌장):
 *   - OPENROUTER_API_KEY 미설정 → status:"unavailable" (프론트는 원문 KO 유지 + 안내).
 *   - LLM 실패 → status:"error" (절대 throw 로 호출 체인 깨지 않음).
 * 번역은 디스커버리/교육 콘텐츠의 접근성 확장이며 단독 매매 신호와 무관하다.
 */
export type ResearchLang = "en";
export interface ResearchTranslation {
    status: "ok" | "unavailable" | "error";
    lang: ResearchLang;
    title?: string;
    dek?: string;
    takeaways?: string[];
    toc?: {
        no: string;
        title: string;
    }[];
    bodyHtml?: string;
    /** unavailable/error 사유 (프론트 안내용) */
    detail?: string;
}
export declare function translateResearch(slug: string, lang?: ResearchLang): Promise<ResearchTranslation>;
