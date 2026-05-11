# SHORT 듀얼 시스템 — 헌장 검증

**날짜**: 2026-05-09

BBDX 헌장 (`tradelab-backend/STRATEGY_CHARTER.md`) 4 규칙을 SHORT 시스템이
어떻게 준수하는지 명시.

## 규칙 1 — 차원 중복 X

> 새 차원은 기존 6 차원 (1=momentum, 2=trend, 3=volatility, 4=volume,
> 5=structure, 6=macro/sentiment, 7=onchain) 과 *다른 정보* 를 제공해야 함.

**SHORT 검증**: SHORT 는 *새 차원이 아니라 LONG path 의 부호 반전 미러*.
같은 6 차원 (RSI=momentum, ADX=trend, BB=structure, candle pattern=structure,
volume ratio=volume) 을 *반대 방향* 으로 해석.

→ **차원 추가 X** — 헌장 영향 0.

## 규칙 2 — 백테스트 알파 검증

> 모든 신규 시그널은 backtest 에서 winRate / Sharpe / Profit Factor 가
> 통계적으로 유의미한 알파를 보여야 함.

**SHORT 현재 상태**: ⚠️ **미검증**.
- `decideShortEntry` 임계값 (RSI 62~75, BB 2~5% tolerance, ADX ≤20~25) 는
  LONG 미러로 *대칭 가정* 만 함. 실제 시장 데이터에서 알파가 있는지는
  backtest 가 필요.

**TODO**:
1. `tradelab-backend/src/backtest/signal-extractor.ts` 에 SHORT path 재생 로직
   추가 (lookahead-free 보장).
2. `metrics.ts` 가 LONG / SHORT 별로 winRate / Sharpe / MDD / PF 를 *분리*
   집계.
3. CLI flag `--side=long|short|both` 추가.
4. SHORT path 의 PF ≥ 1.5 / Sharpe ≥ 0.8 을 통과해야 클라이언트 사이드 미러
   (`indicators-client.ts`) 에 추가.

→ **현재는 surface 만, alpha 입증 후 클라 미러 + 사용자 노출 strong claim
  변경 가능**.

## 규칙 3 — 단독 시그널 X (modifier-only)

> 보조 차원 (온체인, Lite translator 등) 은 BBDX core 시그널 *없이* 매매
> 신호 발행 금지. multiplier 로만 작동.

**SHORT 검증**:

### 3.1. SHORT path 자체는 BBDX core ✓
- `decideShortEntry` 는 BB 위치 + ADX + (선택) 패턴 + RSI 컨플루언스 *모두*
  요구. Single-feature trigger X.
- 각 path:
  - **BB**: `bbStructureShort != null` (구조 인식)
  - **PTN**: 약세 패턴 + BB상단 근처 + ADX ≤ 25 (3 컨플루언스)
  - **NUM**: RSI ∈ [62,75] + BB상단 ≤2% + ADX ≤ 20 (3 컨플루언스)

### 3.2. 온체인 SHORT multiplier 는 modifier-only ✓
- `applyOnchainShortToEntry(signal, onchain)` 의 `signal.strength` 가 0 이면
  결과도 0. 즉 BBDX SHORT 시그널 없으면 온체인이 SHORT 만들어 낼 수 없음.

### 3.3. Lite translator SHORT 라벨도 modifier-only ✓
- `deriveRecommendation` 의 SHORT 분기는 `shortAdjusted && shortEntry` 두
  입력 모두 있을 때만. 둘 다 BBDX path 결과.

→ **헌장 규칙 3 완전 준수** ✓

## 규칙 4 — 자본 보호 (Capital Protection)

> 극단적 시장 환경에서 mean-reversion 진입은 차단. 차단 시 BLOCKED 라벨로
> 사용자에게 명시.

**LONG (기존)**:
```
strong_distribution + 평균회귀 LONG → BLOCKED
(BB:upperRiding 만 예외 — 추세 LONG 은 분배 환경에서도 살아남을 여지)
```

**SHORT (신규 미러)**:
```
strong_accumulation + 평균회귀 SHORT → BLOCKED
(BB:lowerRiding 만 예외 — 추세 SHORT 은 매집 환경에서도 살아남을 여지)
```

### 시장 상식과 일치 검증
- **strong_accumulation** = 큰 자금이 빠르게 매수 중 → FOMO 직전. 평균회귀
  SHORT (= "오를 만큼 올랐다, 떨어질 거다") 가 *가장 위험*. → 차단 합리적.
- **lowerRiding** = 가격이 BB하단 따라 내려가는 추세 SHORT. 매집 환경에서
  도 단기적으로 하락 추세는 가능 → 예외 허용.

→ **자본 보호 미러 합리적** ✓

## 규칙 5 (암묵) — Falling/Rising Knife 차단

> 추세가 반대로 가는데 진입하면 손실 폭이 커짐. ADX > 25 + 반대 DI 우세
> 시 진입 차단.

**LONG**: `isFallingKnife` (= -DI > +DI AND ADX > 25) → LONG 차단,
`upperRiding` 만 예외.

**SHORT 미러**: `isRisingKnife` (= +DI > -DI AND ADX > 25) → SHORT 차단,
`lowerRiding` 만 예외.

→ **2 게이트 모두 미러로 구현** ✓

## 종합 점검표

| 헌장 규칙 | 상태 | 비고 |
|---|---|---|
| 1. 차원 중복 X | ✓ | SHORT 는 LONG 미러, 새 차원 X |
| 2. 백테스트 알파 | ⚠️ | 미검증 — backtest CLI 작업 후속 |
| 3. 단독 시그널 X (modifier-only) | ✓ | SHORT path = BBDX core, 온체인/Lite = modifier |
| 4. 자본 보호 | ✓ | strong_accumulation × 평균회귀 SHORT BLOCKED |
| 5. Knife 차단 | ✓ | isRisingKnife + lowerRiding 예외 |

## 사용자 노출 정책

현재까지 헌장 준수도 4/5 (alpha 미검증). 따라서:
- ✅ Lite UI 에 `SHORT` / `STRONG_SHORT` 라벨 표시 — 단, **Lite 학습 카드에**
  "SHORT 알고리즘은 검증 단계입니다" 같은 disclaimer 추가 권고.
- ✅ Pro Home 에 SHORT 배지 표시 — Pro 사용자는 raw 지표 본인 검증 가능.
- ⚠️ Lite Alerts (push notification) 에 SHORT 시그널 발송은 alpha 입증 후로
  연기.

## 다음 단계

1. **backtest SHORT path 추가** (P1):
   - `signal-extractor.ts` SHORT 재생 (lookahead-free)
   - `metrics.ts` LONG/SHORT 분리 집계
   - `cli.ts` `--side` flag

2. **Alpha 통과 시**:
   - `indicators-client.ts` SHORT 클라이언트 미러
   - Lite Alerts SHORT 발송 활성화
   - SHORT-specific learn card

3. **Alpha 미통과 시**:
   - 임계값 재조정 (signal-engineer agent)
   - 또는 SHORT path 자체를 deprecate (feature flag 로 비활성)
