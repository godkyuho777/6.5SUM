# Additional Strategies — Audit Report

> 명세서 `03_ADDITIONAL_STRATEGIES.md` §0~§10 의 6개 추가 전략 modifier
> 구현 검증. 헌장 7차원 매핑 + 헌장 규칙 1/2/3 준수 + calibration TODO.

생성일: 2026-05-09
작업 범위: dev 브랜치 (sha 0b074f97 기준), append-only 추가.
대상 파일: `src/modifiers/*.ts` (신규 6 modifier + types + index)

---

## 1. 6 modifier 일람표

| # | Modifier | 차원 | dimension-mapping 키 | rule1Exempt | beta | 외부 호출 | 캐시 |
|---|----------|------|---------------------|-------------|------|-----------|------|
| 1 | EMA Ribbon | 3 (trend) | `emaRibbon` | true | false | X (candles only) | scanner cache |
| 2 | Market Breadth | 6 (macro) | `marketBreadth` | true | false | Bybit klines × N | 5분 |
| 3 | MACD Divergence | 1 (momentum) | `macdDivergence` | true (RSI 와 다른 각도) | false | X | scanner cache |
| 4 | Funding Extreme | 6 (macro) | `fundingExtreme` | true | false | Bybit funding/history | 5분 |
| 5 | CVD Divergence | 4 (volume) | `cvdDivergence` | true | **true (스캐폴드)** | TODO WS | — |
| 6 | Order Block | 5 (structure) | `orderBlock` | true | true | X | scanner cache |

---

## 2. 헌장 7차원 매핑 검증

명세서 §0 의 7개 정보 차원에 맞춰 각 modifier 가 어느 차원을 측정하는지,
그리고 같은 차원 기존 indicator 와 측정 각도가 다른지 (헌장 규칙 1 예외) 검증.

| 차원 | 기존 indicator | 추가 modifier | 측정 각도 차이 |
|------|---------------|--------------|---------------|
| 1. momentum | RSI | MACD Divergence | RSI=level (0~100 bounded), MACD=momentum-of-momentum (unbounded). RSI 가 천장에 붙은 강추세 구간에서 MACD divergence 가 단독 정보 |
| 2. volatility | BB, ATR | (없음) | 추가 modifier 없음 — 기존 BB/ATR 가 충분 |
| 3. trend | ADX, DI+/- | EMA Ribbon | ADX=강도, DI=방향, EMA Ribbon=다중 EMA 정렬 상태. ADX 가 약하게 나오지만 EMA Ribbon 이 perfect bull 인 경우 = "건강한 추세 초입" 진입 윈도우 |
| 4. volume | Vol_zscore, OBV | CVD Divergence | Vol=량, OBV=close 방향 합산, CVD=trade-side 누적. CVD 만이 "공격적 매수자/매도자" 식별 가능 |
| 5. structure | Fib, Trendline | Order Block | Fib/Trendline=확정 레벨, OB=유동성 sweep 흔적. 학파 차이라 `betaStub` 라벨 |
| 6. macro | Wave Tracker (F&G+OI+LSR+Funding 통합) | Market Breadth, Funding Extreme | Wave=composite, Breadth=universe RSI 분포, Funding=single-symbol perp positioning. 각각 다른 각도 |
| 7. onchain | 7-modifier (netflow, whale, ssr, ...) | (없음) | 기존 7-modifier 충분 |

**결론**: 모든 추가 modifier 가 같은 차원 기존 indicator 와 다른 각도를 측정.
`charter/dimension-mapping.ts` 의 `ADDITIONAL_MODIFIER_DIMENSIONS` 에 모두
`rule1Exempt: true` 로 등록.

---

## 3. 헌장 3대 규칙 준수 매트릭스

### 규칙 1 — Dimension Duplicate (같은 차원 중복 금지)

| Modifier | 같은 차원 기존 indicator | rule1Exempt? | 검증 |
|----------|------------------------|--------------|------|
| EMA Ribbon | ADX, DI+/-, EMA | true | OK — 정렬 상태 측정 (강도/방향과 별도) |
| Market Breadth | Wave Tracker | true | OK — universe-wide vs single-symbol composite |
| MACD Divergence | RSI | true | OK — RSI 가 이미 `allowsSameDimensionPair` 에 MACD_histogram 등록됨 |
| Funding Extreme | Wave Tracker | true | OK — single-symbol perp positioning |
| CVD Divergence | Vol_zscore, OBV | true | OK — trade-side aggressive vs raw volume |
| Order Block | Fib, Trendline | true | OK — liquidity sweep vs static level |

### 규칙 2 — Backtest Alpha (백테스트 알파 검증)

**현 작업 범위 외**. 명세서 §10 의 우선순위 표에 따라 EMA Ribbon → Market Breadth →
MACD Divergence → ... 순으로 단계별 백테스트 검증 후 alpha 가 입증된 것만
production rollout 권장.

calibration TODO:
- [ ] EMA Ribbon multiplier 임계값 (현재 1.15 / 1.05 / 0.80 / 0.30) — 백테스트로 fine-tune
- [ ] Market Breadth threshold (rsiBelow30Pct > 0.6 → panic) — 96 코인 universe 분포 검증
- [ ] MACD strength formula (0.4 × distanceFactor + 0.6 × magnitudeFactor) — 가중치
- [ ] Funding rate 임계값 (0.001 = +0.1%/8h) — 알트별 분포 다름 (현재는 BTC 기준)
- [ ] Order Block multiplier 영향력 (현재 ±0.05) — 정량화 합의 부재라 작게 유지

### 규칙 3 — No Standalone Signal (단독 시그널 발행 금지)

**모든 modifier 가 multiplier 형태로만 출력** (✓ 검증).

- 모든 6 modifier 의 결과 타입이 `ModifierResult` (`src/modifiers/types.ts`) 를 상속.
- `multiplier` 필드 (0.30~1.40) 가 항상 존재.
- standalone 시그널 발행 절대 X — `EntryDecision.path` 같은 시그널 결정 필드 없음.
- BBDX 코어 final_confidence 곱셈 체인에 합쳐서만 영향.

`combineAdditionalModifiers()` 가 모든 multiplier 를 단순 product 로 묶어
final_confidence 의 마지막 곱셈 항으로 추가 (TODO: v6.5 머지 후 통합 위치 확정).

---

## 4. Stub-first / Graceful Failure 매트릭스

| Modifier | 외부 호출 실패 시 | 데이터 부족 시 | 키 미설정 시 |
|----------|------------------|---------------|-------------|
| EMA Ribbon | n/a | status="stub", multiplier=1.0 | n/a |
| Market Breadth | 모든 fetch 실패 → status="stub" | 빈 universe → "stub" | n/a |
| MACD Divergence | n/a | <35 캔들 → "stub" | n/a |
| Funding Extreme | status="error", multiplier=1.0 (graceful, throw X) | spot-only → "stub" | n/a |
| CVD Divergence | n/a (스캐폴드) | n/a | n/a — 항상 stub |
| Order Block | n/a | <25 캔들 → "stub" | n/a |

**검증**: 모든 modifier 가 throw 하지 않음. 외부 호출은 try/catch 후 객체 반환.
호출 체인을 깨지 않음 (헌장 규칙 3 안전성).

---

## 5. 룩어헤드 안전성 (Lookahead-free)

백테스트에서 미래 데이터 사용 금지 — `signal-extractor.ts` 의 헌장.

| Modifier | swing 탐지 | i 시점 데이터만 사용? |
|----------|-----------|---------------------|
| EMA Ribbon | 없음 (EMA 만) | OK — calculateEMA 가 i 까지만 |
| MACD Divergence | 5-bar fractal | OK — i+2 확정 fractal 만 (`maxIdx-2` 까지만 후보) |
| Order Block | 5-bar fractal | OK — `upToIdx-2` 까지만 후보 |
| Market Breadth | 없음 | OK |
| Funding Extreme | 없음 | OK — 가장 최근 funding 만 |
| CVD Divergence | (스캐폴드) | n/a |

**검증**: MACD/Order Block 의 fractal 탐지가 i+2 확정 swing 만 후보로 인정.
가장 최신 swing 은 i = N-3 까지.

---

## 6. Multiplier 한계 검증

`src/modifiers/types.ts` 의 `clampMultiplier` 가 [0.30, 1.40] 으로 강제 clamp.

| Modifier | 이론적 multiplier 범위 | 실제 출력 범위 |
|----------|----------------------|--------------|
| EMA Ribbon | 0.30 ~ 1.15 | 0.30 / 0.80 / 1.00 / 1.05 / 1.15 (5 stage) |
| Market Breadth | 0.60 ~ 1.30 | 0.60 / 0.90 / 1.00 / 1.10 / 1.30 (5 stage) |
| MACD Divergence | 0.80 ~ 1.20 | 1.0 ± strength × 0.20 |
| Funding Extreme | 0.85 ~ 1.20 | 0.85 / 0.92 / 1.00 / 1.10 / 1.20 (5 stage) |
| CVD Divergence | 1.0 (stub) | 1.0 |
| Order Block | 0.95 ~ 1.05 | 0.95 / 1.00 / 1.05 (3 stage) |

**최악 경우 누적 영향** (모든 modifier 가 LONG 약화 방향):
0.30 × 0.60 × 0.80 × 0.85 × 1.0 × 0.95 ≈ 0.116 → BBDX score 88.4% 차감.

**최선 경우 누적 영향** (모든 modifier 가 LONG 강화):
1.15 × 1.30 × 1.20 × 1.20 × 1.0 × 1.05 ≈ 2.26 → BBDX score 126% 가산.

→ confidence 가 100 cap 에 닿을 가능성 있음. v6.5 머지 후 통합 위치에서
최종 cap 확인 필요 (`Math.min(100, base × ...)`).

---

## 7. v6.5 BBDX 코어 통합 위치 (TODO)

현재 `EntryDecision` 에 6 개 optional `*Mult` 필드 추가됨.
실제 곱셈 체인 통합은 v6.5 머지 후 다음 위치에서:

```ts
// src/signals/confidence.ts (또는 동등 위치)
final_confidence = base
                 × confluence
                 × wave
                 × macro
                 × onchain
                 × (vwapMult ?? 1.0)
                 × combineAdditionalModifiers({           // ★ TODO 추가
                     emaRibbonMult: entry.emaRibbonMult,
                     marketBreadthMult: entry.marketBreadthMult,
                     macdDivergenceMult: entry.macdDivergenceMult,
                     fundingExtremeMult: entry.fundingExtremeMult,
                     cvdDivergenceMult: entry.cvdDivergenceMult,
                     orderBlockMult: entry.orderBlockMult,
                   });
final_confidence = Math.min(100, final_confidence);   // cap
```

scanner.ts 가 이미 `emaRibbonMult / macdDivergenceMult / orderBlockMult` 를
EntryDecision 에 채워 넣음. `marketBreadthMult / fundingExtremeMult` 는
비용 큰 호출이라 별도 라우트 (`modifiers.all`) 에서 호출자가 합쳐야 함.

---

## 8. tRPC endpoint 일람

`/api/trpc` 하위. 모두 `publicProcedure` (auth 불필요).

| Endpoint | Input | 출력 |
|----------|-------|------|
| `modifiers.emaRibbon` | `{ symbol, tf? }` | `EmaRibbonResult` |
| `modifiers.marketBreadth` | `{ symbols?, tf? }` | `MarketBreadthResult` |
| `modifiers.macdDivergence` | `{ symbol, tf?, lookback? }` | `MacdDivergenceResult` |
| `modifiers.fundingExtreme` | `{ symbol }` | `FundingExtremeResult` |
| `modifiers.orderBlock` | `{ symbol, tf? }` | `OrderBlockResult` |
| `modifiers.cvdDivergence` | `{ symbol, tf? }` | `CvdDivergenceResult` |
| `modifiers.all` | `{ symbol, tf?, includeBreadth? }` | 6 result + `combinedMultiplier` |

---

## 9. 테스트 커버리지

`src/modifiers/__tests__/` 6 파일, 36 tests. 모두 pass.

- `ema-ribbon.test.ts` — 8 tests (perfect bull/bear, neutral, 데이터 부족, 헌장 준수)
- `macd-divergence.test.ts` — 7 tests (데이터 부족, uptrend, multiplier 범위, strength bound, 합성)
- `order-block.test.ts` — 4 tests (데이터 부족, sell-side, neutral, multiplier bound)
- `cvd-divergence.test.ts` — 2 tests (베타 stub 동작)
- `funding-extreme.test.ts` — 9 tests (5 regime + spot-only + error + 캐시)
- `market-breadth.test.ts` — 7 tests (5 sentiment + 빈/실패/부분실패)

회귀 테스트: 기존 375 tests 모두 pass (총 411 tests).

---

## 10. 미해결 / 후속 작업

1. **CVD Divergence 본격 구현** — WebSocket `/v5/public/spot publicTrade` stream
   구독 + 1h/4h/session 윈도우 별 누적 + 가격 swing vs CVD swing 비교.
   별도 PR 권장 (대용량 처리 — 인프라 결정 필요).

2. **v6.5 final_confidence 통합** — `combineAdditionalModifiers()` 결과를
   `signals/confidence.ts` 의 곱셈 체인 마지막에 추가. v6.5 머지 후 작업.

3. **Calibration** — 명세서 §10 우선순위에 따라 단계별 백테스트:
   1. EMA Ribbon (최우선)
   2. Market Breadth
   3. MACD Divergence
   4. Funding Extreme
   5. Order Block (정량화 어려움 — 마지막)

4. **Frontend visualization** — 각 modifier 의 `reason` / `breakdown` 필드를
   UI 에 노출. 특히 `modifiers.all` 의 `combinedMultiplier` 게이지.

5. **Market Breadth universe 확장** — 현재 `TOP_COINS.slice(0, 30)` 으로
   limit. 96 전체로 늘리려면 batch fetch + 더 긴 캐시 TTL 검토.

6. **Funding rate 알트별 임계값** — 명세서 §8 의 +0.001 / -0.0005 는
   BTC 기준. 알트는 변동성이 커서 임계값 다를 수 있음. v2 에서 코인별 분포
   기반 dynamic threshold 검토.

---

## 11. 검증 명령

```powershell
cd tradelab-backend
pnpm check          # tsc --noEmit, 0 errors ✓
pnpm test           # 411/411 pass ✓
pnpm build:types    # dist/types/src/modifiers/*.d.ts 생성 ✓
```
