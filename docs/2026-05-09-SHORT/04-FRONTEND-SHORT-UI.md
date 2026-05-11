# SHORT 듀얼 시스템 — 프론트엔드 UI

**날짜**: 2026-05-09
**브랜치**: `feat/v6.5-merge-frontend` (+ `dev`, `fe65/main`)
**커밋**: `6a00bc1 feat(backtest UI): Phase 1+2+3 surface — Tier exits + Modifier multipliers + Calibration tab`

> 커밋 메시지는 backtest UI 가 메인 헤드라인이지만 SHORT 변경도 같은 commit
> 에 포함됨 (Lite Recommendation SHORT/STRONG_SHORT 동기화 포함).

## 변경 파일

### 1. `src/shared/types.ts` — 백엔드 타입 미러

```typescript
export type BBStructureShort =
  | "lowerRiding"
  | "middleResistance"
  | "squeezeBreakdown"
  | "upperRejection";

export interface ShortEntryDecision {
  path: EntryPath;
  reasons: string[];
  patterns?: CandlePatternMatch[];
  bbStructure?: BBStructureShort;
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
  // ...
  bbStructureShort?: BBStructureShort | null;
  shortDecision?: ShortEntryDecision | null;
  shortStopLossPrice?: number;
  shortSignalStrength?: number;
  isRisingKnife?: boolean;
}
```

### 2. `src/index.css` — 색상 토큰

```css
@theme {
  --color-neon-orange: oklch(0.78 0.20 55);  /* SHORT 캐주션 톤 */
}
```

LONG 톤(`neon-green`/`neon-cyan`/`neon-pink`) 와 EXIT 톤(`neon-yellow`/
`neon-red`) 사이의 *주황* — SHORT 의 "bearish but not catastrophic" 위치.

### 3. `src/components/lite/LiteRecommendationBadge.tsx`

```typescript
type Recommendation =
  | "STRONG_BUY" | "BUY" | "WATCH" | "HOLD"
  | "SELL" | "STRONG_SELL"
  | "SHORT"        // ★
  | "STRONG_SHORT" // ★
  | "BLOCKED";

const STYLE = {
  // ...
  SHORT: {
    emoji: "🟠",
    color: "border-neon-orange/40",
    bg: "bg-neon-orange/10",
    text: "text-neon-orange",
    default: "공매도 추천",
  },
  STRONG_SHORT: {
    emoji: "🔻",
    color: "border-neon-red/50",
    bg: "bg-neon-red/15",
    text: "text-neon-red",
    default: "강한 공매도",
  },
};
```

### 4. `src/pages/Home.tsx` — Pro SIGNAL 컬럼

기존 `LONG NUM/PTN/BB` 배지 옆에 `SHORT NUM/PTN/BB` 배지를 추가:

```tsx
if (coin.shortDecision) {
  const sStrength = coin.shortSignalStrength ?? 0;
  const path = coin.shortDecision.path;
  const isStrong = sStrength >= 70;
  const colorClass = isStrong
    ? "bg-neon-red/20 text-neon-red border-neon-red/40"
    : "bg-neon-orange/20 text-neon-orange border-neon-orange/40";
  badges.push({
    key: "short",
    node: (
      <Badge className={cn("font-mono text-[10px]", colorClass)}>
        <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
        SHORT {path}
      </Badge>
    ),
  });
}
```

`finalStrength ≥ 70` 시 STRONG (red) / 미만 시 caution (orange).

### 5. `src/pages/lite/Dashboard.tsx` — Lite 카드 variant

```tsx
<LiteCard
  variant={
    coin.recommendation === "STRONG_BUY" || coin.recommendation === "BUY"
      ? "good"
      : coin.recommendation === "STRONG_SELL" || coin.recommendation === "STRONG_SHORT"
        ? "bad"
        : coin.recommendation === "SELL" || coin.recommendation === "SHORT"
          ? "caution"
          : "default"
  }
>
```

`STRONG_SHORT` → bad (red)
`SHORT` → caution (orange)
`SELL` (LONG 청산) → caution (yellow)
`STRONG_SELL` → bad (red)

## 클라이언트 사이드 SHORT 산출 — 미구현 (의도적)

`src/lib/indicators-client.ts` 에는 LONG `decideEntry` 만 있고 SHORT 미러
미작성. 따라서 Pro `Home.tsx` 의 SHORT 배지는 **백엔드 `lite.coin` /
`signals.scan` 응답이 `shortDecision` 필드를 채울 때만** 표시됨.

이유:
1. 클라이언트 BBDX 미러는 시장 데이터를 브라우저가 직접 fetch (외부 API 차단
   환경 우회) — SHORT 검증은 백엔드 backtest 와 짝지어야 의미 있음.
2. SHORT 단독 alpha 가 입증되기 전에는 backend 만 산출 → backtest CLI 로
   alpha 검증 후 클라이언트 미러 추가.

## 검증

- `pnpm check` ✓ 0 exit (TS2322 SHORT 유니온 fix 후)
- 모든 `LiteRecommendationBadge` 사용처에서 SHORT/STRONG_SHORT 라벨 정상 렌더
- `Home.tsx` SIGNAL 컬럼이 LONG/SHORT 배지 동시 표시 가능

## 다음 단계

- [ ] `indicators-client.ts` 에 `decideShortEntry` 클라이언트 미러 추가
  (backend alpha 입증 후)
- [ ] `SignalDetailDialog.tsx` 에 SHORT path reasons + bbStructure 시각화
- [ ] Pro CoinDetail Workstation 에 SHORT 진입 chart marker
- [ ] Lite CoinDetail 페이지에 SHORT 라벨 + reasons 노출
