# SHORT 365일 백테스트 재측정 결과 — Alpha 미입증 + Feature Flag 차단

**날짜**: 2026-05-10 (저녁)
**선행**: `14-RESULT-A-SHORT-BACKTEST.md` (90d 결과)
**명령**: `ONCHAIN_MOCK=1 pnpm backtest --strategy bbdx-short --tf 4h --start 2025-05-10 --end 2026-05-10 --symbols ... --calibrate --name p1_3_short_365d_tuned`

## 적용된 임계값 튜닝

Audit S1 권고 + (가) 결과 분석:
- `SHORT_NUM_RSI_LOW`: **62 → 65** (비대칭 미러 회복)
- SHORT Tier 2: **`entry × 0.95` → `entry × 0.97`** (3% 도달 더 흔함, tier1_then_stop 비율 줄이려 시도)

## 365일 결과 vs 90일

| 지표 | 90d (튜닝 전) | 365d (튜닝 후) | 비교 |
|---|---|---|---|
| 표본 | 138 trades | **1101 trades** | ✓ 충분 |
| winRate | 37.0% | **37.8%** | ≈ 변화 없음 |
| avgReturn | -0.27% | **-0.39%** | ❌ 더 나쁨 |
| Sharpe | -0.17 | **-0.25** | ❌ 더 나쁨 |
| MDD | 40.57% | **98.85%** | ❌ **거의 파산** |
| PF | 0.66 | **0.55** | ❌ 더 나쁨 |

### 해석

> 🔴 **365일 1101 trades 표본에서도 SHORT 알파 미입증.** 임계값 조정만으로
> 회복 불가. 강세장 환경 자체가 SHORT 평균회귀 부적합 — *근본 문제는
> 임계값이 아닌 시장 환경 / 전략 설계*.

### Calibration

5 SHORT 파라미터 (RSI / ADX / Pattern / SignalStrength / Modifiers) 모두:
> ⚠ 권고 임계 없음 (통계적 유의성 부재)

→ 어떤 임계값 변경도 baseline + 5%p 통과 X. 표본 부족 X (1101 trades).
**현재 SHORT path 자체가 알파 없음** 결론.

## Production Safety Action

### Feature flag 도입

`scanner.ts` SHORT 산출 부분에 환경변수 게이트 추가:

```typescript
const SHORT_SIGNALS_ENABLED = process.env.ENABLE_SHORT_SIGNALS === "1";
const bbStructureShort = SHORT_SIGNALS_ENABLED
  ? detectBBStructureShort(candles, bbSeries)
  : null;
const shortAllowed = SHORT_SIGNALS_ENABLED &&
  (!risingKnife || bbStructureShort === "lowerRiding");
```

`.env.example` 에 명시:
```
# alpha 통과 기준 충족 시 flag 제거:
#   winRate ≥ 50%, Sharpe ≥ 0.30, PF ≥ 1.3
ENABLE_SHORT_SIGNALS=
```

### 효과

- **Production**: 사용자에게 SHORT 라벨/시그널 노출 X (자본 보호).
- **Backtest**: CLI 는 본 flag 무관하게 측정 가능 (`--strategy bbdx-short`)
  — alpha 입증 작업 진행 가능.

### Frontend UI 영향

(다-2) 의 `[검증중]` 노란 태그 + 본 feature flag 가 이중 보호:
- `ENABLE_SHORT_SIGNALS=1` 인 환경 (개발/테스트) — 라벨 노출 + 검증중 태그 표시
- 미설정 (production) — `shortDecision = null` → 라벨 자체가 안 나옴

## 가능한 개선 방향 (미래)

1. **Cycle-aware activation**: BTC 200d MA 아래일 때만 SHORT 활성 — bear
   market 한정 운영.
2. **Tier 1 stop breakeven**: Tier 1 (bbMiddle) 도달 후 stop 을 entry 로
   이동 — tier1_then_stop 손실 차단.
3. **Wave Alignment 게이트**: `perfect_down` 일 때만 SHORT 진입 허용.
4. **Funding 환경**: Perp funding > +0.05% (강한 long bias) 일 때 contrarian
   SHORT — 다른 메커니즘.

## 헌장 검증

| 규칙 | 영향 |
|---|---|
| R2 백테스트 알파 | ❌ SHORT 미입증 — Production 차단으로 안전성 회복 |
| R4 자본 보호 | ✓ **강화** — Feature flag 로 production 신호 차단 |

## 결론

알파 입증 시도 (RSI 65, Tier 2 -3%) 실패. **현재 SHORT 메커니즘은 강세장
환경에서 자본 파괴 위험** — feature flag 도입으로 production 차단. 미래
cycle-aware 또는 다른 mechanism 적용 시 활성화 검토.
