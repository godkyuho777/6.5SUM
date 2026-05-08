# VWAP Strategy 감사 보고서 + 개선 제안

> **작성일:** 2026-05-09
> **대상 브랜치:** `feat/v6.5-merge` (HEAD `db8de44`)
> **감사 대상:** Parker Brooks 스타일 VWAP 전략 구현
> **명세서:** `VWAP_STRATEGY.md` (repo 루트, 956줄)
> **목적:** 사용자 검토용 + 본 세션이 진행할 개선 작업의 근거 문서

---

## 1. 한 줄 요약

VWAP 누적식 공식 + EMA(9) 는 정확히 구현됐으나, **Volume Profile (HVN/POC/LVN/VA), 표준편차 밴드, 멀티 TF 정합, Pullback "터치+반등" 검증** 이 모두 부재. 명세서의 5가지 진입 조건 중 2~3 개만 검증 가능. 헌장 규칙 3 (단독 시그널 금지) 위반 의심 — `VwapSignal` 이 BBDX 와 병렬로 단독 발행 중.

---

## 2. 현재 구현 인벤토리

### 백엔드 핵심 파일

| 파일 | 라인 | 역할 |
|---|---|---|
| `src/indicators.ts` | 1080~1225 | `calculateVWAP`, `calculateEMA`, `vwapPosition`, `emaPosition`, `detectPullback`, `decideVwapSignal` |
| `src/scanner.ts` | 144~183 | VWAP 시그널을 `CoinScanResult` 에 통합 |
| `src/shared/types.ts` | 181~192 | `VwapPosition`, `EmaPosition`, `VwapSignal` 타입 |

### 함수 시그니처 요약

```ts
calculateVWAP(candles: Candle[]): number
calculateEMA(values: number[], period: number): number
vwapPosition(price: number, vwap: number): "ABOVE" | "BELOW" | "AT"
emaPosition(price: number, ema: number): "ABOVE" | "BELOW" | "AT"
detectPullback(candles, vwap, ema9): boolean
decideVwapSignal(price, vwap, ema9, pullback, volRatio): VwapSignal | null
```

### 신호 강도 (현재)

```
strength = vwapDistanceScore (max 35)    # VWAP 거리 17.5%당 35점
         + emaScore (25 if aligned, 12.5 partial)
         + volScore (max 25)              # volumeRatio 1.2~ → 만점
         + pullbackScore (15 if pullback else 0)
임계: strength >= 50 시 시그널 발행
```

---

## 3. 명세서 (VWAP_STRATEGY.md) 핵심 요구사항

| 요소 | 요구사항 |
|---|---|
| VWAP 공식 | 누적식 `Σ(typicalPrice × volume) / Σvolume` (§4.1) |
| 대표가격 | `(H + L + C) / 3` |
| EMA(9) | k = 0.2 표준 |
| **Volume Profile** | **24개 bin, POC, HVN (1.5×avg), LVN (0.5×avg), 70% Value Area** (§6) |
| **표준편차 밴드** | **1σ, 2σ, 3σ** (§6.3) |
| 진입 조건 (LONG) | (1) 가격>VWAP, (2) EMA>VWAP, (3) EMA 되돌림 반등, (4) HVN/POC 지지, (5) LVN 위 |
| Pullback | "5 캔들 윈도우 내 터치 + 다음 캔들 반등 확인" |
| **신호 점수** | **5 컴포넌트 (25 + 20 + 25 + 15 + 15)** (§9.1) |
| **멀티 TF** | **15m/30m/1h/4h/1d 정합 체크** (§3.2) |
| 최소 데이터 | 20+ 캔들 (§3.2) |

---

## 4. Gap 분석 (명세서 vs 실제)

| # | 항목 | 명세서 | 실제 | 차이 | 영향도 |
|---|---|---|---|---|---|
| 1 | VWAP 누적 공식 | ✓ | ✓ | 일치 | — |
| 2 | EMA(9) | ✓ k=0.2 | ✓ | 일치 | — |
| 3 | **Volume Profile (HVN/POC/LVN/VA)** | 24-bin + POC + HVN/LVN + 70% VA | ❌ 미구현 | **MISSING** | ★★★★★ |
| 4 | **VWAP 표준편차 밴드 (1σ/2σ/3σ)** | 3단 | ❌ 미구현 | **MISSING** | ★★★★ |
| 5 | EMA 되돌림 (5 캔들 + 반등) | 터치 + 반등 캔들 확인 | △ proximity (0.5%) 만 | **PARTIAL** | ★★★ |
| 6 | 진입 조건 5가지 | 5 all() | △ 2개 (방향, EMA 정렬) | **INCOMPLETE** | ★★★★ |
| 7 | 신호 강도 5 컴포넌트 | (25/20/25/15/15) | △ 4 컴포넌트 (35/25/25/15) | **PARTIAL** | ★★★ |
| 8 | **멀티 TF 정합** | 1H/4H/1D | ❌ 단일 TF | **MISSING** | ★★★ |
| 9 | 거래량 z-score | 이상치 탐지 | △ ratio 만 | **PARTIAL** | ★★ |
| 10 | Anchored VWAP | 옵션 | ❌ 누적식만 | **MISSING** | ★★★ |
| 11 | VWAP 단위 테스트 | 필수 | ❌ 0 개 | **MISSING** | ★★ |
| 12 | 룩어헤드 안전 | 필수 | ✅ 안전 | 일치 | — |

---

## 5. 6대 의심 지점 검증

### 5.1 룩어헤드 위험
✅ **PASS** — `calculateVWAP` 은 매개변수 candles 만 사용, 미래 참조 0. `scanner.ts` 가 100 개 캔들만 fetch.

### 5.2 표준편차 밴드 부재
❌ **FAIL (★★★★)** — Bollinger Bands(BB) 는 있으나 VWAP 전용 1σ/2σ/3σ 밴드 미구현. 명세서 §6.3 명시. 진입 조건 4·5번이 이 밴드 또는 Volume Profile 에 의존.

### 5.3 Anchored VWAP 미지원
❌ **FAIL (★★★ 영향, 본 plan 에서 연기)** — 누적식만 있어서 FOMC/halving/local-low 같은 이벤트 기준 reset 불가. 본 plan 에서는 다음 작업으로 연기 (프론트엔드 anchor 선택 UI 와 함께 도입 예정).

### 5.4 BBDX 통합 미흡 (헌장 규칙 3)
❌ **FAIL (★★★★)** — `VwapSignal { side: 'LONG'|'SHORT', strength, reasons }` 형태로 단독 발행 + `EntryDecision` 과 병렬 → 사용자가 둘 중 하나만 보고 진입 가능. **헌장 규칙 3 위반 (단독 시그널 금지)**. → **이번 작업의 Phase 3 에서 modifier 로 통합**.

### 5.5 멀티 TF 정합 부재
❌ **FAIL (★★★)** — `scanCoin(symbol, interval)` 이 단일 TF 만 평가. 명세서 §3.2 의 1H/4H/1D 교차 검증 로직 없음. 사용자가 수동으로 TF 전환해야 함.

### 5.6 거래량 z-score 미사용
⚠️ **PARTIAL (★★, 연기)** — 단순 ratio (5캔들 / 전체 평균) 만 사용. z-score 기반 이상치 탐지는 후속 작업.

---

## 6. 헌장 검증 (STRATEGY_CHARTER.md)

| 항목 | 결과 | 근거 |
|---|---|---|
| 7차원 매핑 | 4번(거래량) + 5번(시장구조) — Volume Profile 의 HVN/POC/LVN 이 두 차원 모두 측정 | `VWAP_STRATEGY.md §1` |
| 규칙 1 (차원 중복 X) | ✅ 통과 — VWAP 만으로 모멘텀(RSI), 변동성(BB), 추세(ADX), 거시, 온체인 차원에 진입 X | |
| 규칙 2 (백테스트 알파) | ⚠️ 미검증 — `v65_vs_v64.test.ts` 부재, VWAP 가중치 calibration 미완료 | 후속 작업 |
| **규칙 3 (단독 시그널 X)** | ❌ **위반 의심** | 위 5.4 |

→ **본 plan Phase 3 에서 modifier 통합으로 규칙 3 풀 준수**.

---

## 7. 개선 우선순위 (10개)

| # | 개선사항 | 영향도 | 본 plan 포함? |
|---|---|---|---|
| 1 | Volume Profile (HVN/POC/LVN/VA) 모듈 | ★★★★★ | ✅ Phase 2A |
| 2 | VWAP 표준편차 밴드 (1σ/2σ/3σ) | ★★★★ | ✅ Phase 2B |
| 3 | Pullback v2 (터치 + 반등 검증) | ★★★ | ✅ Phase 2C |
| 4 | VWAP/BBDX modifier 통합 (헌장 규칙 3) | ★★★★ | ✅ Phase 3 |
| 5 | 멀티 TF 정합 헬퍼 | ★★★ | ✅ Phase 2D |
| 6 | 거래량 z-score 검증 | ★★ | ❌ 후속 |
| 7 | Anchored VWAP 옵션 | ★★★ | ❌ 후속 (UI 와 함께) |
| 8 | VWAP 단위 테스트 (15+) | ★★ | ✅ Phase 2F |
| 9 | 신호 강도 5-컴포넌트 재정렬 | ★★★ | ✅ Phase 2E |
| 10 | 프론트엔드 Volume Profile 시각화 | ★★ | ❌ 후속 (frontend 작업) |

---

## 8. 본 작업으로 진행할 항목 (Phase 2 + 3)

### Phase 2A — Volume Profile 모듈 (`src/volume-profile.ts` 신규)
24-bin Volume Profile + POC + HVN (>1.5× avg) + LVN (<0.5× avg) + 70% Value Area.

### Phase 2B — VWAP 표준편차 밴드 (`indicators.ts` 확장)
volume-weighted variance 기반 1σ/2σ/3σ 밴드.

### Phase 2C — Pullback v2 (`indicators.ts` 확장)
"5 캔들 내 터치" + "후속 1~2 캔들 반등 확인" 패턴 검증, `PullbackQuality` 객체 반환.

### Phase 2D — 멀티 TF 정합 (`src/vwap-multi-tf.ts` 신규)
1H/4H/1D 의 VWAP 신호 방향 일치도 체크. `aligned`/`partial`/`mixed`/`neutral` 4 단계.

### Phase 2E — 신호 강도 5-컴포넌트 (`indicators.ts` 의 `decideVwapSignal` 수정)
명세서 §9.1 의 (25 + 20 + 25 + 15 + 15) 가중치 적용.

### Phase 2F — VWAP 단위 테스트 (`src/indicators-vwap.test.ts` 신규)
vitest 15+ 케이스: VWAP 공식, 표준편차 밴드, Pullback v2, Volume Profile.

### Phase 3 — VWAP modifier 통합 (헌장 규칙 3)
`vwapToMultiplier(VwapSignal | null): number` 헬퍼 + `EntryDecision.vwapMult?: number` optional 필드. `final_confidence = base × confluence × wave × macro × onchain × (vwapMult ?? 1.0)` 흐름에 포함.

---

## 9. 본 작업에서 제외 (후속 작업)

- **Anchored VWAP** — 프론트 anchor-timestamp 선택 UI 와 함께 도입
- **거래량 z-score** — 영향도 ★★ 라 후속
- **프론트엔드 Volume Profile 히트맵** — 백엔드 산출물 검증 후
- **임시값 calibration** (VWAP modifier multiplier 0.7~1.3 등) — 백테스트 엔진으로 도출
- **BBDX `entry.ts`/`exit.ts` 코어** — 다른 Opus 세션 영역

---

## 10. 백테스트 가설 (개선 후 예상)

| 메트릭 | 현재 (가정) | 개선 후 가설 | 검증 방법 |
|---|---|---|---|
| 승률 (Win Rate) | ~50% (조건 2개만) | 55~60% (조건 5개) | `v65_vs_v64.test.ts` 후속 |
| False positive | ~30% | ~15% (Volume Profile 지지 검증) | 동상 |
| MDD | -10% | -7% (멀티 TF 정합 시 진입 절제) | 동상 |
| Sharpe | 1.2 | 1.5+ | 동상 |

⚠️ 위 수치는 가설. 실제 검증은 백테스트 엔진으로 후속.

---

## 11. 위험 / 미해결

1. **Volume Profile 24-bin 가정**: 변동성 큰 코인은 bin 수 부족 가능. 적응형 bin 옵션은 후속.
2. **표준편차 밴드 vs Bollinger Bands 시각 혼동**: UI 라벨 명확화 필요 (frontend 작업).
3. **`vwapMult` 임시값 (0.7~1.3)**: 백테스트로 calibration 필요. 현재는 직관 기반.
4. **dist/types 누락 시 Vercel 빌드 깨짐**: `pnpm build:types` 강제 검증.
5. **다른 Opus 세션의 BBDX 코어 작업과 충돌**: `EntryDecision` 인터페이스에 optional 필드 추가만 — 머지 충돌 최소화.

---

## 12. 검증 절차

```powershell
cd tradelab-backend
pnpm check                                            # tsc --noEmit
pnpm test                                             # vitest, 회귀 0 + 신규 15+ pass
pnpm build:types                                      # dist/types 갱신
git log feat/v6.5-merge --oneline -10                 # 커밋 분리 확인

# 푸시
git push origin feat/v6.5-merge                       # tradelab-hq
git push v65sum feat/v6.5-merge:main                  # 6.5SUM 미러
```

---

## 13. 후속 작업 (별도 plan 으로)

1. Anchored VWAP — 프론트엔드 anchor 선택 UI + 백엔드 reset 로직
2. 거래량 z-score 모듈 (Volume Profile 보강)
3. `vwapMult` calibration — 백테스트 엔진 결과로 임시값 교체
4. 프론트엔드 `/vwap` 페이지에 Volume Profile 히트맵 + std-dev 밴드 시각화
5. `v65_vs_v64.test.ts` 백테스트 비교 (VWAP modifier on/off)
6. 다른 Opus 세션의 BBDX 코어 머지 후 `vwapMult` 가 `final_confidence` 곱셈에 정확히 반영되는지 회귀 검증

---

작성: 본 세션 (VWAP Strategy 개선 담당)
다음 검토: 다른 Opus 세션의 BBDX v6.5 코어 머지 후
