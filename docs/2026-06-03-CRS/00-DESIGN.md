# CRS — Capitulation Reversal Score (청산 반전 점수)

> **한 줄 요약**: 청산 cascade(롱 강제 청산 플러시)가 **BB 하단**에 착지한 뒤 **falling-knife가 풀린 첫 반등 캔들**에서, 숏 과밀(음수 펀딩) 환경이면 = 고확률 mean-reversion 롱. BBDX 롱 진입 신뢰도를 **곱셈 modifier(1.00~1.15)** 로만 증폭. 단독 시그널 발행 X(헌장 규칙3).
>
> **상태**: ❌ **백테스트 FAIL (2026-06-04)** — CRS-lite alpha 미입증(§10.1). 설계·헌장·lookahead 무결성은 유효하나 현 3-신호 게이트(vel+wick+BB하단)가 BBDX 롱 승률을 개선 못함(CRS활성 27.6% vs baseline 33.0%, n=58). **main 승격 보류** — P2(ΔOI/funding) 추가 또는 exit-신호 재포지셔닝 후 재검토. (설계검토: signal-engineer 2026-06-03 수정필요→Conditional)
> **차원**: 6 (Macro / Derivatives positioning)
> **배치**: 백엔드 modifier (`tradelab-backend/src/modifiers/crs.ts` 신규) → `combineAdditionalModifiers`

---

## 1. 왜 지금(2026-06)인가 — 시장 국면 근거

| 지표 | 현재 값(2026-06-03) | 의미 |
|---|---|---|
| BTC 도미넌스 | ~58% | Bitcoin-led, 풀 알트시즌 아님(알트시즌 인덱스 39~49, 75 미달) |
| BTC 가격 | $68k~70k 박스권 | 컨솔리데이션 — 박스 하단 mean-reversion 빈발 |
| 펀딩 | **66일 연속 음수 스트릭**(2010년대 이후 최장) | **숏 과밀** = 숏 스퀴즈 연료 축적 |
| 청산 | 5/7 하루 $415M, 5월 cascade 다발 | **파생 주도 시장 + 청산 이벤트 활성** |
| 자금 흐름 | 주간 $1.67B 유출 | risk-off, 변동성 급발진 잦음 |

**핵심 논리**: 현재는 *파생상품이 현물을 압도하고, 숏이 과밀하며, 청산 cascade가 자주 터지고, BTC가 박스권 하단을 반복 테스트하는* 국면이다. 이 조합은 **"청산 플러시 → 저점 흡수 → 숏 스퀴즈 반등"** 이라는 mean-reversion 롱 셋업이 가장 자주·가장 깨끗하게 나오는 환경이다. BBDX는 본래 BB 하단 바운스를 노리는 mean-reversion 전략이므로, 이 국면 전용 증폭기가 알파 기여 잠재력이 가장 크다.

## 2. 갭 분석 — 왜 이게 TradeLab에 없나

현 인벤토리(RSI·BB·ADX·ATR / 7 온체인 modifier / Fear&Greed·OI·펀딩·L/S / MACD div·Order block·Funding extreme·Market breadth / VWAP·Volume profile / Fibonacci)에서 **청산(liquidation) 기반 진입 신호가 전무**하다. perpetual 중심 시장을 다루면서도 청산 cascade를 진입 의사결정에 반영하지 않는 것이 가장 큰 구조적 갭이다.

- 기존 `funding-extreme.ts` = 펀딩 *수준(state)* 만 본다(음수면 롱 ×1.10~1.20).
- 기존 sentiment `analyzeWave` = OI *증가* 를 파동 에너지로 본다(BTC 전용, BBDX 미연결).
- **둘 다 "급격한 OI 감소(=강제 디레버리징/청산)라는 이벤트(event)"는 보지 않는다.** CRS가 메우는 각도가 바로 이것.

## 3. 구성 지표 — 세분화 (왜 조합했고 / 무엇을 의미하나)

CRS는 4개의 1차 지표 + 1개 게이트로 구성된다. **각각 단독으로는 노이즈이지만, 동시 발생(confluence)할 때만 "청산 반전"이라는 단일 의미로 수렴**한다.

### 지표 ① ΔOI — Open Interest velocity (미결제약정 속도)
- **공식**: `ΔOI = (OI[t] − OI[t−k]) / OI[t−k]`, k = 3 캔들(4h 기준 ~12h)
- **무엇을 의미하나**: 미결제약정의 *급격한 감소*. 가격이 빠지는데 OI가 같이 급감하면, 그건 새 매도가 아니라 **기존 롱 포지션이 강제 청산(=시장에서 사라짐)** 되는 것이다. 자발적 매도(OI 유지/증가)와 강제 청산(OI 급감)을 구분하는 핵심 신호.
- **왜 조합했나**: 가격 하락만으로는 "추세 지속"인지 "청산 플러시"인지 알 수 없다. ΔOI 급감이 동반돼야 *청산성 하락*임이 확증된다. → 지표 ②(가격 속도)의 의미를 규정하는 컨텍스트.
- **임계 시작값**: 4h `ΔOI ≤ −4%`, 1h `≤ −2.5%`.

### 지표 ② Price velocity — ATR 정규화 하락 속도
- **공식**: `vel = (close[t] − close[t−k]) / ATR[t]`, k = 3
- **무엇을 의미하나**: 변동성(ATR) 대비 *얼마나 빠르게* 떨어졌나. cascade는 정의상 짧은 시간에 큰 폭이 빠진다. ATR로 정규화해 코인별 변동성 차이를 흡수.
- **왜 조합했나**: 청산은 "빠른" 하락이다. 느린 하락(추세적 하락)은 cascade가 아니다. BBDX의 stop 폭이 1.5 ATR이므로, **한 윈도우에 stop 폭만큼 하락 = 비정상 플러시**라는 대칭적 해석.
- **임계 시작값**: `vel ≤ −1.5` (ATR의 1.5배 하락).

### 지표 ③ Lower wick ratio — 하단 꼬리 비율(저점 흡수)
- **공식**: `wick = (min(open, close) − low) / (high − low)` (플러시 직후 캔들)
- **무엇을 의미하나**: 캔들 저점에서 *얼마나 되돌려졌나*. 긴 아래꼬리 = 저점에서 매수세가 받아냄(흡수/거부) = 반전 신호. 청산 플러시의 마지막 신호는 "저점을 찍고 강하게 되돌리는 꼬리".
- **왜 조합했나**: ①②는 "떨어졌다"를 본다. ③은 "되돌리기 시작했다"를 본다. **반전의 트리거**. 이게 빠지면 떨어지는 칼을 잡는 것(falling knife)이 된다.
- **임계 시작값**: `wick ≥ 0.4`.

### 게이트 ④ Funding regime — 펀딩 국면 (binary gate, **amplifier 아님**)
- **공식**: `fundingGate = (fundingRate ≤ −0.0005)` → 통과/탈락(bool)
- **무엇을 의미하나**: 음수 펀딩 = 숏이 롱에게 비용을 지불 = **숏 과밀**. 숏이 과밀할수록 반등 시 숏 청산(스퀴즈)이 연쇄돼 반등이 폭발적.
- **왜 곱셈이 아니라 게이트인가 (⚠️ 검토 핵심)**: 기존 `funding-extreme.ts`가 **이미** 음수 펀딩 *크기* 를 롱 multiplier(×1.10~1.20)로 환산한다. CRS가 펀딩 크기를 또 곱하면 **동일 신호 이중계상(double-count)**. 따라서 CRS는 펀딩을 *크기*가 아니라 *유효성 조건(통과/탈락)* 으로만 쓴다. 크기 증폭은 funding-extreme에 위임.

### 게이트 ⑤ BB 하단 — BBDX 도메인 결속
- **조건**: 가격이 BB 하단 터치/관통.
- **왜**: CRS는 *아무 청산*이 아니라 **BB 하단에서의 청산**만 본다. BBDX가 진입하는 위치(=BB 하단 바운스)와 정확히 묶어, modifier가 자기 도메인 밖에서 발화하지 않게 한다.

### ⚠️ Falling-knife와의 관계 (검토가 정교화한 핵심)
BBDX의 `isFallingKnife`(`−DI>+DI && ADX>25`)는 cascade 급락 캔들 진입을 **차단**한다. CRS는 modifier라 진입을 *생성하지 못한다*. 따라서 CRS가 의미를 갖는 순간은 **플러시 캔들 자체가 아니라, falling-knife가 풀린(ADX≤30 또는 +DI 회복) "직후 첫 반등 캔들"** — 바로 BBDX가 진입을 허용하는 그 캔들이다. 즉 CRS는 자연스럽게 "청산 직후 반등 진입"만 증폭하게 된다. ✅ BBDX 철학과 일치.

## 4. 합성 — multiplier 산출

```
gate = (BB 하단 터치) AND (fundingRate ≤ −0.0005)      // ④⑤ 게이트
if (!gate) → multiplier = 1.00  (중립, 진입 죽이지 않음)

# 게이트 통과 시에만 강도 산출 (①②③, funding 크기는 미사용 = 중복 제거)
strength = w1·norm(ΔOI) + w2·norm(vel) + w3·norm(wick)   // 각 [0,1]
multiplier = 1.00 + strength × 0.15                       // 상한 1.15 (검토 반영: 1.20→1.15)
```

- **하한 1.00**: CRS는 *증폭만* 한다. 진입 차단은 별도 falling-knife 필터가 담당(역할 분리).
- **상한 1.15** (← 검토 반영, 원안 1.20): `funding-extreme`가 동시에 ×1.20을 낼 수 있어, `combineAdditionalModifiers`의 곱셈 누적이 `clampMultiplier` 상한(1.40)을 넘지 않도록 여유 확보.
- **가중치 w1:w2:w3 시작값**: 0.4 : 0.35 : 0.25 (OI 확증 > 속도 > 꼬리). 백테스트로 보정.

## 5. 헌장 준수

- **규칙3(modifier-only)**: `ModifierResult` envelope(`modifiers/types.ts`)로 `multiplier` 필드만 출력, stub/error 시 1.00. 단독 진입 생성 경로 없음. ✅
- **Lookahead-free**: ①②③⑤는 캔들 `[t−k..t]`만 참조(미래 캔들 X). ④ 펀딩/OI 시계열은 **각 캔들 i의 `openTime ≤ ts < 다음 openTime`** 로 정렬 필터(백테스트 snapshot-builder 책임). ✅ 단 §7 데이터 제약 참조.

## 6. signal-engineer 검토 결과 (2026-06-03) — 반영된 3대 수정

1. **펀딩 이중계상 제거** ✅ 반영 — funding을 곱셈 amplifier → binary gate로 강등, 상한 1.20→1.15. 배치는 `combineAdditionalModifiers`(`modifiers/index.ts`)에 `crsMult` 키 추가.
2. **백테스트 검증 경로** ⚠️ 제약 — Bybit OI 히스토리는 4h 기준 ~33일만 보존(실측), `data-loader.ts`는 spot 캔들만 수집. **풀 CRS(ΔOI 포함)는 1년 lookahead-free 재생 불가**. → **CRS-lite**(②price velocity + ③wick + ⑤BB게이트, OI/펀딩 제외)를 먼저 백테스트로 알파 검증. ΔOI/펀딩 게이트는 OI 시계열 forward-collect(DB 적재) 후 Phase 2 검증.
3. **falling-knife 교집합 확인** — "CRS 활성 ∩ BBDX 진입" 빈도를 백테스트로 먼저 측정(교집합 ~0이면 CRS는 사문화). §3 마지막 항목대로 개념상 양립하지만 빈도 실측 필요.

## 7. 구현 단계 (Phase)

| Phase | 범위 | 데이터 | 검증 |
|---|---|---|---|
| **P1 — CRS-lite** | ②price velocity + ③wick + ⑤BB게이트만. `modifiers/crs.ts` + `crsMult` 키 | spot 캔들만(이미 보유) | **lookahead-free 백테스트 가능(즉시)** — CRS on/off 대조, CRS 활성 trade subset 메트릭 분리 |
| **P2 — Full CRS** | + ①ΔOI + ④funding gate | OI/펀딩 시계열(forward-collect 필요) | OI DB 적재 수개월 후 재검증 |
| **P3 — UI** | CRS status 뱃지(차원6, "청산 반전", funding과 별도 표기로 중복 인상 방지) | — | Preview |

## 8. 백테스트 검증 계획 (P1)

- **대조군**: `crsMult=1.0` 고정(off) vs CRS-lite(on). `combineAdditionalModifiers`에 flag.
- **메트릭**: winRate / Sharpe / MDD / PF / Expectancy (`metrics.ts`), **+ Wilson 95% CI**.
- **세그먼트**: CRS는 cascade에서만 활성 → 전체 trade가 아닌 **"CRS 활성 trade subset"** 메트릭 분리(`strategyMeta.crsActive` 기록 후 사후 필터). 전체에 묻히면 의미 없음.
- **유니버스/TF/기간**: BTCUSDT·ETHUSDT·SOLUSDT, 4h, 365d. cascade 데이터 품질이 메이저에서 깨끗.
- **합격 기준(가설)**: CRS 활성 subset의 winRate가 baseline 대비 +5%p 이상 & Wilson lower bound > baseline. 미달 시 임계값 보정 또는 반려.

## 9. 영향 모듈 (구현 시)

- **backend**: `modifiers/crs.ts`(신규), `modifiers/index.ts`(`crsMult` 키), `routers.ts`(modifier 합성 라인), `backtest/composite/snapshot-builder.ts`(P2: OI/펀딩 정렬), `backtest/signal-extractor.ts`(`strategyMeta.crsActive`).
- **frontend**: CRS status 뱃지(차원6 modifier 카드), SignalDetailDialog reason. funding-extreme과 시각적 분리.

## 10. 갱신 이력

- 2026-06-03 — 초안 작성 + signal-engineer 설계 검토(수정필요/Conditional). CRS-lite를 P1 백테스트 대상으로 확정. 현재 국면(숏 과밀 66일·청산 cascade 활성·BTC 박스권) 정합성 근거.
- 2026-06-04 — CRS-lite 코드 초안(crs.ts) dev 푸시 + **백테스트 FAIL**(§10.1). main 승격 보류.

## 10.1 백테스트 결과 (2026-06-04) — ❌ FAIL

- **실행**: top-20 메이저, 4h, 730일(2024-06-04~2026-06-04), 5500 BBDX 롱. cost model(fee 0.1% + slip 0.05%) 차감. lookahead audit 0 violations (PASS).
- **성격**: CRS는 **관측적(observational)** — `bbdx.ts shouldEnter`가 CRS 미참조라 entry set 불변, signal-extractor가 crsActive/crsMult 기록만. "CRS 셋업과 겹친 BBDX 롱이 더 이기는가"를 측정.

| subset | n | winRate | Sharpe | PF | Wilson 95% CI |
|---|---|---|---|---|---|
| Baseline(전체) | 5500 | 33.0% | −0.24 | 0.52 | 31.7~34.2% |
| **CRS 활성** | 58 | **27.6%** | −0.42 | 0.41 | **17.8~40.2%** |
| CRS 비활성 | 5442 | 33.0% | −0.24 | 0.52 | 31.8~34.3% |

- **판정 FAIL**: CRS활성 winRate(27.6%)가 baseline(33.0%)보다 **낮고**, Wilson CI[17.8,40.2]가 baseline을 포함 → 분리 알파 없음.
- **부가 발견**: BBDX 롱 자체가 2년 횡보/하락장에서 winRate 33%·음수 expectancy·MDD 100%로 전반 부진 — CRS 책임 아니라 BBDX 롱 진입 알파 부재가 더 큰 그림(별도 트랙).
- **재검토 옵션**: (a) wick 임계 bucket calibration, (b) P2 ΔOI/funding gate 추가 후 재측정(3-신호로는 separator 약함), (c) CRS를 롱 증폭이 아니라 **exit/타이밍 신호**로 재포지셔닝.
- **권고**: main 승격 X. dev 코드는 regression-safe(entry set 불변)라 잔존 무해하나 confidence 증폭 정당성 없음 → 프로덕션 wiring 비활성 또는 P2까지 dormant 권장.
