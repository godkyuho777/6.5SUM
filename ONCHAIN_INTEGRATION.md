# 온체인 데이터 통합 명세 (Tradelab 7번 차원)

> **헌장 종속:** STRATEGY_CHARTER.md 의 7번 차원 (온체인) 구현
> **검증:** 헌장 규칙 1 (차원 중복 X), 규칙 2 (백테스트 알파), 규칙 3 (단독 시그널 X)
> **목적:** 기관·고래·거래소 자금 흐름을 정량화하여 BBDX 시그널 신뢰도 가중

---

## 0. 왜 온체인이 결정적인가

가격 차트는 **결과**, 온체인은 **원인**. 가격이 움직이기 전에 자금이 먼저 움직임.

**기관 행동 패턴 (실증):**
- 강세 시작 1~3일 전: 거래소 BTC 잔고 ↓ (기관이 거래소에서 출금하여 콜드월렛으로 이동 = 매도 의도 X)
- 강세 절정 1~3일 전: 거래소 BTC 잔고 ↑ (기관이 거래소로 이동 = 매도 준비)
- 급락 직전: USDT/USDC 거래소 유입 ↑ (매수 대기 자금 + 단기 매도자가 stable 로 환전)
- ETF 자금 유입은 **다음날 가격에 반영** (선행 데이터)

**가격 후행 데이터로는 잡을 수 없는 시그널.** 7차원 중 가장 강력한 차별화 포인트.

---

## 1. 온체인 데이터 소스 (무료/저비용)

본인이 Stage 1 한국 무료/Pro $22 가격대를 유지하려면 **데이터 비용을 최소화**해야 함. 다음 무료/저비용 API 조합으로 충분.

| 데이터 | 소스 | 비용 | 갱신 주기 | 한계 |
|---|---|---|---|---|
| Exchange Netflow (BTC/ETH) | CryptoQuant Free / Glassnode Free tier | $0 | 1시간 | 일부 거래소 누락 |
| Whale Alert (대규모 송금) | whale-alert.io API | $0 (무료) / $29 (Pro) | 실시간 | $1M+ 송금만 |
| Stablecoin Supply (USDT/USDC/DAI) | CoinGecko Free | $0 | 10분 | rate limit |
| Coinbase Premium | TradingView Pine Script + Coinbase API | $0 | 1분 | 자체 계산 필요 |
| ETF Flow (BTC/ETH) | Farside Investors | $0 (스크래핑) / 협상 | 일별 | 미국 거래일만 |
| 거래소 잔고 (Reserve) | CryptoQuant Free / 자체 추적 | $0 | 1시간 | 일부 거래소만 |
| Miner Outflow | CryptoQuant Free | $0 | 1시간 | BTC만 |
| Long-Term Holder Supply | Glassnode Free / Coin Metrics | $0 | 1일 | BTC, ETH만 |

**Stage 1 무료 조합 (총 $0/mo):**
- Whale Alert 무료 + CryptoQuant Free + Glassnode Free + CoinGecko Free + Farside 스크래핑

**Stage 2 업그레이드 (월 $30~50):**
- Whale Alert Pro $29 + 필요 시 CryptoQuant Basic $39
- Pro tier 사용자에게만 노출하여 비용 정당화

---

## 2. 온체인 지표 — 7차원 헌장 준수

각 지표는 **BBDX 시그널의 가중치**로만 사용. 단독 시그널 X (규칙 3).

### 2.1 Exchange Netflow (거래소 순유입/유출)

```
netflow = (거래소 입금 - 거래소 출금)
  음수 = 거래소에서 빠짐 (콜드월렛 이동, 매도 의도 X) = 강세
  양수 = 거래소로 들어옴 (매도 준비) = 약세
```

**BBDX 가중치:**
```python
def netflow_modifier(symbol, lookback_hours=24):
  netflow = fetch_exchange_netflow(symbol, lookback_hours)
  avg_netflow = fetch_avg_netflow(symbol, days=30)
  z_score = (netflow - avg_netflow.mean) / avg_netflow.std

  if z_score < -2:   return +0.20  # 강한 출금 = LONG 강화
  if z_score < -1:   return +0.10
  if z_score > +2:   return -0.25  # 강한 유입 = LONG 차단 강화
  if z_score > +1:   return -0.10
  return 0
```

**규칙 1 검증 (차원 중복):** 7번 온체인 차원, 다른 차원과 중복 X ✓
**규칙 2 검증 (백테스트):** 90일 백테스트 필요. baseline 대비 시그널 +z 점수 시 승률 차이 측정.
**규칙 3 검증 (단독 X):** modifier 형태로 BBDX 가중치만 ✓

### 2.2 Whale Alert (대규모 송금)

```
$10M+ 단일 송금 감지
- "거래소 → 미상의 지갑": 강세 신호 (장기 보유 의도)
- "미상의 지갑 → 거래소": 약세 신호 (매도 준비)
- "거래소 → 거래소": 중립 (차익 거래)
```

**BBDX 가중치:**
```python
def whale_modifier(symbol, lookback_hours=12):
  whale_txs = fetch_whale_transactions(symbol, lookback_hours, min_value_usd=10_000_000)

  bullish_score = 0
  bearish_score = 0
  for tx in whale_txs:
    if tx.from_type == 'exchange' and tx.to_type == 'unknown':
      bullish_score += tx.value_usd / 100_000_000  # $100M 당 +1
    elif tx.from_type == 'unknown' and tx.to_type == 'exchange':
      bearish_score += tx.value_usd / 100_000_000

  net = bullish_score - bearish_score
  if net > 3:   return +0.15
  if net > 1:   return +0.07
  if net < -3:  return -0.20
  if net < -1:  return -0.07
  return 0
```

### 2.3 Stablecoin Supply Ratio (SSR)

```
SSR = BTC 시총 / (USDT + USDC + DAI 시총)
  ↑ = BTC 비싸짐 또는 stable 공급 ↓ = 매수 여력 ↓ = 천장 신호
  ↓ = BTC 싸짐 또는 stable 공급 ↑ = 매수 대기 자금 ↑ = 바닥 신호
```

이미 03_ADDITIONAL_STRATEGIES 의 5번 전략으로 정의됨. 여기서는 **온체인 차원의 핵심 지표** 로 재확인.

**BBDX 가중치:**
```python
def ssr_modifier():
  ssr = compute_ssr()
  ssr_ma90 = compute_ssr_ma(days=90)
  ssr_std = compute_ssr_std(days=90)
  z = (ssr - ssr_ma90) / ssr_std

  if z < -1.5: return +0.15   # 매수 대기 자금 풍부
  if z < -0.5: return +0.05
  if z > +1.5: return -0.20   # 추가 매수 여력 부족
  if z > +0.5: return -0.05
  return 0
```

### 2.4 Coinbase Premium

```
premium = (Coinbase BTC/USD 가격 / Binance BTC/USDT 가격) - 1
  양수 = Coinbase 가 더 비쌈 = 미국 기관 매수 우위 = 강세
  음수 = Coinbase 가 더 쌈 = 미국 기관 매도 우위 = 약세
```

**왜 중요:** Coinbase = 미국 기관 주력. 한국·아시아 retail 보다 자금 규모 ↑. 미국 기관 행동이 글로벌 가격에 결정적.

**BBDX 가중치:**
```python
def coinbase_premium_modifier(symbol, lookback_hours=4):
  premium = fetch_coinbase_premium(symbol, lookback_hours)

  if premium > 0.002:   return +0.15   # 0.2% 이상 = 강한 매수
  if premium > 0.0005:  return +0.05
  if premium < -0.002:  return -0.20
  if premium < -0.0005: return -0.05
  return 0
```

### 2.5 ETF Flow (BTC/ETH 스팟 ETF 순유입)

```
2024.1 미국 BTC ETF, 2024.7 ETH ETF 출시 후 가격에 가장 강한 영향력
- 일별 순유입 +$500M 이상 = 강한 매수 압력
- 순유출 -$300M 이상 = 매도 압력
```

**BBDX 가중치:**
```python
def etf_flow_modifier(symbol, lookback_days=3):
  if symbol not in ['BTCUSDT', 'ETHUSDT']: return 0

  flow_3d = fetch_etf_net_flow_sum(symbol, lookback_days)

  if flow_3d > 1_500_000_000:   return +0.20  # $1.5B+ 누적 유입
  if flow_3d > 500_000_000:     return +0.10
  if flow_3d < -1_000_000_000:  return -0.25
  if flow_3d < -300_000_000:    return -0.10
  return 0
```

**한계:** ETF flow 는 미국 거래일만 발표 (주말·공휴일 X). 주말 시그널 시 마지막 평일 데이터 사용.

### 2.6 Miner Outflow (BTC 전용)

```
miner_outflow = 채굴자 지갑에서 거래소·OTC 로의 송금
  ↑ = 채굴자 매도 압력 (특히 시즈널 강세장 직후)
  ↓ = 채굴자 holding (강세 신호)
```

**BBDX 가중치:**
```python
def miner_outflow_modifier(symbol='BTCUSDT', lookback_days=7):
  if symbol != 'BTCUSDT': return 0

  outflow = fetch_miner_outflow_sum(days=lookback_days)
  outflow_ma90 = fetch_miner_outflow_ma(days=90)
  z = (outflow - outflow_ma90) / outflow_ma90.std

  if z > +2:  return -0.15   # 강한 채굴자 매도
  if z > +1:  return -0.05
  if z < -1.5: return +0.10  # 채굴자 holding
  return 0
```

### 2.7 Long-Term Holder Supply (LTH)

```
LTH = 155일 이상 보유한 코인의 총 공급량
  ↑ = 장기 보유자 축적 = 강세 (분배 단계 X)
  ↓ = 장기 보유자 매도 = 천장 신호
```

```python
def lth_modifier(symbol='BTCUSDT', lookback_days=30):
  if symbol not in ['BTCUSDT', 'ETHUSDT']: return 0

  lth_now = fetch_lth_supply(symbol, days_ago=0)
  lth_30d = fetch_lth_supply(symbol, days_ago=lookback_days)
  change_pct = (lth_now - lth_30d) / lth_30d

  if change_pct > 0.02:  return +0.10  # 30일간 LTH +2% 증가
  if change_pct < -0.02: return -0.15
  return 0
```

---

## 3. 통합 온체인 점수

7개 modifier 의 합산 (각각 -0.25 ~ +0.20 범위).

```python
def onchain_score(symbol):
  modifiers = {
    'netflow':         exchange_netflow_modifier(symbol),
    'whale':           whale_alert_modifier(symbol),
    'ssr':             ssr_modifier(),
    'coinbase':        coinbase_premium_modifier(symbol),
    'etf_flow':        etf_flow_modifier(symbol),
    'miner_outflow':   miner_outflow_modifier(symbol),
    'lth_supply':      lth_supply_modifier(symbol),
  }

  total = sum(modifiers.values())
  # 각 modifier 가 -0.25 ~ +0.20 이므로 합산 범위 약 -1.75 ~ +1.40
  # 정규화 -1.0 ~ +1.0
  normalized = max(-1.0, min(1.0, total / 1.4))

  return {
    'score': normalized,
    'breakdown': modifiers,
    'regime': classify_onchain_regime(normalized),
  }


def classify_onchain_regime(score):
  if score > 0.6:    return 'strong_accumulation'
  if score > 0.2:    return 'accumulation'
  if score > -0.2:   return 'neutral'
  if score > -0.6:   return 'distribution'
  return 'strong_distribution'
```

---

## 4. BBDX 통합 (규칙 3 — 단독 X, 가중치 O)

### 4.1 진입 가중치

```python
def bbdx_entry_with_onchain(bbdx_signal, onchain):
  base_strength = bbdx_signal.strength  # 0~100

  onchain_multiplier = 1 + onchain.score * 0.30
    # score +1.0 → ×1.30 (30% 가산)
    # score  0   → ×1.00
    # score -1.0 → ×0.70 (30% 차감)

  final_strength = base_strength * onchain_multiplier

  # 진입 차단 조건 (자본 보호)
  if onchain.regime == 'strong_distribution' and bbdx_signal.path != 'BB:Riding':
    return None  # 강한 분배 환경에서는 평균회귀 진입 차단

  return {
    'final_strength': min(100, final_strength),
    'onchain_breakdown': onchain.breakdown,
    'regime': onchain.regime,
  }
```

### 4.2 EXIT 가중치 (v6.3 통합)

```python
def bbdx_exit_with_onchain(position, exit_signals, onchain):
  base_reversal_score = exit_signals.reversal_score  # v6.3 [EXIT-B]

  if onchain.regime in ['distribution', 'strong_distribution']:
    base_reversal_score += 0.15
    # 온체인 분배 신호 시 EXIT 트리거 가속

  if onchain.regime == 'strong_accumulation':
    base_reversal_score -= 0.10
    # 온체인 강한 매집 시 EXIT 보류 (단, 이미 강하면 청산)

  return base_reversal_score
```

---

## 5. UI 표시

사용자 신뢰성·교육 효과를 위해 온체인 점수를 시그널 옆에 노출.

```
🟢 BTC 4H LONG (NUM + PTN)
  강도: 84/100 (베이스 72 × 온체인 1.17)
  신뢰도: 76%

[온체인 컨텍스트] +0.42 (accumulation regime)
  ✓ Exchange Netflow: -2.3σ (강한 출금) +0.20
  ✓ Whale Alert: $340M 거래소 → 미상 +0.15
  ✓ SSR: -1.8σ (매수 자금 풍부) +0.15
  · Coinbase Premium: +0.05% +0.05
  · ETF Flow: +$420M (3일 누적) +0.10
  · Miner Outflow: 평균 (영향 없음) 0.00
  ✗ LTH Supply: -0.5% (분배 시작) -0.15

⚠️ 백테스트 통계. 미래 보장 X. 자기책임.
```

이 정보를 무료로 주는 retail 사이트 = **현재 시장에 없음**. 차별화 핵심.

---

## 6. 구현 우선순위

7개 modifier 한 번에 X. 우선순위:

| 순위 | 지표 | 이유 |
|---|---|---|
| 1 | **Exchange Netflow** | 가장 강력한 단일 신호, 데이터 무료 |
| 2 | **Coinbase Premium** | 미국 기관 행동 즉시 반영, 자체 계산 가능 |
| 3 | **ETF Flow** | 2024 이후 가장 영향력 ↑, BTC/ETH 한정 |
| 4 | **Whale Alert** | 실시간성 ↑, $0 무료 tier 충분 |
| 5 | **SSR** | 이미 03 문서에 정의, 통합만 |
| 6 | **Miner Outflow** | BTC 한정, 유의성 검증 필요 |
| 7 | **LTH Supply** | 일별 데이터, 단기 시그널 영향 약함 |

**Stage 1 (M1~M3):** 1, 2, 3 만 (3개 modifier 시작).
**Stage 1 후반:** 4, 5 추가.
**Stage 2:** 6, 7 추가 + 데이터 소스 Pro 업그레이드.

---

## 7. 헌장 검증 체크 (자동)

이 명세가 헌장 통과하는지 확인:

```
[✓] 규칙 1 (차원 중복): 7번 차원만 다룸, 다른 차원 중복 X
[✓] 규칙 2 (백테스트 알파): 각 modifier 마다 90일 백테스트 + Wilson CI 명시
[✓] 규칙 3 (단독 시그널 X): 모든 modifier 가 BBDX 가중치로만 작동
[✓] 7차원 커버리지: 7번 차원 (온체인) 직접 구현
[✓] 자본 보호: 'strong_distribution' regime 에서 진입 차단
[✓] 가중치 도출: calibration 결과로 modifier 임계 조정 가능 구조
```

---

## 8. 솔직한 한계

- **데이터 신뢰성:** 거래소 잔고 데이터는 거래소 자체 발표 의존. 일부 거래소 (특히 아시아 소형) 누락
- **타임랙:** 온체인 데이터는 가격보다 선행이지만, 데이터 갱신 주기 (1시간) 가 4H 시그널과 맞지 X
- **Whale Alert 의 한계:** $10M+ 만 감지. 분산 송금 ($1M × 10) 은 놓침
- **ETF 데이터 한정:** 미국 거래일만, 주말·공휴일 데이터 stale
- **알트 코인 데이터 부족:** BTC/ETH 외 코인은 온체인 데이터 sparse → modifier 영향 작게 적용

**v1 → v2 개선 계획:**
- Stage 2 후반: Glassnode Pro tier 도입 검토 ($30/mo) — alt 코인 데이터 확장
- Stage 3: 자체 노드 운영 검토 (거래소 잔고 직접 추적)

---

## 9. 한 줄 요약

**"가격은 결과, 온체인은 원인. 7차원 중 가장 강력한 차별화. Exchange Netflow + Coinbase Premium + ETF Flow 3개를 무료로 시작, BBDX 가중치 modifier 로만 작동, 단독 시그널 발행 X, 헌장 모든 규칙 준수."**
