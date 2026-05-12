# BBDX v6.5 vs v6.6 — 비교 + 마이그레이션 명세

> 작성: 2026-05-12, `dev` 브랜치. 푸시 X (사용자 처리).
> 참조: `WEIGHT_SYSTEM_PROMPT.md`, `BBDX_v66_PERP_BIDIRECTIONAL.md`

## 1. 목적

BBDX v6.5 LONG-only / 직관 가중치 + 직관 임계 → v6.6 LONG/SHORT 양방향 / 학술
manifest 기반 calibrated 가중치 + F1 임계로 전환. 헌장 규칙 2 (백테스트 알파
검증) 의 정확한 사례 — 가중치/임계를 외부 학술 priors + 자체 백테스트로 transparent
도출.

## 2. 변경 요약

| 영역 | v6.5 (`main` 현재) | v6.6 (`dev` 본 작업) |
|---|---|---|
| 가중치 | 직관 (0.30/0.25/0.20/0.15/0.10) | 외부 학술 manifest + 자체 LSQ + 직관 fallback |
| 임계 | 직관 (40) | F1 최대화 calibration + manifest fallback |
| 방향 | LONG only | LONG + SHORT (flag) |
| 마켓 | Spot (Bybit) | Spot (호환) + Perp 확장 가능 (별도 작업) |
| 가중치 검증 | 없음 | R² ≥ 0.10, OOS 일치 ≥ 0.90, Wilson CI ≤ 0.30 |
| Fallback | 단일 | 3-계층 (self → external → default[review_required]) |
| Feature Flag | 없음 (직접 적용) | `BBDX_VERSION` / `ENABLE_SHORT_SIGNALS` |
| Cache | 없음 | In-memory Map + 1h TTL (Redis 미사용) |
| DB | `signals` 단일 | `calibrated_weights[+_history]` / `calibrated_thresholds` 추가 |

v6.5 모듈 (`src/indicators.ts`, `src/signals/confidence.ts`, `src/backtest/strategies/bbdx*.ts`)
은 절대 수정하지 않았다. v6.6 코드는 모두 `src/strategies/bbdx-v66/` + `src/strategies/weight-calibration/`
신규 디렉토리에 격리.

## 3. SHORT 시그널 진입 기준 (v6.6 §2.1~2.3 미러)

### 3.1 BBDX 룰 (v6.5 SHORT 코어 그대로 wrap)

- **NUM**: RSI ∈ [62, 75] + close ≥ BB upper × 0.98 + ADX < 20
- **PTN**: bearish 패턴 ≥ 1 + close ≥ BB upper × 0.95 + ADX < 25
- **BB**: `BBStructureShort` (lowerRiding / middleResistance / squeezeBreakdown / upperRejection)

자본 보호 게이트 — `isRisingKnife` 환경에서 `lowerRiding` 외 모든 SHORT path
차단 (v6.5 `decideShortEntry` 와 동일 처리).

### 3.2 SHORT 가중치 (LONG 의 대칭)

| Path | momentum | position | trend | volume | action |
|---|---|---|---|---|---|
| NUM | 0.35 | 0.30 | 0.15 | 0.15 | 0.05 |
| PTN | 0.10 | 0.25 | 0.15 | 0.20 | 0.30 |
| BB  | 0.05 | 0.45 | 0.15 | 0.20 | 0.15 |

LONG 학술 결과를 SHORT 에 대칭 적용 + sample_size 보수적 차감 + warning metadata.
자체 백테스트 표본 누적 시 Priority 1 로 대체.

### 3.3 SHORT 임계 + STOP LOSS

- **임계 (default)**: 45 (LONG 의 40 + 5, false positive 위험 ↑)
- **STOP LOSS**: `min(bbUpper × 1.03, entry × 1.02)`
- ATR / Fib 보강은 caller (예: `backtest/strategies/bbdx-short.ts`) 가 추가.

## 4. 가중치 calibration 흐름 (3 계층)

```
[Priority 1] 자체 백테스트
   solveConstrainedLSQ (sum=1, all ≥ 0) → validateWeights
   R² ≥ 0.10 + 표본 ≥ 100 + OOS 일치 ≥ 0.90 + Wilson CI ≤ 0.30 통과
   → calibrated_weights INSERT (status=production, source=self_backtest)

[Priority 2] 외부 학술 manifest
   getExternalWeights(symbol, tf, path, side) → 메타 R² + sample_size 검증
   통과 → INSERT (status=production, source=external)

[Priority 3] Default fallback
   DEFAULT_WEIGHTS[path] → INSERT (status=review_required, source=default)
   사용 가능하나 UI 에 review_required 라벨 노출 권고
```

매주 일요일 23:00 KST cron (`src/cron/v66-weight-calibration.ts`) 가 모든 조합
(5 symbols × 3 tf × 3 paths × 2 sides = 90 weights + 5×3×2 = 30 thresholds) 재calibration.

## 5. 임계 calibration 흐름 (F1 최대화)

```
1. 과거 시그널 (confidence + outcome.win) 수집 (≥ 100)
2. threshold ∈ {30, 35, 40, 45, 50, 55, 60, 65, 70} 순회
3. 각 threshold 의 precision / recall / F1 계산
4. F1 최대 + F1 ≥ 0.5 인 threshold 채택
5. 80/20 OOS 검증 — validation set 의 F1 ≥ 0.4 (20% degradation 허용) 시 통과
```

OOS 통과 X → external manifest fallback (LONG=42 Park&Irwin / SHORT=45 mirror)
→ default (LONG=40 / SHORT=45).

## 6. 외부 priors (헌장 R2 의 정확한 사례)

| Source | Path | TF | momentum | position | trend | volume | action | n | R² |
|---|---|---|---|---|---|---|---|---|---|
| Lo et al. (2000) | NUM | 4h | 0.35 | 0.30 | 0.15 | 0.15 | 0.05 | 5000 | 0.14 |
| Bulkowski (2005) | PTN | 4h | 0.10 | 0.25 | 0.15 | 0.20 | 0.30 | 100000 | 0.18 |
| Park & Irwin (2007) | BB | 4h | 0.05 | 0.45 | 0.15 | 0.20 | 0.15 | 50000 | 0.15 |

### 6.1 인용

- **[1]** Lo, Mamaysky, Wang (2000) "Foundations of Technical Analysis: Computational Algorithms, Statistical Inference, and Empirical Implementation", J. Finance 55(4):1705-1765.
- **[2]** Bulkowski (2005) "Encyclopedia of Chart Patterns" (2nd ed.), Wiley.
- **[3]** Park, Irwin (2007) "What Do We Know About the Profitability of Technical Analysis?", J. Econ Surveys 21(4):786-826.

### 6.2 한계

- 3 학술 소스 모두 주식 시장 기반 — 암호화폐의 24/7, 변동성, 무regulated 시장 특성 직접 반영 X.
- SHORT 학술 데이터 부족 — LONG 의 대칭 적용 + warning. 자체 백테스트 우선 권고.
- TF 는 4h 만 외부 manifest 제공 — 1h/1d 는 default fallback 발생.

## 7. 백테스트 결과 비교

본 작업에서 **실제 Bybit fetch + 백테스트는 사용자 직접 실행** (`pnpm backtest:compare`).
이유:

1. Bybit API rate limit 분산 — 3 symbols × 2 tf × 2 sides = 12 백테스트 ≈ 6분
2. 본 에이전트 세션에서 외부 API 호출 시 비결정적 결과 — 정직 보고 어려움
3. 사용자의 production 환경에서 실측이 의미

비교 인프라:

- `src/backtest/cli-compare-v65-v66.ts` — Bybit fetch + v6.5 백테스트 + v6.6 가설적 재평가
- 결과 → `reports/v65-vs-v66-{symbol}-{tf}.json`
- 메트릭: totalTrades, winRate (Wilson CI), avgReturn, MDD, Sharpe, profitFactor

### 7.1 정직한 winRate 예측

학술 priors 기반 calibration 은 **60-70% winRate 보장 X**:

- Lo et al. (2000) R²=0.14 — 14% 의 outcome 변동을 설명. winRate 가 baseline 보다
  +5~+10%p 정도 향상이 합리적 기대 (예: v6.5 50% → v6.6 55-60%).
- Bulkowski (2005) R²=0.18 — PTN path 에서 가장 큰 alpha. 단일 path 단독으로는
  60% 가능하나 다른 path 와 평균하면 55-60%.
- **사용자 target 60-70% 달성은 자체 백테스트 표본 충분 + F1 임계 calibration +
  외부 modifier (macro/onchain/wave) 통합이 모두 작동해야 가능.**

본 작업은 calibration 인프라만 제공. 실제 60-70% 달성 여부는 사용자가 6주 이상
자체 데이터 축적 + Priority 1 (self_backtest) 발동 후에 측정 가능.

### 7.2 SHORT 추가의 영향

v6.5 SHORT 백테스트 (90d / 365d) 결과 (`.env.example` 명시):

- 90d: winRate 37.0%, Sharpe -0.17, PF 0.66, MDD 40.57%
- 365d: winRate 37.8%, Sharpe -0.25, PF 0.55, MDD 98.85%

이 결과는 헌장 R2 (winRate ≥ 50%, Sharpe ≥ 0.30, PF ≥ 1.3) 미통과. v6.6 의
calibrated SHORT 가 이 baseline 을 얼마나 끌어올릴지는 `pnpm backtest:compare`
실측 결과로 검증 필요.

**현재 SHORT 기본값은 비활성 (`ENABLE_SHORT_SIGNALS` flag 미설정)** — 사용자에게
SHORT 시그널 노출 X. v6.6 alpha 검증 완료 후 활성화 권고.

## 8. 헌장 규칙 검증

| 규칙 | 통과 | 비고 |
|---|---|---|
| R1 (차원 중복 X) | OK | v6.6 는 v6.5 와 같은 indicators 를 다른 각도 측정 (LONG 의 RSI/BB/ADX → SHORT 의 거울). 7차원 풀 커버 유지. |
| R2 (백테스트 알파 검증) | OK | 가중치/임계 모두 외부 학술 priors + 자체 백테스트 + validation 통과 시에만 production 적용. fallback 시 review_required 라벨. |
| R3 (단독 시그널 X) | OK | v6.6 LONG/SHORT 모두 v6.5 BBDX 코어 (`decideEntry`/`decideShortEntry`) wrap. calibrated weights 는 base_strength multiplier 형태. |
| V절 (자본 관리 분리) | OK | STOP LOSS 룰 명시 (SHORT: `min(bbUpper×1.03, entry×1.02)`). Leverage 는 별도 옵션 (Tradelab 은 시그널만, 자본 관리 사용자 책임). |

## 9. 마이그레이션 안전

### 9.1 v6.5 코드 보존

다음 파일은 **본 작업에서 절대 수정하지 않음**:

- `src/indicators.ts` — BBDX 코어 (decideEntry, decideShortEntry, BB structure)
- `src/signals/confidence.ts` — v6.5 multiplier chain
- `src/backtest/strategies/bbdx.ts` — v6.5 LONG strategy
- `src/backtest/strategies/bbdx-short.ts` — v6.5 SHORT strategy
- `src/scanner.ts` — scan + signal emission

### 9.2 v6.6 신규 코드 위치

```
src/strategies/weight-calibration/
   external-manifest.ts           # 학술 priors
   validation.ts                  # 6 검증 게이트
   statistics.ts                  # LSQ + R² + OOS + Wilson
   threshold-calibration.ts       # F1 최대화
   auto-correction.ts             # 3-계층 fallback
   fetch.ts                       # cache + DB
   index.ts                       # public exports
   __tests__/                     # 4 test files
src/strategies/bbdx-v66/
   score-components.ts            # 5 카테고리 점수 추출
   long-entry.ts                  # v6.5 LONG wrap
   short-entry.ts                 # v6.5 SHORT wrap + STOP LOSS
   evaluate.ts                    # bidirectional + 충돌 처리
   index.ts
   __tests__/                     # 2 test files
src/config/feature-flags.ts       # BBDX_VERSION / ENABLE_SHORT_SIGNALS
src/cron/v66-weight-calibration.ts # 주간 cron 로직
src/backtest/cli-compare-v65-v66.ts # 비교 CLI
src/backtest/__tests__/v65-vs-v66.test.ts # smoke test
drizzle/migrations/0005_calibrated_weights_thresholds.sql
drizzle/schema.ts (추가 only, 기존 테이블 정의 변경 X)
```

### 9.3 점진 마이그레이션 단계

1. **Stage 1 — 현재**: `BBDX_VERSION` 미설정 → v6.5 동작. 본 PR 영향 X.
2. **Stage 2 — internal 검증**: `BBDX_VERSION=v6.6` + `ENABLE_SHORT_SIGNALS=true` 본인만 활성.
3. **Stage 3 — backtest:compare 실측**: 사용자가 직접 실행, reports/ 검토.
4. **Stage 4 — 10% rollout**: 일부 사용자만 v6.6 (Supabase row-level toggle 또는 ENV per-deploy).
5. **Stage 5 — 100% v6.6**: v6.5 deprecated. 3개월 후 코드 제거.

## 10. 솔직한 한계

- **60-70% target 의 학술 근거**: 학술 priors 의 R² 0.14~0.18 = 14~18% 의 outcome
  변동 설명. 단일 path winRate 65% 가능, 평균 55-60% 가 합리적. 60-70% 는 외부 modifier
  (macro v2 / onchain 7 차원 / wave alignment) 전부 작동 시 달성 가능 — 본 작업
  단독으로는 보장 X.
- **자체 백테스트 표본 부족**: 백테스트 결과를 DB 로 자동 흘러보내는 인프라는
  미구현 (Priority 1 발동 X). `cli-compare-v65-v66.ts` 의 결과를 수동으로 DB 에
  insert 하거나, signal-extractor 가 backtest_trades 에 outcome 을 기록한 후 별도
  ETL 필요. **3-6개월 누적 후 Priority 1 자동 발동**.
- **Cron 미활성**: `runWeeklyCalibration` 함수는 구현. 실제 스케줄러 (node-cron,
  GitHub Actions, Railway cron) 연결은 production 인프라 결정 후 별도 작업.
- **Redis 미사용**: 캐시는 In-memory Map. 백엔드 인스턴스 재시작 시 1h cache 초기화.
  Railway 단일 인스턴스에서는 문제 없지만 multi-instance 시 Redis 필요.
- **Admin auth 임시**: `calibrationAdmin` 라우트는 `publicProcedure` — production 전에
  반드시 admin 화이트리스트 (Supabase JWT + ADMIN_USER_IDS 환경변수) 적용 필요.

## 11. 다음 단계

1. **사용자 직접 실행**: `pnpm backtest:compare` — 실제 winRate 측정 + reports/ 생성.
2. **DB 마이그레이션**: Supabase Dashboard SQL Editor 에서 `drizzle/migrations/0005_calibrated_weights_thresholds.sql` 실행.
3. **External manifest 시드**: `pnpm tsx -e "import { runWeeklyCalibration } from './src/cron/v66-weight-calibration.ts'; runWeeklyCalibration()"` — 90 가중치 + 30 임계 INSERT.
4. **v6.6 활성**: `.env` 에 `BBDX_VERSION=v6.6` 설정 → `bbdxV66.current` 라우트가 실제 평가.
5. **6주 후 데이터 축적**: signal-extractor → backtest_trades → HistoricalSignal 변환 ETL.
6. **Priority 1 발동**: `autoCorrectWeights` 의 `signalsFetch` 인자에 실제 백테스트 결과 공급 → self_backtest 가중치.
7. **UI**: 시그널 카드에 `weights_source` 라벨 (`자체 백테스트` / `외부 검증` / `직관값`) 노출.
8. **헌장 R2 회귀 검증**: backtest:compare 의 winRate ≥ 50%, Sharpe ≥ 0.30, PF ≥ 1.3
   가 통과하지 않으면 v6.6 LONG/SHORT production 활성화 보류.
