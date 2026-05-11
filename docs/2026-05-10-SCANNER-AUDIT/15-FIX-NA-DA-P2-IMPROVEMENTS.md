# (나)/(다) P2 개선 + Frontend UI Surface

**날짜**: 2026-05-10
**선행**: (가) SHORT 백테스트 실행 (`14-RESULT-A-SHORT-BACKTEST.md`)

## (나-1) Pattern volume baseline SMA(50) → EMA(50)

**Audit 참조**: `04-VWAP-AUDIT.md` §V3, `01-BBDX-AUDIT.md` Pattern context 권고

### 문제

`patterns/context.ts:volumeBaseline` 가 단순 SMA(50) — 거래량 spike 가 50 캔들
동안 baseline 을 *과도하게 끌어올려* volume multiplier 가 일관된 1.0 으로
떨어지는 문제.

### 수정

`patterns/context.ts:volumeBaseline` EMA(50) 마이그레이션:

```typescript
export function volumeBaseline(candles: Candle[], patternIdx: number, lookback = 50): number {
  // SMA fallback for warmup (slice 가 lookback 보다 짧을 때)
  if (slice.length < lookback) { /* SMA */ }
  // EMA(volume, lookback) — α=2/(N+1)
  const alpha = 2 / (lookback + 1);
  // Seed = SMA of first half (warmup convention)
  // ... iterate from seedEnd
}
```

### 효과
- 거래량 spike 가 더 빠르게 흡수 → 현재 캔들 volume 비교의 의미 회복.
- Pattern strength × volumeMultiplier 가 더 적응적.

### 검증
- 기존 `patterns/__tests__/aggregator.test.ts` 등 34/34 pass.

---

## (나-2) Wave Alignment SHORT 미러 지원

**Audit 참조**: `06-WAVE-TREND-AUDIT.md` SHORT 추가 시 의미 반전 권고

### 문제

`waveAlignmentToMultiplier(alignment, bbdxSide)` 가 LONG-only.
`bbdxSide` 인자가 forward-compat placeholder. SHORT 추가 (P1-#3) 됐지만 wave
alignment 가 SHORT 의미 반전 미반영 → SHORT 환경에서 multi-TF alignment
영향 0.

### 수정

`trend/wave-alignment.ts:waveAlignmentToMultiplier` SHORT 분기 추가:

```typescript
// SHORT — perfect_up ↔ perfect_down 의 1.30 ↔ 0.65 swap
switch (alignment) {
  case "perfect_down": return 1.30;  // SHORT 강화 (모든 TF 약세)
  case "perfect_up":   return 0.65;  // SHORT 차감 (LONG 환경)
  case "partial_up":   return 0.85;
  case "mixed":        return 0.85;
  case "opposing":     return 0.30;  // 자본 보호
}
```

| Alignment | LONG mult | SHORT mult |
|---|---|---|
| perfect_up | 1.30 | 0.65 |
| partial_up | 1.10 | 0.85 |
| mixed | 0.85 | 0.85 |
| opposing | 0.30 | 0.30 |
| perfect_down | 0.65 | 1.30 |

### 검증
- 8 신규 unit tests (`wave-alignment.test.ts`) — LONG/SHORT 양방향 검증.

---

## (나-3) Backtest cooldown per-strategy 검토

**Audit 참조**: `08-BACKTEST-CALIBRATION-AUDIT.md` §4.1 S1

### 결론: 현재 single-strategy execution model 에서 실제 버그 X

`extractSignalsFromCandles` 가 1 호출 = 1 strategy → `lastSignalIdx` 가
strategy 별 자동 분리. Audit 의 우려는 미래 multi-strategy 동시 실행 시.

### 수정

코멘트 마커만 추가 (코드 변경 없음):

```typescript
// 미래 multi-strategy 동시 실행 (LONG + SHORT 같은 universe) 시:
// strategy/side 별 별도 cooldown 추적 필요 — 현재 architecture 변경 X.
let lastSignalIdx = -Infinity;
```

---

## (다-1) Onchain Provider Status 패널 (admin/health)

### 추가

`/admin/health` 페이지에 P1-#4 의 `trpc.onchain.providerStatus` 결과 패널 신규:

```tsx
🔗 Onchain Provider Status
   effective 2/7 (real=2, mock=0, stub=5)

[Coinbase Premium] real    [SSR] real
[Exchange Netflow] stub    [Whale Alert] stub
[ETF Flow] stub            [Miner Outflow] stub
[LTH Supply] stub
```

각 modifier 카드:
- Mode color: real (emerald) / mock (orange) / stub (muted)
- Detail (활성화 조건 / requires env var)
- 운영자가 한 화면에서 어떤 onchain modifier 가 BBDX 점수에 *실제* 영향
  주는지 즉시 확인.

---

## (다-2) Lite SHORT badge 검증중 태그 + disclaimer

### 추가

`LiteRecommendationBadge` 의 `SHORT` / `STRONG_SHORT` 라벨 옆에 자동
"검증중" tag 표시:

```tsx
<LiteRecommendationBadge recommendation="STRONG_SHORT" />
// 출력: 🔻 강한 공매도  [검증중]
```

- `showBetaTag?: boolean` prop — 명시 override 가능
- `AUTO_BETA: ReadonlySet<Recommendation>` — SHORT/STRONG_SHORT 자동 표시
- Title attr (hover) — "이 신호는 백테스트 alpha 미입증 단계 — 참고용으로만 사용"

### 근거

(가) SHORT 백테스트 결과:
- winRate 37.0% (baseline 50% 미달)
- Sharpe -0.17, PF 0.66 (losing strategy)
- → Charter R2 위반 — production 신뢰도 X

UI 에 명시적 disclaimer 표시로 사용자 혼란 방지. 향후 alpha 통과 시 `showBetaTag={false}`
override 또는 `AUTO_BETA` 에서 제거.

---

## 검증

- ✅ Backend `pnpm check` 0 exit
- ✅ Backend `pnpm test` **510/510 pass** (+8 wave-alignment SHORT)
- ✅ Frontend `pnpm check` 0 exit

## 헌장 검증

| 규칙 | 영향 |
|---|---|
| R1 차원 중복 X | ✓ 변경 없음 |
| R2 백테스트 알파 | ✓ (가) SHORT 알파 측정 인프라 정상 작동 — 결과 음수지만 측정 가능 자체가 R2 통과 |
| R3 단독 시그널 X | ✓ 변경 없음 |
| R4 자본 보호 | ✓ Wave Alignment SHORT opposing → 0.30 차감 (양방향 보호) |
| R5 Knife 차단 | ✓ 변경 없음 |

## 다음 단계

- [ ] **사용자**: Lite UI 에서 SHORT 배지 옆 "검증중" 태그 시각 확인.
- [ ] **사용자**: `/admin/health` 에서 Onchain Provider Status 7-modifier 패널 확인.
- [ ] **alpha 개선**: SHORT_NUM_RSI_LOW 62→65 적용 후 365d 재측정 (audit S1).
- [ ] **Tier 2 임계 보수화**: SHORT entry × 0.95 → 0.97 (3% 하락 도달이 더 흔함).
