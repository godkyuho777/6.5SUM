# 내일 (2026-05-11+) 작업 계획서

**작성**: 2026-05-10 (오늘 작업 마무리 시점)
**목적**: SHORT alpha 입증을 위한 4단계 개선. Charter R2 통과 후 feature flag 해제.

## 현재 상태

- SHORT 365d 결과: winRate 37.8%, Sharpe -0.25, PF 0.55, MDD 98.85% — **명백한 미입증**
- 임계값 조정 (RSI 62→65, Tier 2 -3%) 효과 미미 → **메커니즘 자체 개선 필요**
- `ENABLE_SHORT_SIGNALS` env flag 로 production 차단 중 — 안전

## 권고 순서 (2 → 3 → 1 → 4)

### Phase A: 알고리즘 개선 (예상 1일)

#### ① Tier 1 stop breakeven (난이도 낮음, 영향 큼)

**문제**:
365d 결과에서 `tier1_then_stop` 이 37.7% — Tier 1 (bbMiddle) 도달 후 잔여 50%
가 *원래 stop 그대로 유지* → trend reversal 시 손실로 끝남.

**개선**:
`signal-extractor.ts:measureOutcomeTiered` 에 Tier 1 도달 후 stop 을 **entry
가격으로 이동** (breakeven). audit O2 권고.

```typescript
// Tier 1 도달 후
if (!tier1Hit && tierHit(c, target1)) {
  tier1Hit = true;
  // ... 기존 50% 청산 로직
  // NEW: 잔여 50% 의 stop 을 entry 가격으로 이동
  effectiveStop = side === "long"
    ? Math.max(stopLoss, entryPrice)
    : Math.min(stopLoss, entryPrice);
}
```

**예상 효과**: SHORT MDD 98.85% → 30~40% 회복 가능 (Tier 1 도달 후 손실 cap).
**검증**: 365d SHORT 재측정.

---

#### ② Wave Alignment SHORT 게이트 (난이도 낮음, 영향 중간)

**문제**:
`bbdx-short.ts` 가 `decideShortEntry + Pattern Confluence + Higher-TF SMA`
만 사용. (나-2) 에서 `waveAlignmentToMultiplier` SHORT 미러는 완성됐지만 진입
*게이트* 로 활용 X.

**개선**:
`bbdx-short.ts:shouldEnter` 에 wave alignment perfect_down 조건 추가:

```typescript
// Gate 6: Wave Alignment perfect_down 또는 partial_down 만 SHORT 진입 허용
const trends = await analyzeTrend(symbol, ["1h", "4h", "1d"]);
const wave = classifyWaveAlignment(trends);
if (wave.alignment !== "perfect_down" && wave.alignment !== "mixed") {
  return { entry: false };
}
```

**예상 효과**: 강세장 환경 SHORT 진입 자체 차단 → trade 갯수 ↓ but win rate ↑.
**검증**: 365d SHORT 재측정.

---

#### ③ Cycle-aware SHORT activation (난이도 중간, 영향 큼)

**문제**:
강세장 (BTC 가 200d MA 위) 에서는 SHORT 평균회귀 자체가 부적합.

**개선**:
새 모듈 `src/cycle/btc-regime.ts`:

```typescript
export type BtcCycleRegime = "bull" | "bear" | "neutral";

export async function detectBtcCycleRegime(): Promise<BtcCycleRegime> {
  const btcCandles = await fetchKlines("BTCUSDT", "1d", 250);
  const ma200 = sma(btcCandles.map(c => c.close), 200);
  const current = btcCandles[btcCandles.length - 1].close;
  const distance = (current - ma200) / ma200;
  if (distance > 0.05) return "bull";   // BTC > MA200 + 5%
  if (distance < -0.05) return "bear";  // BTC < MA200 - 5%
  return "neutral";
}
```

`scanner.ts` 또는 `bbdx-short.ts` 에서 활용:
```typescript
const cycleRegime = await detectBtcCycleRegime();
if (cycleRegime === "bull") return null;  // bull 시 SHORT 차단
```

**예상 효과**: SHORT 가 bear/neutral 환경에서만 작동 → alpha 입증 가능.
**검증**: 2022 H2 (bear) + 2024 H1 (mixed) 별도 백테스트.

### Phase B: 외부 데이터 통합 (예상 1~2일)

#### ④ 5 stub onchain modifier 실제 API 연결

**현재 stub**: exchange_netflow, whale_alert, etf_flow, miner_outflow, lth_supply

**작업 단계**:

**ⓐ CryptoQuant** (exchange_netflow + miner_outflow):
- 키: $29/월 plan (Basic). 사용자 발급.
- Endpoint: `/v1/exchange-flows/{symbol}/netflow`, `/v1/miner-flows/{symbol}/outflow`
- 30d baseline + z-score 산출 → `stub-modifiers.ts` 실데이터 경로 활성화

**ⓑ Whale Alert** (whale_alert):
- 키: $9.95/월 Personal plan.
- Endpoint: `/v1/transactions?symbol={symbol}&min_value=1000000`
- 24h 합산 netUsd → 기존 임계값 적용

**ⓒ Glassnode** (lth_supply):
- 키: 무료 tier (제한 있음) 또는 $39/월 Advanced.
- Metric: `supply_lth_pct_change_30d`
- BTC/ETH 만 지원

**ⓓ Farside** (etf_flow):
- 무료 스크래핑 (`ETF_FLOW_PROVIDER=farside`).
- 현재 `stub-modifiers.ts:142-202` 의 HTTP 호출 코드는 byte length 검증만 →
  HTML 파싱 + 3-day cumulative netUsd 추출 구현 필요.
- BTC/ETH 만 지원.

**예상 효과**: `effective=2/7` → `effective=7/7` (real data). onchain modifier
가 BBDX final_confidence 에 실제 영향 → alpha 측정 정확도 회복.

**검증**:
- `/admin/health` provider status 패널에서 모드 변화 확인
- 365d LONG + SHORT 재측정 후 ONCHAIN_MOCK=0 vs key 설정 비교

---

## 작업 흐름 (내일 실제 실행)

### 아침 (1~3시간)
1. ✅ `①` Tier 1 stop breakeven 구현 + 365d SHORT 재측정
2. ✅ `②` Wave Alignment 게이트 적용 + 365d SHORT 재측정
3. **중간 평가**: ①+② 만으로 alpha 통과 (winRate ≥ 50%, Sharpe ≥ 0.30, PF ≥ 1.3) 시 → ③ 보류 가능

### 오후 (1~2시간)
4. ✅ `③` Cycle-aware (BTC 200d MA) 구현 + 2022/2024 기간 분리 측정
5. 모든 조건 통과 시 → `ENABLE_SHORT_SIGNALS` 기본 `1` 으로 변경 (혹은 cycle 조건 만족 시 자동 활성)

### 저녁 (사용자 API 키 발급 + 작업)
6. ✅ `④a` CryptoQuant 키 발급 + Railway 환경변수 설정
7. ✅ `④b` Whale Alert 키 발급 + 설정
8. ✅ `④c` Glassnode 키 발급 + 설정
9. ✅ `④d` Farside scraper 구현 (키 불필요)

### 마무리
10. 백엔드 4곳 + 프론트엔드 3곳 push
11. `/admin/health` 시각 검증
12. 종합 보고서 (`docs/2026-05-11-...`)

## 주의 사항

### Charter R2 합격 기준 (재게시)
```
winRate ≥ 50%
Sharpe ≥ 0.30
Profit Factor ≥ 1.3
n ≥ 100 trades / 365d / Wilson CI lower bound ≥ baseline + 5%p
```

①~③ 적용 후 미통과 시 → 전략 자체 deprecate 검토 (SHORT path 제거 또는
다른 mechanism 으로 교체 — 예: pure trend-following SHORT).

### Push 정책
- 각 단계 (①, ②, ③, ④) 별로 별도 commit
- 매 단계마다 backend 4곳 (`origin/dev`, `origin/feat/v6.5-merge`, `v65sum/main`,
  `v65sum/dev`) + frontend 3곳 (`origin/dev`, `origin/feat/v6.5-merge-frontend`,
  `fe65/main`) push
- 사용자 명시적 API 키 입력 작업 (④a/b/c) 은 사용자가 직접 실행

### 환경변수 확인 (내일 시작 시)
```bash
# Production / Railway 에서 SHORT 활성화 검토용
ENABLE_SHORT_SIGNALS=     # 현재 미설정 (차단 상태)
ONCHAIN_MOCK=             # 현재 미설정

# 새로 발급 후 추가될 키
CRYPTOQUANT_API_KEY=
WHALE_ALERT_API_KEY=
GLASSNODE_API_KEY=
ETF_FLOW_PROVIDER=        # "farside" 로 설정
```

## 오늘까지의 상태 (참고)

- **Backend** `9ed7c0d` 7곳 동기화 완료
- **Frontend** `ad08390` 7곳 동기화 완료
- **526/526 tests pass**
- **18 audit/fix MD 작성**

## 시작 명령 (내일)

```powershell
cd "Trade LAB\tradelab-backend"
git pull origin dev --ff-only
pnpm install
pnpm check
pnpm test   # 526 baseline

# 작업 시작 → Phase A ① Tier 1 BE
```

푹 쉬세요 — 좋은 알파 입증 결과가 나올 거예요 🙏
