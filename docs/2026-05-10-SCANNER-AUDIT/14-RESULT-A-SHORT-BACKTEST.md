# (가) SHORT 백테스트 실행 결과 — 알파 미입증

**날짜**: 2026-05-10
**명령**: `ONCHAIN_MOCK=1 pnpm backtest --strategy bbdx-short --quick --calibrate --name p1_3_short_alpha`

## 인프라 검증 ✅

P1-#3 의 SHORT 백테스트 인프라가 정상 작동 — Charter R2 *측정 가능 상태* 도달:
- `bbdx-short` strategy 로딩 ✓
- `decideShortEntry` Rising Knife 게이트 ✓ (138 signals 추출 — 실제 진입 조건
  부합 trade 만)
- `measureOutcomeTiered` SHORT side-aware ✓ (Tier 1=bbMiddle 가격↓ 도달, Tier 2=
  max(bbLower, entry×0.95), Stop=min(bbUpper×1.03, entry×1.02))
- `[Onchain] effective=7/7 (real=2, mock=5)` 컨텍스트 출력 ✓ (ONCHAIN_MOCK=1)
- LONG/SHORT split + SHORT-specific calibration 자동 출력 ✓

## 알파 측정 결과 ⚠️

| 지표 | 값 | 평가 |
|---|---|---|
| Total trades | 138 | 표본 충분 (≥100) |
| **winRate** | **37.0%** | ❌ baseline 50% 미달 |
| avgReturn | -0.27% | ❌ 음수 |
| **Sharpe** | **-0.168** | ❌ 손실 위험 ↑ |
| MDD | 40.57% | ❌ 심각한 낙폭 |
| **PF** | **0.66** | ❌ <1.0 = losing strategy |
| Expectancy | -0.27% | ❌ 음수 |
| Avg MFE | +2.07% | (참고) |
| Avg MAE | -1.87% | (참고) |

### 해석

> 🔴 기댓값 음수. 현재 파라미터로는 수익 불가능. 시그널 조건 재검토 필요.

**Charter R2 위반**: SHORT path 가 baseline 대비 알파 입증 못함. 헌장 정책상
production 노출 자제 권고.

### Calibration 결과 (Wilson 95% CI)

5 SHORT 파라미터 (RSI / ADX / Pattern / SignalStrength / Modifiers) 모두:
> ⚠ 권고 임계 없음 (통계적 유의성 부재)

→ 현재 trade 분포에서 *어떤 임계값 변경* 도 baseline winRate +5%p 를 통계적
유의 (Wilson lower bound) 로 넘기지 못함. 표본 부족 가능 (90일 5코인 138 trade)
또는 진짜 noise 일 수 있음.

## Exit 사유 분포

```
tier2_full (50%+50%):     35 (25.4%) — 가장 좋은 outcome
target_hit (Tier 1 only): 30 (21.7%)
tier1_then_stop:          52 (37.7%) — 가장 흔한 outcome
stop_loss (Tier 1 X):     21 (15.2%)
```

→ **tier1_then_stop (37.7%)** 가 dominant — Tier 1 도달 후 추세가 reversal
되어 잔여 50% 가 손절. SHORT 평균회귀가 *짧은 반등 후 trend 재개* 환경에서
대부분 손실로 끝남.

## 가능한 원인 (가설)

1. **시장 환경 부적합** — 90일 (2026-02-09 ~ 2026-05-10) BTC 강세장
   추정. Bull market 에서 SHORT 평균회귀는 본질적으로 어려움.
2. **Tier 2 임계 너무 멀음** — `max(bbLower, entry × 0.95)` 가 5% 하락.
   Bull market 에서 5% 연속 하락 드물어 Tier 1 만 도달 후 다시 상승 → 잔여
   50% 손실.
3. **Rising Knife 게이트 너무 좁음** — `+DI > -DI && ADX > 25` 차단인데,
   ADX < 25 인 약한 추세 환경에서도 강세 코인이 SHORT 환경 부적합.
4. **Pattern Confluence ≥ 0.4 약함** — bearish 패턴 0.4 임계가 false-positive
   다수 통과시킴.

## 권고

### 즉시 조치 (운영 안전)
- ✅ **Lite UI 의 SHORT 라벨에 "검증 단계" disclaimer 명시** — 사용자에게
  "현재 SHORT 알고리즘 backtest 미입증 — 참고용" 표시.
- ✅ **Production Lite Alerts 의 SHORT 알림 발송 비활성화** (이미 구현 X — 그대로).

### 단기 개선 (다음 회차)
- Audit S1 권고 적용: `SHORT_NUM_RSI_LOW` 62 → 65 (비대칭 미러 회복).
- Tier 2 임계 보수화: `max(bbLower, entry × 0.95)` → `max(bbLower, entry × 0.97)`
  — 3% 하락 도달이 더 흔해서 잔여 50% trail 가능.
- 365일 백테스트 (quick 90일 표본 부족 가능).
- Bear market 구간 (2022년 6월~12월) 별도 측정 — cycle-aware alpha.

### 장기 (alpha 통과 조건)
- winRate ≥ 50%, Sharpe ≥ 0.30, PF ≥ 1.3 도달 시 production 활성화.
- 미통과 시 SHORT path feature flag 비활성화 또는 deprecate.

## 결론

**(가) 작업 자체는 P1-#3 인프라 검증 성공**. 측정 결과 SHORT 알파 미입증 →
**(나)/(다) 후속 개선** 으로 이어감. 임계값 조정 (RSI/ADX/Tier 2) + 365일 측정
이 다음 회차 우선순위.
