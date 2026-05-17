/**
 * env-driven stub modifiers
 *
 * 다음 5개 modifier 는 외부 API 키가 필요하므로, 키 미설정 시 status="stub"
 * value=0 을 반환하여 BBDX 점수에 영향이 없도록 한다. 키가 설정되면 자동으로
 * 진짜 호출 경로가 활성화되며, 명세서의 임계값/공식이 그대로 적용된다.
 *
 * 환경 변수:
 *   CRYPTOQUANT_API_KEY  → exchange_netflow, miner_outflow
 *   WHALE_ALERT_API_KEY  → whale_alert
 *   GLASSNODE_API_KEY    → lth_supply
 *   ETF_FLOW_PROVIDER    → etf_flow ("farside" 면 스크래핑, 미설정이면 stub)
 *   ONCHAIN_MOCK         → "1" 이면 키 미설정 stub 자리에 결정론 mock 값 주입
 *                          (UI 시각화 검증 용도. status="mock" 으로 식별).
 *
 * 각 함수는 명세서의 임계값을 그대로 적용한다. 진짜 호출 경로는 v1 에서
 * "key 있으면 호출, 없으면 stub" 만 분기. 실제 구현은 키 발급 후 한 곳에서.
 *
 * Mock 모드 우선순위:
 *   1. 실제 API 키 존재 → 실데이터 경로 (TBD, 현재는 stub 그대로 반환)
 *   2. ONCHAIN_MOCK=1 → 결정론 mock (symbol+key hash 기반)
 *   3. 그 외 → status: "stub", value: 0
 */

import type { OnchainModifierKey, OnchainModifierResult } from "./types";
import { computeFarsideEtfFlow } from "./etf-flow";

// ─── Mock 유틸 ──────────────────────────────────────────────────────

/**
 * 결정론적 32-bit 해시 (FNV-1a 변형). 같은 입력은 항상 같은 출력.
 * symbol+modifierKey 조합으로 modifier 마다 다른 mock 값이 나오도록 한다.
 */
function simpleHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** [0, 1) 범위 결정론 0~1 float. */
function hashUnit(input: string): number {
  return simpleHash(input) / 0xffffffff;
}

/**
 * Mock 값 산출 — 각 modifier 의 정상 ±max 한계 내에서 결정론적으로 분포.
 * coin 마다 다른 값이 나오도록 symbol+key 를 모두 해시 입력으로 사용.
 *
 * 분포: |signed| < 0.1 인 영역은 0 (영향 없음) 으로 dead-zone 처리,
 *       나머지는 [-maxAbs, +maxAbs] 정상 분포.
 * 시각화 용도로 코인마다 색이 다르게 나오도록 한다.
 */
function mockValue(symbol: string, key: OnchainModifierKey, maxAbs: number): number {
  const u = hashUnit(`${symbol}|${key}`);
  const signed = u * 2 - 1; // [-1, +1)
  if (Math.abs(signed) < 0.1) return 0;
  const raw = signed * maxAbs;
  return Math.round(raw * 100) / 100;
}

function isMockMode(): boolean {
  return process.env.ONCHAIN_MOCK === "1";
}

// ─── Exchange Netflow ───────────────────────────────────────────────

export async function computeExchangeNetflow(
  symbol: string
): Promise<OnchainModifierResult> {
  const key = process.env.CRYPTOQUANT_API_KEY;
  if (!key) {
    if (isMockMode()) {
      const value = mockValue(symbol, "exchange_netflow", 0.20);
      return {
        key: "exchange_netflow",
        value,
        status: "mock",
        detail: `[mock] ${symbol} exchange netflow ${value >= 0 ? "+" : ""}${value.toFixed(2)} (ONCHAIN_MOCK=1)`,
      };
    }
    return {
      key: "exchange_netflow",
      value: 0,
      status: "stub",
      detail: "CRYPTOQUANT_API_KEY 미설정 — 영향 없음 (v1 stub)",
    };
  }

  // TODO(v1.1): CryptoQuant API 호출 — 24h netflow + 30d baseline.
  //   z-score 산출:
  //     z<-2 → +0.20, z<-1 → +0.10, z>+2 → -0.25, z>+1 → -0.10
  return {
    key: "exchange_netflow",
    value: 0,
    status: "stub",
    detail: `${symbol} CryptoQuant 통합 미구현 (key 감지됨, 다음 릴리스)`,
    raw: { hasKey: true },
  };
}

// ─── Whale Alert ────────────────────────────────────────────────────

export async function computeWhaleAlert(
  symbol: string
): Promise<OnchainModifierResult> {
  const key = process.env.WHALE_ALERT_API_KEY;
  if (!key) {
    if (isMockMode()) {
      const value = mockValue(symbol, "whale_alert", 0.15);
      return {
        key: "whale_alert",
        value,
        status: "mock",
        detail: `[mock] ${symbol} whale alert ${value >= 0 ? "+" : ""}${value.toFixed(2)} (ONCHAIN_MOCK=1)`,
      };
    }
    return {
      key: "whale_alert",
      value: 0,
      status: "stub",
      detail: "WHALE_ALERT_API_KEY 미설정 — 영향 없음 (v1 stub)",
    };
  }

  // TODO(v1.1): whale-alert.io API 호출 — 12h $10M+ 송금 분류.
  //   bullish (exchange→unknown) - bearish (unknown→exchange) 차이로
  //     net>+3 → +0.15, net>+1 → +0.07, net<-3 → -0.20, net<-1 → -0.07
  return {
    key: "whale_alert",
    value: 0,
    status: "stub",
    detail: `${symbol} Whale Alert 통합 미구현 (key 감지됨, 다음 릴리스)`,
    raw: { hasKey: true },
  };
}

// ─── ETF Flow ───────────────────────────────────────────────────────

export async function computeEtfFlow(
  symbol: string
): Promise<OnchainModifierResult> {
  if (symbol !== "BTCUSDT" && symbol !== "ETHUSDT") {
    return {
      key: "etf_flow",
      value: 0,
      status: "stub",
      detail: `${symbol}는 ETF 미상장 — 영향 없음`,
    };
  }

  const provider = process.env.ETF_FLOW_PROVIDER;
  if (provider !== "farside") {
    if (isMockMode()) {
      const value = mockValue(symbol, "etf_flow", 0.20);
      return {
        key: "etf_flow",
        value,
        status: "mock",
        detail: `[mock] ${symbol} ETF flow ${value >= 0 ? "+" : ""}${value.toFixed(2)} (ONCHAIN_MOCK=1)`,
      };
    }
    return {
      key: "etf_flow",
      value: 0,
      status: "stub",
      detail: "ETF_FLOW_PROVIDER 미설정 — 영향 없음 (Farside 스크래핑 비활성)",
    };
  }

  // Farside HTML 파싱 위임 — `etf-flow.ts` 가 fetch/parse/threshold 적용.
  // BTC/ETH 만 지원 (상위 가드에서 보장됨).
  return computeFarsideEtfFlow(symbol as "BTCUSDT" | "ETHUSDT");
}

// ─── Miner Outflow (BTC only) ───────────────────────────────────────

export async function computeMinerOutflow(
  symbol: string
): Promise<OnchainModifierResult> {
  if (symbol !== "BTCUSDT") {
    return {
      key: "miner_outflow",
      value: 0,
      status: "stub",
      detail: "BTC 외 코인은 miner outflow N/A",
    };
  }

  const key = process.env.CRYPTOQUANT_API_KEY;
  if (!key) {
    if (isMockMode()) {
      const value = mockValue(symbol, "miner_outflow", 0.15);
      return {
        key: "miner_outflow",
        value,
        status: "mock",
        detail: `[mock] ${symbol} miner outflow ${value >= 0 ? "+" : ""}${value.toFixed(2)} (ONCHAIN_MOCK=1)`,
      };
    }
    return {
      key: "miner_outflow",
      value: 0,
      status: "stub",
      detail: "CRYPTOQUANT_API_KEY 미설정 — 영향 없음 (v1 stub)",
    };
  }

  // TODO(v1.1): CryptoQuant miner outflow 7d sum + 90d baseline.
  //   z>+2 → -0.15, z>+1 → -0.05, z<-1.5 → +0.10
  return {
    key: "miner_outflow",
    value: 0,
    status: "stub",
    detail: "Miner outflow 통합 미구현 (key 감지됨, 다음 릴리스)",
    raw: { hasKey: true },
  };
}

// ─── LTH Supply (BTC/ETH) ───────────────────────────────────────────

export async function computeLthSupply(
  symbol: string
): Promise<OnchainModifierResult> {
  if (symbol !== "BTCUSDT" && symbol !== "ETHUSDT") {
    return {
      key: "lth_supply",
      value: 0,
      status: "stub",
      detail: `${symbol}는 LTH metric N/A`,
    };
  }

  const key = process.env.GLASSNODE_API_KEY;
  if (!key) {
    if (isMockMode()) {
      const value = mockValue(symbol, "lth_supply", 0.15);
      return {
        key: "lth_supply",
        value,
        status: "mock",
        detail: `[mock] ${symbol} LTH supply ${value >= 0 ? "+" : ""}${value.toFixed(2)} (ONCHAIN_MOCK=1)`,
      };
    }
    return {
      key: "lth_supply",
      value: 0,
      status: "stub",
      detail: "GLASSNODE_API_KEY 미설정 — 영향 없음 (v1 stub)",
    };
  }

  // TODO(v1.1): Glassnode lth-supply 30일 변화율.
  //   change_pct > +2% → +0.10, < -2% → -0.15
  return {
    key: "lth_supply",
    value: 0,
    status: "stub",
    detail: `${symbol} Glassnode LTH 통합 미구현 (key 감지됨, 다음 릴리스)`,
    raw: { hasKey: true },
  };
}

// ─── Test exports ───────────────────────────────────────────────────
// 테스트에서 결정론 검증 용 — 프로덕션 코드는 사용 X.
export const __testing = { simpleHash, hashUnit, mockValue, isMockMode };
