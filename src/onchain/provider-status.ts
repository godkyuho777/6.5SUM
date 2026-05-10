/**
 * Onchain Provider Status — P1-#4 (2026-05-10).
 *
 * Audit `02-ONCHAIN-AUDIT.md` §2 의 "5/7 modifier stub" 가시화.
 * 사용자가 라이브 환경에서 어떤 onchain modifier 가 실데이터로 작동하고
 * 어떤 게 stub/mock 인지 명확히 알 수 있도록 status 를 운영시점에 노출.
 *
 * 사용처:
 *   - `routers.ts` `onchain.providerStatus` tRPC procedure (프론트엔드 surface)
 *   - 백테스트 시작 시 console 로그 (헌장 R2 알파 측정 시점에 컨텍스트 노출)
 *   - admin/health endpoint (운영자 검증)
 *
 * 헌장 R2 (백테스트 알파):
 *   stub modifier 가 알파 측정에 영향을 주지 않도록 명시 — Wilson CI 결과
 *   해석 시 "modifier=0 환경의 baseline" 을 의미.
 */

import type { OnchainModifierKey } from "./types";

/** Modifier 의 데이터 소스 모드. */
export type ProviderMode =
  | "real"   // 실제 외부 API 호출 (Coinbase Exchange, CoinGecko, Farside 등)
  | "stub"   // 환경변수 미설정 — value=0, BBDX 영향 X
  | "mock"   // ONCHAIN_MOCK=1 — 결정론 mock 값 (시각화 / 백테스트 데모 용)
  | "partial"; // 일부 코인만 real (e.g. coinbase_premium = 27 코인만)

export interface ProviderStatus {
  key: OnchainModifierKey;
  /** 사람이 읽을 수 있는 라벨. */
  label: string;
  mode: ProviderMode;
  /** 어떤 환경변수 / 외부 source 가 필요한지. */
  requires: string;
  /** 활성화 조건 detail. */
  detail: string;
}

/**
 * 현재 환경에서 각 modifier 의 provider 상태 산출.
 *
 * 환경변수 검사:
 *   - `CRYPTOQUANT_API_KEY` → exchange_netflow / miner_outflow real
 *   - `WHALE_ALERT_API_KEY` → whale_alert real
 *   - `GLASSNODE_API_KEY` → lth_supply real
 *   - `ETF_FLOW_PROVIDER=farside` → etf_flow scraping 활성
 *   - `ONCHAIN_MOCK=1` → stub 자리에 mock 값 주입
 */
export function getOnchainProviderStatus(): ProviderStatus[] {
  const env = process.env;
  const mock = env.ONCHAIN_MOCK === "1";

  const status = (
    key: OnchainModifierKey,
    label: string,
    isReal: boolean,
    requires: string,
    realDetail: string,
    stubDetail: string,
  ): ProviderStatus => ({
    key,
    label,
    mode: isReal ? "real" : mock ? "mock" : "stub",
    requires,
    detail: isReal ? realDetail : mock ? `${stubDetail} → ONCHAIN_MOCK=1 mock 활성` : stubDetail,
  });

  return [
    status(
      "exchange_netflow",
      "Exchange Netflow (CryptoQuant)",
      Boolean(env.CRYPTOQUANT_API_KEY),
      "CRYPTOQUANT_API_KEY",
      "실데이터 활성 (TODO: v1.1 호출 코드 미구현)",
      "키 미설정 — value=0 (BBDX 영향 X)",
    ),
    status(
      "whale_alert",
      "Whale Alert",
      Boolean(env.WHALE_ALERT_API_KEY),
      "WHALE_ALERT_API_KEY",
      "실데이터 활성 (TODO: v1.1 호출 코드 미구현)",
      "키 미설정 — value=0",
    ),
    status(
      "ssr",
      "Stablecoin Supply Ratio (CoinGecko Free)",
      true, // 항상 활성 (외부 키 불필요, CoinGecko 무료)
      "CoinGecko Free API (자동)",
      "활성. ⚠ 90일 z-score buffer 가 *런타임 누적* — 서버 재시작 시 reset.",
      "n/a",
    ),
    status(
      "coinbase_premium",
      "Coinbase Premium",
      true, // 외부 키 불필요 — Coinbase Exchange + Bybit ticker 직접 호출
      "Coinbase Exchange API + Bybit ticker (자동)",
      "활성 — 27개 메이저 코인 한정 (BTCUSDT/ETHUSDT 등). 화이트리스트 외 코인은 partial.",
      "n/a",
    ),
    status(
      "etf_flow",
      "ETF Flow (Farside)",
      env.ETF_FLOW_PROVIDER === "farside",
      "ETF_FLOW_PROVIDER=farside",
      "스크래핑 활성 (BTC/ETH 만)",
      "스크래핑 미활성 — value=0",
    ),
    status(
      "miner_outflow",
      "Miner Outflow (CryptoQuant)",
      Boolean(env.CRYPTOQUANT_API_KEY),
      "CRYPTOQUANT_API_KEY (BTC only)",
      "실데이터 활성 (TODO: v1.1 호출 코드 미구현)",
      "키 미설정 — value=0",
    ),
    status(
      "lth_supply",
      "LTH Supply Change (Glassnode)",
      Boolean(env.GLASSNODE_API_KEY),
      "GLASSNODE_API_KEY (BTC/ETH only)",
      "실데이터 활성 (TODO: v1.1 호출 코드 미구현)",
      "키 미설정 — value=0",
    ),
  ];
}

/** real / stub / mock 카운트 요약. */
export function summarizeProviderStatus(): {
  total: number;
  real: number;
  mock: number;
  stub: number;
  partial: number;
  /** 헌장 R2 알파 측정에 *영향 있는* modifier 갯수 (real + mock). */
  effective: number;
} {
  const list = getOnchainProviderStatus();
  let real = 0;
  let mock = 0;
  let stub = 0;
  let partial = 0;
  for (const s of list) {
    if (s.mode === "real") real += 1;
    else if (s.mode === "mock") mock += 1;
    else if (s.mode === "partial") partial += 1;
    else stub += 1;
  }
  return {
    total: list.length,
    real,
    mock,
    stub,
    partial,
    effective: real + mock,
  };
}

/**
 * 백테스트 시작 시 권고 헬퍼 — Wilson CI 결과 해석 시 컨텍스트 출력.
 *
 * 출력 예시:
 *   "[Onchain] effective=2/7 (real=2, mock=0, stub=5).
 *    백테스트 alpha 는 *5개 modifier 미작동 환경의 baseline*.
 *    ONCHAIN_MOCK=1 또는 외부 키 설정 시 추가 alpha 측정 가능."
 */
export function describeProviderStatusForBacktest(): string {
  const s = summarizeProviderStatus();
  const lines = [
    `[Onchain] effective=${s.effective}/${s.total} ` +
      `(real=${s.real}, mock=${s.mock}, stub=${s.stub})`,
  ];
  if (s.effective < s.total) {
    lines.push(
      `  ⚠ ${s.total - s.effective}개 modifier 가 *영향 없음* — 백테스트 alpha 는`,
    );
    lines.push(
      `     "${s.effective}개 modifier 만 작동하는 baseline" 으로 해석.`,
    );
    if (s.mock === 0) {
      lines.push(
        `     ONCHAIN_MOCK=1 설정 시 stub 자리에 결정론 mock 주입 가능 (시각화/데모).`,
      );
    }
  }
  return lines.join("\n");
}

