# Wave Tracker — Sentiment & Matrix 감사 보고서

> 거시 스탠스 + 파동 예측 지표로 사용 중인 Wave Tracker 의 Sentiment & Matrix
> 모듈을 다차원에서 점검. 19개 문제 식별 → 4개 Phase 로 개선.
>
> **작성일**: 2026-05-10
> **대상 브랜치**: `tradelab-backend@dev`, `tradelab-frontend@dev`
> **모듈 경로**:
> - Backend: `src/sentiment/{index, types, sentiment-score, wave-matrix,
>   fear-greed, coingecko-global, bybit-derivatives, bybit-long-short}.ts`
> - Frontend: `src/pages/WaveSentiment.tsx`,
>   `src/components/wave/WaveMatrixCard.tsx`

---

## 0. 요약

| 차원 | 현재 | 문제점 | 개선 방향 |
|---|---|---|---|
| 데이터 소스 | 4개 (F&G / CoinGecko / Bybit OI+Funding / Bybit L/S) | 일부 stale (F&G 1일 1회) | 무관 (소스 자체는 OK) |
| Composite 공식 | F&G 40% + 시총 20% + OI 15% + L/S+Funding 25% | F&G 가중치 과도 / 임계값 과민 | 가중치 재배분 + 임계값 calibration |
| Confidence 공식 | `(max/4)×100×(score/100+0.5)` | 비대칭 — bearish 일치를 약하게 표시 | symmetric divergence 기반 |
| Wave 신호 | 4개 vote | tie 처리 미비 / OI 9-case 중복 | tie=neutral 명시 + case 정리 |
| 거시 스탠스 | 없음 | "거시 스탠스" 사용자 요구 unmet | RISK_ON / RISK_OFF / NEUTRAL / DEFENSIVE 분류 신설 |
| Multi-period | 24h만 | 7일/30일 추세 없음 → 단기 노이즈에 휘둘림 | OI 7d / Funding 7d 평균 도입 |
| UI | 4 신호 + 추론 텍스트 | stale data 무경고 / 거시 스탠스 미표기 | macro stance badge + source health indicator |

핵심 한 줄: **"한 시점만 보고 있고, 가중치가 과민하며, confidence 가 비대칭이다."**

---

## 1. 데이터 소스 분석

### 1.1 사용 중인 4개 API

| 소스 | API | 갱신 주기 | 캐시 TTL | 키 필요 |
|---|---|---|---|---|
| Fear & Greed | `alternative.me/fng` | 1일 1회 | 1시간 | ✗ |
| Global Market | `api.coingecko.com/api/v3/global` | ~5분 | (캐시 없음) | ✗ |
| Bybit Derivatives | `api.bybit.com/v5/market/{open-interest, funding/history, tickers}` | 실시간 | 5분 | ✗ |
| Bybit Long/Short | `api.bybit.com/v5/market/account-ratio` | 실시간 (1h period) | 5분 | ✗ |

**각 소스 자체에는 큰 결함 없음** — 무료, 키 불필요, graceful fallback 구현됨.
다만 *조합 방식과 해석* 에 결함이 있음.

### 1.2 누락된 거시 지표 (사용자 요청 반영)

거시 스탠스 (= macro stance) 를 정확히 알려주려면 다음이 필요한데 모두 누락:

| 지표 | 의미 | 구현 가능성 |
|---|---|---|
| BTC Realized Volatility (7d / 30d) | 변동성 phase — 변동성 폭발 임박 신호 | ✅ Bybit candle 로 자체 계산 가능 |
| Funding Rate 7d 평균 vs 현재 | 펀딩 추세 (과열 누적 vs 단기 스파이크) | ✅ Bybit funding/history limit 확장 |
| OI 7d 변화율 | 24h OI 노이즈 vs 진짜 추세 | ✅ Bybit open-interest intervalTime=1d&limit=7 |
| Stablecoin Supply Ratio (SSR) | 스테이블 → BTC 매수력 | ⚠️ 이미 `src/onchain/ssr.ts` 존재 — 미연결 |
| BTC ETF Net Flow | 미국 기관 자금 유입/유출 | ⚠️ 키 필요 (FRED 또는 SoSoValue) |
| DXY (US Dollar Index) | 달러 강세/약세 → 위험자산 inverse | ⚠️ 키 필요 (FRED 또는 yahoo) |

---

## 2. 식별된 문제점 (총 19개)

### 🔴 Critical (즉시 수정)

#### P-1. F&G 가중치 40% 과도 — 저주파 신호의 과대평가
- **현재**: `score += (currentFng - 50) × 0.4` — F&G 50pt 차이가 ±20점 영향
- **문제**: F&G 는 1일 1회 갱신. intraday 시그널 (OI/Funding) 과 같은 비중으로 묶이면, F&G 가 어제 "fear" 면 오늘 OI 가 +10% 폭등해도 composite 가 중립선 아래.
- **영향도**: composite score 의 60% 이상이 F&G 1개에 종속되는 경우 다수
- **개선**: F&G 25% + 시총 15% + OI 25% + Funding 15% + L/S 15% + 보정 5%

#### P-2. Confidence 공식의 수학적 비대칭
- **현재**: `confidence = (max(bull, bear) / 4) × 100 × (compositeScore/100 + 0.5)`
- **문제**: compositeScore=0 일 때 multiplier=0.5 → 강한 bearish 4/4 일치도 50% 신뢰도. compositeScore=100 일 때 multiplier=1.5 → 강한 bullish 4/4 일치는 150% 가 clamp 되어 100%. **bearish 시그널을 구조적으로 평가절하**.
- **영향도**: 하락장에서 사용자가 confidence 를 신뢰하지 않게 됨 → 본래 의도와 정반대
- **개선**: `confidence = (|bull - bear| / 4) × 100 × signalStrength`,
  signalStrength = `|compositeScore - 50| / 50` (0.0~1.0, 대칭)

#### P-3. Tie(2:2) 처리 명시 부족
- **현재**: `bullishCount > bearishCount` → bullish, 같으면 neutral. 하지만 confidence 는 여전히 max=2/4=50% × multiplier 가 산출됨.
- **문제**: 2:2 동점인데 50% 신뢰도가 표시됨 → 사용자 오인
- **영향도**: 노이즈 구간에서 가짜 신뢰도
- **개선**: tie 면 `confidence = 0`, `prediction = "신호 미정"`

#### P-4. OI 임계값 ±2% 너무 낮음
- **현재**: OI 24h 변화 ±2% → bullish/bearish 신호
- **문제**: BTC OI 24h 변동은 평상시 ±1.5% 내외 — ±2% 는 거의 매일 트리거. 진짜 추세 신호는 ±5% 이상.
- **영향도**: 신호 노이즈, false positive 다수
- **개선**: OI 시그널 threshold ±3% (강 시그널) / ±1.5% (약 시그널) — 2단계 분리

#### P-5. Funding rate 임계값 ±0.005% 너무 낮음
- **현재**: 펀딩 평균 > 0.005% → bullish (롱 과열) / < -0.005% → bearish
- **문제**: Bybit 표준 펀딩은 ±0.01% 가 평범. 0.005% 는 ratio 0.5x 수준 — 의미 없는 노이즈.
- **영향도**: Funding signal 이 항상 bull/bear 둘 중 하나로 활성화 → 4-신호 다양성 저하
- **개선**: ±0.01% (강) / ±0.0025% 미만 = neutral

#### P-6. L/S Ratio 1.1/0.9 — Retail Long-bias 보정 없음
- **현재**: ratio > 1.1 → bullish, < 0.9 → bearish
- **문제**: Bybit account-ratio 는 retail 중심 → 평균 자체가 1.5~2.0 (롱 우세). 1.1 임계값은 "평소보다 더 롱" 이 아니라 "평소" 를 캡처.
- **영향도**: L/S 신호가 거의 항상 bullish → 정보 손실
- **개선**: ratio > 2.0 (강 bullish 과열) / 1.0~1.5 (neutral) / < 1.0 (드문 숏 우세)
  또는 7일 평균 대비 z-score 사용

### 🟡 Important (다음 Phase)

#### P-7. Multi-period 부재 → 단기 노이즈 종속
- **현재**: 모든 신호가 24h 한 시점만 사용
- **문제**: 24h OI +3% 가 "단발 스파이크" 인지 "7일 추세" 인지 구분 불가
- **개선**: OI 7d 변화율 추가, Funding 7d 평균 추가

#### P-8. OI 9-case 중복 분기 의미 불명
- **현재** (`wave-matrix.ts` `deriveOiSignal`):
  ```
  oiUp && priceUp && greedy   → bullish (롱 가속)
  oiUp && priceUp && fearful  → bullish (스마트머니)
  oiUp && priceUp             → bullish
  ```
- **문제**: 셋 다 bullish 신호. 텍스트만 다를 뿐 의사결정 기여도 동일.
- **개선**: 텍스트 분기는 유지하되, signal 강도(weak/medium/strong) 를 추가 차원으로 노출

#### P-9. MarketPhase 4분류 매핑 단순
- **현재**: `sentiment<40 + OI>+1%` → ACCUMULATION 등 4가지 단순 매트릭스
- **문제**: ±1% OI 같은 작은 변동까지 phase 결정에 사용. ACCUMULATION 과 PANIC 사이가 1% 차이.
- **개선**: phase 결정에 사용하는 OI threshold 를 ±2.5% 로 강화 + 중간 단계 (TRANSITIONAL) 추가

#### P-10. Phase OI 임계값 (±1%) vs Signal OI 임계값 (±2%) 불일치
- **현재**: `phaseFor()` 는 ±1%, `deriveOiSignal()` 은 ±2%
- **문제**: 같은 OI 수치를 두 함수가 다른 기준으로 해석 → 결과가 모순적으로 보임 (예: phase=HEATING 인데 oiSignal=neutral)
- **개선**: 단일 threshold ±3% 로 통일

#### P-11. Funding 7-점 (3개 평균 단순) 추세 무시
- **현재**: 최근 3개 펀딩의 단순 평균
- **문제**: 펀딩이 0.01 → 0.005 → 0.001 (감소 중) 인데 평균 0.005 만 보면 정적 해석
- **개선**: 7개 funding history 가져와서 (a) 평균, (b) 추세 (slope) 두 값 export

#### P-12. F&G 7일 추세 ±2점은 미미
- **현재**: 7일 변화 > 10pt 면 ±2점
- **문제**: composite 의 ±2점은 의미 없음 (다른 항목이 ±20점인데). 그리고 ±10pt 임계값은 너무 큼.
- **개선**: ±5pt 변화부터 ±3점 보정, ±15pt 변화면 ±5점 보정 (gradient)

#### P-13. compositeScore Round 단계 문제
- **현재**: `Math.round(score)` → 49.4 와 49.6 이 같은 49 가 됨
- **문제**: classify(49) = NEUTRAL, classify(50) = NEUTRAL 인데 (currentFng - 50) × 0.4 가 -0.2 가 되어 결과가 49 면 fearful 영역에 가까움
- **개선**: Math.round 유지하되, label 경계 (40, 60) 근처는 "borderline" 표기 추가

#### P-14. CoinGecko Global 캐시 없음
- **현재**: `coingecko-global.ts` 호출 시 매번 fetch (CoinGecko free tier 30 calls/min)
- **문제**: scanner 가 여러 코인을 병렬 호출 시 rate limit 가능
- **개선**: 5~10분 캐시

### 🟢 Polish (UI/UX)

#### P-15. 거시 스탠스 통합 표기 누락 ⭐ 사용자 요청
- **현재**: WaveSentiment 페이지가 4 신호를 따로 보여줄 뿐, "지금 시장이 RISK_ON 인가 RISK_OFF 인가" 같은 통합 결론 없음
- **개선**: 헤더에 `MACRO STANCE: RISK_ON` (4 단계) 큰 배지 추가

#### P-16. Stale data warning 부재
- **현재**: API 실패 시 fallback 0 값 반환, 사용자에 표시 없음
- **개선**: 각 신호 옆에 `(LIVE)` / `(STALE 5m)` / `(FALLBACK)` 라벨

#### P-17. Reasons 항상 6-7개 출력 — 노이즈
- **현재**: 변화 미미해도 모든 항목 출력
- **개선**: 신호 강도 ≥ medium 인 항목만 reasons 에 포함

#### P-18. predictionKo 메시지 5개로 고정
- **현재**: bull-strong / bull / bear-strong / bear / neutral 5종 메시지
- **개선**: 시장 단계 + bias + 신뢰도 조합으로 9~12종 메시지 + 권장 액션 (대기 / 분할매수 / 익절 / 관망 등)

#### P-19. compositeLabel 과 marketPhase 의 관계 불명확
- **현재**: compositeLabel (F&G 분류) 과 marketPhase (시장 단계) 가 별도로 표기 → 사용자 혼란
- **개선**: compositeLabel 은 sentiment 카드에만 표기, marketPhase 는 별도 phase 카드 — 명확한 분리

---

## 3. 개선안 (4 Phase)

### Phase A — 즉시 수정 (이번 PR)

목적: 수학적 결함 + 임계값 calibration. 핵심 재산이라 불릴 만한 부분.

| 변경 | 파일 |
|---|---|
| Composite 가중치 재분배 (F&G 25% / 시총 15% / OI 25% / Funding 15% / L/S 15% / 보정 5%) | `sentiment-score.ts` |
| Confidence 공식 symmetric 화 — `\|bull-bear\|/4 × 100 × \|score-50\|/50` | `wave-matrix.ts` |
| Tie 처리 — 2:2 면 confidence=0 + prediction "신호 미정" | `wave-matrix.ts` |
| OI 임계값 통일 (±3% strong, ±1.5% weak) | `wave-matrix.ts`, `sentiment-score.ts` |
| Funding 임계값 ±0.005% → ±0.01% | `wave-matrix.ts`, `sentiment-score.ts` |
| L/S 임계값 1.1/0.9 → 2.0/1.0 (retail bias 보정) | `wave-matrix.ts`, `sentiment-score.ts` |
| F&G 7일 추세 보정 ±2 → ±5 (gradient) | `sentiment-score.ts` |

### Phase B — 거시 스탠스 신설 (이번 PR 핵심)

| 변경 | 파일 |
|---|---|
| 새 모듈 `macro-stance.ts` 추가: `MacroStance = "RISK_ON" \| "NEUTRAL_BULL" \| "NEUTRAL_BEAR" \| "RISK_OFF" \| "DEFENSIVE"` | `src/sentiment/macro-stance.ts` (신규) |
| 분류 입력: composite score, marketPhase, overallBias, confidence, BTC 변동성(추후), F&G | `macro-stance.ts` |
| `WaveMatrixState.macroStance` 필드 추가 | `types.ts` |
| `computeWaveTrackerData` 가 macroStance 도 반환 | `index.ts` |
| 프론트엔드 `WaveMatrixCard` 최상단에 macro stance badge | `WaveMatrixCard.tsx` |

### Phase C — Multi-period (다음 PR)

| 변경 | 파일 |
|---|---|
| OI 7일 변화율 추가 (`bybit-derivatives.ts` intervalTime=1d&limit=7) | `bybit-derivatives.ts` |
| Funding 7일 평균 + slope 추가 (`limit=21` = 8h × 21 = 7d) | `bybit-derivatives.ts` |
| `WaveMatrixState.oiChange7d`, `fundingTrend7d` 필드 | `types.ts` |
| 프론트엔드 multi-period 비교 차트 | `WaveMatrixCard.tsx` |

### Phase D — UI 개선 (다음 PR)

| 변경 | 파일 |
|---|---|
| Stale data 라벨 (`LIVE` / `STALE` / `FALLBACK`) | `WaveMatrixCard.tsx` |
| Reasons dynamic filtering (medium+ 만) | `sentiment-score.ts` |
| Prediction 9~12종 + 권장 액션 | `wave-matrix.ts` |

---

## 4. 거시 스탠스 (Macro Stance) — 신설 차원 명세

사용자 요청: "이후의 하락이나 상승 파동을 예측해주고 거시적인 스탠스를
알려주는 지표". 이 부분이 현재 시스템의 **가장 큰 누락**.

### 4.1 분류 (5 단계)

| Stance | 조건 | 의미 | 권장 액션 |
|---|---|---|---|
| **RISK_ON** | composite ≥ 65 + bias=bullish + confidence ≥ 60 + phase ∈ {HEATING} | 위험자산 적극 노출 가능 | 신규 진입 OK, 추세 추종 |
| **NEUTRAL_BULL** | composite 55~65 + bias=bullish | 약한 상승 편향 | 분할 매수, 신중 진입 |
| **NEUTRAL** | tie 또는 confidence < 40 | 방향성 불명확 | 관망 우선 |
| **NEUTRAL_BEAR** | composite 35~45 + bias=bearish | 약한 하락 편향 | 포지션 축소, 헷지 |
| **RISK_OFF** | composite ≤ 35 + bias=bearish + confidence ≥ 60 | 위험자산 회피 | 현금 보유, 역추세 진입 자제 |
| **DEFENSIVE** | composite ≤ 25 + bias=bearish + confidence ≥ 75 + phase=PANIC | 패닉 진행 중 | 매수 자제, 바닥 신호 대기 |

### 4.2 분류 알고리즘 (의사코드)

```typescript
function deriveMacroStance(
  compositeScore: number,
  bias: Signal,
  confidence: number,
  phase: MarketPhase,
): MacroStance {
  // 패닉 우선
  if (phase === "PANIC" && compositeScore <= 25 && bias === "bearish" && confidence >= 75) {
    return "DEFENSIVE";
  }
  // 강한 신호 우선
  if (bias === "bullish" && confidence >= 60) {
    if (compositeScore >= 65) return "RISK_ON";
    if (compositeScore >= 55) return "NEUTRAL_BULL";
  }
  if (bias === "bearish" && confidence >= 60) {
    if (compositeScore <= 35) return "RISK_OFF";
    if (compositeScore <= 45) return "NEUTRAL_BEAR";
  }
  // 약한 신호
  if (bias === "bullish") return "NEUTRAL_BULL";
  if (bias === "bearish") return "NEUTRAL_BEAR";
  return "NEUTRAL";
}
```

### 4.3 시각 표기

```
┌─────────────────────────────────────────┐
│  🟢 MACRO STANCE: RISK_ON               │
│  강한 상승 편향 — 신규 진입 가능        │
│  Confidence 78% · Composite 71/100      │
└─────────────────────────────────────────┘
```

---

## 5. 우선순위 및 영향도

| Phase | 항목 | Impact | Effort | Priority |
|---|---|---|---|---|
| A | Confidence symmetric | 🔴 High (역방향 사용성) | XS (15분) | P0 |
| A | OI/Funding/L/S 임계값 calibration | 🔴 High (노이즈 제거) | S (30분) | P0 |
| A | Composite 가중치 재배분 | 🟡 Med | S | P1 |
| B | Macro Stance 신설 | 🔴 High (사용자 명시 요청) | M (1h) | P0 |
| C | Multi-period | 🟡 Med | L (2~3h) | P1 |
| D | UI polish | 🟢 Low | M | P2 |

이번 PR 에서 **Phase A + B 전부, Phase D 일부** 진행. Phase C 는 다음 PR.

---

## 6. 후속 검증 방법

1. 백엔드 단위 테스트: `src/sentiment/__tests__/sentiment-score.test.ts`,
   `wave-matrix.test.ts`, `macro-stance.test.ts` 추가
2. 프론트 시각 확인: Claude Preview 로 `/wave-tracker/sentiment` 페이지에서:
   - macro stance 배지 색상이 시장 상태 반영
   - confidence 가 strong bear 일 때도 100% 까지 가능
   - tie 시 "신호 미정" 표시
3. 백테스트 회귀: macro stance = RISK_ON 시점의 BBDX 진입 win rate 가
   RISK_OFF 시점보다 유의미하게 높아야 (Wilson 95% CI)

---

## 7. 변경 영향 범위

- 백엔드 영향 파일 (5개): `sentiment-score.ts`, `wave-matrix.ts`, `types.ts`,
  `index.ts`, 신규 `macro-stance.ts`
- 프론트엔드 영향 파일 (1개): `WaveMatrixCard.tsx`
- 호환성: `WaveMatrixState` 에 `macroStance` 필드만 *추가* — 기존 필드 변경 없음
  (tRPC client 자동 동기화 OK)
- 백테스트: 영향 없음 (sentiment 모듈은 backtest 파이프라인에 미연결)
- Scanner: 영향 없음 (sentiment 모듈은 scanner.ts 에서 호출하지 않음)
