# P1-#1 FIX — `combineAdditionalModifiers` 곱셈체인 통합

**날짜**: 2026-05-10
**Audit 참조**: `00-INDEX.md` 우선순위 P1-#1, `03-ADDITIONAL-STRATEGIES-AUDIT.md` §7

## 문제 (Audit 결과)

`tradelab-backend/src/modifiers/index.ts` 의 `combineAdditionalModifiers()` 가
정의는 되어있지만:

1. ❌ **scanner.ts** 가 modifier 결과를 `entryDecision.*Mult` 필드에 *부착만*
   하고 `signalStrength` 산출 시점에 곱하지 않음. → 사용자 화면의 strength
   점수에 영향 0.
2. ❌ **signals/confidence.ts** 의 `computeFinalConfidence` 공식
   `base × confluence × wave × macro × onchain` 에 `additional` term 빠짐.
3. ❌ **SHORT path** 가 modifier 를 부착받지 못함 (LONG only).

결과: EMA Ribbon / MACD Divergence / Order Block / Funding Extreme / Market
Breadth / CVD Divergence 6 modifier 가 *작동은 하지만 final_confidence /
signalStrength 에 영향 0* — 모든 v6.5 알파 가설이 측정 자체가 안 됨.

## 수정 사항

### 1. `signals/confidence.ts` — `additional` multiplier 추가

```typescript
export interface ConfidenceInputs {
  // ... 기존 필드 ...
  /**
   * Additional Strategies multiplier (P1-#1 fix, 2026-05-10).
   * Combined product of EMA Ribbon × MACD × OB × Funding × Breadth × CVD.
   * Pass `combineAdditionalModifiers(decision)` result. omit → 1.0.
   */
  additional?: number;
}

// 공식 변경:
//   final_confidence = base × confluence × wave × macro × onchain × additional
const additional = (Number.isFinite(inputs.additional ?? NaN))
  ? (inputs.additional as number)
  : 1.0;
const raw = base * confluence * wave * macro * onchain * additional;
```

`ConfidenceBreakdown` 에 `additional: number` 필드 추가 (telemetry).

### 2. `scanner.ts` — signalStrength 곱셈체인 통합

```typescript
const baseLongStrength = calculateSignalStrengthV2(price, indicators, volConfirmation);
let finalLongStrength = baseLongStrength;
if (entryDecision) {
  const addMult = combineAdditionalModifiers({
    emaRibbonMult: entryDecision.emaRibbonMult,
    macdDivergenceMult: entryDecision.macdDivergenceMult,
    orderBlockMult: entryDecision.orderBlockMult,
    // marketBreadth/funding/cvd 는 hot path 외부 endpoint
  });
  const waveMult = entryDecision.waveMult ?? 1.0;
  const vwapMult = entryDecision.vwapMult ?? 1.0;
  finalLongStrength = clamp(baseLongStrength * addMult * waveMult * vwapMult, 0, 100);
}

// SHORT 도 동일 체인 (LONG 의 multiplier 부호 반전)
let finalShortStrength = shortSignalStrength;
if (shortDecision && shortSignalStrength > 0) {
  const addMult = combineAdditionalModifiers({
    emaRibbonMult: shortDecision.emaRibbonMult,    // invertMultiplier(LONG)
    macdDivergenceMult: shortDecision.macdDivergenceMult,
    orderBlockMult: shortDecision.orderBlockMult,
  });
  finalShortStrength = clamp(
    shortSignalStrength * addMult * (shortDecision.waveMult ?? 1.0) * (shortDecision.vwapMult ?? 1.0),
    0, 100
  );
}
```

### 3. `scanner.ts` — SHORT modifier 부호 반전

```typescript
function invertMultiplier(longMult: number): number {
  if (!Number.isFinite(longMult)) return 1.0;
  const inverted = 2 - longMult;
  return Math.max(0.30, Math.min(2.0, inverted));
}

// 사용
if (shortDecision) {
  shortDecision.emaRibbonMult = invertMultiplier(ribbon.multiplier);
  shortDecision.macdDivergenceMult = invertMultiplier(macd.multiplier);
  shortDecision.orderBlockMult = invertMultiplier(ob.multiplier);
}
```

**근거**: LONG modifier 가 1.20 (강세 정렬) 일 때 SHORT 는 0.80 (약화) 이
직관과 일치. 부호 반전 함수 `2 - x` 는 1.0 (중립) 을 보존하면서 양/음
multiplier 를 미러.

### 4. `shared/types.ts` — ShortEntryDecision 에 `waveMult` 추가

LONG `EntryDecision.waveMult` 가 SHORT 에는 빠져있어 type error → 추가.

### 5. 단위테스트 5건 신규 추가

`signals/__tests__/confidence.test.ts`:
- `additional 미지정 시 1.0 fallback` (backward compat)
- `additional=1.30 → finalConfidence ↑`
- `additional=0.70 → finalConfidence ↓`
- `additional=NaN → 1.0 fallback`
- `formula 일치 검증`

## 헌장 검증

| 규칙 | 영향 | 검증 |
|---|---|---|
| 1. 차원 중복 X | ✓ | modifier 들은 이미 `rule1Exempt` flag 로 운영 중. 새 차원 X. |
| 2. 백테스트 알파 | ⚠️ | wiring 후에야 알파 *측정 가능*. 측정값은 후속. |
| 3. 단독 시그널 X | ✓ | `entryDecision/shortDecision` 이 있을 때만 multiplier 적용. modifier 단독 trigger X. |
| 4. 자본 보호 | ✓ | regime gates 가 먼저 evaluate (변경 없음). |
| 5. Knife 차단 | ✓ | isFallingKnife/isRisingKnife 게이트 변경 없음. |

## 효과 가설 (백테스트 검증 필요)

- **winRate ↑** — bullish modifier (EMA Ribbon golden cross, MACD bullish
  divergence, OB demand zone) 가 함께 trigger 한 LONG 진입은 false-positive
  감소 기대.
- **Sharpe ↑** — modifier 약세 시 strength ↓ 로 `sizeFactor=reject` 또는
  `small` 로 떨어져 손실 거래 회피.
- **MDD ↓** — Falling Knife 환경에서 EMA Ribbon mult ≤ 0.50 + isFallingKnife
  게이트 결합으로 추세-반대 진입 차단 강화.

## 검증

- ✅ `pnpm check` 0 exit
- ✅ `pnpm build:types` 0 exit
- ✅ `pnpm test` 480/480 pass (5 신규 통과)

## 다음 단계 (P2/P3)

- [ ] backtest CLI 가 LONG/SHORT 별 + modifier ON/OFF 별 winRate 비교 출력
  (Charter Rule 2 알파 검증)
- [ ] `routers.ts` 의 `lite.coin` / `signals.detail` 응답에 `breakdown.additional`
  노출 (UI debugging)
- [ ] Funding Extreme / Market Breadth / CVD 도 scanner hot path 에 통합
  (현재는 외부 endpoint only — 비용 vs 정확도 trade-off)
