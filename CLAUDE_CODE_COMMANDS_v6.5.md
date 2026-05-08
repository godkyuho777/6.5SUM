# BBDX v6.5 Claude Code 실행 명령서

> **목적:** v6.1 → v6.5 한 번에 마이그레이션 (단, 단계별 PR 로 안전 보장)
> **대상:** 본인 백엔드 저장소 (`tradelab-hq/tradelab-backend`)
> **선행:** 다음 5개 MD 파일이 백엔드 저장소 루트에 push 완료되어 있어야 함
>   - STRATEGY_CHARTER.md
>   - BBDX_PATTERN_v6.2.md
>   - BBDX_v6.3_EXIT_REDESIGN.md
>   - BBDX_v6.4.md
>   - BBDX_v6.5_FULL_DIMENSION.md
>   - ONCHAIN_INTEGRATION.md
>   - PATTERN_SYSTEM_AUDIT.md

---

## 0. 시작 전 준비 (5분)

### 0.1 본인 PC 에서 환경 확인

```powershell
# PowerShell 새 창 열고
cd $HOME\Desktop\tradelab\tradelab-backend

# git 상태 확인
git status

# 깔끔한 main 인지 확인 (uncommitted 변경 없어야 함)
# 만약 변경사항 있으면:
git stash  # 또는 commit 후 진행
```

### 0.2 MD 파일 모두 push 됐는지 확인

```powershell
ls *.md
```

**필요한 파일 (모두 있어야 함):**
- STRATEGY_CHARTER.md
- BBDX_PATTERN_v6.2.md
- BBDX_v6.3_EXIT_REDESIGN.md
- BBDX_v6.4.md
- BBDX_v6.5_FULL_DIMENSION.md
- ONCHAIN_INTEGRATION.md
- PATTERN_SYSTEM_AUDIT.md

빠진 게 있으면 먼저 push.

### 0.3 Claude Code 실행

```powershell
claude
```

---

## 1. 첫 명령 — 컨텍스트 로드

Claude Code 시작 후 **첫 번째 명령**으로 이걸 입력. 이 명령이 모든 후속 작업의 기준 컨텍스트를 잡아줍니다.

```
이 저장소의 다음 7 개 MD 파일을 모두 읽어줘:

1. STRATEGY_CHARTER.md (헌장 — 7차원 + 3규칙, 가장 중요)
2. BBDX_PATTERN_v6.2.md (카테고리 가중 강도 모델)
3. BBDX_v6.3_EXIT_REDESIGN.md (EXIT 4 카테고리 재설계)
4. BBDX_v6.4.md (진입 정밀화 + 헌장 검증)
5. BBDX_v6.5_FULL_DIMENSION.md (거시·온체인 통합, 최종 목표)
6. ONCHAIN_INTEGRATION.md (7번 차원 modifier)
7. PATTERN_SYSTEM_AUDIT.md (패턴 시스템 12 결함)

읽은 후 다음을 보고서:

A) 현재 백엔드의 BBDX 구현 상태:
   - 어느 버전 (v6.1 ~ v6.5) 이 어디까지 구현되어 있는가
   - 핵심 모듈 위치 (지표, 시그널, EXIT, 백테스트 등)
   - 헌장 7차원 중 현재 커버되는 것

B) v6.5 적용까지의 작업 양:
   - 신규 추가할 모듈
   - 수정할 모듈
   - 데이터 fetch 추가 필요 (FRED, CryptoQuant 등)

C) 위험 요소:
   - 기존 코드와 충돌 가능성
   - 데이터 의존성 (외부 API rate limit 등)
   - 백테스트 엔진 호환성

D) 구현 권장 순서:
   - 어떤 Phase 부터 시작할지
   - 각 Phase 의 의존성

한국어 보고서 형식. 코드 수정 X. 분석만.
```

**예상 응답 시간:** 2~5분 (저장소 크기에 따라).

**받은 보고서 검토 포인트:**
- 본인 의도와 다른 부분이 있나
- 위험 요소가 본인이 인지하지 못한 게 있나
- 작업 양 추정이 합리적인가

이상한 부분 있으면 추가 질문 후 다음 단계로.

---

## 2. 작업 분기 생성 + 환경 셋업

```
v6.5 마이그레이션을 위한 작업 환경을 셋업해줘:

1. 새 git 브랜치 생성:
   git checkout -b feat/bbdx-v6.5-migration

2. 의존성 추가 (FRED, 온체인 데이터용):
   - node-fetch (이미 있으면 skip)
   - 캐시 라이브러리 (예: lru-cache 또는 node-cache)
   pnpm add 가 필요한 것만

3. 환경변수 추가 (.env.example 갱신):
   FRED_API_KEY=         # https://fredaccount.stlouisfed.org/login/secure/
   CRYPTOQUANT_API_KEY=  # (Stage 1 무료 tier)
   WHALE_ALERT_API_KEY=  # https://whale-alert.io
   COINGECKO_API_KEY=    # 무료 tier 가능

   # 본인이 발급 안 받았으면 빈 값으로 시작.
   # 해당 modifier 는 disabled 상태로 작동.

4. 디렉토리 구조 생성:
   server/src/
     ├── strategies/
     │   ├── bbdx/
     │   │   ├── entry.ts          (Phase 1)
     │   │   ├── exit.ts           (Phase 1)
     │   │   ├── strength.ts       (Phase 1, 카테고리 가중)
     │   │   └── falling-knife.ts  (Phase 1, 시그모이드)
     ├── macro/
     │   ├── liquidity.ts          (Phase 3)
     │   └── fred-client.ts        (Phase 3)
     ├── onchain/
     │   ├── modifiers.ts          (Phase 3)
     │   ├── exchange-netflow.ts   (Phase 3)
     │   ├── whale-alert.ts        (Phase 3)
     │   ├── ssr.ts                (Phase 3)
     │   ├── coinbase-premium.ts   (Phase 3)
     │   └── etf-flow.ts           (Phase 3)
     └── charter/
         └── validator.ts          (Phase 2)

5. .gitignore 갱신:
   .backtest-cache/
   .macro-cache/
   .onchain-cache/

6. 변경사항 commit:
   "chore: setup v6.5 migration environment"

작업 후 git diff 보여주고 승인 받기.
```

---

## 3. Phase 1 — v6.2 + v6.3 통합 (카테고리 가중 + EXIT 재설계)

```
Phase 1 을 진행해줘. 헌장 검증 + v6.2 카테고리 강도 + v6.3 EXIT 재설계.

작업 단위 (각각 별도 commit):

[1.1] 헌장 검증 모듈 (이게 먼저 필요. 모든 후속 작업이 통과해야)
  파일: server/src/charter/validator.ts
  내용: STRATEGY_CHARTER.md 의 III 절 검증 시스템
  - 7차원 매핑 함수
  - 규칙 1·2·3 자동 체크
  - dimensions_covered 객체 반환
  - vitest 케이스: 7차원 모두 통과/실패 시나리오 5개
  commit: "feat(charter): add 7-dimension validator"

[1.2] Falling Knife 시그모이드 페널티
  파일: server/src/strategies/bbdx/falling-knife.ts
  내용: BBDX_PATTERN_v6.2.md 의 2.4 절
  - sigmoid 함수
  - heaviside 함수
  - fkScore 계산
  - vitest: 임계 영역 (ADX 23, 25, 27) 결정 차이 검증
  commit: "feat(bbdx): falling knife sigmoid penalty"

[1.3] 카테고리 가중 강도 모델
  파일: server/src/strategies/bbdx/strength.ts
  내용: BBDX_PATTERN_v6.2.md 의 3.6 절 + 3.2.2 RSI 적응
  - 5 카테고리 점수 함수 (momentum, position, trend, volume, action)
  - 경로별 가중치 (NUM/PTN/BB)
  - RSI quantile 기반 적응 (임시값 [25, 38] 시작, calibration TODO)
  - vitest: T0 시나리오 산출 검증 (NUM 41, PTN 42, BB 60)
  commit: "feat(bbdx): category-weighted strength model"

[1.4] 진입 결정 v6.3 (3 경로 + multi-confluence)
  파일: server/src/strategies/bbdx/entry.ts
  내용: BBDX_v6.3_TRADING_RULES.md (참고: 이 파일 직접 만든 적 없으면 v6.5 의 1.1~1.7 절)
  - NUM/PTN/BB 게이트
  - multi_path_confluence 보너스
  - 헌장 검증 통합 (1.1 의 validator 사용)
  - vitest: 3 경로 confluence 시나리오
  commit: "feat(bbdx): v6.3 entry decision with multi-path"

[1.5] EXIT 4 카테고리 (v6.3 재설계)
  파일: server/src/strategies/bbdx/exit.ts
  내용: BBDX_v6.3_EXIT_REDESIGN.md 1 장 전체
  - [EXIT-A] 부분 청산 Tier 1/2/3
  - [EXIT-B] 반전 점수 5 신호
  - [EXIT-C] Breakeven + Trailing
  - [EXIT-D] 시간 손절
  - 우선순위 함수 (STOP > B > A > C > D)
  - vitest: 시나리오 7개 (목표 도달, 반전 발생, 시간 손절 등)
  commit: "feat(bbdx): v6.3 exit redesign with 4 categories"

[1.6] STOP LOSS 통합
  파일: server/src/strategies/bbdx/exit.ts (확장)
  내용: max(BB×0.97, ATR stop, Fib 23.6%)
  - ATR stop 계산
  - Fib 23.6% 계산 (직전 swing low/high 필요)
  - 최종 stop = max
  - vitest: 3 stop 비교 시나리오
  commit: "feat(bbdx): unified stop loss (BB/ATR/Fib)"

각 sub-commit 후 vitest run 통과 확인. 통과 안 되면 다음 sub 진행 X.

Phase 1 전체 완료 시 PR 생성:
  Title: "feat(bbdx): v6.2 + v6.3 integration (Phase 1)"
  설명: 변경 요약 + 헌장 통과 체크 + 백테스트 v6.1 vs v6.3 비교 결과

PR push 만 하고 main 머지는 본인 검토 후.
```

**예상 시간:** 2~3 일 (Claude Code 작업 시간 기준).

**검증 포인트:**
- vitest 모두 통과
- 헌장 검증 모듈이 7차원 정확히 매핑
- T0 시나리오 산출이 BBDX_v6.3_TRADING_RULES.md 의 예시값과 일치

---

## 4. Phase 2 — v6.4 진입 정밀화

```
Phase 1 PR 가 main 에 머지된 후 진행.

Phase 2: v6.4 진입 정밀화.

[2.1] BB 근접도 grading (binary → continuous)
  파일: server/src/strategies/bbdx/strength.ts (수정)
  내용: BBDX_v6.4.md 1.2 절
  - bb_proximity_strength 함수
  - 기존 positionScore 대체
  - vitest: 1.019 vs 1.021 (binary 영역) 결정 차이 사라졌는지 검증
  commit: "feat(bbdx): bb proximity continuous grading"

[2.2] 패턴 정의 정밀화 + 룩어헤드 안전
  파일: server/src/patterns/definitions.ts (신규)
       server/src/patterns/aggregator.ts (신규)
       server/src/patterns/__tests__/no_lookahead.test.ts (신규)
  내용: PATTERN_SYSTEM_AUDIT.md 의 5.1 ~ 5.5 절
  - 9 패턴 정확한 수식 (해머, 인걸핑, 모닝스타 등)
  - 룩어헤드 안전 detectPatternsAtIndex
  - 다중 패턴 합산 (max + bonus)
  - patternBase 임시값 (calibration TODO 표기)
  - 거래량 + 추세 컨텍스트 multiplier
  - **no_lookahead 테스트 필수 통과**
  commit: "feat(patterns): exact definitions with no-lookahead safety"

[2.3] 패턴 확정 검증 (1~2 캔들 후)
  파일: server/src/strategies/bbdx/entry.ts (수정)
  내용: BBDX_v6.4.md 1.3 절
  - pattern_confirmation 함수
  - PTN 진입에 통합
  - vitest: 패턴 form 직후 vs 확정 후 진입 비교
  commit: "feat(bbdx): pattern confirmation 1~2 candles"

[2.4] Live 진입 트리거 (옵션, 시간 여유 있을 때)
  파일: server/src/strategies/bbdx/entry.ts (수정)
  내용: BBDX_v6.4.md 1.1 절
  - 15분 단위 캔들 진행 중 체크
  - pending_entries 상태 관리
  - 캔들 close 시 확정 검증
  - 사용자 알림 (live 후보 → 확정)
  commit: "feat(bbdx): live entry trigger (optional)"

  ⚠️ Live 트리거는 WebSocket 인프라 필요. WebSocket 마이그레이션
  (이전 INTEGRATION_GUIDE.md) 완료 안 됐으면 [2.4] skip 하고 Phase 3 진행.

[2.5] 적응 임계값 (RSI quantile, 반전 임계, 시간 손절)
  파일: server/src/strategies/bbdx/adaptive-thresholds.ts (신규)
  내용: BBDX_v6.4.md 2.2 + 2.3 절
  - per (symbol, tf) 적응 quantile 계산
  - 매주 갱신 cron
  - 임시값 fallback (백테스트 데이터 부족 시)
  commit: "feat(bbdx): adaptive thresholds per symbol/tf"

각 sub-commit vitest run 통과 확인.

Phase 2 PR:
  Title: "feat(bbdx): v6.4 entry precision (Phase 2)"
```

**예상 시간:** 2~3 일.

**검증 포인트:**
- no_lookahead 테스트 통과 (가장 중요. 깨지면 백테스트 결과 가짜)
- 패턴 정의가 PATTERN_SYSTEM_AUDIT 의 5.1 절과 일치

---

## 5. Phase 3 — v6.5 거시·온체인 통합 (헌장 풀 통과)

```
Phase 2 머지 후 진행.

Phase 3: 거시·온체인 통합. 7차원 헌장 풀 통과.

[3.1] FRED API 클라이언트 (거시 6번 차원)
  파일: server/src/macro/fred-client.ts (신규)
  내용:
  - https://api.stlouisfed.org/fred/series/observations
  - 5 series fetch: SOFR, IORB, RRPONTSYD, WTREGEN, WALCL
  - 일별 캐시 (.macro-cache/)
  - rate limit 처리
  - FRED_API_KEY 없으면 disabled 모드 (mock 데이터)
  - vitest: mock fetch 응답 검증
  commit: "feat(macro): FRED API client"

[3.2] Macro Liquidity Score
  파일: server/src/macro/liquidity.ts (신규)
  내용: BBDX_v6.5 2.1 절
  - 5 입력 → score (-100 ~ +100)
  - regime 분류 (crisis ~ flooded)
  - multiplier 매핑
  - vitest: 시나리오 5개 (각 regime)
  commit: "feat(macro): liquidity score and regime"

[3.3] 한국 거시 (옵션)
  파일: server/src/macro/korea.ts (신규)
  내용: BBDX_v6.5 2.2 절
  - BOK 기준금리 fetch
  - 원-달러 fetch
  - korea_modifier ±0.05
  - vitest
  commit: "feat(macro): korea modifier (BOK + KRW/USD)"

[3.4] 온체인 modifier 1 — Exchange Netflow
  파일: server/src/onchain/exchange-netflow.ts (신규)
  내용: ONCHAIN_INTEGRATION.md 2.1 절
  - CryptoQuant API 또는 Glassnode free tier
  - z-score 기반 modifier (±0.20)
  - 1시간 캐시
  - 데이터 부족 시 0 (modifier disabled)
  - vitest
  commit: "feat(onchain): exchange netflow modifier"

[3.5] 온체인 modifier 2 — Whale Alert
  파일: server/src/onchain/whale-alert.ts (신규)
  내용: ONCHAIN_INTEGRATION.md 2.2 절
  - whale-alert.io API (무료 tier)
  - $10M+ 송금 추적
  - bullish/bearish score
  - vitest
  commit: "feat(onchain): whale alert modifier"

[3.6] 온체인 modifier 3 — SSR
  파일: server/src/onchain/ssr.ts (신규)
  내용: ONCHAIN_INTEGRATION.md 2.3 절
  - CoinGecko API (무료)
  - BTC mcap / (USDT + USDC + DAI mcap)
  - 90일 z-score
  - vitest
  commit: "feat(onchain): SSR modifier"

[3.7] 온체인 modifier 4~7 — Coinbase Premium, ETF Flow, Miner Outflow, LTH
  파일: server/src/onchain/[각각]
  내용: ONCHAIN_INTEGRATION.md 2.4 ~ 2.7 절
  - 각 modifier 별도 파일
  - BTC/알트 차등 (3.3 절 표 참조)
  - vitest 각각
  commit: 각각 별도

  ⚠️ Stage 1 무료 데이터 한정.
  Coinbase Premium: 자체 계산 (Coinbase API + Binance API)
  ETF Flow: Farside 스크래핑 (또는 수동 입력)
  Miner Outflow: CryptoQuant free
  LTH: Glassnode free

[3.8] 온체인 통합 점수
  파일: server/src/onchain/modifiers.ts (신규)
  내용: BBDX_v6.5 3.1 절 + ONCHAIN_INTEGRATION 3 절
  - 7 modifier 합산
  - normalized score (-1 ~ +1)
  - regime 분류
  - 코인 종류별 modifier 차등 적용
  - vitest
  commit: "feat(onchain): integrated onchain score"

[3.9] BBDX 진입 흐름 v6.5 통합
  파일: server/src/strategies/bbdx/entry.ts (수정)
  내용: BBDX_v6.5 4.1 절 의사코드
  - macro·onchain 게이트 추가 (Step 1)
  - macro_mult, onchain_mult 적용 (Step 5, 6)
  - crisis / strong_distribution 차단
  - 헌장 7차원 assert (Step 9)
  - vitest: 위기 환경 진입 차단 / 매집 환경 진입 가속
  commit: "feat(bbdx): v6.5 entry with macro+onchain"

[3.10] BBDX EXIT 흐름 v6.5 강화
  파일: server/src/strategies/bbdx/exit.ts (수정)
  내용: BBDX_v6.5 5 절
  - reversalScore 거시·온체인 가중 추가
  - vitest: T+25 시나리오 (v6.3 보유 vs v6.5 부분 청산)
  commit: "feat(bbdx): v6.5 exit with macro+onchain weighting"

[3.11] 백테스트 v6.4 vs v6.5 비교
  파일: server/src/backtest/__tests__/v65_vs_v64.test.ts (신규)
  내용:
  - 같은 캔들 데이터에 v6.4 와 v6.5 적용
  - 메트릭 비교 (자본 효율, false positive, 평균 청산 가격)
  - 결과를 markdown 리포트로 출력
  commit: "test: v6.4 vs v6.5 backtest comparison"

각 sub-commit vitest run 통과.

Phase 3 PR:
  Title: "feat(bbdx): v6.5 macro + onchain integration (Phase 3)"
  설명:
    - 7차원 풀 커버리지 달성
    - 헌장 통과 검증
    - 백테스트 비교 결과
    - calibration TODO 목록
```

**예상 시간:** 5~7 일 (외부 API 연동 시간 포함).

**검증 포인트:**
- 7차원 모두 ✓ 표기
- macro·onchain API rate limit 정상 처리
- API key 없을 때 graceful fallback (disabled 모드)
- 백테스트 v6.5 가 v6.4 보다 자본 효율 ↑ (가설 검증)

---

## 6. 막혔을 때 (Troubleshooting)

### 6.1 Phase 1 에서 막힘

가장 흔한 문제: vitest 실패.

```
Phase 1 의 sub [X.Y] 에서 vitest 실패. 다음 에러 분석하고 고쳐줘:

[에러 메시지 그대로 붙여넣기]

가능한 원인:
1. T0 시나리오 산출값과 실제 코드 결과 차이
2. 헌장 검증 dimension 매핑 오류
3. 시그모이드 수식 오류

원인 추적 후 수정. 수정 전 본인 승인 받기.
```

### 6.2 Phase 2 의 룩어헤드 테스트 실패

가장 위험한 실패. 절대 무시 X.

```
no_lookahead.test.ts 실패. 어디서 미래 캔들 접근하는지 추적해줘:

1. detectPatternsAtIndex 내부 모든 candles[j] 접근에 j > currentIdx 가 없는지
2. is_morning_star, is_three_white_soldiers 등 multi-candle 패턴이
   current 인덱스 이후 캔들 안 보는지
3. context multiplier 의 prior_candles 슬라이스가 current 이전인지

추적 결과 보고서 + 수정안. 본인 승인 후 적용.
```

### 6.3 Phase 3 외부 API 실패

```
Phase 3 의 [3.X] 에서 외부 API 호출 실패. 다음 확인:

1. 환경변수 설정됐는지 (FRED_API_KEY 등)
2. API 응답 형식이 코드 기대치와 일치하는지
3. rate limit 에 걸렸는지

만약 API key 없으면 disabled 모드 작동하는지 확인.
disabled 모드는 modifier 0 반환 + 로그 출력.
```

---

## 7. 전체 완료 후 검증

```
v6.5 마이그레이션 완료 후 최종 검증해줘:

1. 헌장 검증:
   - bbdx v6.5 entry 함수가 dimensions_covered 7개 모두 ✓ 반환하는지
   - 각 차원이 올바른 modifier 와 매핑되는지

2. 백테스트 비교 리포트:
   - v6.1 (베이스) vs v6.5 (현재)
   - 메트릭: 승률, R:R, MDD, Sharpe, 평균 보유 기간
   - regime 별 성과 (crisis, tight, neutral, easy, flooded)

3. UI 시그널 표시 검증:
   - 모든 시그널 옆 7차원 ✓ 표시
   - macro·onchain regime 라벨
   - 신뢰구간 표기

4. 임시값 calibration TODO 목록:
   - 어떤 값이 calibration 필요한지
   - 백테스트 엔진 완성 후 갱신 계획

5. 프로덕션 배포 체크리스트:
   - testnet 1 주일 dry-run
   - 사용자 0 환경에서 검증
   - 주요 위험 시나리오 시뮬

한국어 리포트.
```

---

## 8. 솔직한 마지막 한 마디

**위 명령은 14개 변경을 한 묶음으로 진행하지만, 실제로는 3 단계 PR 로 나누어요.**

각 Phase 끝나면:
- 본인이 PR 검토
- 주요 변경 이해 확인
- 백테스트 결과 검증
- main 머지 결정

"한 번에 v6.5"는 git 브랜치 한 개에서 작업하지만, **본인이 단계별로 검토 가능**한 구조예요. 한 Phase 끝나기 전에 본인이 멈추면 그 시점까지의 변경만 main 에 가고, 나머지는 폐기 또는 다음 시도.

**가장 중요한 건 — 막히면 멈추세요.** vitest 실패한 상태로 다음 Phase 진행 X. 에러 메시지 그대로 가지고 와주시면 같이 풀어드릴게요.

---

## 9. 명령어 빠른 참조 (이것만 봐도 됨)

```
[순서대로 입력]

1. 컨텍스트 로드:
   "이 저장소의 7개 MD 파일 (STRATEGY_CHARTER, BBDX_PATTERN_v6.2,
    BBDX_v6.3_EXIT_REDESIGN, BBDX_v6.4, BBDX_v6.5_FULL_DIMENSION,
    ONCHAIN_INTEGRATION, PATTERN_SYSTEM_AUDIT) 모두 읽고
    현재 백엔드 상태 + v6.5 적용까지 작업 양 + 위험 요소 + 권장 순서를
    한국어 보고서로. 코드 수정 X."

2. 환경 셋업:
   "feat/bbdx-v6.5-migration 브랜치 생성 + 의존성 추가 + 디렉토리 구조 생성.
    위 4번 섹션의 디렉토리 구조 그대로. commit chore: setup v6.5 migration."

3. Phase 1 시작:
   "Phase 1 진행. BBDX_v6.5 명령서 3 절의 [1.1] ~ [1.6] 단계별 sub-commit.
    각 sub 후 vitest 통과 확인. 통과 안 되면 다음 sub 진행 X.
    Phase 1 완료 시 PR 생성 (push only, main merge X)."

4. Phase 2 (Phase 1 머지 후):
   "Phase 2 진행. 명령서 4 절의 [2.1] ~ [2.5]."

5. Phase 3 (Phase 2 머지 후):
   "Phase 3 진행. 명령서 5 절의 [3.1] ~ [3.11]."

6. 최종 검증:
   "v6.5 마이그레이션 완료 검증. 명령서 7 절."
```

이 6 줄을 순서대로 던지면 v6.5 까지 가요. 각 단계 사이에 본인 검토 시간 필요.
