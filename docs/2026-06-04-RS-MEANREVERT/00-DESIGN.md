# RS-MeanRevert — BTC 대비 상대 평균회귀 modifier (데이터 발견형)

> **한 줄 요약**: BBDX 롱 진입 알트가 **BTC 대비 과도하게 뒤처졌을 때**(rs30<−5% AND rs7<0 = weak_laggard) 신뢰도를 ×1.12 증폭. "BTC에 디커플링된 알트가 BB 하단에서 더 강하게 mean-revert한다"는 백테스트 발견에 기반. 단독 시그널 X(헌장 규칙3).
>
> **출생 배경**: RS-Rotation("리더를 사라" momentum)이 백테스트 FAIL → **부호 반전**에서 유의 알파 발견. → 이 modifier로 승계.
> **상태**: ✅ **백테스트 PASS — regime-robust (2026-06-04)** (§8). weak_laggard가 UP/SIDEWAYS/DOWN 전 구간에서 baseline 상회 → "하락장 artifact" 가설 기각. 코드+11테스트+combine wiring 완료(`pnpm check`·1011테스트 통과). **남은 것: scanner hot-path 배선 + main 승격**(별도). (signal-engineer 조건부 GO → 게이트 통과)
> **차원**: 1 (Momentum 슬롯 유지, 라벨 "relative mean-reversion")
> **배치**: `src/modifiers/rs-mean-revert.ts`(rs-rotation.ts 부호 반전 복제) → `combineAdditionalModifiers` `rsMeanRevertMult` 키

---

## 1. 발견 스토리 (왜 이 modifier인가)

1. 현재 국면(도미넌스 58%·선택적 알트장)에 맞춰 **RS-Rotation**(BTC 대비 강한 리더 알트 롱 증폭 = momentum)을 제안.
2. 백테스트(top-20·4h·730일·알트 4620 BBDX 롱): **가설 기각**. leader winRate 33.3% < laggard 36.5%.
3. **부호 반전에서 유의 알파**: weak_laggard(rs30<−5% & rs7<0) **40.1%**, Wilson [37.5%, 42.8%] > baseline 34.8% [33.5%, 36.2%] = **CI 비중첩 = 통계적 유의**.
4. **이유**: BBDX는 mean-reversion(BB하단 바운스). momentum RS와 구조적 충돌. "BTC에 가장 뒤진 알트"가 BB하단에서 가장 강하게 반등.

→ momentum이 아니라 **상대 평균회귀**가 BBDX와 맞는 방향. 데이터가 직접 가리킨 modifier.

## 2. 구성 지표 — 세분화 (무엇을 의미 / 왜)

### 지표 ① rs30 — 30일 BTC 대비 상대수익률
- **공식**: `rs30 = log(coin[t]/coin[t−180]) − log(btc[t]/btc[t−180])` (4h 180캔들=30일)
- **무엇을 의미**: 30일간 이 알트가 BTC를 *얼마나 뒤졌나*. 음수 클수록 BTC 대비 디커플링(과매도) 심함.
- **왜**: 절대수익률이 아니라 **BTC 대비**여야 매크로(BTC 등락)를 상쇄. 두 값의 차이는 순수 BTC항 → 고도미넌스일수록 "상대 약세"가 "절대 약세"보다 더 깊게 벌어짐(§3).

### 지표 ② rs7 — RS 7일 기울기 (둔화 확인)
- **공식**: `rs7 = log(coin/btc)[t] − log(coin/btc)[t−42]` (7일)
- **무엇을 의미**: 상대 약세가 *아직 진행 중인지*. weak_laggard는 rs7<0(여전히 뒤지는 중)까지 요구.
- **왜**: rs30<−5%만으론 "이미 반등 시작한 코인"도 포함. rs7<0 AND 조건이 false positive를 줄여 "진짜 과이탈" 구간만 — 백테스트로 검증된 bin 정의라 **임계 변경 금지**.

### 핵심: 왜 절대 과매도(RSI/BB)와 중복이 아닌가 (직교성)
- decideEntry 3-path(BB/PTN/NUM)는 **전부 자기 코인 절대 좌표**(RSI/BB하단/ADX)만 봄 — BTC 시계열 입력 0.
- 4620개가 *전부 이미 BB하단 절대 과매도*인데 그 안에서 weak_laggard가 +5.3%p 분리 → **절대과매도 ⊥ BTC상대약세 직교** (백테스트 증거).
- 의미: weak_laggard가 좋은 건 "더 과매도라서"(그건 RSI가 이미 셈)가 아니라 **알트가 BTC에 과이탈한 뒤의 mean-reversion 탄성**. 측정 각도가 다름(가격의 자기평균 이탈 vs BTC 대비 이탈).

## 3. 합성 — 비대칭 multiplier (증폭만)

| bin | 조건 | RS-Rotation(실패) | **RS-MeanRevert** |
|---|---|---|---|
| strong_leader | rs30>+5% & rs7>0 | 1.15 | **1.00** |
| leader | rs30>+2% | 1.08 | **1.00** |
| neutral | −2%~+2% | 1.00 | **1.00** |
| laggard | rs30<−2% | 0.92 | **1.00** |
| **weak_laggard** | rs30<−5% & rs7<0 | 0.85 | **1.12** |

- **weak_laggard만 ×1.12 증폭, 나머지 전부 1.0.** 
- **억제(<1.0) 전면 제거**: leader/strong_leader(≈33%)는 baseline(34.8%)과 Wilson CI 중첩 → 유의하게 나쁘지 않음. 억제하면 **역최적화**(RS-Rotation이 실패한 바로 그 함정).
- 1.12 근거: 40.1/34.8 = winRate +15% 상대개선, PF 0.69 vs 0.53. 1.15까지 갈 근거 있으나 단일 bin·횡보장 표본이라 보수적 1.12.
- clamp: 1.12 단독은 1.40 안쪽. combine 결과를 `clampMultiplier`로 감싸 회귀 가드.

## 4. ⚠️ 최대 리스크 — 국면 의존성 (머지 게이트)

- 730일 표본은 **하락/횡보장**: baseline PF 0.53<1, weak_laggard PF 0.69<1 — **절대수익은 여전히 손실, "덜 잃을 뿐".** 발견 알파가 "하락장 낙폭과대 반등"일 가능성.
- **bull/altseason regime에선 정반대일 수 있음**: 상승장엔 momentum 작동(leader 승) — 그게 원래 RS-Rotation 가설. 무조건 켜면 상승장에서 weak_laggard(진짜 죽은 코인) 증폭 위험.
- **머지 합격 조건 = regime-split 백테스트**: 730일을 BTC 상승/횡보/하락 서브구간으로 쪼개 weak_laggard 알파가 **모든 구간에서 baseline 상회(robust)** vs **하락 한정(artifact)** 판별. robust면 무조건 활성, 하락 한정이면 BTC.D 게이트(P2) 후 활성.

## 5. 헌장 / 데이터

- 규칙3: `ModifierResult` envelope, multiplier만, stub/error 1.0, throw 없음. ✅
- 차원1 유지·재라벨(momentum→relative mean-reversion). MACD div(절대 다이버전스)와 측정 각도 직교.
- Lookahead-free: rs30/rs7은 `coin[i−180..i]`+`btc[i−180..i]`만. openTime 타임스탬프 조인(인덱스 X). 유니버스 BTCUSDT 강제 포함. spot 캔들만 → 즉시 백테스트.

## 6. 구현 단계

| Phase | 범위 | 검증 |
|---|---|---|
| **P1** | rs-mean-revert.ts(weak_laggard→1.12) + **regime-split 백테스트** | robust면 wiring, artifact면 보류 |
| **P2** | BTC.D regime 게이트(상승장 비활성) | BTC.D 적재 후 |
| **P3** | UI 차원1 뱃지 "상대 평균회귀" | Preview |

## 8. regime-split 백테스트 결과 (2026-06-04) — ✅ PASS (robust)

- **방법**: top-20+BTC벤치, 4h, 730일, 알트 4671 trade. 각 trade를 (진입시점 BTC 30일 수익률) UP(>+5%)/SIDEWAYS/DOWN(<−5%) regime × weak_laggard 여부 교차분류. lookahead-free(openTime 조인, signalTs까지만).

| regime | baseline winRate(n) | weak_laggard winRate(n) | Wilson CI | 분리 |
|---|---|---|---|---|
| UP | 31.5% (1797) | 35.3% (590) | 31.5~39.2% | ✅ +3.8%p |
| SIDEWAYS | 37.1% (1794) | 45.6% (489) | 41.2~50.0% | ✅✅ +8.5%p (CI하한>base) |
| DOWN | 35.7% (1080) | 38.5% (262) | 32.9~44.6% | ✅ +2.8%p |

- **판정 ROBUST**: 3 regime 전부 baseline 상회, 표본 충분(n 262~590). 알파 최강이 SIDEWAYS·UP → **하락장 artifact 가설 기각**(설계서 §4 최대 리스크 부정).
- 교차확인: BTC>50SMA(상승추세) weak_laggard +7.1%p(40.8 vs 33.6). SANITY: baseline 34.8/weak_laggard 40.1 재현(34.6/39.7).
- DOWN·UP은 Wilson 하한이 baseline 점추정을 약간 못 넘는 약분리(점추정 분리), SIDEWAYS만 CI하한 분리 → 보수적 1.12·억제없음 설계와 부합. P2 BTC.D 게이트 불필요(모니터링 권고).

## 9. 구현 상태 (2026-06-04)

- ✅ `src/modifiers/rs-mean-revert.ts` (weak_laggard→1.12, 나머지 1.0, dim1, throw 없음, openTime 조인)
- ✅ `src/modifiers/rs-mean-revert.test.ts` (11 케이스: 분류·억제없음·벤치·부족·clamp 1.40·NaN)
- ✅ `src/modifiers/index.ts` — `rsMeanRevertMult` 키 + combine 결과 `clampMultiplier` 가드
- ✅ `pnpm check` clean, 전체 1011 테스트 통과
- ⬜ `scanner.ts` hot-path 배선(computeRsMeanRevert 호출 + BTC 벤치 캔들 전달) — **미완**(현재 combine은 키 수신만, 라이브 스캔 미적용)
- ⬜ frontend 차원1 뱃지(P3), main 승격

## 7. 갱신 이력

- 2026-06-04 — RS-Rotation 백테스트 FAIL의 부호 반전 알파(weak_laggard 40.1%, Wilson 비중첩)에서 출생. signal-engineer 조건부 GO(regime-split이 머지 게이트). 비대칭 설계(증폭만, 억제 금지).
- 2026-06-04 (2차) — **regime-split 백테스트 PASS**(§8): 3 regime 전부 baseline 상회, 하락장 artifact 아님. 코드+11테스트+combine wiring 완료. scanner 배선·main 승격 후속.
