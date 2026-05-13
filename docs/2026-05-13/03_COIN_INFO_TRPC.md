# `coin.info` tRPC 라우트 — CoinGecko + 23-Coin 한국어 큐레이션

> **목적**: 프론트엔드 CoinDetail 의 "코인 정보" 탭 (NEW) 데이터 공급
> **소스**: CoinGecko Free API + 자체 한국어 큐레이션
> **캐시**: 1h in-memory + 429 60s backoff + stale-cache graceful fallback

---

## 1. 작업 요약

사용자 요청: CoinDetail 페이지에 CoinMarketCap-style "코인 정보" 탭 추가. CoinGecko API + 23 코인 한국어 정적 큐레이션으로 풀 구현.

---

## 2. 모듈 — `src/coin-info.ts` (522 lines)

### CoinInfo 타입
```ts
export interface CoinInfo {
  symbol: string;          // "BTCUSDT"
  baseSymbol: string;      // "BTC"
  name: string;            // "Bitcoin"
  coingeckoId: string;

  // Metadata (큐레이션)
  description: string;     // 한국어 1줄
  category: string[];      // ["Cryptocurrency", "Layer 1", "Store of Value"]
  useCase: string;         // 핵심 용도
  launchDate?: string;
  consensus?: string;      // "Proof of Work" / "Proof of Stake"

  // Market data (CoinGecko)
  rank?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
  volume24hUsd?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number | null;

  // Price
  currentPrice?: number;
  ath?: number;
  athDate?: string;
  athChangePct?: number;
  atl?: number;

  // Links
  homepage?: string;
  whitepaper?: string;
  github?: string;
  twitter?: string;
  reddit?: string;

  // Status
  status: "real" | "stub" | "error";
  cachedAt: number;
  errorDetail?: string;
}
```

### 23-Coin 한국어 큐레이션

```ts
const KOREAN_CURATION: Record<string, {...}> = {
  BTC, ETH, SOL, ADA, XRP, DOGE, AVAX, DOT, LINK, MATIC,
  UNI, ATOM, LTC, TRX, BNB, TON, SHIB, NEAR, APT, ARB,
  OP, SUI, PEPE
};
```

각 코인 별:
- `description` — 한국어 1줄 (예: "비트코인 — 2009년 사토시 나카모토가 발행한 최초의 암호화폐. 디지털 금...")
- `useCase` — 용도 (예: "가치 저장 / 디지털 금 / 결제 / 인플레이션 헷지")
- `category` — 분류 배열
- `launchDate` — 런칭 연도
- `consensus` — 합의 알고리즘

**중요**: CoinGecko 호출 실패 시에도 큐레이션은 살아남음 (`buildErrorInfo` 가 description/useCase 보존).

### 캐싱 + Rate Limit

```ts
const CACHE_TTL_MS = 60 * 60 * 1000;  // 1h
const cache = new Map<string, { data: CoinInfo; ts: number }>();

// 429 응답 시 60s backoff
let cooldownUntil = 0;
```

Stale cache fallback: TTL 초과해도 fresh fetch 실패 시 stale 데이터 + `status: "stub"` 라벨.

---

## 3. tRPC 라우트

`src/routers.ts` 의 `coinRouter` 안에 `info` procedure append:

```ts
const coinRouter = t.router({
  meta: ... (기존, mcap/vol/dominance/SSR),
  info: publicProcedure
    .input(z.object({ symbol: z.string() }))
    .query(async ({ input }) => getCoinInfo(input.symbol)),
});
```

기존 `coin.meta` 시그니처 변경 X (append-only).

`src/types-entry.ts`: `CoinInfo` re-export → 프론트엔드 `import type { CoinInfo } from "@tradelab/backend/router"` 가능.

---

## 4. 화이트리스트 외 코인 처리

23-coin whitelist 외 (예: "WIF" / "TURBO" 등) → `status: "stub"`:
```ts
{
  symbol: "WIFUSDT",
  baseSymbol: "WIF",
  name: "WIF",
  description: "정보 미커버 — Tradelab 23-coin whitelist 외",
  status: "stub",
  ...
}
```

UI 가 "정보 미커버" 카드 표시.

---

## 5. 테스트

`src/coin-info.test.ts` (139 lines, 6 tests):
- 화이트리스트 코인 정상 응답 (mock fetch)
- 화이트리스트 외 코인 stub
- CoinGecko 실패 시 graceful error
- 캐시 hit
- 429 backoff
- Korean curation 보존 (CoinGecko 실패해도 description 유지)

---

## 6. Commits

```
e317acb build: rebuild dist/types for coin.info route
004efd0 feat(api): add coin.info tRPC route (CoinGecko detailed info + Korean curation)
```

---

## 7. 검증

- `pnpm check` PASS
- `pnpm test` **737/737 PASS** (731 → 737, +6 신규)
- `pnpm build:types` PASS

---

## 8. 헌장 준수

| 규칙 | 결과 |
|---|---|
| R1 / R2 / R3 | N/A — 정보 표시 전용, BBDX 시그널 영향 X |

graceful try/catch — throw 없음, status 라벨로 UI 분기.

---

## 9. 프론트 사용처

`tradelab-frontend/src/pages/CoinDetail/tabs/v2/CoinInfoTab.tsx` (394L):
- `trpc.coin.info.useQuery({ symbol })` 호출
- 6 카드 grid:
  1. CoinHeaderCard (이름 + rank + 현재가)
  2. 개요 (description + useCase + category badges)
  3. 마켓 데이터 grid (시총/FDV/24h 거래량/공급량 3종)
  4. 가격 정보 (현재가/ATH/ATL)
  5. 프로젝트 메타 (런칭/합의)
  6. 공식 링크 (홈페이지/백서/GitHub/Twitter/Reddit)

작성: 2026-05-13
