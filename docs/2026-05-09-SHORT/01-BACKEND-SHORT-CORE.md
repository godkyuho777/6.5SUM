# SHORT 듀얼 시스템 — 백엔드 코어

**날짜**: 2026-05-09
**브랜치**: `feat/v6.5-merge` (+ `dev`, `v65sum/main`, `v65sum/dev`)
**커밋**: `07b6a47 feat(short): SHORT position entry path 듀얼 시스템 추가`
**최종 SHA**: `329e226` (Phase 3 Wilson CI 포함)

## 목적

기존 LONG-only BBDX 시그널 시스템에 SHORT 진입 path 를 *별개*로 추가.
EXIT (LONG 청산) 의미는 그대로 유지하면서, 하락장에서 적극적 SHORT 진입을
헌장 규칙 3 (modifier-only) 을 깨지 않고 가능하게 한다.

**채택 근거**:
- 옵션 A (EXIT 를 SHORT 로 단순 rename) 거부 — EXIT 는 청산 의미가 핵심
- 옵션 C (UI 만 토글) 거부 — 진입 로직이 LONG 만이라 약세장에서 무기 없음
- **옵션 B (듀얼 시스템) 채택** — LONG / SHORT 각각의 진입 path

## 변경 파일

### 1. `src/shared/types.ts`

```typescript
export type BBStructureShort =
  | "lowerRiding"        // 추세 추종 SHORT (하단 타고 내려감)
  | "middleResistance"   // 중단 저항
  | "squeezeBreakdown"   // 스퀴즈 하향 이탈
  | "upperRejection";    // 상단 거부

export interface ShortEntryDecision {
  path: EntryPath;       // "NUM" | "PTN" | "BB" 재사용
  reasons: string[];
  patterns?: CandlePatternMatch[];
  bbStructure?: BBStructureShort;
  // Additional Strategies multipliers (LONG 미러)
  vwapMult?: number;
  emaRibbonMult?: number;
  marketBreadthMult?: number;
  macdDivergenceMult?: number;
  fundingExtremeMult?: number;
  cvdDivergenceMult?: number;
  orderBlockMult?: number;
}

// CoinScanResult 확장
interface CoinScanResult {
  // ... 기존 필드 ...
  bbStructureShort: BBStructureShort | null;
  shortDecision: ShortEntryDecision | null;
  shortStopLossPrice: number;     // BB상단 × 1.03
  shortSignalStrength: number;    // 0~100 (5-component 미러)
  isRisingKnife: boolean;          // +DI > -DI AND ADX > 25
}
```

### 2. `src/indicators.ts` — 4 신규 함수 (~200 라인)

#### `isRisingKnife(plusDi, minusDi, adx): boolean`
LONG `isFallingKnife` 의 미러. SHORT 진입 차단 게이트.
```typescript
return plusDi > minusDi && adx > 25;
```

#### `detectBBStructureShort(candles, bbSeries): BBStructureShort | null`
4 미러 검사 (우선순위 순):
- `upperRejection` — 가격이 BB상단 닿고 즉시 후퇴
- `squeezeBreakdown` — BB 폭 좁아지고 하향 이탈
- `middleResistance` — BB중단에서 반복 거부
- `lowerRiding` — 가격이 BB하단을 따라 내려감 (추세 SHORT)

#### `decideShortEntry(candles, ind, patterns, bbStructureShort, volRatio)`
BB > PTN > NUM 우선순위 미러:
- **BB path** — `bbStructureShort` 존재 시 즉시 trigger
- **PTN path** — 약세 패턴 (engulfing/eveningStar/threeBlackCrows 등) +
  BB 상단 근처 (5% 이내) + ADX ≤ 25
- **NUM path** — RSI ∈ [62, 75] + BB 상단 근처 (2% 이내) + ADX ≤ 20

임계값 상수:
```typescript
const SHORT_NUM_RSI_LOW = 62;     // LONG 의 30 → 70 미러 (대칭점)
const SHORT_NUM_RSI_HIGH = 75;
const SHORT_NUM_BB_TOLERANCE = 0.02;
const SHORT_NUM_ADX_MAX = 20;
const SHORT_PTN_BB_TOLERANCE = 0.05;
const SHORT_PTN_ADX_MAX = 25;
```

#### `calculateShortSignalStrength(price, ind, volumeConfirmation): number`
5-component 미러:
1. **RSI score** — `(rsi - 62) / 13 × 25` (0~25)
2. **BB proximity** — 가격이 BB상단에 가까울수록 ↑
3. **ADX reversal probability** — 100 - (adx × 2.5)
4. **Reversal probability bonus** — `−DI > +DI` 시 가산
5. **Volume confirmation** — −5 / 0 / +15

### 3. `src/scanner.ts`

```typescript
const bbStructureShort = detectBBStructureShort(candles, bbSeries);
const risingKnife = isRisingKnife(indicators.plusDi, indicators.minusDi, indicators.adx);
const shortAllowed = !risingKnife || bbStructureShort === "lowerRiding";
const shortDecision = shortAllowed
  ? decideShortEntry(candles, indicators, candlePatterns, bbStructureShort, ratio)
  : null;
const shortStopLossPrice = indicators.bbUpper * 1.03;
const shortSignalStrength = shortDecision
  ? calculateShortSignalStrength(price, indicators, volConfirmation)
  : 0;
```

`shortAllowed` 게이트 — `isRisingKnife` 일 때 `lowerRiding` 만 예외 허용
(LONG 의 `isFallingKnife` + `upperRiding` 예외와 미러).

## 디버깅 노트

- **TS2300 Duplicate identifier 'isBear' / 'upperWick'**: `isBull/bodySize/lowerWick/isBear/upperWick` 가 line 511~515 에 const arrow 로 이미 정의됨.
  → SHORT BB structure 모듈에서 helper 재정의 제거, 주석으로 재사용 명시.
- **TS2739 CoinScanResult 누락**: scanner result object 에 5 신규 필드 추가
  필요 (정상 path + error fallback path 양쪽).

## 검증

- `pnpm check` ✓ 0 exit
- `pnpm build:types` ✓ d.ts emit (frontend 가 SHORT 타입 import 가능)

## 다음 단계

- [ ] 백테스트 CLI 가 SHORT trade 를 별도 집계 (Charter Rule 2 — alpha 검증)
- [ ] SHORT signalStrength 의 winRate / PF / Sharpe 측정
- [ ] LONG/SHORT pair correlation 분석 (둘 다 동시 trigger 시 우선순위 정책)
