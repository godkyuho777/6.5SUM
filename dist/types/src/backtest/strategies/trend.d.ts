/**
 * Trend Analysis Strategy — Wave Tracker / Trend Analysis 페이지.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ 헌장 R3 (No Standalone Signal) 통제 — P1-#2 fix, 2026-05-10        ║
 * ║                                                                      ║
 * ║ 본 strategy 는 **backtest 알파 baseline 측정 전용**.                  ║
 * ║ live signal scanner (`scanner.ts`) 는 trend 분석을 BBDX 의            ║
 * ║ *waveMult multiplier* 로만 사용 (`analyzeTrend(...).waveMult`).       ║
 * ║ standalone 진입 발행 X.                                              ║
 * ║                                                                      ║
 * ║ 사용 정책:                                                           ║
 * ║   ✅ backtest CLI (`pnpm backtest --strategy trend`) — 비교 baseline  ║
 * ║   ❌ real-time signal 발행 — BBDX 의 waveMult multiplier 로만 작동    ║
 * ║                                                                      ║
 * ║ Audit: `docs/2026-05-10-SCANNER-AUDIT/06-WAVE-TREND-AUDIT.md`        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * 명세서 Trend_Analysis_Engine_v2.0 의 멀티 TF 종합을 backtest 가능하게
 * 단순화한 버전. 같은 TF 캔들에서 SMA 기반 Higher-TF 추세 근사.
 *
 * 진입 게이트 (backtest 한정):
 *   1. EMA 9 > 21 > 50 (정배열) — 추세 방향 BULLISH
 *   2. ADX ≥ 20 (추세 존재)
 *   3. +DI > -DI (강세 우위)
 *   4. price > SMA(50) AND SMA(50) 상승 (long-term context)
 *   5. HH/HL pattern (직전 swing 대비 higher highs)
 *
 * Tier 1/2:
 *   Tier 1: 직전 20캔들 high (swing high) 회복 → 50%
 *   Tier 2: entry × 1.05 (+5%) → 잔여 50%
 *   Stop: max(EMA(21), entry × 0.97) — 추세 추종 손절
 *
 * 헌장 차원: 3 trend (ADX + EMA + SMA + HH/HL)
 */
import type { BacktestStrategy } from "./types";
export declare const trendStrategy: BacktestStrategy;
