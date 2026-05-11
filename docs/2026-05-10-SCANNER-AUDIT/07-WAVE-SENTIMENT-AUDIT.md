# 07 — Wave Sentiment & Matrix v4.1 Audit

## 0. 개요

`src/sentiment/` 디렉토리는 4개 외부 데이터 소스 → composite sentiment + 4-signal matrix.

- `sentiment-score.ts` — Composite Sentiment (40% F&G + 20% global + 15% OI + 25% L/S+Funding)
- `wave-matrix.ts` — 4-signal vote (OI / Sentiment / Funding / L/S)
- `index.ts` — orchestrator (Promise.allSettled, 4 fetch 병렬)

## 1. Composite Sentiment Score (`sentiment-score.ts`)

### 1.1 현재 룰

```
score = 50 (시작점)
       + (F&G - 50) × 0.4
       + ±2 (F&G 7d delta > 10pt)
       + marketCapChange24h × 1.5
       + ±1.5 (BTC dominance >60 / <45)
       + oiChangeRate × 1.0
       + ±5 (longHeavy / shortHeavy by ratio)
       + ±3 (funding > 0.005 / < -0.005)
       (clamp 0~100)
```

Market Phase 분류 (sentiment, oiChange):
- fearful (<40) + oiUp → ACCUMULATION
- greedy (>60) + oiUp → HEATING
- greedy + oiDown → DISTRIBUTION
- fearful + oiDown → PANIC
- 그 외 → HEATING (default)

### 1.2 단점

#### S1. 가중치 합계 검증 (P2)
- 명세서 §3 의 가중치 40+20+15+25 = 100% 분배.
- 실제 코드:
  - F&G: 0.4 (max ±20점)
  - global: marketCap × 1.5 (실제 변화율 ±5% → ±7.5점)
  - BTC dominance: ±1.5
  - OI: × 1.0 (변화율 ±2% → ±2점)
  - L/S: ±5
  - Funding: ±3
- *실효 가중치* 가 명세서 의도와 다름 — F&G dominant (40%), 나머지는 합쳐도 ~30% 영향.
- BTC dominance ±1.5 와 OI ×1.0 (실효 ±2) 의 격차 작음 — *signal noise* 수준.

#### S2. Default Market Phase = HEATING (P1)
- `phaseFor:51`: `fearful || greedy` 미해당 + oiFlat → HEATING.
- 일반적인 market state (sentiment 40~60, OI flat) 가 *대부분 시간* — default 가 HEATING 으로 잘못 분류.
- 의미: HEATING 은 "과열" — 일반 평온 시장에서도 사용자에게 "과열" 메시지 표시 → *의사결정 distortion*.
- 권고: default → "NEUTRAL" 또는 "TRANSITIONAL" phase 추가.

#### S3. fngContribution 사용 후 fngDelta7d 보너스 (P3)
- `score = 50 + (currentFng - 50) × 0.4` 후 `fngDelta7d > 10 → +2`.
- F&G 자체와 7d 변화는 *상관관계 큼* — 같은 정보 두 번 가산 위험.
- 단점: F&G 80 (greedy) + 7d delta +15 → score 50 + 12 + 2 = 64.
  같은 환경에서 "greedy + 회복 추세" 가 단순 +12 (F&G만 가산) 보다 더 강한 신호인지 — 명세서 의도 검증 필요.

#### S4. score clamp 0~100 (P3)
- 모든 가산 합계가 0~100 안에 떨어지는지 check 필요.
- 최악 case: F&G 0 (-20) + BTC dom 60+ (-1.5) + marketCap -10% (-15) + oiUp +2 + shortHeavy -5 + funding short_extreme -3 = -42.5. score = 50 - 42.5 = 7.5 (clamp 안됨 ✓).
- 최선: 50 + 20 + 1.5 + 15 + 2 + 5 + 3 = 96.5 — clamp 안됨 ✓.
- score = 0 또는 100 도달 거의 없음 — 분포 약 5~95 영역 — 정상.

### 1.3 개선안

- S2: `default` phase → `"NEUTRAL"` 추가, HEATING 은 *진짜 과열* (sentiment>70 + oiUp 등) 한정.
- S1: 가중치 calibration — 명세서 40/20/15/25 의도 명확히 *score 영향 max* 로 매핑.

### 1.4 헌장 검증

- **R1**: 6차원 (macro). `Fear&Greed`, `BTC_dominance` 가 dimension-mapping 에 등록 — 두 개 모두 macro 차원 — `allowsSameDimensionPair` 미명시. **R1 위반 가능**.
- **R2**: composite score 자체는 alpha 측정 가능 (calibration 추가 가능).
- **R3**: `SentimentSnapshot` 이 standalone signal 인지, BBDX multiplier 인지 **확인 필요** — 7. 참조.

---

## 2. Wave Matrix v4.1 (`wave-matrix.ts`)

### 2.1 현재 룰

4 signal vote:
- OI signal (`deriveOiSignal`): 9-case matrix (OI direction × Price direction × F&G state)
- Sentiment signal: composite > 60 / < 40
- Funding signal: rate > 0.005 / < -0.005
- L/S signal: ratio > 1.1 / < 0.9

overall bias:
- bullish ≥ 3 → bullish
- bearish ≥ 3 → bearish
- bullish > bearish → bullish (else bearish)
- 그 외 → neutral

confidence:
```
confidence = (max(bullish, bearish) / 4) × 100 × (compositeScore/100 + 0.5)
```

### 2.2 단점

#### M1. confidence 공식 의미 (P2)
- bullish 4개 (max 4) + composite 100 → confidence = 1 × 100 × 1.5 = **150** (clamp 100).
- bullish 4개 + composite 50 → 1 × 100 × 1 = 100.
- bullish 4개 + composite 0 → 1 × 100 × 0.5 = 50.
- 단점: confidence 가 composite 와 강한 상관 — *circular reference*. composite 가 이미 sentiment signal 의 부분.
- 결과: bullish 다 가리키는데 composite 가 30 (fear) 면 confidence = 50 — modest.
- 의도: "compositeScore 가 강한 bullish + 4 signal bullish" → 강한 confidence. 합리적이지만 composite 가 sentiment signal 의 derivation 이라 *double counting*.

#### M2. 9-case OI matrix 의 fearful/greedy override (P3)
- `oiUp + priceUp + greedy` → bullish (interpretation: "탐욕 + 상승 가속")
- `oiUp + priceUp + fearful` → bullish (interpretation: "스마트머니 매집 초기 상승")
- 두 case 같은 결론 — fearful 일 때 매집 가설은 확률 작음 (대부분 상승은 hype, 매집 X).
- 단점: contrarian 가설을 default 로 — false positive.

#### M3. funding 임계 0.005 (`wave-matrix.ts:118-122`) (P2)
- `funding > 0.005 → bullish`.
- 비대칭: 음수 funding (`-0.005`) 도 bullish 가능 ("숏 과열" 의미). 현재 rule: `funding > 0.005 → bullish`, `< -0.005 → bearish`.
- spec 의 funding extreme modifier (`modifiers/funding-extreme.ts`) 와 *반대* — 거기는 `funding > 0.001 → long_extreme → 0.85 (LONG 약화)`.
- **모순**: Wave Matrix 는 high funding = bullish, Funding Extreme modifier 는 high funding = LONG 차감.
- 사용자 측 인지 모호 — "funding 양수면 bullish 인가 bearish 인가?".
- 권고: Wave Matrix 의 funding signal 도 **contrarian** 적용 (high funding → bearish).

#### M4. L/S ratio 1.1 / 0.9 임계 (P3)
- 일반 ratio 분포: 0.7 ~ 1.5. 1.1 (long heavy) 은 *온건 임계*.
- 단점: 1.1 빈번 도달 — bullish signal 이 정상 수준에서도 자주 발생.
- 권고: ratio > 1.3 → bullish 로 강화.

### 2.3 개선안

| 항목 | 현재 | 권고 | 근거 |
|---|---|---|---|
| Funding signal contrarian | high → bullish | **high → bearish** (Funding Extreme 와 정합) | M3 |
| L/S ratio 임계 | 1.1 / 0.9 | **1.3 / 0.7** | M4 |
| OI matrix `fearful + oiUp + priceUp` | bullish (스마트머니) | **neutral** (확률 낮음) | M2 |
| confidence 공식 | composite 의존 | composite 분리 | M1 |

### 2.4 헌장 검증

- **R1**: 4 signal 중 sentiment + funding + L/S 모두 6차원 (macro). composite 도 macro. **R1 위반 가능** (4중 동일 차원).
- **R2**: standalone "prediction" 발행 — alpha 측정 미흡.
- **R3**: prediction 메시지가 **standalone signal 처럼 작동** 가능 (`predictionKo` "강한 상승 일치. 추세 추종 진입 + 익절 계획 필수" — 진입 권고 메시지). **R3 위반 위험**.

---

## 3. ★ BBDX 곱셈체인 통합 검증 (P1)

### 3.1 현황

- `sentiment/index.ts:computeWaveTrackerData` 가 SentimentSnapshot + WaveMatrixState 반환.
- `signals/confidence.ts:ConfidenceInputs` 인자에 sentiment/wave-matrix 항목 **없음**.
- grep 결과 `computeComposite`, `computeWaveMatrix` 호출처:
  - `sentiment/index.ts` (정의)
  - 그 외 — **router 의 wave-tracker route 만** (display 용도)

### 3.2 영향 ★

- **Wave Sentiment & Matrix 결과가 BBDX final_confidence 에 영향 0** — display 만.
- spec (Wave Tracker spec **확인 필요**) 의 의도가 multiplier 인지 advisory 인지 모호.
- 만약 multiplier 의도라면 — 미통합 = 알파 측정 0, R2 위반.
- 만약 advisory 의도라면 — `predictionKo` 메시지가 사용자에게 *직접 진입 권고* — R3 위반 위험.

### 3.3 권고

- spec 명확화: "advisory only — UI 표시 + 사용자 의사결정 보조" → BBDX 미통합 OK, 단 R3 위반 회피 위해 메시지 톤 조정 ("진입 권고" 톤 → "환경 분류").
- 또는 multiplier 통합: composite score 100 → mult 1.20, 0 → mult 0.80 등 연속 함수.

---

## 4. 헌장 검증 종합

- **R1**: macro 차원 4중 (composite + 3 signal) — `allowsSameDimensionPair` 명시 부재. **위반 가능**.
- **R2**: alpha 측정 0건 (calibration param 미포함). **위반 가능**.
- **R3**: `predictionKo` 메시지가 진입 권고 톤 — **간접 위반 위험**.

## 5. 권고 우선순위

| 항목 | P | 영향 |
|---|---|---|
| BBDX 통합 모드 spec 명확화 | **P1** | R2/R3 결정 |
| Funding signal contrarian (Funding Extreme 와 정합) | P1 | M3 모순 |
| `predictionKo` 톤 조정 (진입 권고 X) | P1 | R3 |
| Default Market Phase NEUTRAL (S2) | P1 | UI 의사결정 distortion |
| L/S 임계 1.1→1.3 | P2 | 정확도 |
| confidence 공식 composite 분리 | P2 | double counting |
