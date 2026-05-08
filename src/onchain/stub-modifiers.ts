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
 *
 * 각 함수는 명세서의 임계값을 그대로 적용한다. 진짜 호출 경로는 v1 에서
 * "key 있으면 호출, 없으면 stub" 만 분기. 실제 구현은 키 발급 후 한 곳에서.
 */

import axios from "axios";
import type { OnchainModifierResult } from "./types";

// ─── Exchange Netflow ───────────────────────────────────────────────

export async function computeExchangeNetflow(
  symbol: string
): Promise<OnchainModifierResult> {
  const key = process.env.CRYPTOQUANT_API_KEY;
  if (!key) {
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
    return {
      key: "etf_flow",
      value: 0,
      status: "stub",
      detail: "ETF_FLOW_PROVIDER 미설정 — 영향 없음 (Farside 스크래핑 비활성)",
    };
  }

  // TODO(v1.1): Farside HTML 스크래핑 — 최근 3 영업일 누적 BTC/ETH ETF flow.
  //   3d>+$1.5B → +0.20, 3d>+$500M → +0.10
  //   3d<-$1B → -0.25, 3d<-$300M → -0.10
  // 위험 요소: HTML 구조 변경, CSP, robots.txt. 실패 시 status="error".
  try {
    const url = symbol === "BTCUSDT"
      ? "https://farside.co.uk/btc/"
      : "https://farside.co.uk/eth/";
    const resp = await axios.get<string>(url, {
      timeout: 10000,
      headers: { "User-Agent": "tradelab-onchain/1.0" },
    });
    // Sanity check 만 — 실제 파싱은 명시적 v1.1 작업.
    if (resp.data.length < 1000) throw new Error("응답 비정상");
    return {
      key: "etf_flow",
      value: 0,
      status: "stub",
      detail: `${symbol} Farside HTML 수신 OK — 파서 v1.1 예정`,
      raw: { bytes: resp.data.length },
    };
  } catch (err: any) {
    return {
      key: "etf_flow",
      value: 0,
      status: "error",
      detail: `Farside 호출 실패: ${err.message ?? err}`,
    };
  }
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
