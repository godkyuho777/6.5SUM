# P2 작업 — EXIT-B B4/B5 wiring + VWAP signalStrength 정규화

**날짜**: 2026-05-10
**Audit 참조**: `01-BBDX-AUDIT.md` E2, `04-VWAP-AUDIT.md` V4

## 1. EXIT-B B4 trendline + B5 MACD divergence wiring

### 문제 (Audit E2)

`exits/reversal.ts:108-123` 의 `trendlineBreak` (B4) + `macdDivergence` (B5)
컴포넌트가 정의되었지만 input 이 매번 0 (호출 측에서 채우지 않음).

→ EXIT-B 가 사실상 3-component (B1+B2+B3, max 0.40+0.30+0.20=0.90) 로
운영. 임계 0.50 통과 더 어려움. 명세서 5-component score (max 1.40) 실제
미달.

### 수정

#### `indicators.ts:decideExit` 확장

```typescript
export function decideExit(
  price: number,
  ind: TechnicalIndicators,
  bearishPatterns: CandlePatternMatch[],
  opts?: { candles?: Candle[] }   // ← 신규
): ExitDecision | null {
  // B4 trendline detection (OLS slope on last 30 closes)
  let trendlineState: "intact" | "confirmed_break" | "broken" | undefined;
  if (opts?.candles && opts.candles.length >= 30) {
    // Linear regression slope; if slope > 0 (uptrend) AND price < trendline
    // → broken; 직전 5 candles 모두 below → confirmed_break
  }

  // B5 MACD bearish divergence (EMA12-EMA26 vs price swing high)
  let macdBearishDivergence = false;
  if (opts?.candles && opts.candles.length >= 26) {
    // Bearish divergence: price HH AND macdLine LH on last 10 candles
  }

  return decideExitForScanner({
    price, indicators: ind, bearishPatterns,
    trendlineState, macdBearishDivergence,
  });
}
```

#### `exits/index.ts:ScannerExitContext` 확장

```typescript
trendlineState?: "intact" | "confirmed_break" | "broken";
macdBearishDivergence?: boolean;
```

#### `scanner.ts` 호출 측

```typescript
// 변경: candles 인자 추가
const exitDecision = decideExit(price, indicators, bearishPatterns, { candles });
```

### 효과

EXIT-B 5-component score 가 spec 명시값 max 1.40 으로 복원:
- B1 +DI/-DI cross: 0..0.40
- B2 ADX>25 + bear DI: 0..0.30
- B3 bearish pattern (≥0.6): 0..0.20
- **B4 trendline: 0..0.30** ← 신규 wired
- **B5 MACD bearish div: 0..0.20** ← 신규 wired

→ 임계 0.50 통과율 회복 → MDD ↓ 1~3% 가설 (audit E2).

---

## 2. VWAP signalStrength 공식 정규화

### 문제 (Audit V4)

`backtest/strategies/vwap.ts:113-116` 의 공식:
```typescript
signalStrength = 50 + (distance / entryPrice) × 1000
```

분석:
- `distance = abs(entry - vwap)` — VWAP 와 가격 차이
- `(distance / entryPrice) × 1000` = % × 10
- entry-VWAP 거리 0.5% → score 55, 5% → score 100

문제:
- 일반 진입 시점 거리는 0.1~0.5% → score 51~55 영역에 쏠림
- 0.5~5% 거리는 비대칭적 분포

### 수정

VWAP 1σ 기준 정규화:
```typescript
const vwap = calculateVWAP(windowCandles);
const distance = Math.abs(entryPrice - vwap);
let oneSigma: number;
try {
  const bands = calculateVwapBands(windowCandles);
  oneSigma = bands.upper1 - vwap;     // 1σ
} catch {
  oneSigma = entryPrice * 0.005;       // fallback
}
const sigmaUnits = distance / oneSigma;
const signalStrength = Math.round(
  Math.min(100, 50 + Math.min(2.0, sigmaUnits) * 25),
);
```

### 매핑

| sigmaUnits | signalStrength | 의미 |
|---|---|---|
| 0σ | 50 | VWAP 와 정확히 일치 — 중립 |
| 0.5σ | 62 | 약함 |
| 1σ | 75 | 강함 |
| 1.5σ | 87 | 매우 강함 |
| ≥2σ | 100 (cap) | 극단적 |

### 효과

- **분포 균등화**: 0~2σ 거리가 50~100 균등 mapping → calibration 가능.
- **TF/코인 적응**: 1σ 가 코인별 변동성 반영 → SHIB 와 BTC 가 다른 σ 사용.

---

## 검증

- ✅ Backend `pnpm check` 0 exit
- ✅ Backend `pnpm test` **526/526 pass**

## 헌장 검증

| 규칙 | 영향 | 검증 |
|---|---|---|
| R1 차원 중복 X | ✓ | B4 (5 structure) + B5 (1 momentum, rule1Exempt) — 다른 차원 |
| R2 백테스트 알파 | ✓ | EXIT-B 5-component 복원 → 알파 측정 정확도 회복 |
| R3 단독 시그널 X | ✓ | 변경 없음 — EXIT 는 BBDX core 의 일부 |
| R4 자본 보호 | ✓ | EXIT-B 임계 도달 가능성 회복 → reversal 조기 인지 |
| R5 Knife 차단 | ✓ | 변경 없음 |

## 다음 단계

- [ ] EXIT-B B4/B5 wiring 후 LONG backtest 재측정 — winRate / MDD 변화 확인
- [ ] VWAP signalStrength 분포 검증 — backtest 시 signalStrength 히스토그램
  확인 (calibration param `signalStrength` bucket 통계)
