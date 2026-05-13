/**
 * Coin Info — CoinGecko Free 기반 코인 상세 메타데이터 (한국어 큐레이션 포함)
 *
 * CoinDetail 페이지의 "코인 정보" 탭에서 사용. 시총/거래량 외에도
 * 설명/카테고리/공식 링크/공급량/ATH 등 CoinMarketCap-style 풀 패키지 제공.
 *
 * 헌장 규칙:
 *   - 외부 API 키 필수화 금지 (CoinGecko Free, 키 없음, ~10-30 req/min)
 *   - 호출 실패는 status: "error" 객체 반환, throw 금지
 *   - 화이트리스트 (23 coin) 외 → status: "stub" + 한국어 안내
 *
 * 캐시:
 *   - in-memory 1h TTL (메타에 비해 변동성 낮으므로 5분보다 길게 잡음)
 *   - 429 rate limit 응답 시 60초 backoff
 *
 * 참고:
 *   - coin-meta.ts 는 시총/거래량/도미넌스/SSR 중심으로 5분 캐시.
 *   - 본 모듈은 description/links/supply/ATH 중심으로 1h 캐시.
 *   - 두 모듈의 화이트리스트는 동일 (23 coin).
 */

import axios from "axios";

const COINGECKO_DETAIL_URL = "https://api.coingecko.com/api/v3/coins";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_BACKOFF_MS = 60 * 1000; // 60 sec backoff after 429
const REQUEST_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────────
// 심볼 → CoinGecko id 매핑 (coin-meta.ts 와 일치)
// ─────────────────────────────────────────────────────────────
const SYMBOL_TO_CG_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  MATIC: "matic-network",
  UNI: "uniswap",
  ATOM: "cosmos",
  LTC: "litecoin",
  TRX: "tron",
  BNB: "binancecoin",
  TON: "the-open-network",
  SHIB: "shiba-inu",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  PEPE: "pepe",
};

// ─────────────────────────────────────────────────────────────
// 23-coin 한국어 큐레이션 — description / useCase / category / consensus
//
// CoinGecko 영문 description 은 너무 길고 마케팅 톤이므로,
// 한국어 자체 큐레이션을 함께 제공한다. UI 는 우선 한국어를 보이고
// 원문이 필요하면 toggle 로 펼치는 방식 권장.
// ─────────────────────────────────────────────────────────────
interface KoreanCuration {
  description: string;
  useCase: string;
  category: string[];
  launchDate?: string;
  consensus?: string;
}

const KOREAN_CURATION: Record<string, KoreanCuration> = {
  BTC: {
    description:
      "비트코인 — 2009년 사토시 나카모토가 발행한 최초의 암호화폐. " +
      "디지털 금 (Digital Gold) 으로 불리며 가치 저장 수단으로 자리잡음. " +
      "PoW (Proof of Work) 합의 알고리즘, 21M 유한 공급량.",
    useCase: "가치 저장 / 디지털 금 / 결제 / 인플레이션 헷지",
    category: ["Cryptocurrency", "Store of Value", "Layer 1"],
    launchDate: "2009-01-03",
    consensus: "Proof of Work",
  },
  ETH: {
    description:
      "이더리움 — 2015년 Vitalik Buterin 이 출시한 스마트 컨트랙트 플랫폼. " +
      "DeFi/NFT/Web3 의 인프라. 2022년 The Merge 로 PoS 전환, " +
      "EIP-1559 base fee burn 으로 deflationary 가능.",
    useCase: "스마트 컨트랙트 플랫폼 / DeFi / NFT / Layer 1",
    category: ["Smart Contract Platform", "Layer 1", "DeFi"],
    launchDate: "2015-07-30",
    consensus: "Proof of Stake",
  },
  SOL: {
    description:
      "솔라나 — Anatoly Yakovenko 가 개발한 고성능 Layer 1. " +
      "Proof of History + Proof of Stake. 65,000 TPS 목표. " +
      "낮은 수수료로 DEX/NFT/Web3 게임에서 빠르게 성장.",
    useCase: "고성능 Layer 1 / DEX / NFT / Web3 게임",
    category: ["Smart Contract Platform", "Layer 1"],
    launchDate: "2020-03-16",
    consensus: "Proof of History + Proof of Stake",
  },
  ADA: {
    description:
      "카르다노 — Charles Hoskinson (이더리움 공동 창립자) 이 주도. " +
      "Ouroboros PoS 알고리즘. 학술 논문 기반 개발 프로세스로 알려짐. " +
      "아프리카·동남아 신원/금융 인프라에 포커스.",
    useCase: "Layer 1 / 학술적 PoS / 개도국 금융 인프라",
    category: ["Smart Contract Platform", "Layer 1", "Research-Driven"],
    launchDate: "2017-09-29",
    consensus: "Proof of Stake (Ouroboros)",
  },
  XRP: {
    description:
      "리플 — Ripple Labs 가 발행한 결제 특화 코인. " +
      "RippleNet 으로 국경 간 송금 (B2B) 시장 공략. " +
      "2023년 SEC 소송 일부 승소로 미국 거래소 재상장.",
    useCase: "국경 간 송금 / B2B 결제 / 금융기관 인프라",
    category: ["Payment", "Cross-Border"],
    launchDate: "2012-01-01",
    consensus: "Ripple Protocol Consensus Algorithm",
  },
  DOGE: {
    description:
      "도지코인 — 2013년 Billy Markus & Jackson Palmer 가 농담으로 시작. " +
      "Shiba Inu 밈 기반. Litecoin 포크. 일론 머스크 트윗으로 유명세. " +
      "무한 발행이지만 매년 5B 의 고정 인플레이션.",
    useCase: "밈 코인 / 결제 / 커뮤니티 통화",
    category: ["Meme", "Payment"],
    launchDate: "2013-12-06",
    consensus: "Proof of Work",
  },
  AVAX: {
    description:
      "아발란체 — Ava Labs 가 개발한 고성능 Layer 1. " +
      "Snowman 합의 + 서브넷 (Subnet) 으로 확장. EVM 호환. " +
      "DeFi·게임·기관 자산 토큰화에 강점.",
    useCase: "고성능 Layer 1 / 서브넷 / DeFi / RWA",
    category: ["Smart Contract Platform", "Layer 1"],
    launchDate: "2020-09-21",
    consensus: "Avalanche Consensus (Snowman+)",
  },
  DOT: {
    description:
      "폴카닷 — Gavin Wood (이더리움 공동 창립자) 가 설계한 멀티체인 Layer 0. " +
      "릴레이 체인 + 파라체인 구조로 체인 간 상호운용성 제공. " +
      "NPoS 합의.",
    useCase: "Layer 0 / 멀티체인 / 파라체인 상호운용",
    category: ["Layer 0", "Interoperability"],
    launchDate: "2020-05-26",
    consensus: "Nominated Proof of Stake",
  },
  LINK: {
    description:
      "체인링크 — 분산 오라클 네트워크. 온체인 스마트 컨트랙트에 " +
      "오프체인 데이터 (가격/날씨/스포츠 결과 등) 를 공급. " +
      "CCIP 로 크로스체인 메시징 확장.",
    useCase: "오라클 / 가격 피드 / 크로스체인 메시징",
    category: ["Oracle", "Infrastructure"],
    launchDate: "2017-09-19",
    consensus: "N/A (Ethereum-secured)",
  },
  MATIC: {
    description:
      "폴리곤 — 이더리움 Layer 2 스케일링 솔루션. " +
      "PoS 사이드체인 + zkEVM. 2024년 POL 토큰으로 리브랜딩 진행. " +
      "낮은 수수료로 DeFi/NFT 인프라.",
    useCase: "Ethereum Layer 2 / 스케일링 / DeFi / NFT",
    category: ["Layer 2", "Scaling", "EVM"],
    launchDate: "2019-04-26",
    consensus: "Proof of Stake",
  },
  UNI: {
    description:
      "유니스왑 — 가장 큰 탈중앙 거래소 (DEX) 의 거버넌스 토큰. " +
      "AMM (Automated Market Maker) 모델의 표준화. " +
      "V4 hooks 로 확장 가능한 풀 도입.",
    useCase: "DEX 거버넌스 / AMM / DeFi 인프라",
    category: ["DeFi", "DEX", "Governance"],
    launchDate: "2020-09-17",
    consensus: "N/A (Ethereum-secured)",
  },
  ATOM: {
    description:
      "코스모스 — Tendermint 합의 + Cosmos SDK 로 만들어진 인터체인 허브. " +
      "IBC (Inter-Blockchain Communication) 로 체인 간 자산 이동. " +
      "App-chain 패러다임의 선구자.",
    useCase: "Interchain / App-chain / IBC",
    category: ["Layer 0", "Interoperability"],
    launchDate: "2019-03-14",
    consensus: "Tendermint BFT",
  },
  LTC: {
    description:
      "라이트코인 — 2011년 Charlie Lee 가 비트코인을 포크해 만든 결제 코인. " +
      "Scrypt 알고리즘, 2.5분 블록 (BTC 1/4). MimbleWimble 으로 프라이버시 옵션. " +
      "디지털 실버로 불림.",
    useCase: "결제 / 디지털 실버 / 마이크로 트랜잭션",
    category: ["Cryptocurrency", "Payment"],
    launchDate: "2011-10-07",
    consensus: "Proof of Work (Scrypt)",
  },
  TRX: {
    description:
      "트론 — Justin Sun 이 주도. 컨텐츠/엔터테인먼트 dApp 플랫폼. " +
      "DPoS 합의로 높은 TPS. USDT 발행 체인 중 하나로 스테이블코인 인프라 역할.",
    useCase: "Layer 1 / 컨텐츠 dApp / USDT 인프라",
    category: ["Smart Contract Platform", "Layer 1"],
    launchDate: "2018-06-25",
    consensus: "Delegated Proof of Stake",
  },
  BNB: {
    description:
      "바이낸스 코인 — 바이낸스 거래소의 네이티브 토큰. " +
      "BNB Chain (BSC) 의 가스 토큰. 거래소 수수료 할인 + 분기별 burn. " +
      "Launchpad / 이용권 / 결제 등 광범위한 유틸리티.",
    useCase: "거래소 토큰 / BSC 가스 / 결제 / Launchpad",
    category: ["Exchange Token", "Layer 1"],
    launchDate: "2017-07-25",
    consensus: "Proof of Staked Authority",
  },
  TON: {
    description:
      "톤 (The Open Network) — Telegram 이 시작한 Layer 1. " +
      "샤딩 기반 무한 확장 목표. Telegram 8억 사용자와 통합되어 " +
      "Web3 mass adoption 후보로 주목.",
    useCase: "Layer 1 / Telegram 통합 / Web3 onboarding",
    category: ["Smart Contract Platform", "Layer 1"],
    launchDate: "2018-01-01",
    consensus: "Proof of Stake (BFT)",
  },
  SHIB: {
    description:
      "시바이누 — 2020년 익명 개발자 Ryoshi 가 발행한 ERC-20 밈 코인. " +
      "도지킬러 로 마케팅. Shibarium L2 출시로 유틸리티 확장 시도.",
    useCase: "밈 코인 / 커뮤니티 / Shibarium L2",
    category: ["Meme", "ERC-20"],
    launchDate: "2020-08-01",
    consensus: "N/A (Ethereum-secured)",
  },
  NEAR: {
    description:
      "니어 프로토콜 — Nightshade 샤딩 기반 Layer 1. " +
      "사용자 친화적 계정 모델 (account.near) 과 낮은 가스. " +
      "AI x Web3 내러티브로 부각.",
    useCase: "Layer 1 / 샤딩 / AI x Web3",
    category: ["Smart Contract Platform", "Layer 1", "Sharding"],
    launchDate: "2020-04-22",
    consensus: "Doomslug Proof of Stake",
  },
  APT: {
    description:
      "앱토스 — 구 Meta (Facebook) Diem 팀이 분사해 만든 Layer 1. " +
      "Move 언어 (Rust 기반) + 병렬 실행 엔진. " +
      "엔터프라이즈향 안정성 강조.",
    useCase: "Layer 1 / Move 언어 / 병렬 실행",
    category: ["Smart Contract Platform", "Layer 1", "Move"],
    launchDate: "2022-10-17",
    consensus: "AptosBFT (PoS)",
  },
  ARB: {
    description:
      "아비트럼 — Offchain Labs 가 개발한 이더리움 Optimistic Rollup L2. " +
      "Nitro 업그레이드로 가스 효율 향상. " +
      "DeFi TVL 기준 L2 1위.",
    useCase: "Ethereum Layer 2 / Optimistic Rollup / DeFi",
    category: ["Layer 2", "Rollup", "EVM"],
    launchDate: "2023-03-23",
    consensus: "N/A (Ethereum-secured Optimistic Rollup)",
  },
  OP: {
    description:
      "옵티미즘 — Optimism Foundation 의 Optimistic Rollup L2. " +
      "Superchain / OP Stack 으로 모듈러 L2 표준 추진. " +
      "Base / Worldcoin 등 주요 체인이 OP Stack 채택.",
    useCase: "Ethereum Layer 2 / OP Stack / Superchain",
    category: ["Layer 2", "Rollup", "EVM"],
    launchDate: "2022-05-31",
    consensus: "N/A (Ethereum-secured Optimistic Rollup)",
  },
  SUI: {
    description:
      "수이 — 구 Meta Diem 팀이 분사해 만든 Layer 1 (Aptos 와 형제). " +
      "Move 변형 언어 + 객체 중심 데이터 모델. " +
      "병렬 처리에 강점.",
    useCase: "Layer 1 / Move 언어 / 객체 중심 모델",
    category: ["Smart Contract Platform", "Layer 1", "Move"],
    launchDate: "2023-05-03",
    consensus: "Narwhal-Bullshark BFT",
  },
  PEPE: {
    description:
      "페페 — 2023년 익명 발행된 ERC-20 밈 코인. " +
      "Pepe the Frog 밈 기반. 빠른 시총 성장으로 밈 시즌 의 상징. " +
      "유틸리티 없음 — 순수 sentiment-driven.",
    useCase: "밈 코인 / Sentiment-driven 거래",
    category: ["Meme", "ERC-20"],
    launchDate: "2023-04-17",
    consensus: "N/A (Ethereum-secured)",
  },
};

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────
export interface CoinInfo {
  /** "BTCUSDT" (Bybit 심볼) */
  symbol: string;
  /** "BTC" (USDT 접미사 제거) */
  baseSymbol: string;
  /** "Bitcoin" (CoinGecko name) */
  name: string;
  /** "bitcoin" (CoinGecko id) */
  coingeckoId: string;

  // ── 메타데이터 (한국어 큐레이션 우선)
  /** 한국어 큐레이션 description (자체 작성) */
  description: string;
  /** 카테고리 태그 (예: ["Cryptocurrency", "Layer 1", "Store of Value"]) */
  category: string[];
  /** 핵심 용도 한 줄 요약 */
  useCase: string;
  /** ISO date or year */
  launchDate?: string;
  /** "Proof of Work" | "Proof of Stake" | ... */
  consensus?: string;

  // ── Market data (CoinGecko)
  /** 시총 순위 (1 = BTC) */
  rank?: number;
  marketCapUsd?: number;
  /** Fully Diluted Valuation */
  fdvUsd?: number;
  volume24hUsd?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  /** null = 무한 발행 (DOGE 등) */
  maxSupply?: number | null;

  // ── Price
  currentPrice?: number;
  ath?: number;
  athDate?: string;
  /** ATH 대비 % 변화 (예: -50 = ATH에서 50% 하락) */
  athChangePct?: number;
  atl?: number;

  // ── Links
  homepage?: string;
  whitepaper?: string;
  github?: string;
  twitter?: string;
  reddit?: string;

  // ── Status
  /** "real" = CoinGecko 응답, "stub" = 화이트리스트 외, "error" = 호출 실패 */
  status: "real" | "stub" | "error";
  /** Date.now() 기준 캐시 시각 */
  cachedAt: number;
  errorDetail?: string;
}

// ─────────────────────────────────────────────────────────────
// 캐시 + Rate limit 백오프
// ─────────────────────────────────────────────────────────────
interface InfoCacheEntry {
  data: CoinInfo;
  ts: number;
}
const INFO_CACHE = new Map<string, InfoCacheEntry>();

/** 429 응답 후 backoff 종료 timestamp. 그 전엔 외부 호출 스킵. */
let rateLimitedUntil = 0;

/** 테스트 / 디버그용 — 캐시 초기화. */
export function clearCoinInfoCache(): void {
  INFO_CACHE.clear();
  rateLimitedUntil = 0;
}

// ─────────────────────────────────────────────────────────────
// CoinGecko 응답 타입 (필요한 필드만)
// ─────────────────────────────────────────────────────────────
interface CGCoinDetailResponse {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank?: number | null;
  links?: {
    homepage?: string[];
    whitepaper?: string;
    repos_url?: { github?: string[] };
    twitter_screen_name?: string;
    subreddit_url?: string;
  };
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    fully_diluted_valuation?: { usd?: number };
    total_volume?: { usd?: number };
    circulating_supply?: number;
    total_supply?: number | null;
    max_supply?: number | null;
    ath?: { usd?: number };
    ath_date?: { usd?: string };
    ath_change_percentage?: { usd?: number };
    atl?: { usd?: number };
  };
}

// ─────────────────────────────────────────────────────────────
// 메인 export
// ─────────────────────────────────────────────────────────────
/**
 * 단일 코인의 상세 정보를 가져온다.
 *
 * 동작 순서:
 *   1. 캐시 hit → 즉시 반환
 *   2. 화이트리스트 외 → status: "stub"
 *   3. rate limit 백오프 중 → status: "error" (stale 캐시 있으면 그것 반환)
 *   4. CoinGecko 호출 → 성공 시 status: "real", 실패 시 status: "error"
 */
export async function getCoinInfo(rawSymbol: string): Promise<CoinInfo> {
  const symbol = rawSymbol.toUpperCase().trim();
  const baseSymbol = symbol.replace(/USDT$/, "");
  const now = Date.now();

  // ── 1. 캐시 검사
  const cached = INFO_CACHE.get(symbol);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  // ── 2. 화이트리스트 검사
  const cgId = SYMBOL_TO_CG_ID[baseSymbol];
  const curation = KOREAN_CURATION[baseSymbol];

  if (!cgId || !curation) {
    const stub: CoinInfo = {
      symbol,
      baseSymbol,
      name: baseSymbol,
      coingeckoId: "",
      description:
        "정보 미커버 — Tradelab 23-coin whitelist 외. " +
        "Bybit 가격 데이터만 사용 가능하며 메타데이터는 제공되지 않습니다.",
      category: ["Unknown"],
      useCase: "데이터 미커버",
      status: "stub",
      cachedAt: now,
    };
    INFO_CACHE.set(symbol, { data: stub, ts: now });
    return stub;
  }

  // ── 3. Rate limit 백오프 중이면 stale 캐시 또는 error 반환
  if (now < rateLimitedUntil) {
    if (cached) {
      // stale 데이터라도 반환 (UI 가 깨지지 않도록)
      return { ...cached.data, cachedAt: cached.ts };
    }
    return buildErrorInfo(
      symbol,
      baseSymbol,
      cgId,
      curation,
      "CoinGecko rate limit — 60초 후 재시도",
      now
    );
  }

  // ── 4. CoinGecko 호출
  try {
    const url = `${COINGECKO_DETAIL_URL}/${cgId}`;
    const resp = await axios.get<CGCoinDetailResponse>(url, {
      params: {
        localization: false,
        tickers: false,
        community_data: false,
        developer_data: false,
        sparkline: false,
      },
      timeout: REQUEST_TIMEOUT_MS,
      headers: { "User-Agent": "tradelab-backend/1.0" },
    });

    const data = resp.data;
    const md = data.market_data ?? {};
    const links = data.links ?? {};

    const info: CoinInfo = {
      symbol,
      baseSymbol,
      name: data.name ?? baseSymbol,
      coingeckoId: cgId,

      // Korean curation (정적)
      description: curation.description,
      category: curation.category,
      useCase: curation.useCase,
      launchDate: curation.launchDate,
      consensus: curation.consensus,

      // Market data (CoinGecko 동적)
      rank: data.market_cap_rank ?? undefined,
      marketCapUsd: md.market_cap?.usd,
      fdvUsd: md.fully_diluted_valuation?.usd,
      volume24hUsd: md.total_volume?.usd,
      circulatingSupply: md.circulating_supply,
      totalSupply: md.total_supply ?? undefined,
      maxSupply: md.max_supply,

      // Price
      currentPrice: md.current_price?.usd,
      ath: md.ath?.usd,
      athDate: md.ath_date?.usd,
      athChangePct: md.ath_change_percentage?.usd,
      atl: md.atl?.usd,

      // Links
      homepage: links.homepage?.[0] || undefined,
      whitepaper: links.whitepaper || undefined,
      github: links.repos_url?.github?.[0] || undefined,
      twitter: links.twitter_screen_name
        ? `https://twitter.com/${links.twitter_screen_name}`
        : undefined,
      reddit: links.subreddit_url || undefined,

      status: "real",
      cachedAt: now,
    };

    INFO_CACHE.set(symbol, { data: info, ts: now });
    return info;
  } catch (err: any) {
    // 429 → 백오프 활성화
    const httpStatus = err?.response?.status;
    if (httpStatus === 429) {
      rateLimitedUntil = now + RATE_LIMIT_BACKOFF_MS;
      console.warn(
        `[CoinInfo] CoinGecko rate limit (429) — backoff ${RATE_LIMIT_BACKOFF_MS}ms`
      );
    } else {
      console.warn(
        `[CoinInfo] ${symbol} CoinGecko 호출 실패: ${err?.message ?? err}`
      );
    }

    // stale 캐시 있으면 그것 반환 (graceful degradation)
    if (cached) {
      return { ...cached.data, cachedAt: cached.ts };
    }

    return buildErrorInfo(
      symbol,
      baseSymbol,
      cgId,
      curation,
      `CoinGecko 호출 실패: ${err?.message ?? err}`,
      now
    );
  }
}

/** 에러 응답 빌더 — 한국어 큐레이션은 그대로 유지하면서 market data 만 비움. */
function buildErrorInfo(
  symbol: string,
  baseSymbol: string,
  coingeckoId: string,
  curation: KoreanCuration,
  errorDetail: string,
  now: number
): CoinInfo {
  return {
    symbol,
    baseSymbol,
    name: baseSymbol,
    coingeckoId,
    description: curation.description,
    category: curation.category,
    useCase: curation.useCase,
    launchDate: curation.launchDate,
    consensus: curation.consensus,
    status: "error",
    cachedAt: now,
    errorDetail,
  };
}
