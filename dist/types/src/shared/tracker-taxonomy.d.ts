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
export declare const TRACKER_MODIFIERS: readonly TrackerModifier[];
/**
 * 헌장 검증 — 모듈 로드 시 즉시 실행 (위반 시 throw).
 *   - modifierOnly === true (헌장 규칙 3)
 *   - dimensions 비어있지 않고, 각 차원이 [1,7] 범위
 *   - route 가 `/trackers/{layer}/` 로 시작
 */
export declare function validateTaxonomy(items: readonly TrackerModifier[]): void;
export declare function listModifiers(layer?: TrackerLayer): readonly TrackerModifier[];
export declare function getModifier(slug: string): TrackerModifier | null;
