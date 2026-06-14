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

import type {
  ResearchArticle,
  ResearchArticleSummary,
  ResearchSectorId,
  ResearchType,
} from "../shared/research-types";

// ── mock 본문 (featured 1개 충실, weekly 1개 보강) ────────────────
const RWA_PRIMER_BODY = `
<h2 id="s1">1. 토큰화 국채가 만든 새로운 기준금리</h2>
<p>온체인 자본시장에서 가장 빠르게 자리 잡은 자산은 변동성 큰 알트코인이 아니라, 미국 단기 국채를 토큰화한 상품이었다. 미 국채 수익률이 4~5% 구간에 머무는 동안, 스테이블코인으로 유휴 상태에 있던 자본은 "온체인에서도 무위험에 가까운 이자"를 요구하기 시작했다. 토큰화 국채(tokenized treasuries)는 이 수요에 정확히 응답하는 상품이다.</p>
<p>핵심은 이것이 단순한 신상품이 아니라 <strong>온체인 세계의 기준금리(risk-free rate)</strong> 역할을 하기 시작했다는 점이다. DeFi 대출 프로토콜의 조달 금리, RWA 담보 대출의 하한선, 스테이블코인 발행사의 준비금 운용까지 — 토큰화 국채 수익률이 여러 시장의 가격 기준점으로 스며들고 있다.</p>

<figure>
  <div class="prose-figure-placeholder" role="img" aria-label="토큰화 국채 시장 규모 추이 차트 자리"></div>
  <figcaption>그림 1. 토큰화 국채 시장 규모는 18개월 만에 의미 있는 자산군으로 성장했다 (개념도, 데이터는 발행 시점 기준).</figcaption>
</figure>

<h2 id="s2">2. 누가 발행하고 누가 사는가</h2>
<p>발행 측은 크게 세 부류로 나뉜다. 첫째, 자산운용사가 머니마켓펀드(MMF)를 토큰 래퍼로 감싼 형태. 둘째, 크립토 네이티브 프로토콜이 국채 ETF·repo 포지션을 담보로 온체인 토큰을 발행하는 형태. 셋째, 핀테크·브로커가 규제 샌드박스 안에서 발행하는 형태다.</p>
<p>수요 측은 의외로 "리테일 투기 수요"가 아니다. 가장 큰 매수 주체는 <strong>DAO 트레저리, 스테이블코인 발행사, 온체인 펀드</strong>다. 이들은 수억 달러 규모의 유휴 스테이블코인을 보유하면서, 이를 그냥 놀리는 대신 토큰화 국채로 옮겨 이자를 확보한다.</p>

<blockquote>"RWA는 크립토가 전통 금융을 흉내 내는 단계가 아니라, 전통 금융의 캐시플로우를 크립토의 결제 레일 위에 올리는 단계다."</blockquote>

<h2 id="s3">3. 구조적 리스크: 오프체인 의존성</h2>
<p>토큰화 국채의 가장 큰 약점은 역설적으로 그 강점에서 나온다. 수익의 원천이 오프체인(실제 국채)에 있기 때문에, 온체인 토큰 보유자는 <strong>발행사·커스터디언·법적 래퍼</strong>라는 신뢰 사슬에 의존한다. 스마트컨트랙트가 아무리 견고해도, 기초 자산을 보관하는 신탁이나 발행사의 파산은 코드로 막을 수 없다.</p>

<div class="prose-callout" data-variant="warn">
  <p><strong>주의.</strong> "온체인이라 안전하다"는 직관은 RWA에는 적용되지 않는다. RWA의 신용 위험은 발행사의 신용 위험과 같다. 토큰의 스마트컨트랙트 감사 여부보다, <em>기초 자산이 실제로 격리(bankruptcy-remote)되어 있는지</em>가 훨씬 중요하다.</p>
</div>

<h2 id="s4">4. 투자자 관점 체크리스트</h2>
<p>RWA 섹터 토큰을 평가할 때는 거버넌스 토큰의 가격 모멘텀이 아니라, 다음 구조적 질문에 먼저 답해야 한다. 기초 자산은 무엇이며 누가 보관하는가. 수익은 토큰 보유자에게 어떤 경로로 분배되는가. 발행사가 사라지면 자산을 회수할 법적 청구권이 있는가. 이 세 가지가 명확하지 않다면, 표시된 APY가 아무리 매력적이어도 그것은 신용 위험의 대가일 뿐이다.</p>
<p>그럼에도 방향성은 분명하다. 온체인 자본이 "무위험 이자"라는 닻을 갖게 되면서, 시장 전체의 자본 배분이 한층 정교해지고 있다. RWA는 다음 사이클의 인프라 레이어로 자리 잡을 가능성이 높다.</p>
`;

const WEEKLY_DEX_BODY = `
<h2 id="w1">한 주 요약</h2>
<p>이번 주 온체인 활동의 핵심은 두 가지다. 첫째, 주요 DEX의 거래량이 4주간의 하락세를 끊고 반등했다. 둘째, 스테이블코인 총공급이 소폭 증가하며 "대기 자본"이 늘었다. 두 지표가 같은 방향을 가리킬 때는 통상 위험선호(risk-on) 초기 국면으로 해석된다.</p>

<h2 id="w2">DEX 거래량 — 무엇이 반등을 이끌었나</h2>
<p>반등의 주역은 신규 내러티브 토큰의 회전(rotation)이었다. 다만 거래량 회복이 곧 추세 전환을 의미하지는 않는다. 거래량은 변동성에 후행하기 쉬워, 단기 가격 급변이 만든 일시적 회전일 가능성도 열어 둬야 한다.</p>

<blockquote>스테이블코인 공급 증가 + DEX 거래량 반등의 조합은 "자본은 들어왔고, 이제 어디로 갈지 정하는 중"이라는 신호에 가깝다.</blockquote>

<h2 id="w3">스테이블코인 공급 추이</h2>
<p>스테이블코인 총공급은 시장의 건드라이 파우더(dry powder)다. 공급이 늘었다는 것은 법정화폐가 온체인으로 유입됐다는 뜻이고, 이 자본이 위험자산으로 회전하면 가격 상승의 연료가 된다. 다만 공급 증가가 곧바로 매수로 이어진다는 보장은 없다 — 토큰화 국채 등 "온체인 현금성 자산"에 머무를 수도 있다.</p>

<div class="prose-callout" data-variant="warn">
  <p><strong>주의.</strong> 본 주간 시황은 시장 구조 관찰이며, BBDX 시그널과 무관하다. 개별 진입/청산 판단은 시그널 스캐너의 RSI·BB·ADX 컨플루언스를 따른다.</p>
</div>
`;

// ── seed 기사 6개 (프론트 mock 과 내용 동일) ─────────────────────
export const RESEARCH_ARTICLES: ResearchArticle[] = [
  {
    slug: "rwa-sector-primer",
    type: "deepdive",
    title: "RWA 섹터 프라이머: 토큰화 국채가 바꾸는 온체인 자본시장",
    dek: "토큰화 국채가 온체인의 기준금리로 자리 잡으며 DeFi·스테이블코인 자본 배분을 재편하고 있다. 구조·발행 주체·리스크를 한 번에 정리한다.",
    sector: "rwa",
    tags: ["RWA", "토큰화 국채", "스테이블코인", "기준금리"],
    assets: ["ONDO", "BTC"],
    author: "김규호",
    readMinutes: 12,
    publishedAt: "2026-06-13T09:00:00+09:00",
    featured: true,
    takeaways: [
      "토큰화 국채는 온체인 세계의 기준금리(risk-free rate) 역할을 시작했다.",
      "최대 수요 주체는 리테일이 아니라 DAO 트레저리·스테이블코인 발행사·온체인 펀드.",
      "핵심 리스크는 스마트컨트랙트가 아니라 발행사·커스터디언의 신용 위험.",
      "평가 기준: 기초 자산, 수익 분배 경로, 파산 시 법적 청구권 3가지.",
    ],
    toc: [
      { no: "01", title: "토큰화 국채가 만든 새로운 기준금리" },
      { no: "02", title: "누가 발행하고 누가 사는가" },
      { no: "03", title: "구조적 리스크: 오프체인 의존성" },
      { no: "04", title: "투자자 관점 체크리스트" },
    ],
    bodyHtml: RWA_PRIMER_BODY,
    naverUrl: "https://blog.naver.com/tradelab/rwa-sector-primer",
    canonical: null,
  },
  {
    slug: "weekly-12-dex-stablecoin",
    type: "weekly",
    title: "DEX 거래량 회복과 스테이블코인 공급 추이 (주간 시황 #12)",
    dek: "주요 DEX 거래량이 4주 만에 반등하고 스테이블코인 공급이 늘며 위험선호 초기 국면 신호가 관찰된다.",
    sector: "defi",
    tags: ["주간 시황", "DEX", "스테이블코인", "TVL"],
    assets: ["UNI", "AAVE"],
    author: "김규호",
    readMinutes: 6,
    publishedAt: "2026-06-12T08:00:00+09:00",
    takeaways: [
      "DEX 거래량이 4주간 하락 후 반등 — 신규 내러티브 토큰 회전이 주도.",
      "스테이블코인 총공급 소폭 증가 = 대기 자본(dry powder) 확대.",
      "두 지표 동반 상승은 위험선호 초기 국면으로 해석되나 추세 전환 확정은 아님.",
    ],
    toc: [
      { no: "01", title: "한 주 요약" },
      { no: "02", title: "DEX 거래량 — 무엇이 반등을 이끌었나" },
      { no: "03", title: "스테이블코인 공급 추이" },
    ],
    bodyHtml: WEEKLY_DEX_BODY,
    canonical: null,
  },
  {
    slug: "depin-sector-map",
    type: "deepdive",
    title: "DePIN 섹터 맵: 컴퓨팅·스토리지·무선 3대 축",
    dek: "분산형 물리 인프라(DePIN)를 컴퓨팅·스토리지·무선 세 축으로 나누고, 각 축의 수요 검증 가능성을 비교한다.",
    sector: "depin",
    tags: ["DePIN", "컴퓨팅", "스토리지", "무선"],
    assets: ["RENDER", "FIL"],
    author: "김규호",
    readMinutes: 9,
    publishedAt: "2026-06-10T09:00:00+09:00",
    takeaways: [
      "DePIN은 컴퓨팅·스토리지·무선 3대 축으로 분해하면 평가가 쉬워진다.",
      "토큰 인센티브가 실제 인프라 수요로 전환되는지가 핵심 검증 포인트.",
    ],
    toc: [
      { no: "01", title: "DePIN이란 무엇인가" },
      { no: "02", title: "3대 축 비교" },
      { no: "03", title: "수요 검증 프레임워크" },
    ],
    canonical: null,
  },
  {
    slug: "layer2-competition",
    type: "deepdive",
    title: "Layer 2 경쟁 구도: 수수료·TVL·시퀀서 탈중앙화",
    dek: "주요 Layer 2를 수수료·TVL·시퀀서 탈중앙화 세 지표로 비교하고, 차별화가 어디서 생기는지 짚는다.",
    sector: "layer-2",
    tags: ["Layer 2", "TVL", "시퀀서", "롤업"],
    assets: ["ARB", "OP"],
    author: "김규호",
    readMinutes: 11,
    publishedAt: "2026-06-08T09:00:00+09:00",
    takeaways: [
      "L2 차별화는 수수료보다 시퀀서 탈중앙화·생태계 락인에서 발생한다.",
      "TVL 절대치보다 TVL의 질(스테이블 vs 인센티브 유동성)이 중요.",
    ],
    toc: [
      { no: "01", title: "롤업 경쟁의 현재" },
      { no: "02", title: "수수료·TVL 비교" },
      { no: "03", title: "시퀀서 탈중앙화 로드맵" },
    ],
    canonical: null,
  },
  {
    slug: "btc-etf-flow-5w",
    type: "flash",
    title: "비트코인 ETF 자금 흐름: 5주 연속 순유입",
    dek: "비트코인 스팟 ETF가 5주 연속 순유입을 기록했다. 흐름의 강도와 지속 가능성을 짧게 점검한다.",
    sector: "btc",
    tags: ["BTC", "ETF", "자금 흐름"],
    assets: ["BTC"],
    author: "김규호",
    readMinutes: 4,
    publishedAt: "2026-06-13T18:30:00+09:00",
    takeaways: [
      "비트코인 스팟 ETF 5주 연속 순유입 — 기관 매수 우위 지속.",
      "유입 강도는 둔화 — 추세 가속이 아닌 안정적 누적 단계로 해석.",
    ],
    toc: [
      { no: "01", title: "5주 순유입 요약" },
      { no: "02", title: "강도와 지속 가능성" },
    ],
    canonical: null,
  },
  {
    slug: "ai-sector-valuation",
    type: "deepdive",
    title: "AI 섹터 밸류에이션: 토큰 P/F 비율로 본 고평가 구간",
    dek: "AI 섹터 토큰을 P/F(Price/Fees) 비율로 줄 세워, 펀더멘털 대비 고평가된 구간을 식별한다.",
    sector: "ai",
    tags: ["AI", "P/F", "밸류에이션"],
    assets: ["FET", "RENDER"],
    author: "김규호",
    readMinutes: 8,
    publishedAt: "2026-06-06T09:00:00+09:00",
    takeaways: [
      "AI 토큰 다수가 P/F 기준 펀더멘털 대비 고평가 구간에 진입.",
      "내러티브 프리미엄과 실제 수수료 창출을 분리해서 봐야 한다.",
    ],
    toc: [
      { no: "01", title: "P/F 비율이란" },
      { no: "02", title: "AI 섹터 P/F 랭킹" },
      { no: "03", title: "고평가 구간의 함의" },
    ],
    canonical: null,
  },
];

// ── 조회 헬퍼 (DB 교체 시 이 함수들만 갈아끼우면 됨) ──────────────

/** bodyHtml 을 제거한 카드용 요약으로 변환 (payload 절감) */
function toSummary(a: ResearchArticle): ResearchArticleSummary {
  const { bodyHtml: _bodyHtml, ...summary } = a;
  return summary;
}

const byDateDesc = (a: ResearchArticle, b: ResearchArticle) =>
  b.publishedAt.localeCompare(a.publishedAt);

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
export function listResearch(
  input: ListResearchInput = {}
): ResearchArticleSummary[] {
  const q = input.q?.trim().toLowerCase();
  return RESEARCH_ARTICLES.filter((a) => {
    if (input.type && a.type !== input.type) return false;
    if (input.sector && a.sector !== input.sector) return false;
    if (q) {
      const haystack = [a.title, a.dek, ...a.tags].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  })
    .slice()
    .sort(byDateDesc)
    .map(toSummary);
}

/** 단일 기사(본문 포함) 조회 — 없으면 null (throw 금지) */
export function getResearchBySlug(slug: string): ResearchArticle | null {
  return RESEARCH_ARTICLES.find((a) => a.slug === slug) ?? null;
}

/**
 * 연관 기사 — 같은 섹터 우선, 부족하면 최신순으로 채워 최대 n개(요약, 본문 제외).
 * 기준 slug 자신은 제외. slug 미존재 시 빈 배열.
 */
export function getRelatedResearch(
  slug: string,
  n = 2
): ResearchArticleSummary[] {
  const current = RESEARCH_ARTICLES.find((a) => a.slug === slug);
  if (!current) return [];
  const others = RESEARCH_ARTICLES.filter((a) => a.slug !== current.slug);
  const sameSector = others.filter((a) => a.sector === current.sector);
  const rest = others.filter((a) => a.sector !== current.sector);
  return [...sameSector.sort(byDateDesc), ...rest.sort(byDateDesc)]
    .slice(0, n)
    .map(toSummary);
}
