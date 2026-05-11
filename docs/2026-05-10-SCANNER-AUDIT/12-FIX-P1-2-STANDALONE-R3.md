# P1-#2 FIX — VWAP/Fibonacci/Trend Standalone R3 검증 + 수정

**날짜**: 2026-05-10
**Audit 참조**: `00-INDEX.md` 우선순위 P1-#2, `04-VWAP-AUDIT.md` §3, `05-FIBONACCI-AUDIT.md`, `06-WAVE-TREND-AUDIT.md`, `09-CHARTER-CROSS-CHECK.md`

## 문제 (Audit)

헌장 R3 (No Standalone Signal) 위반 가능성 확인 필요:

1. **VWAP** — `backtest/strategies/vwap.ts` 가 standalone signal 발행 가능.
   live 환경에서 `decideVwapSignal` + `vwapToMultiplier` 두 모드 공존 → 사용
   인지 모호.
2. **Fibonacci** — ⚠️ **scanner.ts 에서 실제 R3 위반 발견**:
   ```typescript
   // 위반 코드
   isEntrySignal: entryDecision != null || !!fibSignal,
   ```
   Fibonacci 골든존만 도달해도 BBDX core (`entryDecision`) 없이 `isEntrySignal=true`
   → standalone signal 발행 가능 — **헌장 R3 명시 위반**.
3. **Trend** — `backtest/strategies/trend.ts` 가 standalone strategy. live 에서는
   `analyzeTrend(...).waveMult` multiplier 로만 사용.

## 수정 사항

### 1. **`scanner.ts` R3 위반 시정** — Fibonacci standalone 트리거 제거

```diff
- isEntrySignal: entryDecision != null || !!fibSignal,
+ // P1-#2 fix (2026-05-10): isEntrySignal 은 BBDX core (entryDecision) 에만
+ //   의존. Fibonacci standalone 트리거 제거 (R3 violation). fibSignal 은
+ //   display 정보로 보존되지만 standalone 진입 시그널로 사용 X.
+ isEntrySignal: entryDecision != null,
```

`fibSignal` 자체는 `CoinScanResult.fibSignal` 필드로 보존 — UI 가 표시 정보로
사용 가능 (Fib 골든존 위치 등). 단 **진입 트리거는 BBDX core 만**.

### 2. **VWAP / Fibonacci / Trend strategy header 에 R3 통제 박스**

3 strategy 파일 헤더 주석에 명시적 R3 통제 박스 추가:

```typescript
// vwap.ts / fibonacci.ts / trend.ts
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ 헌장 R3 (No Standalone Signal) 통제 — P1-#2 fix, 2026-05-10        ║
 * ║                                                                      ║
 * ║ 본 strategy 는 **backtest 알파 baseline 측정 전용**.                  ║
 * ║ live signal scanner (`scanner.ts`) 는 ... multiplier 로만 사용.       ║
 * ║                                                                      ║
 * ║ 사용 정책:                                                           ║
 * ║   ✅ backtest CLI — 비교 baseline                                    ║
 * ║   ❌ real-time signal 발행 — multiplier 로만 작동                    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
```

향후 누가 standalone signal 발행 시도해도 헤더가 명시적으로 거부.

### 3. **`routers.ts` backtest.run enum 갱신**

`bbdx-short` 추가 (P1-#3 와 paired):

```typescript
strategy: z
  .enum(["bbdx", "bbdx-short", "fibonacci", "vwap", "trend"])
  .default("bbdx"),
```

## 검증

| 항목 | 결과 |
|---|---|
| `pnpm check` | ✓ 0 exit |
| `pnpm test` | ✓ 493/493 pass (+13 P1-#3 SHORT 신규) |

## 헌장 검증

| 규칙 | 영향 | 검증 |
|---|---|---|
| **R1 차원 중복 X** | ✓ | strategy 별 dimensionsCovered 유지. Fibonacci=5, VWAP=[3,4], Trend=3. |
| **R2 백테스트 알파** | ✓ | 3 strategy 모두 backtest 운영 — alpha baseline 측정 가능. |
| **R3 단독 시그널 X** | ✓ **시정 완료** | scanner.ts 의 fibSignal R3 위반 제거. 3 strategy 헤더가 backtest-only 명시. |
| **R4 자본 보호** | ✓ | scanner.ts 의 `isStopLossHit` 등 BBDX core 보호 룰 유지. |
| **R5 Knife 차단** | ✓ | 변경 없음 — falling/rising knife 게이트 그대로. |

## 영향

### Live 사용자 화면 변화
- **이전**: Fibonacci 골든존만 도달해도 SIGNAL 컬럼에 진입 표시.
- **이후**: Fibonacci 골든존은 표시 (chip / chart marker) 되지만 *진입 트리거*
  로 작동 X. `entryDecision` 발생 시에만 `isEntrySignal=true`.

→ 사용자 측 변화: Fibonacci-only 시그널이 사라짐. 단 BBDX core (RSI+BB+ADX
3-path) 에서 trigger 한 시그널은 그대로. 헌장 R3 안전성 회복.

### Frontend 영향
- `Home.tsx` 의 `renderSignalBadges(coin)` 가 `coin.fibSignal` 을 별도 chip 으로
  표시해도 OK (display only). `coin.isEntrySignal` 만 BBDX 의존.
- Lite UI 의 `recommendation` 도 BBDX 기반 — 영향 없음.

## 단점 (audit 의 잔여 권고 — P2/P3)

- **VWAP signalStrength 공식** (V4): `50 + dist% × 10` — 분포 비현실. P3.
- **VWAP Multi-TF Alignment neutral=1.00 vs mixed=0.95 역설** (VM5). P2.
- **VWAP detectPullback 5-candle hard** (V2): TF-별 권고. P2.
- **Trend standalone 의 Higher-TF SMA 단순 근사**: 실제 multi-TF 분석 ≠ backtest
  단순화. P2.

## 다음 단계

- [ ] Frontend 가 `coin.fibSignal` 의 chip 을 *display only* 로 처리하는지 검증
  (`Home.tsx` SIGNAL 컬럼).
- [ ] Audit P2 권고 — VWAP signalStrength 공식 정규화 (`dist%/2σ × 50`).
- [ ] `vwapToMultiplier` SHORT 지원 (audit VM3) — 다음 회차.
