# SHORT 듀얼 시스템 — 온체인 multiplier 미러

**날짜**: 2026-05-09
**파일**: `tradelab-backend/src/onchain/bbdx-integration.ts`
**커밋**: `07b6a47`

## 목적

`applyOnchainToEntry` (LONG) 의 부호 반전 미러를 작성. 온체인 7-modifier 의
score 가 SHORT 진입 강도를 가중하도록.

## 명세

### LONG (기존, 변경 X)
```
multiplier_long = 1 + onchain.score × 0.30

  score +1.0 → ×1.30  (강한 매집 → LONG 강화)
  score  0   → ×1.00
  score -1.0 → ×0.70  (강한 분배 → LONG 약화)

자본 보호: strong_distribution + 평균회귀 LONG → 차단
           (BB:upperRiding 만 예외 — 추세 LONG)
```

### SHORT (신규, 미러)
```
multiplier_short = 1 - onchain.score × 0.30

  score +1.0 → ×0.70  (강한 매집 → SHORT 약화)
  score  0   → ×1.00
  score -1.0 → ×1.30  (강한 분배 → SHORT 강화)

자본 보호: strong_accumulation + 평균회귀 SHORT → 차단
           (BB:lowerRiding 만 예외 — 추세 SHORT)
```

## 구현

```typescript
export function applyOnchainShortToEntry(
  signal: BbdxSignalLike,
  onchain: OnchainScore
): OnchainAdjustedEntry {
  const multiplier = 1 - onchain.score * 0.30;

  // 자본 보호 미러: strong_accumulation 환경에서 lowerRiding 외 SHORT 차단
  const isMeanReversion = signal.path !== "BB:lowerRiding";
  if (onchain.regime === "strong_accumulation" && isMeanReversion) {
    return {
      baseStrength: signal.strength,
      multiplier,
      finalStrength: 0,
      blocked: true,
      blockReason:
        "온체인 strong_accumulation 환경에서 평균회귀 SHORT 진입은 자본 보호 위해 차단",
      regime: onchain.regime,
      modifiers: onchain.modifiers,
    };
  }

  const final = Math.min(100, Math.max(0, signal.strength * multiplier));
  return {
    baseStrength: signal.strength,
    multiplier,
    finalStrength: final,
    blocked: false,
    blockReason: null,
    regime: onchain.regime,
    modifiers: onchain.modifiers,
  };
}
```

## 헌장 검증

- ✓ **규칙 3 (modifier-only)** — onchain 단독 SHORT 시그널 X. `signal.strength`
  (= BBDX SHORT path 결과) 를 입력으로 받아 multiplier 만 적용.
- ✓ **자본 보호 미러** — LONG 의 strong_distribution 차단과 정확히 대칭.
  과열된 매집 환경 (FOMO 직전) 에서 평균회귀 SHORT 가 가장 위험 → 차단.
- ✓ **부호 일관성** — 온체인 score 가 양수 (=강세) 일 때 SHORT multiplier
  가 1.0 미만 → 약화. 음수일 때 강화. 직관과 일치.

## 사용 예 (Lite translator)

```typescript
// 백엔드 routers.ts 의 lite.coin procedure
const longAdjusted = applyOnchainToEntry(
  { strength: scan.signalStrength, path: scan.entryDecision?.bbStructure },
  onchainScore
);
const shortAdjusted = applyOnchainShortToEntry(
  { strength: scan.shortSignalStrength, path: scan.shortDecision?.bbStructure },
  onchainScore
);

const recommendation = deriveRecommendation(
  longAdjusted, scan.entryDecision, scan.exitDecision,
  shortAdjusted, scan.shortDecision
);
```

## 다음 단계

- [ ] EXIT 보정 (`applyOnchainToExit`) 도 SHORT 청산 (= LONG 진입 강화)
  의미를 검토. 현재는 LONG 청산 가속만 다룸.
- [ ] backtest 에서 SHORT path 도 onchain modifier 가 진입 score 에 곱해지는지
  E2E 검증.
