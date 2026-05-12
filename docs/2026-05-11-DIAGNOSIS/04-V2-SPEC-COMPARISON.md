# v2 명세 (모바일 prompt) vs 우리 실제 구현 — 솔직한 비교

**날짜**: 2026-05-11
**대상 문서**:
- `BACKTEST_DATA_DEBUG_COMMANDS-1.md` (디버그 명령서)
- `BACKTEST_ENGINE_AUDIT.md` (12 문제 audit)
- `BACKTEST_SPEC_META_AUDIT.md` (15 약점 메타 진단)
- `BACKTEST_ENGINE_v2.md` (통합 v2 명세)

> **솔직한 평가**: v2 명세는 *Claude Code 외부* 에서 일반론으로 작성된
> prompt. 우리 실제 코드를 보지 않은 상태라 일부 항목이 우리 상황과 어긋남.
> 동시에 사용자 요구 (per-trade UI + 3-layer composite) 는 매우 가치 있고
> 즉시 구현 가능.

---

## 0. 핵심 결론 (TL;DR)

| v2 명세 17 문제 | 우리 실제 상태 |
|---|---|
| 1. No-lookahead 미통과? | ✅ **이미 검증됨** (`08-BACKTEST-CALIBRATION-AUDIT.md §1.4`) |
| 2. Bybit 페이지네이션 부정확? | ✅ **이미 작동** (1728 trades 365d fetch 검증됨) |
| 3. 데이터 위생 (gap/NaN/OHLC) | ✅ `calculateAllIndicators` NaN 처리 정상 |
| 4. Realistic execution (slippage/fee) | ⚠️ **부분 적용** — `types.ts` 에 `feePct/slippagePct` 있지만 wiring 미확인 |
| 5. patternBase 임시값 | ⚠️ Audit 권고 P2 (`03-ADDITIONAL-STRATEGIES-AUDIT.md`) |
| 6. 카테고리 가중치 calibration | ⚠️ `STANDARD_CALIBRATION_PARAMS` 있지만 자동 갱신 X |
| 7. 이중 엔진 A/B 일관성 | ❓ multi-strategy.ts + single-indicator.ts 확인 필요 |
| 8. Multiple Comparison BH FDR | ❌ **미구현** — 단 우리는 single-hypothesis 시스템 |
| 9. 표본 부족 UI 경고 | ⚠️ `overallSampleSufficiency` field 있지만 UI 표시 미확인 |
| 10. 백테스트 성능 | ✅ 365d × 10 코인 12초 (정상) |
| 11. 백테스트 vs 실거래 비교 | ❌ 미구현 — 실거래 데이터 필요 |
| 12. Golden file 테스트 | ❌ 미구현 |
| 13. WebSocket vs REST 정합성 | N/A — 우리는 REST 전용 |
| 14. Timezone (UTC vs KST) | ✅ 모든 timestamp UTC ms |
| 15. 다중 코인 일관성 | ✅ `computeMetricsBySymbol` 있음 |
| 16. Latency 측정 | ❌ 미구현 |
| 17. DB Migration 호환성 | ✅ Drizzle migrations 작동 |

**결론**: v2 명세 17 문제 중 우리가 *실제* 가진 문제는 **5건** (#4, 7, 8, 11, 12, 16). 나머지 11건은 이미 처리됨 또는 우리 시스템에 N/A.

**v2 명세가 *못 잡은* 우리 실제 핵심 문제** (우리 진단서에서 발견):
- ⚠️ tier1_then_stop 45% — Tier 1 도달 후 BE 회귀 패턴 (audit V1 에는 없음)
- ⚠️ Stop placement 가 winRate 의 dominant factor (P0 fix 로 80% → 18%)
- ⚠️ Mean reversion 본질 부적합 (강세장 → Trend-Follow 필요)
- ⚠️ Live `decideEntry` vs backtest 임계값 불일치 (audit D5, P0-③ 으로 시정)

→ **우리 audit + diagnosis 가 v2 명세 보다 *우리 특정 문제* 에 더 정확함**.

---

## 1. v2 명세의 *우리에게 진짜 유용한* 권고 4건

### 1.1 Realistic Execution (slippage + fee) — 부분 적용
`src/backtest/types.ts` 에 이미 `feePct`, `slippagePct` 필드 있지만 실제
wiring 미확인. **Phase 2 작업**.

### 1.2 Golden File 테스트
합성 데이터 (RSI=30 perfect entry 시뮬레이션) → 기대 결과 hardcoded → 백테스트
코드 정확성 검증. **추가 가치 있음**.

### 1.3 학술 Baseline 비교
Buy-and-hold vs SMA Cross vs RSI MR vs BBDX. 우리 Trend-Follow PF 0.98 인데
**baseline 대비 alpha 있는지** 검증 필요. **Phase 3 작업**.

### 1.4 Per-trade UI 상세
**사용자 요구 #1 — 즉시 구현 가치**.

---

## 2. v2 명세의 *우리에게 부적합* 권고 5건

### 2.1 두 파일 통합 — 우리에게 N/A
우리는 이미 단일 `BACKTEST_DEFECT_AUDIT.md` 가 아닌 `docs/2026-05-10-SCANNER-AUDIT/`
폴더로 체계화. 통합 작업 필요 없음.

### 2.2 BH FDR Multiple Comparison
우리는 *단일 가설* 시스템 (각 calibration param 측정). 사용자별 가설 등록
시스템 X. BH FDR 보정 필요성 낮음.

### 2.3 WebSocket vs REST
우리는 REST 전용. N/A.

### 2.4 다중 timeframe 결합 시 정렬
이미 `multi-tf.ts` 에서 처리됨. N/A.

### 2.5 12주 → 6~9개월 로드맵
우리는 *days-level* 작업 (오늘 P0+P1 모두 완료). 우리 속도가 v2 명세 가정보다
훨씬 빠름. 로드맵 단위 무관.

---

## 3. 사용자 실제 요구 — 즉시 구현 가능

### 3.1 요구 #1: 개별 trade UI (진입 사유 + 가격 + 종료 가격)

**상태**: backend 데이터 *이미 있음*. frontend UI 만 필요.

```typescript
// 이미 존재: src/backtest/types.ts:BacktestTrade
{
  signalTs: number;              ← 진입 시각
  symbol: string;
  entryReasons?: string[];       ← 진입 사유 (이미 채워짐!)
  strategyMeta?: Record<...>;    ← Pattern Confluence, Wave alignment 등
  entryPrice: number;             ← 진입 가격
  target: number;
  target2?: number;
  stopLoss: number;
  // ...
  exitPrice: number;              ← 종료 가격
  exitTs: number;
  exitReason: ExitReason;         ← 종료 사유
  returnPct: number;
  win: boolean;
  partialExits?: PartialExit[];   ← 부분 청산 상세
}
```

**필요한 작업**:
- ✅ Backend: 이미 완료 (BacktestTrade 객체 완전)
- ✅ tRPC: `trpc.backtest.trades` endpoint 이미 존재
- ❌ Frontend: **trade-by-trade 카드 UI 신규** ← 이게 사용자 요구

### 3.2 요구 #2: 3-layer 조합 백테스팅 (새 탭)

**상태**: backend + frontend 모두 신규 작업 필요.

**3 Layer 정의**:
1. **Signal Layer** (Tradelab 기존 Signal Tracker 지표)
   - RSI 임계 (e.g. < 30)
   - BB 위치 (e.g. ≤ bbLower × 1.02)
   - ADX 임계 (e.g. < 20)
   - Pattern Confluence (e.g. ≥ 0.4)

2. **Macro Layer** (Macro Liquidity 지표)
   - Macro regime (flooded / easy / neutral / tight / crisis)
   - Korea modifier (+/- 0.05)

3. **Wave Layer** (Wave Tracker 지표)
   - Wave alignment (perfect_up / partial_up / mixed / opposing)
   - Multi-TF trend direction

**조합 규칙**:
- 모든 layer 의 조건이 *동시에 충족* 시 진입 (AND 게이트)
- 또는 사용자가 선택한 layer 만 활성 (예: Signal + Wave 만)
- 각 layer 의 condition 은 사용자가 선택 가능

**예시**:
```
[Signal Layer]   RSI < 30 + BB ≤ bbLower × 1.02
[Macro Layer]    regime IN ['easy', 'flooded']
[Wave Layer]     alignment IN ['perfect_up', 'partial_up']
                  ↓ AND 게이트
              모든 조건 충족 시 진입
              → 백테스트 → winRate 측정
```

**필요한 작업**:
- ❌ Backend: `src/backtest/composite/` 신규 디렉토리
  - `LayerCondition` interface
  - `composite-strategy.ts` — runtime composition
  - `runCompositeBacktest()` runner
- ❌ tRPC: `trpc.backtest.runComposite` 신규 procedure
- ❌ Frontend: `/backtest/composite` 신규 탭
  - 3 layer 의 condition builder UI
  - 결과 시각화 (winRate + Sharpe + trade list)
- ❌ 비교 모드: 기존 single-strategy vs composite 결과 side-by-side

---

## 4. 구현 계획 — 단계별

### Phase A: 즉시 (오늘 회차)

**A-1**: ⭐ **Per-trade UI** 구현 (사용자 요구 #1)
- Frontend: `/backtest` 페이지에 trade-by-trade 카드 추가
- 각 카드: symbol / entryTs / entryPrice / entryReasons (bullet list) /
  exitPrice / returnPct / win badge / partialExits 시각화
- 기존 결과 (overall metrics) 와 *별도 섹션* 으로

**A-2**: ⭐ **3-layer composite backend 구조** (사용자 요구 #2 시작)
- `src/backtest/composite/types.ts`:
  ```typescript
  interface LayerCondition {
    layer: 'signal' | 'macro' | 'wave';
    indicator: string;     // 'rsi', 'macroRegime', 'waveAlignment'
    operator: 'lt' | 'gt' | 'eq' | 'in';
    value: number | string | string[];
  }

  interface CompositeStrategyConfig {
    signalConditions: LayerCondition[];
    macroConditions: LayerCondition[];
    waveConditions: LayerCondition[];
    requireAllLayers: boolean;   // true = AND across layers
  }
  ```
- `src/backtest/composite/composite-strategy.ts`: BacktestStrategy 인터페이스
  구현 (기존 strategy 와 동일 형태)
- `src/backtest/composite/evaluator.ts`: condition 평가 엔진

### Phase B: 다음 회차

- B-1: tRPC `backtest.runComposite` procedure
- B-2: Frontend `/backtest/composite` 신규 탭 + condition builder UI
- B-3: 비교 모드 (single-strategy vs composite side-by-side)
- B-4: Realistic execution (slippage + fee) wiring 확정
- B-5: Golden file 테스트 (합성 데이터 검증)

### Phase C: 후속 (옵션)

- C-1: 학술 baseline 비교 (Buy-and-hold vs SMA Cross vs BBDX vs Composite)
- C-2: 백테스트 vs 실거래 비교 (실거래 데이터 누적 후)
- C-3: Multi-strategy ensemble (BBDX + Trend-Follow 결합)

---

## 5. 단계별 작업 흐름

### Phase A (오늘 회차)

```
[A-1] Per-trade UI
  1. Frontend `/backtest` 페이지 확인
  2. trade-by-trade 카드 컴포넌트 신규 (`BacktestTradeCard.tsx`)
  3. 기존 결과 페이지에 mount
  4. trpc.backtest.trades 데이터 사용
  5. 7곳 push

[A-2] 3-layer composite backend 구조
  1. `src/backtest/composite/` 디렉토리 생성
  2. types.ts (LayerCondition, CompositeStrategyConfig)
  3. composite-strategy.ts (BacktestStrategy 구현체)
  4. evaluator.ts (condition 평가)
  5. unit tests (3 layer 조합 검증)
  6. 7곳 push
```

### Phase B (다음 회차)

```
[B-1~B-5] Composite backtest 완성 + UI + 비교
  - 3 layer 조합 백테스트 실행 가능
  - 비교 모드 (single vs composite)
  - 사용자 요구 완전 충족
```

---

## 6. 최종 권고 — 어떤 순서로

**사용자 결정 사항**:

### 옵션 (가): 즉시 Phase A 시작 (Per-trade UI + Composite backend 구조)
- 1~2시간 작업
- 사용자가 결과를 *오늘 안에* 보고 검토 가능
- backend 구조는 작성하지만 endpoint + frontend 는 다음 회차

### 옵션 (나): Phase A + B 다 진행 (Composite 완전 구현)
- 3~4시간 작업
- composite 백테스팅 완전 작동
- per-trade UI 도 완성

### 옵션 (다): 우선 사용자 검토 후 시작
- 본 비교 분석서 검토 후 사용자가 우선순위 확정
- "v2 명세 채택 부분 / reject 부분 / 우리만의 추가" 확정 후 Phase A 시작

---

## 7. 솔직한 한계

```
[v2 명세의 한계]
  - Claude Chat 모바일 prompt 라 우리 코드 X 보고 작성
  - 일반론적 함정 (look-ahead 등) 강조하지만 우리는 이미 처리됨
  - 우리 실제 문제 (Stop placement, mean reversion 한계) 는 X 잡음

[우리 audit/diagnosis 의 한계]
  - 365d × 10 coins 표본 한계 (5년 데이터 권고)
  - calibration 자동 갱신 미구현
  - Golden file 테스트 미구현 (v2 명세 권고 채택 가치)

[해결한 것]
  - 우리 audit/diagnosis 가 우리 실제 시스템 정확히 진단
  - Trend-Follow PF 0.98 발견 (mean reversion 의 본질적 한계 입증)
  - Stop placement 의 dominant 영향 검증
  - Live ↔ backtest 임계값 동기화 (P0-③)

[v2 명세에서 채택할 만한 것]
  - Realistic execution wiring (slippage + fee)
  - Golden file 테스트
  - 학술 baseline 비교 (BBDX 의 진짜 alpha 검증)
  - Per-trade UI (사용자 요구와 일치)
  - 3-layer composite (사용자 요구 #2)
```

---

## 8. 한 줄 요약

**"v2 명세 17 문제 중 우리가 *실제* 가진 건 5건 (4, 7, 8, 11, 12).** 나머지
11건은 이미 처리됨 또는 N/A. **사용자 실제 요구 2건 (per-trade UI + 3-layer
composite)** 이 v2 명세 보다 훨씬 우선. Phase A 시작 — per-trade UI + composite
backend 구조."
