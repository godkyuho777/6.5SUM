# RS-Rotation — BTC 대비 상대강도 로테이션 modifier

> **한 줄 요약**: BBDX가 알트에 롱 진입할 때, 그 알트가 **BTC 벤치마크 대비 상대강도(RS)** 가 강하면(자금 로테이션 유입) 신뢰도 ↑, 약하면 ↓. 고도미넌스·선택적 알트장에서 "약한 알트 롱"을 억제하고 "리더 알트 롱"을 증폭. 곱셈 modifier(단독 시그널 X, 헌장 규칙3).
>
> **상태**: 🟢 설계 검토 완료(signal-engineer, 2026-06-03) — **신규 가치 있음**. CRS와 달리 **OI 불필요 → 즉시 풀 백테스트 가능**(검증 비용 최저).
> **차원**: 1 (Momentum) — 차원 6(market-breadth/funding/CRS) 과밀 회피
> **배치**: 백엔드 `src/modifiers/rs-rotation.ts` (신규) → `combineAdditionalModifiers` `rsRotationMult` 키

---

## 1. 왜 지금(2026-06)인가 — 시장 국면 근거

| 지표 | 현재 값 | 의미 |
|---|---|---|
| BTC 도미넌스 | ~58% | 자금이 BTC에 은신, 알트 로테이션 미발생 |
| 알트시즌 인덱스 | 39~49 (75 미달) | **선택적 알트장** — broad 펌프 아님 |
| 알트 강세 | AI·토큰화 narrative만 | 소수 리더만 BTC 아웃퍼폼 |

**핵심 논리**: "top 100의 75%가 90일간 BTC를 아웃퍼폼해야 알트시즌"인데 현재 미달이다. 즉 알트 롱은 *아무 알트나*가 아니라 **BTC 대비 RS가 양수인 소수 리더**만 유효하다. BBDX는 코인을 가리지 않고 BB 하단 셋업이면 진입하므로, 선택장에서 "약한 알트의 BB 하단 바운스"(= 떨어지는 약세코인)에 잘못 진입할 위험이 크다. RS-Rotation은 이 약점을 정조준한다.

## 2. 갭 분석 / 중복 검증 (signal-engineer 실측)

**per-coin RS는 코드 어디에도 진입 가중치로 없다.** 기존 유사 인프라와는 **직교(orthogonal)**:

| | market-breadth (`modifiers/market-breadth.ts`) | sector-aggregator (`lib/sector-aggregator.ts`) | **RS-Rotation (신규)** |
|---|---|---|---|
| 측정 단위 | universe **집계**(전체의 N%) | 섹터 평균 변동률 | **개별 코인 1개** |
| 비교 기준 | 절대 임계(RSI 30/70) | 없음(절대 24h) | **상대**(coin − BTC) |
| 진입 영향 | 차원6 multiplier(모든 코인 동일) | 없음(디스커버리 전용) | 차원1 multiplier(코인별 상이) |
| 답하는 질문 | "시장 전체가 과열인가"(언제 사냐) | "어느 섹터가 도나" | **"이 코인이 BTC를 이기나"(무엇을 사냐)** |

→ market-breadth는 *타이밍*, RS는 *종목 선택*. 같은 진입 신호에 market-breadth는 스칼라 1개, RS는 코인마다 다른 값을 낸다. 중복 아님.

## 3. 구성 지표 — 세분화 (왜 조합했고 / 무엇을 의미하나)

### 지표 ① RS 레벨 (30d) — 중기 로테이션 여부
- **공식**: `rs30 = log(coin.close[t]/coin.close[t−30d]) − log(btc.close[t]/btc.close[t−30d])` (로그수익률 차이, 스케일 안정)
- **무엇을 의미하나**: 최근 30일간 이 코인이 BTC를 *얼마나* 이겼나(>0) 졌나(<0). 자금이 BTC에서 이 코인으로 로테이션 유입 중인지의 중기 척도.
- **왜 조합했나**: 선택장에서 "리더 vs 낙오자"를 가르는 1차 기준. 절대 수익률이 아니라 *BTC 대비*여야 매크로(BTC 자체 등락)를 상쇄하고 순수 알파만 본다.

### 지표 ② RS 추세 (7d) — 로테이션 가속/방향
- **공식**: `rs7 = log(coin/btc)[t] − log(coin/btc)[t−7d]` (RS의 단기 기울기)
- **무엇을 의미하나**: RS가 *지금 강해지는 중*인지(가속) *식는 중*인지(둔화). 레벨이 아니라 방향.
- **왜 조합했나**: rs30이 양수여도 식어가는 중이면 진입 부적합. ①은 "강한가", ②는 "강해지는가"를 본다. 둘의 confluence = 진짜 로테이션 리더.

### 게이트 ③ 도미넌스 레짐 (P2 — BTC.D 시계열 필요)
- **조건**: BTC.D 상승 추세 → RS 임계 강화(약한 알트 더 억제) / BTC.D 하락 추세 → 완화(로테이션 시작)
- **왜 P2인가**: BTC.D 히스토리컬 시계열은 CoinGecko 등 별도 소스라 `data-loader.ts`(spot 캔들)로 백테스트 재생 불가 — CRS의 ΔOI와 같은 함정. P1은 spot만으로 되는 ①②만.

## 4. 합성 — multiplier 산출 (양방향)

```
if (symbol === 벤치마크 자기자신, 예: BTCUSDT) → multiplier 1.0 (RS=0 정의상 중립)

strong_leader : rs30 > +0.05 AND rs7 > 0  → 1.15   (BTC를 5%+ 이기고 가속)
leader        : rs30 > +0.02              → 1.08
neutral       : −0.02 ≤ rs30 ≤ +0.02      → 1.00
laggard       : rs30 < −0.02              → 0.92
weak_laggard  : rs30 < −0.05 AND rs7 < 0  → 0.85   (BTC에 5%+ 뒤지고 둔화 — 억제)
```

- **하한 0.85 (← CRS와 다름)**: CRS는 "증폭 전용(하한 1.0), 차단은 falling-knife"였다. 하지만 **RS의 존재 이유 자체가 "약한 알트 롱 억제"** 다. 1.0 하한을 두면 목적의 절반(낙오자 억제)이 사라진다. → 0.85까지 억제 허용(0.60까지는 안 감, 코인 1개 상대약세에 과한 억제는 false negative 위험).
- **상한 1.15**: 곱셈 누적 안전. `funding-extreme 1.20 × market-breadth 1.30 × RS 1.15 = 1.79 > clamp 1.40` 이므로 개별 상단은 1.15로 억제(정보 뭉개짐 최소화).

## 5. 헌장 준수 & 데이터

- **규칙3(modifier-only)**: `ModifierResult` envelope, `multiplier`만 출력, stub/error 시 1.0. 단독 진입 X. ✅
- **Lookahead-free + 백테스트**: i 시점 RS는 `coin.close[i−w..i]` + `btc.close[i−w..i]` 만 참조. **OI/펀딩 불필요 → 풀 RS가 즉시 1년 lookahead-free 백테스트 가능**(CRS 대비 최대 강점). 단 **코인↔BTC 캔들은 인덱스가 아닌 `openTime` 타임스탬프로 조인**(코인별 상장일 차이로 인덱스 어긋남 주의). 백테스트 유니버스에 **BTCUSDT 강제 포함**(벤치 캔들 동반 적재).

## 6. signal-engineer 검토 결론 — 핵심 설계 결정 3가지

1. **차원 1(momentum) + 0.85~1.15 양방향.** 차원6 과밀 회피. MACD div(같은 차원1)와 측정 각도 직교(절대 다이버전스 vs BTC 상대강도). 약한 알트 억제(<1.0)가 RS의 존재 이유.
2. **P1 = spot-only ①RS레벨 + ②RS추세. ③도미넌스 게이트는 P2.** BTC.D는 spot 캔들로 재생 불가. 유니버스 BTCUSDT 강제 포함 + openTime 조인.
3. **배치 = `combineAdditionalModifiers`에 `rsRotationMult` 키.** signal-extractor `strategyMeta.rsRotationMult` 기록. 백테스트 세그먼트는 **"알트(BTC 제외) + RS 비중립" subset** 메트릭 분리(BTC 진입에 희석 방지).

## 7. 구현 단계

| Phase | 범위 | 데이터 | 검증 |
|---|---|---|---|
| **P1** | ①rs30 + ②rs7, 양방향 multiplier | spot 캔들(BTCUSDT 동반) | **즉시 풀 백테스트** — RS on/off, 알트+비중립 subset 메트릭 |
| **P2** | + ③도미넌스 게이트 | BTC.D 시계열(CoinGecko) | BTC.D 적재 후 |
| **P3** | UI 차원1 뱃지 "상대강도 로테이션" | — | Preview |

## 8. 백테스트 검증 계획 (P1)

- **대조군**: `rsRotationMult=1.0`(off) vs RS(on). `combineAdditionalModifiers` flag.
- **메트릭**: winRate / Sharpe / MDD / PF / Expectancy + Wilson 95% CI (`metrics.ts`).
- **세그먼트**: **알트만(BTCUSDT 제외) + RS 비중립 trade subset** 분리. leader 증폭 trade(Wilson lower > baseline) + laggard 억제 trade(winRate 개선) 양쪽 확인.
- **유니버스/TF/기간**: 알트 다수(SOL/AVAX/LINK/… ) + BTCUSDT(벤치), 4h, 365d.
- **합격 기준(가설)**: laggard 억제로 알트 진입 winRate +Δ, leader 증폭 trade Wilson lower bound > baseline.

## 9. 영향 모듈 (구현 시)

- **backend**: `modifiers/rs-rotation.ts`(신규), `modifiers/index.ts`(`rsRotationMult` 키), `shared/types.ts`(EntryDecision `rsRotationMult?`), `scanner.ts`·`routers.ts`(합성), `backtest/signal-extractor.ts`(`strategyMeta`), `backtest/data-loader.ts`(BTC 벤치 동반 로드 + openTime 조인 규약).
- **frontend**: 차원1 RS 뱃지("상대강도 로테이션", "BTC 대비 강세 리더(자금 유입)"). MACD div·market-breadth와 시각 분리. SignalDetailDialog에 `rs30`/`rs7` 수치.

## 10. 갱신 이력

- 2026-06-03 — 초안 + signal-engineer 검토(신규 가치 있음). CRS와 형제 제안이나 **OI 불필요로 백테스트 즉시 가능**이 차별점. 현재 선택적 알트장(도미넌스 58%·알트시즌 39~49) 정합.
