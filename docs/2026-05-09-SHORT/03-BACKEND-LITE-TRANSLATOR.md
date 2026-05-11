# SHORT 듀얼 시스템 — Lite translator 확장

**날짜**: 2026-05-09
**파일**: `tradelab-backend/src/lite/types.ts`, `tradelab-backend/src/lite/translator.ts`
**커밋**: `07b6a47`

## 목적

Lite UI 의 `Recommendation` 라벨에 SHORT 시그널을 표면화. 일반인 친화 라벨로
"공매도 추천" / "강한 공매도" 표시.

헌장 규칙 3 준수: translator 는 BBDX SHORT path 결과의 *번역*만. 새 시그널
산출 X.

## 변경 사항

### 1. `lite/types.ts` — Recommendation enum 확장

```typescript
export type Recommendation =
  | "STRONG_BUY"
  | "BUY"
  | "WATCH"        // 진입 path 약함, 관찰
  | "HOLD"         // 진입/청산 시그널 없음
  | "SELL"         // LONG 청산 (기존 보유자 익절/손절)
  | "STRONG_SELL"  // LONG 청산 4/4 또는 강한 reversal
  | "SHORT"        // ★ 신규: SHORT 진입 (기본 강도)
  | "STRONG_SHORT" // ★ 신규: SHORT 진입 (finalStrength ≥ 80)
  | "BLOCKED";     // 자본 보호 차단
```

### 2. `RECOMMENDATION_LABEL` 매핑

| 값 | 한국어 라벨 | tone |
|---|---|---|
| `STRONG_BUY` | 강한 매수 추천 | good |
| `BUY` | 매수 추천 | good |
| `WATCH` | 관찰 | caution |
| `HOLD` | 지금은 추천 없음 | muted |
| `SELL` | 매도 고려 | caution |
| `STRONG_SELL` | 강한 매도 | bad |
| **`SHORT`** | **공매도 추천** | **caution** |
| **`STRONG_SHORT`** | **강한 공매도** | **bad** |
| `BLOCKED` | 지금은 추천 없음 | muted |

### 3. `lite/translator.ts` — `deriveRecommendation` 확장

```typescript
export function deriveRecommendation(
  adjusted: OnchainAdjustedEntry | null,           // LONG onchain-adjusted
  entry: EntryDecision | null,                      // LONG path
  exit: ExitDecision | null,                        // LONG 청산
  shortAdjusted: OnchainAdjustedEntry | null = null,// SHORT onchain-adjusted
  shortEntry: { path: string } | null = null        // SHORT path
): Recommendation {
  // 1. 자본 보호 우선 (LONG)
  if (adjusted?.blocked) return "BLOCKED";

  // 2. LONG 청산 (기존 보유자 우선)
  if (exit) {
    if (exit.conditionsMet >= 4) return "STRONG_SELL";
    if (exit.conditionsMet >= 3) return "SELL";
  }

  // 3. LONG 진입
  if (adjusted && entry) {
    const s = adjusted.finalStrength;
    if (s >= 80) return "STRONG_BUY";
    if (s >= 60) return "BUY";
    if (s >= 40) return "WATCH";
  }

  // 4. SHORT 자본 보호
  if (shortAdjusted?.blocked) return "BLOCKED";

  // 5. SHORT 진입
  if (shortAdjusted && shortEntry) {
    const s = shortAdjusted.finalStrength;
    if (s >= 80) return "STRONG_SHORT";
    if (s >= 60) return "SHORT";
  }

  return "HOLD";
}
```

### 우선순위 설계

```
BLOCKED (LONG 차단) >
STRONG_SELL / SELL (보유자 청산) >
STRONG_BUY / BUY / WATCH (LONG 진입) >
BLOCKED (SHORT 차단) >
STRONG_SHORT / SHORT (SHORT 진입) >
HOLD
```

**근거**:
- LONG 보유자 보호 우선 (청산 시그널이 SHORT 진입보다 우선)
- SHORT 는 LONG 신호 없을 때만 노출 — 두 path 동시 trigger 시 BBDX path 가 우세
- 자본 보호 (BLOCKED) 가 모든 진입보다 우선

### 4. `recommendationLabel()` — UI 색상

```typescript
SHORT:        { color: "neon-orange" },  // 🟠 caution
STRONG_SHORT: { color: "neon-red" },     // 🔻 bad (LONG STRONG_SELL 과 같은 색)
```

## 헌장 검증

- ✓ **규칙 3** — translator 는 새 *수치* 산출 X. 입력 (`adjusted` /
  `shortAdjusted` / `entry` / `shortEntry` / `exit`) 가 모두 null 이면 `HOLD`
  (라벨 X).
- ✓ **단독 시그널 X** — SHORT 라벨은 `shortAdjusted` (= BBDX SHORT path
  결과 + onchain multiplier) 가 있을 때만 노출. 온체인만으로 SHORT 안 나옴.
- ✓ **자본 보호** — `shortAdjusted.blocked = true` 면 BLOCKED 우선.

## 단위 테스트 권고 (선택)

```typescript
// translator.test.ts 추가 시나리오
test("SHORT path 가 LONG 보다 후순위", () => {
  // LONG entry + SHORT entry 동시 trigger → BUY 만
});
test("LONG path 없을 때 SHORT 가 노출", () => {
  // entry=null, shortAdjusted.finalStrength=85 → STRONG_SHORT
});
test("strong_accumulation + 평균회귀 SHORT → BLOCKED", () => {
  // shortAdjusted.blocked=true → BLOCKED
});
```

## 다음 단계

- [ ] `lite.coin` procedure 가 `applyOnchainShortToEntry` 호출하고 결과를
  `deriveRecommendation` 의 4번째 인자로 전달하는지 routers.ts 검증
- [ ] `translator.test.ts` 에 SHORT 시나리오 3 케이스 추가
