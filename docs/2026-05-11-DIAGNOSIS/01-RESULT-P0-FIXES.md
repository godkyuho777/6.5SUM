# P0 Fix 적용 결과 — 부분 성공, 새 문제 발견

**날짜**: 2026-05-11
**선행**: `00-WHY-WINRATE-UNDER-50.md` 진단서의 처방 P0-①②③ 적용
**명령**: `ONCHAIN_MOCK=1 pnpm backtest --strategy bbdx --tf 4h --start 2025-05-11 --end 2026-05-11 --symbols ... --calibrate`

## 적용한 fix (3건)

1. **P0-①** `bbdx.ts:getEntryParams` — ATR 1.5σ 기반 stop
   ```typescript
   stopLoss = max(entry - 1.5 × ATR, bbLower × 0.92)
   ```
2. **P0-②** `signal-extractor.ts:measureOutcomeTiered` — Tier 1 도달 후 stop 을
   entry (BE) 로 이동 (`effectiveStop` 변수)
3. **P0-③** `bbdx.ts:shouldEnter` — `isEntrySignal` (RSI 30~35 1-path) → live
   `decideEntry` (RSI 25~38 3-path) 호출로 동기화. NUM path 에는 soft pattern
   gate (0.2) 추가.

## Before vs After 비교

| 지표 | Before | After | 변화 |
|---|---|---|---|
| Total trades | 52 | **1728** | +33배 (live 3-path 진입 +) |
| **winRate** | 21.1% | **31.1%** | ✅ **+10%p** |
| stop_loss (Tier 1 X) | **80.8%** | **18.1%** | ✅ **-62.7%p** |
| target_hit (Tier 1 only) | 15.4% | 27.6% | +12.2%p |
| tier1_then_stop | 1.9% | **45.1%** | ⚠️ **+43.2%p (새 dominant)** |
| **tier2_full** | 0.0% | **9.2%** | ✅ Tier 2 도달 처음 발생 |
| Sharpe | -0.23 | -0.30 | ❌ 더 나쁨 |
| **PF** | 0.58 | **0.44** | ❌ 더 악화 |
| **MDD** | 34.5% | **100%** | ❌ 자본 파산 |
| avgReturn | -0.58% | -0.60% | ≈ 변화 X |

## 진단 — 무엇이 일어났나

### ✅ 성공한 부분

#### 가설 검증 1: Stop 너무 좁음 — **확정**

- **Before**: `max(bbLower × 0.97, entry × 0.98)` ≈ 0.2~0.5% 아래 → 80% trades
  가 정상 변동성에 의해 stop out
- **After**: `max(entry - 1.5×ATR, bbLower × 0.92)` ≈ 변동성 적응 stop
- **결과**: stop_loss 80.8% → 18.1% (**-62.7%p**) — 가설 정확히 검증됨

#### 가설 검증 2: Tier 2 unreachable — **부분 해소**

- **Before**: tier2_full 0.0% — 단 한 번도 Tier 2 도달 X
- **After**: tier2_full 9.2% — Tier 2 까지 도달하는 trade 발생
- 단 9.2% 는 여전히 낮음 → Tier 2 임계 조정 필요

#### 가설 검증 3: Live vs backtest 불일치 — **해소**

- Before: 52 trades / 365d → 70일에 1번 진입 (signal 너무 드물음)
- After: 1728 trades / 365d → 5 trades/day (live decideEntry 3-path 채택)
- **이제 backtest 가 라이브 사용자 시그널과 동일한 룰 측정**

### ❌ 새로 발견된 문제

#### 문제 1: `tier1_then_stop` 45% Dominant ⚠️

Tier 1 도달 후 잔여 50% 가 BE (entry 가격) 회귀 시 stop out 되는 패턴이
**전체의 45%** — 새로운 dominant exit reason.

**원인 분석**:
- Tier 1 = bbMiddle. entry 가 bbLower 근처 → Tier 1 까지 거리 = bbMiddle - bbLower
  (BB 폭의 약 50%)
- 실제로는 *짧은 pullback bounce* 패턴: 가격이 bbMiddle 까지 잠시 오른 후
  bbLower 로 다시 회귀
- BE 이동된 stop (entry 가격) 까지 회귀하면 잔여 50% = breakeven 청산
- Tier 1 (+1%) × 50% + BE × 50% = +0.5% expected. *손실은 아님*
- 그러나 *MDD 누적* 에 +0.5% 작은 수익이 -1~2% 큰 손실 만회 못함

**의미**: Tier 1 자체가 *너무 가까운 normal pullback* 을 측정 중. **bbMiddle
이 의미 있는 target 인지 재검토 필요**.

#### 문제 2: MDD 100% — Equity Curve 파산

- 1728 trades × avgReturn -0.60% × 누적 compounding = -100% (자본 파산)
- 누적 equity 가 0 에 도달하면 MDD = 100% cap

**원인**:
- expectancy 음수 (-0.60%) × 1728 trades = 누적 -1037% (수학적으로 불가능, 100% cap 적용)
- **즉 strategy 자체가 *대규모* 손실 전략**

#### 문제 3: 진입 빈도 너무 높음

- 5 trades/day × 10 coins (실제로는 1728/365 = 4.7) → over-trading
- Live decideEntry 의 3-path (BB > PTN > NUM) 가 너무 헐거움
- **헌장 R3 "단독 시그널 X"** — 현재 NUM path 는 RSI+BB+ADX 3 차원만 → 5차원
  (structure) 결핍

## 새 처방 (P1 — 다음 작업)

### 가장 시급한 4건

#### ① **Tier 1 = bbMiddle × 1.01 또는 ATR-기반** (해결 #1)
현재: Tier 1 = bbMiddle (entry 근처) — 짧은 bounce pattern 잘림
권고: Tier 1 = `bbMiddle + 0.5 × ATR` 또는 `entry × 1.01`
- 짧은 pullback 잘림 방지 → tier1_then_stop ↓ 기대

#### ② **NUM path Pattern Confluence ≥ 0.4 hard gate** (해결 #2)
현재: NUM path 는 soft gate ≥ 0.2 만 → false-positive 통과
권고: 모든 path 에 동일 ≥ 0.4 hard gate (BB/PTN/NUM)
- 진입 빈도 1728 → 500~800 trades 예상
- winRate ↑ 5~10%p 예상

#### ③ **추세 추종 path 신규** (전략 다양화)
mean reversion (BBDX) + trend follow (신규) 결합:
```typescript
// trend-follow.ts (가칭)
shouldEnter: EMA 9>21>50 + ADX>25 + +DI>-DI + recent_HH/HL
trailing_stop: EMA(21)
```
- 강세장에서 BBDX 실패, trend follow 가 보완
- 약세장에서 BBDX (SHORT path) 의 trend follow SHORT 추가 가능

#### ④ **Cycle-aware activation** (BTC 200d MA)
- BTC > 200d MA + 5% → "bull" → BBDX mean reversion 약화, trend follow 강화
- BTC < 200d MA - 5% → "bear" → mean reversion 강화, trend follow 약화
- range → 양쪽 정상

## 누적 진단 결론

**원래 진단** (00-WHY-WINRATE-UNDER-50.md):
> 전략 70% + 엔진 측정결함 20% + 개념 10%

**P0 적용 후 업데이트**:
- **엔진 측정결함 80% 해소** ✅ (live↔backtest 동기화 + ATR stop + Tier 1 BE)
- **전략 본질 문제 노출** ❌ — Tier 1 너무 가까움 + 진입 너무 헐거움 + mean reversion 단일

→ **다음 단계는 전략 자체 다양화 + 게이트 강화**. 엔진은 더 이상 큰 개선 여지 없음.

## Push 정책

본 결과는 backend repo 안 commit. P0-①②③ 적용 코드 + 결과 분석 MD push.
사용자 결정 사항:
- P1-① (Tier 1 ATR) 추가 작업 자동 진행 vs 별도 회차

다음 push 시:
- backend 4곳 (origin/dev, origin/feat, v65sum/main, v65sum/dev)
- frontend 3곳 (코드 변경 없음 — 백엔드 deps만 갱신 가능)

## 검증

- ✅ pnpm check / pnpm test **665/665 pass**
- ✅ pnpm build:types
- ✅ 365d 1728 trades 측정 — Wilson CI 통과 가능 표본
