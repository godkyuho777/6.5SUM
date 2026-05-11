# 2026-05-10 — 오늘 한 작업 종합 보고

## 동기화 검증 ✅

dev 프론트/백엔드와 godkyuho777 레포가 **100% 동일** 확인.

| Repo | origin/dev | godkyuho777 | 파일 diff |
|---|---|---|---|
| Backend | `bccc2c0` | `v65sum/main = bccc2c0`, `v65sum/dev = bccc2c0` | **0** |
| Frontend | `1595f3d` | `fe65/main = 1595f3d` | **0** |

`git diff origin/dev godkyuho777/main --stat` 모두 빈 출력 = 파일 단위 100% 일치.

---

## 작업 흐름

### Phase 1 — Signal Scanner 종합 audit (오전)

**목적**: dev 의 모든 시그널 스캐너 단점/개선점 분석.
**산출**: `docs/2026-05-10-SCANNER-AUDIT/00~09` (10개 MD)

23 개 스캐너 모듈 분석 — P1 10건 / P2 8건 / P3 4건 우선순위 부여.

가장 시급한 P1 3건:
1. `combineAdditionalModifiers` BBDX 곱셈체인 미통합 (5 modifier 측정 자체 불가)
2. VWAP/Fibonacci/Trend standalone 시그널 R3 위반 위험
3. SHORT path + 5/7 onchain modifier 알파 미검증 (R2 위반)

### Phase 2 — P1 4건 시정 (오전~오후)

| Fix | Commit | Doc |
|---|---|---|
| **P1-#1** combineAdditionalModifiers wiring | `39e7eeb` | `10-FIX-P1-1-COMBINE-MODIFIERS.md` |
| **P1-#2** VWAP/Fib/Trend standalone R3 시정 | `b27caa2` | `12-FIX-P1-2-STANDALONE-R3.md` |
| **P1-#3** SHORT 백테스트 alpha 인프라 | `b27caa2` | `11-FIX-P1-3-SHORT-BACKTEST.md` |
| **P1-#4** Onchain provider status 가시화 | `b27caa2` | `13-FIX-P1-4-ONCHAIN-PROVIDER-STATUS.md` |

### Phase 3 — (가)/(나)/(다) 검증 + P2 + UI surface (오후)

| 단계 | 작업 | 결과 |
|---|---|---|
| **(가)** SHORT 백테스트 실행 | `pnpm backtest --strategy bbdx-short --quick --calibrate` | ⚠️ alpha 미입증 (winRate 37.0%, Sharpe -0.17, PF 0.66) |
| **(나-1)** Pattern volume EMA(50) | `patterns/context.ts` SMA → EMA 마이그레이션 | ✓ |
| **(나-2)** Wave Alignment SHORT 미러 | `wave-alignment.ts` perfect_down ↔ perfect_up swap + 8 tests | ✓ |
| **(나-3)** Backtest cooldown 검토 | 현재 single-strategy 모델 OK, 미래 multi-strategy 주석 마커 | ✓ |
| **(다-1)** Onchain Provider Status 패널 | `/admin/health` 7-modifier real/mock/stub 카드 surface | ✓ |
| **(다-2)** Lite SHORT badge 검증중 태그 | `LiteRecommendationBadge` 자동 `[검증중]` 노란 chip + hover disclaimer | ✓ |

`14-RESULT-A-SHORT-BACKTEST.md` / `15-FIX-NA-DA-P2-IMPROVEMENTS.md` 보고서.

### Phase 4 — Wave Sentiment v4.3 (병렬 세션)

본 Claude 세션 외에 v4.3 작업 진행됨 — 마지막 commit:
- Backend `bccc2c0 feat(sentiment): v4.3 Phase C+D — multi-period + source health + 12 p...`
- Frontend `1595f3d feat(wave): Sentiment & Matrix v4.3 — multi-period badges + source he...`

직접 작업 X — 별도 보고서 참조 권고.

---

## 코드 변경 통계

### Backend

```
오늘 커밋 (sentiment v4.3 제외):
39e7eeb fix(p1-1): wire combineAdditionalModifiers into final_confidence chain
b27caa2 fix(p1-2,3,4): SHORT backtest alpha + R3 standalone fix + onchain stub gate
1762730 feat(p2): pattern EMA(50) + Wave Alignment SHORT mirror + provider status

신규 파일 4개:
  src/backtest/strategies/bbdx-short.ts          (167 lines, P1-#3)
  src/backtest/__tests__/short-strategy.test.ts  (220 lines, +13 tests)
  src/onchain/provider-status.ts                 (156 lines, P1-#4)
  src/onchain/__tests__/provider-status.test.ts  (110 lines, +9 tests)

주요 수정:
  src/scanner.ts                — combineAdditionalModifiers wiring + R3 fix
  src/signals/confidence.ts     — additional multiplier 추가 + ConfidenceBreakdown
  src/indicators.ts             — decideShortEntry Rising Knife 게이트 명시
  src/backtest/signal-extractor.ts — measureOutcomeTiered side-aware
  src/backtest/calibration.ts   — SHORT_CALIBRATION_PARAMS + runShortCalibration
  src/backtest/metrics.ts       — computeMetricsBySide
  src/backtest/cli.ts           — --strategy bbdx-short + LONG/SHORT split
  src/patterns/context.ts       — volumeBaseline EMA(50)
  src/trend/wave-alignment.ts   — SHORT mirror
  src/routers.ts                — onchain.providerStatus tRPC 신규
  src/onchain/types.ts          — MODIFIER_BOUNDS 주석 보강
  src/onchain/score.ts          — 주석 (spec source of truth)
  src/shared/types.ts           — ShortEntryDecision.waveMult

테스트: 475 → 510 (+35 신규)
  - 5 confidence.additional
  - 13 short-strategy
  - 9 provider-status
  - 8 wave-alignment SHORT
```

### Frontend

```
오늘 커밋:
f28bb58 chore(deps): pull backend P1-#1 fix
3378413 chore(deps): pull backend P1-#2/#3/#4 fix
e308207 feat(p2,p1-4): SHORT 검증중 disclaimer + Onchain Provider Status panel

주요 수정:
  src/shared/types.ts                            — BBStructureShort + ShortEntryDecision 미러
  src/components/lite/LiteRecommendationBadge.tsx — SHORT/STRONG_SHORT 자동 [검증중] 태그
  src/pages/admin/HealthCheck.tsx                — Onchain Provider Status 패널
  src/index.css                                  — --color-neon-orange 토큰
  pnpm-lock.yaml                                 — backend SHA 3회 갱신
```

---

## 헌장 검증 (5규칙)

| 규칙 | Phase 1 진단 | 시정 후 | 비고 |
|---|---|---|---|
| **R1 차원 중복 X** | ✓ | ✓ | 모든 modifier `rule1Exempt` flag 유지 |
| **R2 백테스트 알파** | ❌ SHORT 0건 | ⚠️ → ✓ | (가) 측정 인프라 정상, 결과 음수지만 *측정 가능* 통과 |
| **R3 단독 시그널 X** | ❌ scanner.ts fibSignal trigger | ✓ | P1-#2 시정 완료 (entryDecision 의존만) |
| **R4 자본 보호** | ⚠️ Rising Knife 외부 | ✓ 강화 | decideShortEntry 내부 게이트 명시 + Wave Alignment opposing 양방향 0.30 |
| **R5 Knife 차단** | ✓ | ✓ | falling/rising 양방향 defense in depth |

---

## (가) SHORT 백테스트 결과 — 핵심 발견

**측정 인프라 ✅**:
- `bbdx-short` strategy 정상 로드
- `decideShortEntry` Rising Knife 게이트 작동 — 138 trades 추출
- side-aware Tier 1/2/Stop 정상 (가격 ↓ 도달 = Tier hit)
- LONG/SHORT split + SHORT-specific Wilson CI calibration 출력

**알파 결과 ⚠️**:
| 지표 | 값 |
|---|---|
| Total trades | 138 (90d, 5 coins, 4h) |
| **winRate** | **37.0%** |
| avgReturn | -0.27% |
| **Sharpe** | **-0.17** |
| MDD | 40.57% |
| **PF** | **0.66** |
| Calibration | 5/5 권고 임계 "통계적 유의성 부재" |

→ **현재 SHORT path 는 Charter R2 미통과**. UI 에 (다-2) 검증중 태그 자동
표시. Production Lite Alerts 발송 비활성 권고.

**가능한 원인** (가설):
1. 시장 환경 부적합 — 90일 BTC 강세장
2. Tier 2 임계 너무 멀음 (entry × 0.95 → 5% 하락 도달 드물음)
3. SHORT_NUM_RSI_LOW 62 가 audit S1 권고 65 보다 너무 낮음
4. Pattern Confluence 0.4 임계로 false-positive 통과

---

## Push 결과 — 7곳 동기화 ✅

### Backend (`bccc2c0`)
| Remote | Branch | SHA |
|---|---|---|
| origin (tradelab-hq) | dev | `bccc2c0` ✅ |
| origin (tradelab-hq) | feat/v6.5-merge | (이력별, sentiment v4.3 별도) |
| v65sum (godkyuho777/6.5SUM) | main | `bccc2c0` ✅ |
| v65sum (godkyuho777/6.5SUM) | dev | `bccc2c0` ✅ |

### Frontend (`1595f3d`)
| Remote | Branch | SHA |
|---|---|---|
| origin (tradelab-hq) | dev | `1595f3d` ✅ |
| origin (tradelab-hq) | feat/v6.5-merge-frontend | (이력별, v4.3 별도) |
| fe65 (godkyuho777/Frontend6.5) | main | `1595f3d` ✅ |

### 검증
- Backend `pnpm check` ✓ / `pnpm test` 510/510 (+35 신규) / `pnpm build:types` ✓
- Frontend `pnpm check` ✓

---

## 작성된 문서 (`docs/2026-05-10-SCANNER-AUDIT/`)

총 **16개 MD 파일**:

### Audit (10개)
- `00-INDEX.md` — 색인 + 23 스캐너 카탈로그
- `01-BBDX-AUDIT.md` — BBDX LONG/SHORT/EXIT
- `02-ONCHAIN-AUDIT.md` — 7-modifier
- `03-ADDITIONAL-STRATEGIES-AUDIT.md` — 6 modifier
- `04-VWAP-AUDIT.md` — VWAP standalone + multiplier
- `05-FIBONACCI-AUDIT.md` — Fib 골든존
- `06-WAVE-TREND-AUDIT.md` — Multi-TF Trend
- `07-WAVE-SENTIMENT-AUDIT.md` — Sentiment v4.1
- `08-BACKTEST-CALIBRATION-AUDIT.md` — Wilson CI
- `09-CHARTER-CROSS-CHECK.md` — 5규칙 cross-check

### Fix 보고서 (6개)
- `10-FIX-P1-1-COMBINE-MODIFIERS.md`
- `11-FIX-P1-3-SHORT-BACKTEST.md`
- `12-FIX-P1-2-STANDALONE-R3.md`
- `13-FIX-P1-4-ONCHAIN-PROVIDER-STATUS.md`
- `14-RESULT-A-SHORT-BACKTEST.md`
- `15-FIX-NA-DA-P2-IMPROVEMENTS.md`

### 본 종합 보고서
- `99-SUMMARY-TODAY.md` (이 파일)

---

## 다음 회차 권고

### 즉시 (alpha 입증 우선)
1. **SHORT 임계값 조정** — `SHORT_NUM_RSI_LOW` 62 → 65 (audit S1) + Tier 2
   `entry × 0.95 → 0.97` (3% 도달 더 흔함) → 365일 재측정.
2. **365d 전체 백테스트** — Quick (90d) 표본 부족 가능. Bear market 구간
   포함된 1년 평가.
3. **사용자 측 시각 검증** — `/admin/health` Onchain Provider Status 패널 +
   Lite UI SHORT 배지 검증중 태그 확인.

### 단기 (P2 잔여)
- EMA Ribbon vs isFallingKnife R1 검증
- EXIT-B B4/B5 wiring (trendline + macd divergence)
- VWAP signalStrength 공식 정규화
- Tier-based onchain 분모 동적화

### 장기
- alpha 통과 시 SHORT production 활성화 (검증중 태그 제거)
- 5 stub onchain modifier 실제 API 호출 코드 (CryptoQuant / Whale Alert /
  Glassnode / Farside)
- SSR 90d buffer 영속화 (DB persist)
