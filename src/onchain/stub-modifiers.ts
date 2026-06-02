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
import { fetchCryptoQuant } from "./sources/cryptoquant";
import { fetchGlassnode, type GlassnodeAsset } from "./sources/glassnode";

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

/**
 * z-score → modifier value 매핑.
 *
 * 거래소 netflow (BTC) — z 가 양수면 거래소로 유입 (매도 압력),
 * 음수면 거래소에서 유출 (보유/축적 의향).
 *
 *   z >= +2  → -0.25  (강한 유입, 매도 압력)
 *   z >= +1  → -0.10  (선형 보간)
 *   z <= -2  → +0.20  (강한 유출, 보유 의향)
 *   z <= -1  → +0.10  (선형 보간)
 *   |z| < 1  → 0  (중립)
 *
 * @internal — 테스트용 export.
 */
export function applyNetflowZscoreThreshold(z: number): number {
  if (!Number.isFinite(z)) return 0;
  if (z >= 2) return -0.25;
  if (z <= -2) return 0.2;
  if (z >= 1) return -0.1;
  if (z <= -1) return 0.1;
  return 0;
}

export async function computeExchangeNetflow(
  symbol: string
): Promise<OnchainModifierResult> {
  // v1: BTC 전용 (CryptoQuant Free tier 가 btc/* 시리즈만 제공).
  // 다른 symbol 은 score.ts 의 tier-aware enabled 가 별도 처리.
  if (!symbol.startsWith("BTC")) {
    return {
      key: "exchange_netflow",
      value: 0,
      status: "stub",
      detail: `${symbol} BTC 전용 (v1) — 영향 없음`,
    };
  }

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

  // 실데이터 호출 — CryptoQuant Free, 30d 일별 netflow.
  const result = await fetchCryptoQuant("btc/exchange-flows/netflow", 30);
  if (result.status !== "ok" || result.data.length < 7) {
    return {
      key: "exchange_netflow",
      value: 0,
      status: result.status === "stub" ? "stub" : "error",
      detail: result.detail ?? `${symbol} CryptoQuant netflow 데이터 부족 (n=${result.data.length})`,
    };
  }

  // z-score: 가장 최근 24h vs 30일 평균/표준편차.
  // CryptoQuant 의 day cadence 응답에서 마지막 행 = 가장 최근 일.
  const values = result.data.map((d) => d.value);
  const latest = values[values.length - 1];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  const z = std > 0 ? (latest - mean) / std : 0;

  const value = applyNetflowZscoreThreshold(z);
  const signV = value >= 0 ? "+" : "";

  return {
    key: "exchange_netflow",
    value,
    status: "ok",
    detail: `${symbol} 24h netflow ${latest.toFixed(0)} BTC · z=${z.toFixed(2)} (30d, ${signV}${value.toFixed(2)})`,
    raw: { latest, z, mean, std, samples: values.length },
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

/**
 * Miner outflow z-score → modifier value 매핑.
 *
 * 채굴자 outflow (BTC) — 7d 합산을 30d 분포 대비 z-score 화. z 가 양수면
 * 채굴자가 평소보다 많이 출금 (거래소 이동 → 매도 압력 가능), 음수면 보유 의향.
 *
 *   z >= +2    → -0.15  (강한 매도 압력)
 *   z >= +1    → -0.05  (약한 매도 압력)
 *   z <= -1.5  → +0.10  (채굴자 holding, 공급 축소)
 *   그 외       → 0  (중립)
 *
 * @internal — 테스트용 export.
 */
export function applyMinerOutflowZscoreThreshold(z: number): number {
  if (!Number.isFinite(z)) return 0;
  if (z >= 2) return -0.15;
  if (z >= 1) return -0.05;
  if (z <= -1.5) return 0.1;
  return 0;
}

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

  // 실데이터 호출 — CryptoQuant Free, 30d 일별 miner outflow.
  const result = await fetchCryptoQuant("btc/miner-flows/outflow", 30);
  if (result.status !== "ok" || result.data.length < 7) {
    return {
      key: "miner_outflow",
      value: 0,
      status: result.status === "stub" ? "stub" : "error",
      detail:
        result.detail ??
        `${symbol} CryptoQuant miner outflow 데이터 부족 (n=${result.data.length})`,
    };
  }

  // 7d 합산을 전 구간 rolling-7d-sum 분포 대비 z-score 화.
  // 일별 outflow → 24개 이상의 7일 합산 시계열을 만들고, 마지막(최근 7d)을
  // 분포 평균/표준편차로 정규화한다.
  const daily = result.data.map((d) => d.value);
  const rollingSums: number[] = [];
  for (let i = 6; i < daily.length; i++) {
    let s = 0;
    for (let j = i - 6; j <= i; j++) s += daily[j];
    rollingSums.push(s);
  }
  const latest7d = rollingSums[rollingSums.length - 1];
  const mean = rollingSums.reduce((s, v) => s + v, 0) / rollingSums.length;
  const variance =
    rollingSums.reduce((s, v) => s + (v - mean) ** 2, 0) / rollingSums.length;
  const std = Math.sqrt(variance);
  const z = std > 0 ? (latest7d - mean) / std : 0;

  const value = applyMinerOutflowZscoreThreshold(z);
  const signV = value >= 0 ? "+" : "";

  return {
    key: "miner_outflow",
    value,
    status: "ok",
    detail: `${symbol} 7d miner outflow ${latest7d.toFixed(0)} BTC · z=${z.toFixed(2)} (30d, ${signV}${value.toFixed(2)})`,
    raw: { latest7d, z, mean, std, samples: rollingSums.length },
  };
}

// ─── LTH Supply (BTC/ETH) ───────────────────────────────────────────

/**
 * LTH supply 30d 변화율 → modifier value 매핑.
 *
 * Long-Term Holder supply 의 30일 변화율 (소수, 예: 0.05 = +5%).
 * 양수면 장기 보유자 축적 (공급 잠김 → bullish), 음수면 분배 (매도 → bearish).
 *
 *   >= +2%  → +0.10  (강한 축적, cap)
 *   <= -2%  → -0.15  (강한 분배, cap)
 *   작은 양수 → value × 5  로 선형 보간 (+0.02 에서 +0.10 cap 도달)
 *   작은 음수 → value × 7.5 로 선형 보간 (-0.02 에서 -0.15 cap 도달)
 *   0       → 0
 *
 * @internal — 테스트용 export.
 */
export function applyLthSupplyChangeThreshold(changePct: number): number {
  if (!Number.isFinite(changePct)) return 0;
  if (changePct >= 0.02) return 0.1;
  if (changePct <= -0.02) return -0.15;
  if (changePct >= 0) return changePct * 5;
  return changePct * 7.5;
}

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

  // 실데이터 호출 — Glassnode Free, 30d LTH supply 시계열.
  const asset: GlassnodeAsset = symbol === "BTCUSDT" ? "BTC" : "ETH";
  const result = await fetchGlassnode("supply/lth_sum", asset, 30);
  if (result.status !== "ok" || result.data.length < 2) {
    return {
      key: "lth_supply",
      value: 0,
      status: result.status === "stub" ? "stub" : "error",
      detail:
        result.detail ??
        `${symbol} Glassnode LTH supply 데이터 부족 (n=${result.data.length})`,
    };
  }

  // 30d 변화율: (마지막 - 처음) / 처음. 시계열은 시간 오름차순 가정.
  const first = result.data[0].v;
  const last = result.data[result.data.length - 1].v;
  const changePct = first !== 0 ? (last - first) / first : 0;

  const value = applyLthSupplyChangeThreshold(changePct);
  const signV = value >= 0 ? "+" : "";
  const pctStr = (changePct * 100).toFixed(2);

  return {
    key: "lth_supply",
    value,
    status: "ok",
    detail: `${symbol} LTH supply 30d ${changePct >= 0 ? "+" : ""}${pctStr}% (${signV}${value.toFixed(2)})`,
    raw: { changePct, first, last, asset, samples: result.data.length },
  };
}

// ─── Test exports ───────────────────────────────────────────────────
// 테스트에서 결정론 검증 + 임계값 helper 단위 검증 용 — 프로덕션 코드는 사용 X.
export const __testing = {
  simpleHash,
  hashUnit,
  mockValue,
  isMockMode,
  applyNetflowZscoreThreshold,
  applyMinerOutflowZscoreThreshold,
  applyLthSupplyChangeThreshold,
};
