# Wave Tracker — Sentiment & Matrix v4.3 (Phase C + D)

> v4.2 Audit (`WAVE_SENTIMENT_AUDIT.md`) 의 후속 PR. Phase A/B (수학 수정 +
> Macro Stance) 는 v4.2 에서 완료. 본 문서는 **Phase C (Multi-period 차원
> 추가)** 와 **Phase D (UX/데이터 무결성)** 의 상세 명세 + 구현 계획.
>
> **작성일**: 2026-05-10
> **베이스 커밋**: `tradelab-backend@dev` 5e3d7a7 (v4.2)
> **대상 브랜치**: `tradelab-backend@dev`, `tradelab-frontend@dev`

---

## 0. 요약

| Phase | 항목 | 영향 | Effort |
|---|---|---|---|
| C-1 | OI 7일 변화율 추가 | 24h 노이즈 vs 7일 추세 분리 | M |
| C-2 | Funding 7일 평균 + slope 추가 | 펀딩 단발 스파이크 vs 누적 과열 분리 | M |
| C-3 | OI 24h vs 7d divergence 신호 | 단기/장기 괴리 → 추세 전환 신호 | S |
| D-1 | Source Health metadata | 4개 API 별 LIVE/STALE/FALLBACK 추적 | M |
| D-2 | Reasons dynamic filtering | 강도 ≥ medium 만 reasons 출력 | S |
| D-3 | Prediction 9~12종 + 권장 액션 | 시장 단계 × bias × 신뢰도 조합별 메시지 | M |
| D-4 | Frontend 시각화 | stale 라벨 + multi-period 차트 + prediction 카드 | M |

전체 effort: ~3~4시간. v4.2 와 호환 유지 (필드 추가만, 기존 변경 X).

---

## 1. Phase C — Multi-period 차원 추가

### 1.1 OI 7일 변화율 (`oiChange7d`)

**현재**: 24h OI 변화 (`oiChangeRate`) 한 시점만 사용.

**문제**: 24h OI +3% 가 "단발 스파이크" 인지 "7일 누적 추세" 인지 구분 불가.
스파이크는 fade out 하지만 추세는 follow through.

**개선**: Bybit `/v5/market/open-interest` 에 `intervalTime=1d&limit=8` 호출
→ 8일치 일봉 OI 가져와서 (latest - 7d ago) / 7d ago × 100% 계산.

**구현**:
```typescript
async function fetchOi7d(symbol: string): Promise<number> {
  const resp = await axios.get(`${BASE}/v5/market/open-interest`, {
    params: { category: "linear", symbol, intervalTime: "1d", limit: 8 },
    timeout: 6000,
  });
  const list = resp.data.result?.list ?? [];
  if (list.length < 2) return 0;
  // 시간 내림차순. [0]=latest, [last]=7d ago.
  const latest = Number(list[0].openInterest);
  const oldest = Number(list[list.length - 1].openInterest);
  if (oldest === 0) return 0;
  return ((latest - oldest) / oldest) * 100;
}
```

**임계값**:
- `oiChange7d > 10%` → 강한 누적 매수 추세 (bull mid-term)
- `oiChange7d < -10%` → 누적 청산 (bear mid-term)
- `|oiChange7d| < 5%` → 횡보

### 1.2 Funding 7일 평균 + slope (`fundingAvg7d`, `fundingTrend7d`)

**현재**: 최근 3개 펀딩 평균 (= 1일치). 추세 정보 없음.

**문제**: 펀딩이 0.025 → 0.015 → 0.005 (감소 추세) 인데 평균 0.015 만 보면
"상승 가속" 으로 오판.

**개선**: `funding/history` `limit=21` (8h × 21 = 7일) → 7일 평균 + 일별
slope (linear regression) 계산.

**구현**:
```typescript
async function fetchFunding7d(symbol: string): Promise<{
  avg7d: number;
  trend7d: "rising" | "falling" | "flat";
  slope7d: number; // % per day
}> {
  const resp = await axios.get(`${BASE}/v5/market/funding/history`, {
    params: { category: "linear", symbol, limit: 21 },
    timeout: 6000,
  });
  const list = resp.data.result?.list ?? [];
  if (list.length === 0) return { avg7d: 0, trend7d: "flat", slope7d: 0 };

  // 시간 내림차순. 평균은 단순.
  const rates = list.map((x) => Number(x.fundingRate) * 100); // %
  const avg7d = rates.reduce((s, r) => s + r, 0) / rates.length;

  // Linear regression slope (시간을 X 로, 펀딩을 Y 로). 펀딩 간격 8h.
  // X=0 (가장 옛날) → X=N-1 (최신). reverse 후 OLS.
  const xs = rates.map((_, i) => i).reverse();
  const reverseRates = [...rates].reverse();
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = reverseRates.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (reverseRates[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slopePerInterval = den === 0 ? 0 : num / den;
  // 8h 단위 slope → 1일 단위로 환산 (×3, 펀딩 8h × 3 = 1일)
  const slope7d = slopePerInterval * 3;

  let trend7d: "rising" | "falling" | "flat" = "flat";
  if (slope7d > 0.002) trend7d = "rising";
  else if (slope7d < -0.002) trend7d = "falling";

  return { avg7d, trend7d, slope7d };
}
```

**해석**:
- `avg7d > 0.015%` + `trend7d = rising` → 누적 롱 과열 + 가속 (스퀘즈 위험)
- `avg7d < -0.015%` + `trend7d = falling` → 누적 숏 과열 + 가속 (베어 캐피츌레이션 위험)
- `avg7d > 0` + `trend7d = falling` → 롱 과열 해소 중 (mean reversion)

### 1.3 OI 24h vs 7d Divergence 신호

**의미**: 단기와 장기의 괴리는 **추세 전환** 의 강력한 신호.

**케이스**:
1. **Bullish Reversal**: `oiChange7d < -10%` + `oiChangeRate > +3%` → 7일간
   롱 청산 후 신규 롱 유입 시작 (바닥 반등)
2. **Bearish Reversal**: `oiChange7d > +10%` + `oiChangeRate < -3%` → 7일간
   롱 누적 후 청산 시작 (고점 분산)
3. **Bullish Acceleration**: `oiChange7d > +10%` + `oiChangeRate > +3%` →
   누적 매수 + 가속 (강한 상승 진행)
4. **Bearish Acceleration**: `oiChange7d < -10%` + `oiChangeRate < -3%` →
   누적 청산 + 가속 (강한 하락 진행)
5. **Choppy**: 그 외 → divergence 신호 없음

**WaveMatrixState 신규 필드**: `oiDivergence: "BULL_REVERSAL" |
"BEAR_REVERSAL" | "BULL_ACCEL" | "BEAR_ACCEL" | "CHOPPY"`

---

## 2. Phase D — UX / 데이터 무결성

### 2.1 Source Health Metadata

**현재**: 4개 API 중 일부 실패 시 fallback 0 값으로 silently 진행. 사용자가
신뢰할 수 있는 데이터인지 모름.

**개선**: 각 소스별 상태 + lastUpdated 노출.

**신규 타입**:
```typescript
export type SourceStatus = "live" | "stale" | "fallback";

export interface SourceHealth {
  fearGreed: { status: SourceStatus; lastUpdated: number; ageSec: number };
  globalMarket: { status: SourceStatus; lastUpdated: number; ageSec: number };
  bybitDerivatives: { status: SourceStatus; lastUpdated: number; ageSec: number };
  bybitLongShort: { status: SourceStatus; lastUpdated: number; ageSec: number };
  /** 4개 중 OK 인 것 갯수 (4 = perfect, 0 = all fallback). */
  healthScore: number;
}
```

**규칙**:
- `live`: 5분 이내 fetch 성공
- `stale`: fetch 성공했지만 캐시 5분 ~ 30분 사이
- `fallback`: fetch 실패해서 default 값 사용

**`computeWaveTrackerData` 의 반환에 추가**: `{ sentiment, matrix, sourceHealth }`

### 2.2 Reasons Dynamic Filtering

**현재**: 6~7개 reasons 항상 출력 (변화 미미해도).

**개선**: 신호 강도가 medium 이상인 항목만 reasons 에 포함. 단, 최소 3개는
보장 (UI 빈 공간 방지).

**기준 (강도 분류)**:
- `OI`: |oiChange| ≥ 1.5% (medium), ≥ 3% (strong)
- `Funding`: |rate| ≥ 0.005% (medium), ≥ 0.01% (strong)
- `L/S`: ratio ≤ 1.0 또는 ≥ 2.0 (medium 이상)
- `F&G`: |value - 50| ≥ 15 (medium), ≥ 30 (strong)
- `시총`: |change| ≥ 1% (medium), ≥ 3% (strong)
- `BTC dominance`: > 60% 또는 < 45% 만 출력

### 2.3 Prediction 9~12종 + 권장 액션

**현재**: 5종 메시지 (bull-strong / bull / bear-strong / bear / neutral).

**개선**: `(marketPhase × overallBias × confidence)` 조합으로 12종 메시지
+ 각각 권장 액션 분리.

**매트릭스**:

| Phase | Bias | Confidence | 메시지 ID | 한글 |
|---|---|---|---|---|
| HEATING | bullish | ≥70 | `heat_bull_strong` | "강한 상승 가속. 추세 추종 진입 + 분할 익절 준비." |
| HEATING | bullish | <70 | `heat_bull_weak` | "약한 상승 편향. 확정 캔들 대기 + 사이즈 축소." |
| ACCUMULATION | bullish | ≥60 | `accum_bull` | "공포 + OI↑ → 스마트머니 매집 신호. 분할 매수 가능." |
| ACCUMULATION | bearish | ≥60 | `accum_bear` | "공포 + OI↑ but 베어 우세. 가짜 반등 가능. 신중." |
| DISTRIBUTION | bullish | ≥60 | `dist_bull` | "탐욕 + OI↓ but 매수세 잔존. 분산 임박. 익절 타이밍." |
| DISTRIBUTION | bearish | ≥70 | `dist_bear_strong` | "고점 분산 진행. 신규 롱 자제. 짧은 stop 으로 숏 검토." |
| DISTRIBUTION | bearish | <70 | `dist_bear_weak` | "분산 가능성. 보유 포지션 stop 강화." |
| PANIC | bearish | ≥75 | `panic_bear_strong` | "패닉셀 진행. 매수 자제. F&G < 20 + OI 반등 신호 대기." |
| PANIC | bearish | <75 | `panic_bear_weak` | "패닉 진행 중이나 신뢰도 낮음. 관망 우선." |
| PANIC | bullish | any | `panic_bull` | "패닉 + 매수세 — 캐피츌레이션 후 반등 가능. 분할 진입." |
| any | neutral | any | `mixed` | "신호 혼재. 추가 데이터 확인 후 판단." |
| any | tied | any | `tied` | "4-신호 동점. 신호 미정. 관망." |

**구현**:
```typescript
function derivePrediction(
  bias: Signal,
  confidence: number,
  phase: MarketPhase,
  isTie: boolean,
): { id: string; ko: string; en: string; action: string } {
  if (isTie) return PREDICTIONS.tied;
  if (bias === "neutral") return PREDICTIONS.mixed;

  const phaseKey = phase as "HEATING" | "ACCUMULATION" | "DISTRIBUTION" | "PANIC";
  const conf = confidence >= 70 ? "strong" : confidence >= 60 ? "med" : "weak";
  const key = `${phaseKey}_${bias}_${conf}` as const;
  return PREDICTIONS[key] ?? PREDICTIONS.mixed;
}
```

### 2.4 Frontend 시각화 (Phase D)

**Source Health 라벨**: WaveMatrixCard 헤더에 4개 점등 표시:
```
🟢 F&G  🟢 Global  🟡 Bybit OI (stale 8m)  🔴 L/S (fallback)
```

**Multi-period 뱃지** (Phase C 데이터 활용): Wave Matrix 패널 OI Signal 옆에:
```
OI 변화: +3.2%  [24h]    +12.5%  [7d ↑] (BULL ACCEL)
```

**Prediction 카드 확장**: 기존 한 줄 → 2 섹션:
- 상단: 한글 prediction 메시지
- 하단: "권장 액션:" + recommended action (별도 색상)

---

## 3. 구현 순서 (실제 PR)

### Step 1: 백엔드 — Phase C 데이터 fetch 확장
1. `src/sentiment/bybit-derivatives.ts` 수정 — `fetchOi7d`, `fetchFunding7d`
   추가, 결과를 `BybitDerivativesData` 에 합침
2. `src/sentiment/types.ts` 수정 — `BybitDerivativesData` 에 `oiChange7d`,
   `fundingAvg7d`, `fundingTrend7d` 필드 추가

### Step 2: 백엔드 — Phase C OI Divergence 분석
3. `src/sentiment/wave-matrix.ts` 수정 — `deriveOiDivergence(...)` 추가,
   `WaveMatrixState.oiDivergence` 노출
4. `WaveMatrixState` 에 `oiChange7d`, `fundingAvg7d`, `fundingTrend7d` 표면화

### Step 3: 백엔드 — Phase D source health
5. 각 fetch 모듈이 timestamp 반환하도록 변경
6. `src/sentiment/index.ts` 의 `computeWaveTrackerData` 가 sourceHealth
   metadata 까지 묶어서 반환

### Step 4: 백엔드 — Phase D reasons + predictions
7. `src/sentiment/sentiment-score.ts` — reasons dynamic filtering
8. `src/sentiment/wave-matrix.ts` — `derivePrediction` 12종 매핑 + action

### Step 5: 백엔드 — 테스트
9. `src/sentiment/__tests__/multi-period.test.ts` — Phase C 검증
10. `src/sentiment/__tests__/predictions.test.ts` — Phase D 12종 매핑 검증
11. `src/sentiment/__tests__/source-health.test.ts` — fallback 추적 검증

### Step 6: 프론트엔드
12. `src/components/wave/WaveMatrixCard.tsx` — Source Health 인디케이터 +
    multi-period 뱃지 + prediction action 카드

### Step 7: 빌드 + 배포
13. `pnpm check`, `pnpm test`, `pnpm build:types`
14. 백엔드 4 ref 푸시 → 프론트 dep bump → 프론트 4 ref 푸시

---

## 4. 호환성 (v4.2 → v4.3)

- `WaveMatrixState` 에 새 필드만 *추가* (제거 X, 변경 X)
- `BybitDerivativesData` 도 추가 only (기존 4 필드 유지)
- `computeWaveTrackerData` 의 반환 타입에 `sourceHealth` 추가 (optional 처리
  → 구버전 클라이언트는 무시)
- 프론트엔드 구버전 응답 호환 위해 모든 새 필드를 `as any` optional 로 처리

따라서 **구버전 백엔드 + 신버전 프론트** 도 정상 작동 (점진 배포 가능).

---

## 5. 검증 항목

- [ ] OI 7일 변화율이 정상 계산 (Bybit 응답 시간 내림차순 가정)
- [ ] Funding 7일 추세가 강한 일방향 funding 데이터에서 정확히 rising/falling
- [ ] Divergence 5케이스 분류가 audit 명세와 일치
- [ ] Source health: 1개 fallback 시 healthScore=3, 모두 fallback 시 0
- [ ] Reasons: 약한 신호 (|oi|<1.5, |funding|<0.005) 때 해당 항목 reasons 에서 제외
- [ ] Prediction 12종 중 phase × bias × conf 조합이 모두 매칭
- [ ] 프론트엔드: source health 라벨이 4개 모두 색상 정확
- [ ] 프론트엔드: multi-period 뱃지가 OI 7d 데이터 없을 때 graceful 숨김
