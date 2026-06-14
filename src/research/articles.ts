/**
 * 리서치 퍼블리싱 허브 — seed 데이터 + 조회 헬퍼.
 *
 * stub-first: DB 테이블/마이그레이션 없이 in-memory seed 를 서빙한다. 향후
 * `research_articles` 테이블이 붙으면 아래 RESEARCH_ARTICLES / 헬퍼를 DB 조회로
 * 교체한다(`routers.ts` 의 TODO 참고).
 *
 * 콘텐츠 정책 (2026-06-14 주간 발행 #13):
 *   - 본문은 *기관 리서치 톤*(핵심요약 → 논거 → 촉매 → 리스크 → 결론)으로 작성하고
 *     핵심 주장마다 1차 출처를 inline <a> 로 명시(inline attribution).
 *   - 변동성 큰 가격/등락률은 본문에 *고정 수치로 박제하지 않는다*. 날짜를 명시한
 *     as-of 값 또는 범위로만 쓰고, 라이브 수치는 사이트 /sectors(섹터 동향)로 위임.
 *   - 출처가 충돌하거나 미검증인 수치는 callout(data-variant="warn") 로 플래그.
 *
 * 헌장: 리서치는 *디스커버리/교육* 콘텐츠. BBDX 시그널 시스템과 무관하며
 * 단독 매매 시그널을 발행하지 않는다.
 */

import type {
  ResearchArticle,
  ResearchArticleSummary,
  ResearchSectorId,
  ResearchType,
} from "../shared/research-types";

// ── 본문 (HTML, .prose-research 타이포그래피) ─────────────────────────

const WEEKLY_13_BODY = `
<h2 id="s1">1. 한 주 요약</h2>
<p>이번 주(6월 8~14일) 암호화폐 시장은 <strong>전형적인 위험회피(risk-off) 국면</strong>이었다. 비트코인은 6월 5일 장중 <strong>약 $59,100</strong>까지 밀리며 2026년 들어 가장 약한 한 주를 보냈고, 24시간 동안 35만 계좌·30억 달러 규모의 청산이 쏟아졌다(<a href="https://news.bitcoin.com/why-is-bitcoin-crashing-worst-week-of-2026-59100-low-and-more-than-half-of-all-btc-now-in-the-red/">Bitcoin.com</a>). 이후 6월 11~12일 "이란 전쟁 종료" 헤드라인에 위험자산이 일제히 반등하며 BTC는 <strong>$63,000대를 회복</strong>, 주간으로는 거의 보합으로 마감했다(<a href="https://finance.yahoo.com/personal-finance/investing/article/bitcoin-and-ethereum-prices-today-friday-june-12-2026-prices-rebound-this-morning-after-trump-claims-war-has-ended-115949042.html">Yahoo Finance</a>).</p>
<p>핵심은 두 가지다. 첫째, 이번 하락은 크립토 내부 악재가 아니라 <strong>매크로(지정학+인플레이션)가 주도</strong>했다. 둘째, 같은 하락장 안에서도 섹터 간 <strong>상대강도(relative strength) 차이가 뚜렷</strong>했다 — "무엇이 올랐나"보다 "무엇이 덜 빠졌나"를 읽어야 하는 한 주였다.</p>

<div class="prose-table-wrap">
<table>
<thead><tr><th>지표</th><th class="num">값 (6/12 기준)</th><th>비고</th></tr></thead>
<tbody>
<tr><td>BTC</td><td class="num">~$63,400</td><td>주간 보합, 6/5 저점 ~$59.1K</td></tr>
<tr><td>ETH</td><td class="num">~$1,670</td><td>주간 -5%대 — BTC 대비 열위</td></tr>
<tr><td>BTC 도미넌스</td><td class="num">~58%</td><td>risk-off 상승</td></tr>
<tr><td>알트시즌 지수</td><td class="num">46~49</td><td>"비트코인 시즌"(75 미만)</td></tr>
<tr><td>공포·탐욕 지수</td><td class="num">18~21</td><td>극단적 공포 (6/5~8 8~12까지 하락 후 회복)</td></tr>
</tbody>
</table>
</div>
<figure>
  <div class="prose-figure-placeholder" role="img" aria-label="비트코인 주간 가격 흐름 차트 자리"></div>
  <figcaption>그림 1. BTC는 6/5 연중 저점(~$59.1K) 후 6/11~12 종전 헤드라인에 반등(개념도, as-of 6/12). 라이브 차트는 <a href="/">시그널 스캐너</a> 참조.</figcaption>
</figure>

<h2 id="s2">2. 매크로 — 이란 쇼크와 인플레이션 벽</h2>
<p>한 주를 지배한 변수는 <strong>이란-미국 충돌과 유가</strong>였다. 미군의 추가 공습으로 에너지 가격이 급등했고, 이는 곧바로 물가 지표로 번졌다. 6월 10일 발표된 <strong>5월 미국 CPI는 전년比 +4.2%</strong>로 4월(+3.8%)에서 가속 — 2023년 5월 이후 최고치를 기록했다(<a href="https://blog.kraken.com/economic-brief/june-10-2026">Kraken</a>). 다음 날 PPI도 뜨겁게 나오며 "연준의 2026년 첫 금리 인하" 시나리오를 정면으로 흔들었다.</p>
<p>결과적으로 <strong>금리 인하는 테이블에서 내려갔고</strong>, 시장은 일부 12월 인상 가능성까지 가격에 반영하기 시작했다(현 기준금리 3.50~3.75%, <a href="https://www.gomarkets.com/en/articles/us-market-drivers-june-2026">GO Markets</a>). 달러지수(DXY)는 ~100 부근으로 단단했다. 채권 금리가 높게 유지되는 환경은 이자가 없는 BTC에 직접적인 역풍이며, 이번 주 ETF 순유출(4번 섹션)의 근본 원인이다.</p>
<p>유일한 구조적 호재는 정책에서 나왔다. <strong>일본 중의원이 6월 11일 디지털자산 개혁 법안을 통과</strong>시켜 BTC·ETH 등을 금융상품거래법(FIEA) 체계로 재분류하고, 세율을 최고 55%에서 <strong>일률 20%로 인하</strong>하며 현물 ETF 경로를 열었다(<a href="https://dataconomy.com/2026/06/11/japan-crypto-tax-etfs-legislation/">Dataconomy</a>).</p>
<div class="prose-callout" data-variant="warn">
  <p><strong>해석 주의.</strong> 일본 20% 세율은 <strong>중의원만 통과(참의원 표결 남음)</strong>했고 "특정 암호자산"에 한정되며, 시행은 <strong>2027~2028년경</strong>으로 알려졌다 — 즉시 적용이 아니다. 단기 시그널은 세율 자체보다 <strong>현물 ETF 경로 개방</strong> 쪽이 더 크다.</p>
</div>

<h2 id="s3">3. 섹터 로테이션 — 하락장의 상대강도</h2>
<p>-20%대의 월간 드로다운 안에서 "리더십"은 절대 상승이 아니라 <strong>상대적으로 덜 빠진 것</strong>을 의미한다. 이번 주 상대강도 순서는 대략 다음과 같았다.</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th class="num">순위</th><th>섹터</th><th>성격</th><th>동인</th></tr></thead>
<tbody>
<tr><td class="num">1</td><td>양자내성(Quantum)</td><td>강한 상대강도</td><td>Vitalik·Citi·Google 양자 경고, 6/10 CoinDesk "퀀텀 시계" 칼럼; ZEC 주도</td></tr>
<tr><td class="num">2</td><td>RWA</td><td>하락장서 버팀</td><td>구조적 기관 토큰화 + Ondo 신제품(별도 글)</td></tr>
<tr><td class="num">3</td><td>AI</td><td>반등장 고베타 리더</td><td>TAO·RENDER 반등 주도, OpenAI IPO 후광(별도 글)</td></tr>
<tr><td class="num">4</td><td>BTC</td><td>alt 대비 우위</td><td>안전자산 선호</td></tr>
<tr><td class="num">5</td><td>ETH·L2·DeFi</td><td>열위</td><td>ETH ETF 순유출, 고베타 디리스킹</td></tr>
<tr><td class="num">6</td><td>Meme</td><td>최약</td><td>유동성 축소 1순위 매도</td></tr>
</tbody>
</table>
</div>
<div class="prose-callout" data-variant="warn">
  <p><strong>수치 주의.</strong> 자주 인용되는 "양자내성 섹터, BTC 대비 +59% 아웃퍼폼"은 <strong>5월 한 달</strong> 기준(Binance Research, ZEC 주도)이지 이번 주 수치가 아니다(<a href="https://www.fxstreet.com/cryptocurrencies/news/tokenized-rwas-surge-589-despite-crypto-market-pullback-in-may-binance-research-202606090212">FXStreet/Binance</a>). 위 표의 순위는 방향성 상대강도이며, 정확한 섹터별 등락은 사이트의 <a href="/sectors">섹터 동향</a> 라이브 집계를 참고하라.</p>
</div>

<h2 id="s4">4. 자금 흐름 — ETF 순유출 vs 스테이블코인</h2>
<p>이번 주 흐름은 상반된 두 신호를 동시에 보냈다.</p>
<p><strong>① 비트코인 현물 ETF: 사상 최대급 순유출.</strong> 6월 초 미국 BTC 현물 ETF에서 한 주 동안 약 <strong>34억 달러</strong>가 빠져나가며 2024년 1월 출시 이후 최대 주간 순유출을 기록했다(<a href="https://www.investing.com/analysis/bitcoins-34-billion-etf-bleed-looks-more-cyclical-than-structural-200681474">Investing.com</a>). 4주 연속 순유출 누적은 약 -54억 달러. 원인은 명확하다 — 높은 금리가 유지되며 채권이 BTC보다 매력적이기 때문이다(별도 플래시 노트 참조).</p>
<p><strong>② 스테이블코인: 사상 최대 "대기 자본".</strong> 반면 스테이블코인 총공급은 <strong>~$320~321B로 사상 최고치</strong> 부근을 유지했다(USDT ~$188B, USDC ~$78B, <a href="https://defillama.com/stablecoins">DefiLlama</a>). 가격이 빠지는 동안에도 온체인 달러는 줄지 않았다 — 사이드라인에 마른 화약(dry powder)이 쌓여 있다는 의미다.</p>
<blockquote>ETF에서 돈이 나가는데 스테이블코인은 사상 최대. 자본이 시장을 "떠난" 게 아니라 "관망"으로 옮겨갔다고 읽는 편이 사실에 가깝다.</blockquote>

<h2 id="s5">5. 다음 주 관전 포인트</h2>
<ul>
  <li><strong>FOMC (6/17, 현지)</strong> — 3.50~3.75% 동결 유력. <strong>케빈 워시 신임 의장의 첫 회의</strong>이자 점도표·인플레 톤이 이번 주 최대 변수(<a href="https://blog.kraken.com/economic-brief/june-10-2026">Kraken</a>).</li>
  <li><strong>SpaceX IPO</strong> — 사상 최대급 상장이 투기 자본을 주식 쪽으로 흡수할지 여부.</li>
  <li><strong>이란 종전 후속</strong> — 주말 "유럽서 서명" 발언의 실현 여부. 확인 시 유가↓ → 인플레 완화 → 위험선호 연장, 불발 시 급반전.</li>
  <li><strong>Deribit BTC·ETH 옵션 만기 (6/19)</strong> — FOMC 직후 대형 만기로 변동성 확대 가능.</li>
</ul>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 주간 시황은 시장 구조에 대한 관찰·교육 콘텐츠이며, BBDX 시그널과 무관하다. 개별 진입·청산 판단은 시그널 스캐너의 RSI·BB·ADX 컨플루언스를 따르며, 본 글은 단독 매매 신호를 발행하지 않는다. 과거 성과는 미래를 보장하지 않는다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://news.bitcoin.com/why-is-bitcoin-crashing-worst-week-of-2026-59100-low-and-more-than-half-of-all-btc-now-in-the-red/">Bitcoin.com — 2026 최악의 주, $59,100 저점</a></li>
  <li><a href="https://finance.yahoo.com/personal-finance/investing/article/bitcoin-and-ethereum-prices-today-friday-june-12-2026-prices-rebound-this-morning-after-trump-claims-war-has-ended-115949042.html">Yahoo Finance — 종전 헤드라인 반등(6/12)</a></li>
  <li><a href="https://blog.kraken.com/economic-brief/june-10-2026">Kraken — CPI·FOMC·SpaceX 브리프</a></li>
  <li><a href="https://www.gomarkets.com/en/articles/us-market-drivers-june-2026">GO Markets — 6월 미국 시장 동인</a></li>
  <li><a href="https://dataconomy.com/2026/06/11/japan-crypto-tax-etfs-legislation/">Dataconomy — 일본 디지털자산 개혁 법안</a></li>
  <li><a href="https://www.fxstreet.com/cryptocurrencies/news/tokenized-rwas-surge-589-despite-crypto-market-pullback-in-may-binance-research-202606090212">FXStreet/Binance Research — 5월 섹터 동향</a></li>
  <li><a href="https://www.investing.com/analysis/bitcoins-34-billion-etf-bleed-looks-more-cyclical-than-structural-200681474">Investing.com — BTC ETF $3.4B 순유출</a></li>
  <li><a href="https://defillama.com/stablecoins">DefiLlama — 스테이블코인 공급</a></li>
</ul>
`;

const AI_DEEPDIVE_BODY = `
<h2 id="s1">1. 핵심 — 하락장 속 상대강도, 그러나 "수익 사막"</h2>
<p>2026년 6월 현재 AI 섹터는 크립토에서 가장 두드러진 <strong>상대강도</strong>를 보이는 영역이다. 다만 결정적으로, 그 강세는 <em>강세장이 아니라 광범위한 하락장 안에서의 아웃퍼폼</em>이다. BTC가 ~$60K대로 밀리고 시장이 극단적 공포에 잠긴 동안에도 TAO·FET·RENDER·NEAR·WLD 같은 AI 토큰은 양(+)의 월간 수익률을 지켰다.</p>
<p>지배적 동력은 <strong>AI 주식 복합체(NVIDIA·OpenAI·Anthropic)와의 내러티브·상관 트레이드</strong>이며, 토큰별 공급 축소가 이를 증폭한다. 반대로 그 아래에는 <strong>"가격이 검증 가능한 매출을 크게 앞선다"</strong>는 구조적 간극(income desert)이 있다. 즉, 모멘텀 리더십과 펀더멘털 공백이 공존한다.</p>

<h2 id="s2">2. 무엇이 끌어올렸나 — 6개 촉매</h2>
<p><strong>① 젠슨 황의 Bittensor 지지(3월 GTC).</strong> NVIDIA CEO가 분산 학습 방식의 Bittensor를 "현대판 Folding@home"이라 언급한 이후 TAO는 3월에만 ~+90% 급등했고, 그 효과가 6월의 추세 강도에 여전히 깔려 있다(<a href="https://www.coindesk.com/tech/2026/03/25/bittensor-ecosystem-tokens-value-hit-usd1-5-billion-as-jensen-huang-endorsement-supports-tao-rally">CoinDesk</a>).</p>
<p><strong>② OpenAI IPO 신청 → WLD(6/8~9).</strong> OpenAI가 6월 8일 비공개 S-1을 제출하자(<a href="https://www.cnbc.com/2026/06/08/openai-confidentially-files-for-ipo-prepping-wall-street-for-ai-debut.html">CNBC</a>), 샘 알트먼이 공동창업한 Worldcoin의 WLD가 다음 날 급등했다 — AI 주식↔AI 크립토 상관의 가장 선명한 6월 사례다(<a href="https://stocktwits.com/news-articles/markets/cryptocurrency/worldcoin-wld-surges-openai-confidential-ipo-filing-ai-vs-crypto/cZ0UIL9R7bY">Stocktwits</a>).</p>
<p><strong>③ NVIDIA의 "$1T AI 칩 수요" 프레이밍.</strong> 6월 1일 GTC 타이베이 키노트가 2027년까지 약 1조 달러 AI 칩 수요 서사를 리포트 기간 초입에 다시 각인시켰다 — RENDER·AKT·TAO 같은 분산 GPU·컴퓨팅 테제의 매크로 배경이다(<a href="https://www.cnbc.com/2026/03/16/nvidia-gtc-2026-ceo-jensen-huang-keynote-blackwell-vera-rubin.html">CNBC</a>).</p>
<p><strong>④ NEAR의 제품 출하(5월말~6월).</strong> NEAR는 동적 리샤딩(v2.13, 6월), AI 프롬프트 익명화, 에이전트 커머스(NEAR Intents), 포스트양자 서명 테스트넷 등 <strong>실제 출하된 업그레이드</strong>로 급등했다 — 이 섹터에서 드물게 "구체적 제품"에 기반한 무브였다(<a href="https://decrypt.co/368737/near-protocol-jumps-28-on-privacy-ai-and-scaling-upgrades">Decrypt</a>).</p>
<p><strong>⑤ 공급 축소(burn·halving·emission cut).</strong> Bittensor의 첫 반감기(2025/12, 일일 발행 7,200→3,600 TAO), Venice(VVV)의 매출 기반 소각, Worldcoin의 7월 24일 ~43% 발행 감소가 유통량을 조여 어떤 수요 충격에도 상방을 키운다(<a href="https://docs.learnbittensor.org/learn/emissions">Bittensor Docs</a>).</p>
<p><strong>⑥ TAO 현물 ETF 신청.</strong> Grayscale(GTAO)·Bitwise가 Bittensor 현물 ETF를 신청했고 SEC 결정은 <strong>~8월</strong>로 예상된다 — 섹터 대장주의 기관 접근성 촉매다(<a href="https://coinmarketcap.com/academy/article/grayscale-files-first-us-bittensor-tao-etp">CoinMarketCap Academy</a>).</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th>토큰</th><th>~1개월 변동(보도 기준)</th><th>비고</th></tr></thead>
<tbody>
<tr><td>TAO (Bittensor)</td><td class="num">~+87%</td><td>상당 부분 3월 GTC 레그가 추세에 잔존</td></tr>
<tr><td>FET (ASI)</td><td class="num">~+60%</td><td>6/28 클리프 언락 예정(역풍)</td></tr>
<tr><td>NEAR</td><td class="num">~+60%</td><td>제품 출하 기반 — 비교적 깨끗한 촉매</td></tr>
<tr><td>WLD</td><td class="num">~+120%+</td><td>5/18 ATL($0.23) 대비 회복</td></tr>
<tr><td>RENDER</td><td class="num">~+31%</td><td>GPU 컴퓨팅 인프라</td></tr>
</tbody>
</table>
</div>
<div class="prose-callout" data-variant="warn">
  <p><strong>수치 주의.</strong> 위 등락의 상당수는 <strong>3월 황 발언 레그</strong>가 트레일링 30일에 겹친 값이다. 6/8~14 구간은 "하락장 속 상대강도 유지 + 신규 6월 촉매(OpenAI·NEAR)"로 읽는 게 정확하다. 정확한 as-of 수치는 사이트 <a href="/sectors">섹터 동향(AI)</a> 라이브 집계를 확인하라.</p>
</div>

<h2 id="s3">3. 펀더멘털 — 가격이 매출을 크게 앞선다</h2>
<p>이 섹터의 정의적 사실은 <strong>가격 강세가 검증 가능한 매출을 크게 앞선다</strong>는 점이다. 독립 분석은 Bittensor의 <em>외부(비-발행) 매출</em>을 연환산 <strong>약 $3M~$15M</strong>로 추정한다 — 수십억 달러 시총 대비 극히 작은 값이다. 대표 추론 서브넷 Chutes(SN64)조차 매출의 상당분이 보조금이며, 발행:외부매출 비율이 <strong>22:1~40:1</strong> 수준으로 알려졌다(<a href="https://ambcrypto.com/why-analysts-believe-bittensors-income-desert-could-trigger-tao-rerating/">AMBCrypto</a>, <a href="https://finance.yahoo.com/markets/crypto/articles/bittensor-income-desert-why-52m-113344918.html">Yahoo Finance</a>).</p>
<p>구조적 약점은 <strong>온체인 검증 불가</strong>다. AI 추론 호출 대부분이 오프체인에서 일어나 사용량을 신뢰성 있게 측정하기 어렵다. 즉 "사용량"의 상당 부분이 인센티브 파밍일 수 있다. 예외적으로 Venice(VVV)는 <strong>법정화폐 매출 → 소각</strong> 루프를 가진 드문 사례다(<a href="https://venice.ai/token">Venice</a>).</p>
<blockquote>AI 토큰을 평가할 때는 "내러티브 프리미엄"과 "실제 수수료 창출"을 반드시 분리해야 한다. 둘을 합쳐 보면 거의 항상 고평가로 보인다.</blockquote>

<h2 id="s4">4. 리스크 — 내러티브 프리미엄과 자본 경쟁</h2>
<ul>
  <li><strong>내러티브 ≫ 매출.</strong> 보조금이 실수요보다 먼저 줄면 급격한 리레이팅 위험. 섹터 전반에 일반화된다.</li>
  <li><strong>AI 주식이 자본을 두고 경쟁한다.</strong> Galaxy의 Novogratz는 "자본이 디지털자산보다 AI로 흐른다"고 지적했다 — WLD를 띄운 IPO 파도가 동시에 크립토에서 자본을 빼낼 수 있다(<a href="https://stocktwits.com/news-articles/markets/cryptocurrency/worldcoin-wld-surges-openai-confidential-ipo-filing-ai-vs-crypto/cZ0UIL9R7bY">Stocktwits</a>).</li>
  <li><strong>고베타 + 언락 오버행.</strong> 취약한 매크로에서 고베타 AI 토큰은 BTC 하락 시 가장 크게 맞는다. <strong>FET/ASI 6월 28일 클리프 언락</strong>이 구체적 공급 역풍(<a href="https://tokenomist.ai/fetch-ai">Tokenomist</a>).</li>
  <li><strong>서브넷 토큰의 반사성(reflexivity).</strong> TAO 생태계 서브넷 토큰은 "모회사에 대한 레버리지 베팅"이라 상·하방을 모두 격렬하게 증폭한다.</li>
</ul>

<h2 id="s5">5. 어떻게 평가할까 — 체크리스트 + 다음 촉매</h2>
<p>AI 토큰은 가격 모멘텀이 아니라 다음 질문으로 접근해야 한다. (1) 매출이 <em>발행 보조금</em>인가 <em>외부 수요</em>인가. (2) 사용량이 온체인에서 검증되는가. (3) 공급 일정(언락·소각)이 향후 6개월 어디로 향하는가. 이 세 가지가 불명확하면, 표시된 모멘텀은 내러티브 프리미엄일 가능성이 높다.</p>
<ul>
  <li><strong>6/28</strong> — FET/ASI 클리프 언락(공급 역풍 점검).</li>
  <li><strong>6월말</strong> — NEAR 동적 리샤딩 v2.13 + 포스트양자 테스트넷(실행 점검).</li>
  <li><strong>7/24</strong> — Worldcoin 발행 ~43% 감소.</li>
  <li><strong>~8월</strong> — SEC의 TAO 현물 ETF(GTAO/Bitwise) 결정 — 섹터 최대 구조적 촉매.</li>
</ul>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 글은 섹터 구조·펀더멘털에 대한 교육 콘텐츠로 BBDX 시그널과 무관하며, 단독 매매 신호를 발행하지 않는다. 디지털 자산은 변동성이 매우 크고 원금 전액 손실이 가능하다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://www.coindesk.com/tech/2026/03/25/bittensor-ecosystem-tokens-value-hit-usd1-5-billion-as-jensen-huang-endorsement-supports-tao-rally">CoinDesk — 황 발언과 Bittensor 생태계</a></li>
  <li><a href="https://www.cnbc.com/2026/06/08/openai-confidentially-files-for-ipo-prepping-wall-street-for-ai-debut.html">CNBC — OpenAI 비공개 IPO 신청</a></li>
  <li><a href="https://decrypt.co/368737/near-protocol-jumps-28-on-privacy-ai-and-scaling-upgrades">Decrypt — NEAR 업그레이드 랠리</a></li>
  <li><a href="https://ambcrypto.com/why-analysts-believe-bittensors-income-desert-could-trigger-tao-rerating/">AMBCrypto — Bittensor "income desert"</a></li>
  <li><a href="https://coinmarketcap.com/academy/article/grayscale-files-first-us-bittensor-tao-etp">CoinMarketCap — Grayscale TAO ETF 신청</a></li>
  <li><a href="https://tokenomist.ai/fetch-ai">Tokenomist — FET/ASI 베스팅 일정</a></li>
</ul>
`;

const RWA_DEEPDIVE_BODY = `
<h2 id="s1">1. 핵심 — 토큰화가 하락장에서도 버틴 이유</h2>
<p>이번 주 시장 전반이 risk-off로 빠지는 동안, <strong>RWA(실물자산 토큰화)</strong>는 가장 잘 버틴 섹터 중 하나였다. 이유는 단순하다. RWA의 수요는 <em>리테일 투기</em>가 아니라 <strong>기관의 온체인 수익(yield) 수요</strong>에서 나오며, 이 수요는 BTC 가격 사이클과 상관이 낮기 때문이다. 가격이 빠질 때 "온체인 현금성 자산"으로 피신하려는 자본이 오히려 RWA로 흘러든다.</p>

<h2 id="s2">2. 시장 규모 — 숫자 바로 읽기</h2>
<p>RWA는 숫자 인용이 가장 자주 틀리는 섹터다. 세 가지를 구분해야 한다.</p>
<ul>
  <li><strong>온체인 분산 가치(rwa.xyz, 스테이블 제외): ~$32B</strong> — 헤드라인 집계. 최근 30일 ~-1%로 사실상 횡보. 다만 <strong>보유자 수는 +14.8%(약 909,000명)</strong>로 달러 AUM보다 빠르게 늘었다 — 저변 확대 신호(<a href="https://app.rwa.xyz/">rwa.xyz</a>).</li>
  <li><strong>"+589%" = Binance "active RWA" 지표</strong>(2025년 초 → 2026/6, 토큰화 <em>주식</em>이 +422%로 견인). rwa.xyz의 $32B 집계나 CoinGecko의 +256.7%와는 <em>다른 정의</em>다 — 같은 글에서 섞어 쓰면 안 된다(<a href="https://www.gncrypto.news/news/tokenized-rwas-jump-589-june-2026-binance-research/">Binance Research</a>).</li>
  <li><strong>토큰화 국채 AUM: ~$11~15B 범위</strong>(정의·출처별 상이). 2026/2/11 처음 $10B 돌파(<a href="https://www.coingecko.com/research/publications/rwa-report-2026">CoinGecko RWA Report 2026</a>).</li>
</ul>
<div class="prose-callout" data-variant="warn">
  <p><strong>수치 주의.</strong> "+589%"는 <strong>약 18개월 누적 성장</strong>이지 이번 주 급등이 아니다. 또한 흔히 RWA L2로 언급되는 토큰 티커 혼동 주의 — <strong>XPL은 Plasma, Plume의 토큰은 PLUME</strong>이다.</p>
</div>

<h2 id="s3">3. 무엇이 끌어올렸나 — 4대 촉매</h2>
<p><strong>① Ondo의 제품 확장 → 토큰화 주식 + 레버리지.</strong> Ondo는 6월 9일 <strong>Ondo Perps</strong>를 출시해 비미국 트레이더가 토큰화 미국 주식·ETF를 최대 20배로 거래하게 했고, Ondo Global Markets는 약 8개월 만에 <strong>$1B TVL</strong>(250+ 종목)을 넘겼다 — 수동 토큰화에서 능동 거래 레일로의 전환이며 6월 초 ONDO 강세의 직접 동인이다(<a href="https://www.banklesstimes.com/articles/2026/06/04/ondo-finance-price-prediction-ahead-of-june-9-perps-launch/">BanklessTimes</a>).</p>
<p><strong>② 기관 정산 레일(OUSG on XRPL).</strong> 6월 11일 OUSG 발행·상환이 XRP Ledger에서 24/7 가동됐고, <strong>JPMorgan·Mastercard·Ripple</strong>과 함께 첫 국경 간 토큰화 국채 상환을 실행했다 — RWA가 단순 보유 자산이 아니라 합성·정산 가능한 레일임을 보였다(<a href="https://www.panewslab.com/en/articles/019e2b05-60b1-764a-b6e3-8be94dd2667c">PANews</a>).</p>
<p><strong>③ BlackRock의 추가 토큰화 펀드.</strong> BlackRock은 5월 8~9일 스테이블코인 보유자를 위한 <strong>토큰화 MMF 2종</strong>을 Securitize와 함께 SEC에 신청했고, BUIDL은 파생거래 담보로 승인됐다(<a href="https://www.coindesk.com/business/2026/05/09/blackrock-deepens-tokenization-push-with-new-onchain-fund-offerings">CoinDesk</a>). (신청은 아직 미승인 — 일정 미정.)</p>
<p><strong>④ 규제 가시성(CLARITY Act).</strong> 상원 은행위가 5월 중순 CLARITY Act를 본회의로 진전시켰고, 시장은 2026년 통과 확률을 ~59%로 가격화했다(<a href="https://www.coindesk.com/policy/2026/05/14/live-senate-banking-committee-holds-key-hearing-to-advance-clarity-act">CoinDesk</a>). 디지털 증권 관할을 정리하는 법안으로 토큰화 RWA의 법적 지위에 직접적이다 — 단, <em>아직 통과 미확정</em>.</p>
<p>또한 6월 5~6일 <strong>ether.fi가 Plume의 RWA 볼트에 $100M을 약정</strong>해 BlackRock CLO ETF·Fidelity 채권 ETF로 DeFi 유동성을 연결했다 — RWA가 "보유"를 넘어 <strong>DeFi 담보·수익원</strong>으로 소비되는 흐름이다(<a href="https://cryptodaily.co.uk/2026/06/etherfi-100m-plume-rwa-vault-beyond-tvl">CryptoDaily</a>).</p>

<h2 id="s4">4. 누가 발행하고 누가 사는가</h2>
<p>발행 측은 자산운용사(MMF 토큰 래퍼)·크립토 네이티브 프로토콜·핀테크로 나뉜다. 수요 측의 핵심은 <strong>DAO 트레저리·스테이블코인 발행사·온체인 펀드</strong> — 유휴 스테이블코인을 토큰화 국채로 옮겨 4~5% 이자를 확보한다.</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th>상품</th><th>발행사</th><th class="num">AUM(개략)</th><th class="num">수익률</th></tr></thead>
<tbody>
<tr><td>USYC</td><td>Circle(Hashnote)</td><td class="num">~$3.0B</td><td class="num">—</td></tr>
<tr><td>BUIDL</td><td>BlackRock/Securitize</td><td class="num">~$2.3~2.5B</td><td class="num">~4.0~4.5%</td></tr>
<tr><td>BENJI</td><td>Franklin Templeton</td><td class="num">~$2.3B</td><td class="num">~4.0~4.5%</td></tr>
<tr><td>USDY</td><td>Ondo</td><td class="num">~$2.2B</td><td class="num">~4.8%</td></tr>
<tr><td>OUSG</td><td>Ondo</td><td class="num">~$670M</td><td class="num">—</td></tr>
</tbody>
</table>
</div>
<figcaption>출처: <a href="https://app.rwa.xyz/">rwa.xyz</a>, <a href="https://eco.com/support/en/articles/15210582-top-tokenized-treasury-funds-2026-buidl-ousg-usdy-benji-compared">eco.com</a> (값은 출처·일자별 상이, 범위로 해석).</figcaption>

<h2 id="s5">5. 리스크 — 온체인이라 안전하다는 착각</h2>
<ul>
  <li><strong>발행사·커스터디언 신용 위험.</strong> 수익의 원천이 오프체인(실제 국채)에 있어, 토큰 보유자는 발행사·신탁의 신뢰 사슬에 의존한다. 스마트컨트랙트 감사보다 <em>기초 자산의 파산 격리(bankruptcy-remote)</em> 여부가 훨씬 중요하다.</li>
  <li><strong>집중도.</strong> 국채가 섹터의 ~67%, 이더리움이 토큰화 RWA의 ~50%를 차지 — 소수 발행사·체인에 쏠려 있다.</li>
  <li><strong>금리 민감도.</strong> 4~5% 수익률이 테제의 닻인데, 연준 완화 사이클은 이 수익률을 압축한다. 최근 헤드라인 분산 가치가 ~-1% MoM로 식은 점도 같은 맥락.</li>
  <li><strong>규제 미확정.</strong> CLARITY Act는 <em>아직 4단계 남았고</em> 통과가 보장되지 않는다 — 비증권으로 다뤄지던 토큰이 증권으로 재분류될 위험.</li>
</ul>

<h2 id="s6">6. 투자자 체크리스트</h2>
<p>RWA 토큰을 평가할 때는 거버넌스 토큰의 가격 모멘텀이 아니라 구조를 먼저 본다. (1) 기초 자산은 무엇이며 누가 보관하는가. (2) 수익은 어떤 경로로 분배되는가. (3) 발행사가 사라지면 회수할 <strong>법적 청구권</strong>이 있는가. 이 셋이 명확하지 않다면, 표시된 APY는 결국 신용 위험의 대가다.</p>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 글은 섹터 구조·리스크에 대한 교육 콘텐츠로 BBDX 시그널과 무관하며, 단독 매매 신호를 발행하지 않는다. 표시된 수익률·AUM은 발행 시점 기준이며 변동한다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://app.rwa.xyz/">rwa.xyz — 라이브 RWA 대시보드</a></li>
  <li><a href="https://www.gncrypto.news/news/tokenized-rwas-jump-589-june-2026-binance-research/">Binance Research — "active RWA" +589%</a></li>
  <li><a href="https://www.coindesk.com/business/2026/05/09/blackrock-deepens-tokenization-push-with-new-onchain-fund-offerings">CoinDesk — BlackRock 토큰화 펀드 신청</a></li>
  <li><a href="https://www.panewslab.com/en/articles/019e2b05-60b1-764a-b6e3-8be94dd2667c">PANews — OUSG XRPL 국경 간 정산</a></li>
  <li><a href="https://www.coindesk.com/policy/2026/05/14/live-senate-banking-committee-holds-key-hearing-to-advance-clarity-act">CoinDesk — CLARITY Act 진전</a></li>
  <li><a href="https://cryptodaily.co.uk/2026/06/etherfi-100m-plume-rwa-vault-beyond-tvl">CryptoDaily — ether.fi $100M Plume 볼트</a></li>
  <li><a href="https://www.coingecko.com/research/publications/rwa-report-2026">CoinGecko — RWA Report 2026</a></li>
</ul>
`;

const DEFI_DEEPDIVE_BODY = `
<h2 id="s1">1. 핵심 — BTC 횡보 속 블루칩 회전, 진짜 동력은 수수료 스위치</h2>
<p>이번 주 DeFi는 "BTC 횡보 → 블루칩으로 자본 회전"의 교과서적 흐름이었다. UNI·CRV·AAVE가 반복적으로 선두에 섰고, Stargate(STG)가 고베타 돌발 무브를 만들었다(<a href="https://beincrypto.com/defi-tokens-uni-crv-and-aave-lead-crypto-gains-can-near-follow-suit/">BeInCrypto</a>). 다만 가격 무브의 상당수는 <strong>이벤트(거버넌스·M&amp;A) 주도</strong>였고, 지속 가능한 신호는 따로 있다 — <strong>수수료 스위치(fee switch)로 매출이 토큰에 쌓이기 시작했다</strong>는 것.</p>

<h2 id="s2">2. 무엇이 끌어올렸나 — 3대 촉매</h2>
<p><strong>① Uniswap "UNIfication" 수수료 스위치 → L2 확장.</strong> 메인넷 v2/v3 프로토콜 수수료를 켜고 <strong>UNI 바이백·소각</strong>(100M UNI 소급 소각 포함)을 가동한 데 이어, 6월에 <strong>8개 체인으로 확장 + 티어 기반 "기본 ON"</strong> 투표가 진전되며 UNI가 급등했다(6/5 134k UNI 소각). 섹터 최대의 "실매출 → 토큰" 스토리다(<a href="https://blog.uniswap.org/unification">Uniswap Blog</a>, <a href="https://www.fxstreet.com/cryptocurrencies/news/uniswaps-uni-jumps-15-as-governance-vote-to-expand-fee-switch-gains-momentum-202602261227">FXStreet</a>).</p>
<p><strong>② Curve Llamalend v2(6/10).</strong> Curve가 Optimism에 Llamalend v2를 출시해 <strong>Curve LP 토큰을 담보</strong>로 받는 격리 시장을 열었고, 비-crvUSD 시장이 DAO에 admin fee를 지급해 <strong>veCRV 매출</strong>과 직결시켰다. CRV는 ~+22% 반응했다(<a href="https://www.banklesstimes.com/articles/2026/06/11/curve-dao-token-jumps-22-tests-0-28-after-llamalend-v2-launch/">BanklessTimes</a>).</p>
<p><strong>③ Stargate 인수전(LayerZero vs Wormhole).</strong> LayerZero가 ~$110M 전량 주식 인수를, Wormhole이 ~$120M USDC로 맞불을 놓으며 STG가 주간 폭등 후 장중 급반전했다 — 펀더멘털이 아니라 <strong>M&amp;A 이벤트</strong> 무브다. 최종적으로 DAO는 LayerZero를 택했다(<a href="https://www.theblock.co/post/367705/wormhole-counters-layerzeros-110-million-bid-to-buy-stargate-asks-to-pause-voting-period">The Block</a>).</p>
<div class="prose-callout" data-variant="warn">
  <p><strong>수치 주의.</strong> 이번 주 알트 가격은 출처 간 편차가 크다(예: AAVE·STG 호가가 기사별로 상이, STG는 주간 +100%대 후 장중 -50%대 반전). 본문은 방향성·동인 중심으로 서술하며, 정확한 가격·등락은 라이브 차트로 확인하라.</p>
</div>

<h2 id="s3">3. 구조적 토대 — 기록적 스테이블코인 + 회복력 TVL</h2>
<p>가격 변동 아래의 토대는 견고하다. <strong>스테이블코인 총공급은 ~$320~321B로 사상 최고치</strong>(USDT ~$185B, USDC ~$78B) — 더 많은 온체인 달러는 더 깊은 DEX 유동성·더 큰 대출 예치·더 풍부한 담보를 뜻한다(<a href="https://www.kucoin.com/blog/Stablecoin-Liquidity-Hits-$320B-Milestone-in-May-2026">KuCoin</a>). 전체 DeFi TVL은 ~$130~140B 수준으로, Q1 2026 매도세에서도 "수익 추구 자본이 머물며" 버텼다(<a href="https://www.coindesk.com/business/2026/02/03/defi-s-quiet-strength-tvl-holds-as-market-selloff-tests-traders">CoinDesk</a>). Aave는 V3 TVL ~$14.5B, GHO 스테이블코인 $500M+ 돌파로 회복력을 보였다(<a href="https://www.ainvest.com/news/aave-gho-stablecoin-surpasses-500m-defi-tvl-remains-resilient-market-sell-2602/">Ainvest</a>).</p>

<h2 id="s4">4. 진짜 수익 vs 이벤트 거품</h2>
<p>이번 주의 교훈은 둘을 분리하는 것이다.</p>
<ul>
  <li><strong>지속 가능한 신호 = 수수료 매출의 토큰 귀속.</strong> UNI(바이백·소각), CRV(veCRV admin fee), ENA(sENA로 매출 라우팅), AAVE(GHO·프로토콜 수익) — 가격이 아니라 <em>매출 적립 구조</em>가 핵심.</li>
  <li><strong>거품 신호 = M&amp;A·이벤트 추격.</strong> STG의 +100%대 캔들이 장중 절반을 반납한 것이 전형 — 유기적 사용이 아니라 거래 이벤트 프리미엄.</li>
</ul>
<blockquote>가격 스파이크는 잊어도 좋다. DeFi에서 추적할 단 하나는 "수수료가 실제로 토큰 보유자에게 돌아가기 시작했는가"이다.</blockquote>

<h2 id="s5">5. 리스크</h2>
<ul>
  <li><strong>인센티브 TVL vs 끈적한 TVL.</strong> 이번 주 무브의 상당수가 이벤트·모멘텀 주도 — 인센티브가 빠지면 되돌림.</li>
  <li><strong>디페그·전염 위험.</strong> Aave는 2026년 4월 서드파티 브리지 익스플로잇(~116,500 rsETH 무담보화)으로 악성 부채를 흡수한 바 있다 — 담보 품질·크로스체인 브리지가 섹터의 꼬리 위험. Ethena USDe는 펀딩률 의존 수익이라 음(-)의 펀딩 국면에 취약(<a href="https://coinlaw.io/aave-statistics/">Coinlaw</a>).</li>
  <li><strong>수익 지속성.</strong> Pendle·Ethena식 "온체인 고정수익"은 기초 펀딩·베이시스가 뒤집히면 빠르게 압축된다.</li>
</ul>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 글은 섹터 구조에 대한 교육 콘텐츠로 BBDX 시그널과 무관하며, 단독 매매 신호를 발행하지 않는다. 디지털 자산은 변동성이 매우 크다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://blog.uniswap.org/unification">Uniswap Blog — UNIfication(수수료 스위치)</a></li>
  <li><a href="https://www.banklesstimes.com/articles/2026/06/11/curve-dao-token-jumps-22-tests-0-28-after-llamalend-v2-launch/">BanklessTimes — Curve Llamalend v2</a></li>
  <li><a href="https://www.theblock.co/post/367705/wormhole-counters-layerzeros-110-million-bid-to-buy-stargate-asks-to-pause-voting-period">The Block — Stargate 인수전</a></li>
  <li><a href="https://www.kucoin.com/blog/Stablecoin-Liquidity-Hits-$320B-Milestone-in-May-2026">KuCoin — 스테이블코인 $320B</a></li>
  <li><a href="https://www.coindesk.com/business/2026/02/03/defi-s-quiet-strength-tvl-holds-as-market-selloff-tests-traders">CoinDesk — DeFi TVL 회복력</a></li>
  <li><a href="https://www.ainvest.com/news/aave-gho-stablecoin-surpasses-500m-defi-tvl-remains-resilient-market-sell-2602/">Ainvest — Aave GHO $500M</a></li>
</ul>
`;

const BTC_ETF_FLASH_BODY = `
<h2 id="s1">1. 무슨 일이 있었나 — 사상 최대급 순유출</h2>
<p>6월 초 미국 비트코인 현물 ETF에서 한 주 동안 약 <strong>34억 달러</strong>가 빠져나갔다 — <strong>2024년 1월 출시 이후 최대 주간 순유출</strong>이다(<a href="https://www.investing.com/analysis/bitcoins-34-billion-etf-bleed-looks-more-cyclical-than-structural-200681474">Investing.com</a>). 4주 연속 순유출 누적은 약 <strong>-54억 달러</strong>에 달했다(<a href="https://bitcoinfoundation.org/news/crypto-etfs-news/etf-outflows-june-2/">Bitcoin Foundation</a>).</p>
<div class="prose-callout" data-variant="warn">
  <p><strong>정정 노트.</strong> 직전 시드 글의 "5주 연속 <em>순유입</em>" 서술은 현 시점과 반대다. 2026년 6월 흐름은 <strong>순유출</strong>이 맞다(출처: Investing.com·SoSoValue·Bitcoin Foundation). 주간 윈도/제공처별 수치 편차가 있으니 정확한 일자별 그리드는 <a href="https://farside.co.uk/btc/">Farside</a>·SoSoValue로 확인하라.</p>
</div>

<h2 id="s2">2. 왜 — 금리와 지정학</h2>
<p>원인은 가격이 아니라 <strong>금리</strong>다. 강한 고용 + 끈적한 인플레(5월 CPI +4.2%)로 "더 높게, 더 오래" 환경이 굳어지면서 채권이 BTC보다 매력적이 됐다 — 이자 없는 자산에서 자본이 빠진다(<a href="https://www.gomarkets.com/en/articles/us-market-drivers-june-2026">GO Markets</a>). 여기에 이란발 risk-off가 겹쳤다. 반면 <strong>이더리움 현물 ETF는 4주 순유출을 끝내고</strong> 소폭 순유입으로 돌아서는 조짐을 보였다(<a href="https://sosovalue.com/assets/etf/us-eth-spot">SoSoValue</a>).</p>

<h2 id="s3">3. 어떻게 읽을까 — 순환적 vs 구조적</h2>
<p>핵심 논쟁은 이 유출이 <strong>순환적(cyclical)</strong>이냐 <strong>구조적(structural)</strong>이냐다. Investing.com은 금리 사이클에 연동된 <em>순환적</em> 성격으로 본다 — 금리 기대가 돌면 되돌아올 자금이라는 해석이다. 반대 신호도 있다. 가격이 빠지는 동안에도 <strong>스테이블코인 공급은 사상 최대(~$320B)</strong>를 유지했다 — "떠난" 게 아니라 "관망"으로 옮겨간 자본이 크다는 뜻이다.</p>
<blockquote>ETF 유출 ≠ 시장 이탈. 금리가 만든 일시적 재배분일 가능성을, 사상 최대 스테이블코인 잔고가 뒷받침한다.</blockquote>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 플래시 노트는 자금 흐름 관찰·교육 콘텐츠로 BBDX 시그널과 무관하며, 단독 매매 신호를 발행하지 않는다. 과거 성과는 미래를 보장하지 않는다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://www.investing.com/analysis/bitcoins-34-billion-etf-bleed-looks-more-cyclical-than-structural-200681474">Investing.com — BTC ETF $3.4B 순유출</a></li>
  <li><a href="https://bitcoinfoundation.org/news/crypto-etfs-news/etf-outflows-june-2/">Bitcoin Foundation — 6월 ETF 순유출</a></li>
  <li><a href="https://sosovalue.com/assets/etf/us-eth-spot">SoSoValue — ETH 현물 ETF 대시보드</a></li>
  <li><a href="https://www.gomarkets.com/en/articles/us-market-drivers-june-2026">GO Markets — 금리·인플레 환경</a></li>
</ul>
`;

// ── seed 기사 (2026-06-14 발행분) ───────────────────────────────────
export const RESEARCH_ARTICLES: ResearchArticle[] = [
  {
    slug: "weekly-13-risk-off-rotation",
    type: "weekly",
    title: "주간 시황 #13 — 이란 쇼크와 안전자산 회귀, 그 속의 상대강도 리더",
    dek: "BTC가 6/5 연중 저점(~$59K)까지 밀린 risk-off 한 주. 이란발 유가 충격과 뜨거운 5월 CPI가 금리 인하 기대를 꺾었고, 11~12일 종전 헤드라인에 반등. 하락장 속 어느 섹터가 덜 빠졌나.",
    sector: "btc",
    tags: ["주간 시황", "매크로", "ETF", "섹터 로테이션"],
    assets: ["BTC", "ETH"],
    author: "김규호",
    readMinutes: 7,
    publishedAt: "2026-06-14T09:00:00+09:00",
    featured: true,
    takeaways: [
      "이번 주 하락은 크립토 내부 악재가 아니라 매크로(이란 쇼크 + 5월 CPI +4.2%)가 주도.",
      "금리 인하 기대가 꺾이며 BTC 현물 ETF는 사상 최대급 주간 순유출(~$3.4B).",
      "같은 하락장에서도 상대강도 차이가 뚜렷 — 양자내성·RWA·AI가 버티고 ETH·DeFi·밈이 열위.",
      "스테이블코인 공급은 사상 최대(~$320B) — 자본은 떠난 게 아니라 관망으로 이동.",
    ],
    toc: [
      { no: "01", title: "한 주 요약" },
      { no: "02", title: "매크로 — 이란 쇼크와 인플레이션 벽" },
      { no: "03", title: "섹터 로테이션 — 하락장의 상대강도" },
      { no: "04", title: "자금 흐름 — ETF 순유출 vs 스테이블코인" },
      { no: "05", title: "다음 주 관전 포인트" },
    ],
    bodyHtml: WEEKLY_13_BODY,
    canonical: null,
  },
  {
    slug: "rwa-resilience-tokenized-2026-06",
    type: "deepdive",
    title: "RWA: 토큰화가 하락장에서도 버틴 이유 — Ondo Perps와 기관 정산 레일",
    dek: "시장 전반이 risk-off로 빠지는 동안 RWA는 가장 잘 버틴 섹터였다. 수요가 기관의 온체인 수익에서 나오기 때문. 시장 규모를 바로 읽는 법부터 발행사·리스크까지 정리한다.",
    sector: "rwa",
    tags: ["RWA", "토큰화 국채", "Ondo", "CLARITY Act"],
    assets: ["ONDO", "BUIDL"],
    author: "김규호",
    readMinutes: 10,
    publishedAt: "2026-06-13T09:00:00+09:00",
    takeaways: [
      "RWA 수요는 리테일 투기가 아니라 기관의 온체인 수익(yield) 수요 — BTC 사이클과 상관이 낮아 하락장서 방어적.",
      "시장 규모 숫자 구분 필수: rwa.xyz ~$32B(집계) ≠ Binance +589%(active RWA) ≠ CoinGecko +256.7%.",
      "촉매: Ondo Perps(6/9)·OUSG XRPL 국경 간 정산(JPM/Mastercard/Ripple)·BlackRock 추가 펀드·CLARITY Act 진전.",
      "핵심 리스크는 스마트컨트랙트가 아니라 발행사·커스터디언 신용 + 집중도(국채 ~67%, ETH ~50%) + 금리 민감도.",
    ],
    toc: [
      { no: "01", title: "토큰화가 하락장에서도 버틴 이유" },
      { no: "02", title: "시장 규모 — 숫자 바로 읽기" },
      { no: "03", title: "무엇이 끌어올렸나 — 4대 촉매" },
      { no: "04", title: "누가 발행하고 누가 사는가" },
      { no: "05", title: "리스크 — 온체인이라 안전하다는 착각" },
      { no: "06", title: "투자자 체크리스트" },
    ],
    bodyHtml: RWA_DEEPDIVE_BODY,
    canonical: null,
  },
  {
    slug: "defi-bluechip-fee-switch-2026-06",
    type: "deepdive",
    title: "DeFi: BTC 횡보 속 블루칩 회전 — 진짜 동력은 수수료 스위치",
    dek: "UNI·CRV·AAVE가 선두에 선 한 주. 하지만 가격 무브의 상당수는 거버넌스·M&A 이벤트였다. 지속 가능한 신호는 따로 있다 — 수수료 매출이 토큰에 쌓이기 시작했다는 것.",
    sector: "defi",
    tags: ["DeFi", "수수료 스위치", "Uniswap", "Curve", "스테이블코인"],
    assets: ["UNI", "CRV", "AAVE"],
    author: "김규호",
    readMinutes: 9,
    publishedAt: "2026-06-12T09:00:00+09:00",
    takeaways: [
      "BTC 횡보 → 블루칩 회전의 교과서적 흐름. UNI·CRV·AAVE 선두, STG는 M&A 고베타.",
      "촉매: Uniswap 수수료 스위치 L2 확장 + Curve Llamalend v2(6/10) + Stargate 인수전(LayerZero vs Wormhole).",
      "토대는 견고: 스테이블코인 사상 최대(~$320B) + DeFi TVL ~$130~140B 회복력.",
      "추적할 단 하나 — 가격 스파이크가 아니라 '수수료가 실제로 토큰에 귀속되는가'(UNI·CRV·ENA·AAVE).",
    ],
    toc: [
      { no: "01", title: "블루칩 회전, 진짜 동력은 수수료 스위치" },
      { no: "02", title: "무엇이 끌어올렸나 — 3대 촉매" },
      { no: "03", title: "구조적 토대 — 스테이블코인 + TVL" },
      { no: "04", title: "진짜 수익 vs 이벤트 거품" },
      { no: "05", title: "리스크" },
    ],
    bodyHtml: DEFI_DEEPDIVE_BODY,
    canonical: null,
  },
  {
    slug: "ai-sector-relative-strength-2026-06",
    type: "deepdive",
    title: "AI 섹터: 하락장 속 상대강도 — 후광과 '수익 사막'의 간극",
    dek: "AI는 6월 크립토에서 가장 두드러진 상대강도를 보였다. 단, 강세장이 아니라 하락장 안에서의 아웃퍼폼. NVIDIA·OpenAI IPO 후광이 끌고, 그 아래엔 가격이 매출을 크게 앞서는 구조적 간극이 있다.",
    sector: "ai",
    tags: ["AI", "Bittensor", "Worldcoin", "income desert"],
    assets: ["TAO", "FET", "RENDER"],
    author: "김규호",
    readMinutes: 9,
    publishedAt: "2026-06-11T09:00:00+09:00",
    takeaways: [
      "AI의 강세는 강세장이 아니라 광범위한 하락장 안에서의 상대 아웃퍼폼.",
      "동력은 AI 주식 복합체(NVIDIA·OpenAI IPO)와의 상관 트레이드 + 토큰별 공급 축소.",
      "구조적 약점: 가격 ≫ 검증 가능한 매출 (Bittensor 외부 매출 ~$3~15M 추정, 온체인 검증 불가).",
      "리스크: 내러티브 프리미엄, AI 주식과의 자본 경쟁(Novogratz), 고베타 + FET 6/28 언락.",
    ],
    toc: [
      { no: "01", title: "하락장 속 상대강도, 그러나 수익 사막" },
      { no: "02", title: "무엇이 끌어올렸나 — 6개 촉매" },
      { no: "03", title: "펀더멘털 — 가격이 매출을 크게 앞선다" },
      { no: "04", title: "리스크 — 내러티브 프리미엄과 자본 경쟁" },
      { no: "05", title: "어떻게 평가할까 — 체크리스트 + 다음 촉매" },
    ],
    bodyHtml: AI_DEEPDIVE_BODY,
    canonical: null,
  },
  {
    slug: "btc-etf-outflow-flash-2026-06",
    type: "flash",
    title: "비트코인 ETF, 사상 최대급 주간 순유출 — 무엇이 자금을 빼냈나",
    dek: "6월 초 BTC 현물 ETF에서 한 주 ~$3.4B가 빠져 2024년 출시 이후 최대 순유출. 원인은 가격이 아니라 금리다. 순환적 유출인지 구조적 이탈인지 짧게 점검한다.",
    sector: "btc",
    tags: ["BTC", "ETF", "자금 흐름", "금리"],
    assets: ["BTC"],
    author: "김규호",
    readMinutes: 4,
    publishedAt: "2026-06-13T18:00:00+09:00",
    takeaways: [
      "BTC 현물 ETF 주간 ~$3.4B 순유출 — 2024년 출시 이후 최대(4주 누적 ~-$5.4B).",
      "원인은 가격이 아니라 금리 — '더 높게 더 오래' 환경에서 채권이 BTC를 압도.",
      "ETH ETF는 4주 순유출을 끝내고 소폭 순유입 전환 조짐.",
      "스테이블코인 사상 최대($320B)가 '이탈이 아니라 관망'이라는 순환적 해석을 뒷받침.",
    ],
    toc: [
      { no: "01", title: "무슨 일이 있었나 — 사상 최대급 순유출" },
      { no: "02", title: "왜 — 금리와 지정학" },
      { no: "03", title: "어떻게 읽을까 — 순환적 vs 구조적" },
    ],
    bodyHtml: BTC_ETF_FLASH_BODY,
    canonical: null,
  },
];

// ── 조회 헬퍼 (DB 교체 시 이 함수들만 갈아끼우면 됨) ──────────────

/** bodyHtml 을 제거한 카드용 요약으로 변환 (payload 절감) */
function toSummary(a: ResearchArticle): ResearchArticleSummary {
  const { bodyHtml: _bodyHtml, ...summary } = a;
  return summary;
}

const byDateDesc = (a: ResearchArticle, b: ResearchArticle) =>
  b.publishedAt.localeCompare(a.publishedAt);

export interface ListResearchInput {
  type?: ResearchType;
  sector?: ResearchSectorId;
  /** 제목/dek/태그 부분 일치(대소문자 무시) */
  q?: string;
}

/**
 * 목록 조회 — type/sector/q 필터 적용 후 최신순 정렬, bodyHtml 제외 요약 반환.
 * 카드 그리드용. featured 판별·요약 표시에 필요한 필드는 모두 포함.
 */
export function listResearch(
  input: ListResearchInput = {}
): ResearchArticleSummary[] {
  const q = input.q?.trim().toLowerCase();
  return RESEARCH_ARTICLES.filter((a) => {
    if (input.type && a.type !== input.type) return false;
    if (input.sector && a.sector !== input.sector) return false;
    if (q) {
      const haystack = [a.title, a.dek, ...a.tags].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  })
    .slice()
    .sort(byDateDesc)
    .map(toSummary);
}

/** 단일 기사(본문 포함) 조회 — 없으면 null (throw 금지) */
export function getResearchBySlug(slug: string): ResearchArticle | null {
  return RESEARCH_ARTICLES.find((a) => a.slug === slug) ?? null;
}

/**
 * 연관 기사 — 같은 섹터 우선, 부족하면 최신순으로 채워 최대 n개(요약, 본문 제외).
 * 기준 slug 자신은 제외. slug 미존재 시 빈 배열.
 */
export function getRelatedResearch(
  slug: string,
  n = 2
): ResearchArticleSummary[] {
  const current = RESEARCH_ARTICLES.find((a) => a.slug === slug);
  if (!current) return [];
  const others = RESEARCH_ARTICLES.filter((a) => a.slug !== current.slug);
  const sameSector = others.filter((a) => a.sector === current.sector);
  const rest = others.filter((a) => a.sector !== current.sector);
  return [...sameSector.sort(byDateDesc), ...rest.sort(byDateDesc)]
    .slice(0, n)
    .map(toSummary);
}
