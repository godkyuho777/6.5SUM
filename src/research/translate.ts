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

import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { getResearchBySlug } from "./articles";
import type { ResearchArticle } from "../shared/research-types";

export type ResearchLang = "en";

export interface ResearchTranslation {
  status: "ok" | "unavailable" | "error";
  lang: ResearchLang;
  title?: string;
  dek?: string;
  takeaways?: string[];
  toc?: { no: string; title: string }[];
  bodyHtml?: string;
  /** unavailable/error 사유 (프론트 안내용) */
  detail?: string;
}

// slug:lang → 번역 결과. 프로세스 생명주기 캐시(기사 수정 시 서버 재시작 필요).
const CACHE = new Map<string, ResearchTranslation>();

/** LLM 이 종종 감싸는 ```json / ```html 펜스·BOM 제거 */
function stripFence(s: string): string {
  return s
    .replace(/^﻿/, "")
    .replace(/^```(?:json|html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function contentOf(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const c = result.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : "";
}

const DESK_TONE =
  "You are a professional financial translator for an institutional crypto-research desk (hedge-fund tone, e.g. Citadel/Point72). Translate Korean to natural, precise English.";

/** 메타(title·dek·takeaways·toc) — JSON in/out, 배열 길이·순서 보존 */
async function translateMeta(article: ResearchArticle): Promise<{
  title: string;
  dek: string;
  takeaways: string[];
  toc: string[];
}> {
  const src = {
    title: article.title,
    dek: article.dek,
    takeaways: article.takeaways,
    toc: article.toc.map((t) => t.title),
  };
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${DESK_TONE} Return ONLY valid JSON with the EXACT same keys and array lengths/order as the input. Keep ticker symbols, numbers, $ figures, %, and dates unchanged. No commentary, no code fences.`,
      },
      {
        role: "user",
        content: `Translate the string values of this JSON to English (keep keys and array order/length identical):\n${JSON.stringify(
          src,
        )}`,
      },
    ],
    maxTokens: 1500,
  });
  const parsed = JSON.parse(stripFence(contentOf(result))) as {
    title?: unknown;
    dek?: unknown;
    takeaways?: unknown;
    toc?: unknown;
  };
  return {
    title: typeof parsed.title === "string" ? parsed.title : article.title,
    dek: typeof parsed.dek === "string" ? parsed.dek : article.dek,
    takeaways: Array.isArray(parsed.takeaways)
      ? parsed.takeaways.map((x) => String(x))
      : article.takeaways,
    toc: Array.isArray(parsed.toc) ? parsed.toc.map((x) => String(x)) : src.toc,
  };
}

/** 본문 — HTML 구조 보존, 텍스트 노드만 번역 */
async function translateBody(html: string): Promise<string> {
  if (!html.trim()) return "";
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `${DESK_TONE} You are given an HTML fragment. CRITICAL RULES: (1) Preserve the HTML structure EXACTLY — every tag, attribute, class, id, and href must remain byte-identical. (2) Translate ONLY human-readable text: paragraph text, headings, table cells, blockquotes, list items, figcaption, and aria-label/alt text. (3) Do NOT translate or alter URLs/href, class names, id values, ticker symbols, numbers, $ figures, %, or dates. (4) Output ONLY the translated HTML fragment — no code fences, no commentary.`,
      },
      { role: "user", content: html },
    ],
    maxTokens: 12000,
  });
  return stripFence(contentOf(result));
}

export async function translateResearch(
  slug: string,
  lang: ResearchLang = "en",
): Promise<ResearchTranslation> {
  const key = `${slug}:${lang}`;
  const hit = CACHE.get(key);
  if (hit) return hit;

  const article = getResearchBySlug(slug);
  if (!article) {
    return { status: "error", lang, detail: "기사를 찾을 수 없습니다." };
  }

  // 키 없음 — graceful. 캐시하지 않는다(키 설정 시 즉시 동작하도록).
  if (!ENV.openrouterApiKey) {
    return {
      status: "unavailable",
      lang,
      detail: "영어 번역은 서버 LLM 키(OPENROUTER_API_KEY) 설정 시 제공됩니다.",
    };
  }

  try {
    const [meta, bodyHtml] = await Promise.all([
      translateMeta(article),
      translateBody(article.bodyHtml ?? ""),
    ]);
    const out: ResearchTranslation = {
      status: "ok",
      lang,
      title: meta.title,
      dek: meta.dek,
      takeaways: meta.takeaways,
      toc: article.toc.map((t, i) => ({
        no: t.no,
        title: meta.toc[i] ?? t.title,
      })),
      bodyHtml,
    };
    CACHE.set(key, out);
    return out;
  } catch (err) {
    const detail = (err as Error)?.message ?? String(err);
    console.error(`[research.translate] ${slug} 번역 실패:`, detail);
    return { status: "error", lang, detail };
  }
}
