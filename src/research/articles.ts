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

const WEEKLY_17_BODY = `
<h2 id="s1">1. 두 주 요약 — 인플레이션 벽에 첫 균열이 갔다, 그런데 하늘에서 미사일이 떨어진다</h2>
<p>#16(7/4) 이후 두 주(7/6~7/20)는 우리가 5월부터 추적해 온 두 개의 거시 변수 — <strong>인플레이션(금리)과 지정학(이란)</strong> — 가 처음으로 <strong>반대 방향으로 갈라선</strong> 구간이었다. 한쪽에서는 6월 CPI가 예상을 크게 하회하며(근원 전월比 보합, 전년比 2.6% vs 예상 2.8%, 보도 기준) 워시 체제 아래 처음으로 "인상 리스크 소멸 → 인하 재논의"의 문이 열렸고, BTC는 발표 직후 $64K를 회복해 한때 <strong>$65,600</strong>까지 올랐다(<a href="https://www.coindesk.com/business/2026/07/14/live-updates-bitcoin-price-btc-higher-after-cpi-declined-in-june">CoinDesk</a>, <a href="https://bitcoinmagazine.com/markets/bitcoin-price-jumps-above-64000">Bitcoin Magazine</a>). 다른 쪽에서는 미국의 대이란 공습이 6일째 이어지고 <strong>호르무즈 해협이 사실상 봉쇄</strong>되며 유가가 되올랐고, BTC는 주말로 가며 $62,500 지지 방어전으로 되밀렸다(<a href="https://finance.yahoo.com/personal-finance/investing/article/bitcoin-and-ethereum-prices-today-friday-july-17-2026-prices-ease-as-conflict-in-iran-escalates-125602208.html">Yahoo Finance</a>, <a href="https://cryptoslate.com/bitcoin-must-defend-62500-as-altcoins-lose-8-8-billion-in-a-week/">CryptoSlate</a>).</p>
<p><strong>우리 관점 — #16의 질문에 절반의 답.</strong> #16에서 우리는 "해빙인가 데드캣인가"를 물으며 판정 기준으로 <strong>ETF 유입의 지속</strong>을 걸었다. 그 기준은 충족됐다 — 10거래일 -$2.73B의 유출 행진이 끝나고 3거래일 <strong>+$510M</strong> 순유입으로 전환했으며(보도 기준, <a href="https://www.techtimes.com/articles/319974/20260709/bitcoin-etf-inflows-hit-510m-over-3-days-when-blackrock-leads-bitcoin-follows.htm">TechTimes</a>), 이 유입 전환은 7월 중순까지 유지됐다(<a href="https://www.livevolatile.com/blog/2026-07-15-bitcoin-etf-flows-510m-rebound-8-week-outflow-ends">LiveVolatile</a>). 즉 <strong>'금리발 재배분'이라는 5~6월의 핵심 역풍은 공식적으로 꺾였다</strong>. 그럼에도 우리는 해빙 선언을 유보한다 — 이유는 하나, <strong>지정학이 유가→인플레 경로로 그 균열을 도로 메울 수 있기 때문</strong>이다. 호르무즈발 에너지 충격은 #15에서 연준이 PCE 전망에 '구조 변수'로 박아 넣은 바로 그것이다. 요컨대 지금은 <strong>강세 전환의 필요조건(ETF 유입·인플레 완화)은 갖췄지만 충분조건(지정학 안정)이 빠진 국면</strong>이다.</p>

<div class="prose-table-wrap">
<table>
<thead><tr><th>지표</th><th class="num">값 (as-of 7/17~20)</th><th>비고</th></tr></thead>
<tbody>
<tr><td>BTC</td><td class="num">~$62,500~64,300</td><td>7/15 고점 ~$65.6K 후 지정학에 반납, $62.5K 방어전</td></tr>
<tr><td>ETH</td><td class="num">~$1,830대</td><td>7월 고점 $1,946 터치 후 되돌림</td></tr>
<tr><td>BTC 현물 ETF</td><td class="num">유출 행진 종료</td><td>10일 -$2.73B → 3일 +$510M 전환(보도 기준)</td></tr>
<tr><td>알트 시총</td><td class="num">~$976~984B</td><td>7/10 이후 알트에서 -$8.8B 이탈</td></tr>
<tr><td>전체 시총</td><td class="num">~$2.18조</td><td>6월 저점 대비 회복, 상단은 지정학이 봉쇄</td></tr>
</tbody>
</table>
</div>
<figure>
  <div class="prose-figure-placeholder" role="img" aria-label="CPI 반등과 이란 재점화 사이 BTC 흐름 차트 자리"></div>
  <figcaption>그림 1. 6월 CPI 하회(7/14, 보도 기준)로 $65.6K까지 올랐던 BTC가 이란 공습 6일째·호르무즈 봉쇄에 $62.5K 방어전으로 회귀(개념도, as-of 7/20). 라이브 수치는 <a href="/sectors">섹터 동향</a>·<a href="/">시그널 스캐너</a> 참조.</figcaption>
</figure>

<h2 id="s2">2. 매크로 — 나쁜 물가의 종료 vs 나쁜 지정학의 연장</h2>
<p><strong>① 인플레이션 벽의 첫 균열.</strong> 7월 14일 발표된 6월 CPI는 이 사이클에서 처음으로 <strong>명확한 하회 서프라이즈</strong>였다 — 근원 CPI가 전월比 보합(예상 +0.2%), 전년比 2.6%(예상 2.8%)로 식었다(보도 기준, <a href="https://www.coindesk.com/business/2026/07/14/live-updates-bitcoin-price-btc-higher-after-cpi-declined-in-june">CoinDesk</a>). 5월 CPI +4.2%(#13)가 세운 "인상 리스크" 시나리오, 6/17 FOMC의 매파 점도표(#14)로 굳어진 "인하 부재" 기본값 — 그 벽에 처음 금이 갔다. #16의 약한 고용(5.2만)과 합치면, 워시 연준이 기다려 온 "데이터"가 두 달 연속 완화 쪽으로 나온 셈이다.</p>
<p><strong>② 그러나 호르무즈가 덮개다.</strong> 같은 주, 미국의 대이란 공습이 6일째로 연장되고 호르무즈 해협이 사실상 봉쇄 상태를 유지하며 유가가 재차 상승했다(<a href="https://finance.yahoo.com/personal-finance/investing/article/bitcoin-and-ethereum-prices-today-friday-july-17-2026-prices-ease-as-conflict-in-iran-escalates-125602208.html">Yahoo Finance</a>). #15에서 짚었듯 연준은 이미 에너지 공급 충격을 PCE 전망(3.6%)에 구조 변수로 반영했다 — 유가가 다시 물가 지표로 번지면 6월 CPI의 균열은 '일시적 착시'로 격하되고, 7월 28~29일 FOMC에서 워시가 매파 톤을 유지할 명분이 된다. <strong>인플레와 지정학이 처음으로 반대 방향을 가리키는 지금, 승부처는 7월 말 FOMC와 그 직전의 유가다.</strong></p>

<h2 id="s3">3. 시장 구조 — 유출 추세의 공식 종료, 그리고 시티의 각주</h2>
<p>5월 말부터 이어진 이 사이클 최대의 구조적 악재 — BTC 현물 ETF 연속 순유출 — 가 <strong>공식적으로 끝났다</strong>. 10거래일 누적 -$2.73B의 유출 행진 뒤 3거래일 연속 합산 <strong>+$510M</strong>이 들어왔고, 둘째 날은 블랙록 IBIT가 +$209M을 주도했다(보도 기준, <a href="https://www.techtimes.com/articles/319974/20260709/bitcoin-etf-inflows-hit-510m-over-3-days-when-blackrock-leads-bitcoin-follows.htm">TechTimes</a>). #16에서 "단 하루"라며 유보했던 반전이 <strong>추세 전환으로 승격</strong>된 것이다 — #15의 문턱(2주 연속 유입)도 사실상 충족됐다.</p>
<p>흥미로운 각주는 시티그룹에서 나왔다. 시티는 7월 1일 BTC 12개월 목표가를 $82,000으로 하향하면서도, 리서치에서 <strong>"ETF 순유입 $100M당 당일 BTC +53bp"</strong>의 흐름-가격 감응도를 제시했다(<a href="https://www.livevolatile.com/blog/2026-07-15-bitcoin-etf-flows-510m-rebound-8-week-outflow-ends">LiveVolatile</a>). 방향과 무관하게, 기관이 <strong>ETF 플로우를 BTC 가격의 1차 동인으로 공식 모델링</strong>하기 시작했다는 것 — 우리가 #13부터 "가격보다 흐름"을 앞세운 프레임이 셀사이드 컨센서스가 됐다는 뜻이기도 하다.</p>
<blockquote>유출 추세의 종료는 이번 사이클 저점 논쟁의 필요조건이다. 그러나 유입의 '지속'은 이제 금리가 아니라 호르무즈에 달렸다 — 흐름을 만든 것은 CPI였고, 흐름을 끊을 수 있는 것은 유가다.</blockquote>

<h2 id="s4">4. 섹터 로테이션 — 반등의 대가, 알트에서 돈이 빠졌다</h2>
<p>이번 구간의 로테이션은 6월(#15~16)과 결이 다르다. 6월엔 "덜 빠진 섹터"(AI·RWA·DeFi 현금흐름)가 리더였다면, 7월 중순엔 <strong>BTC 반등이 알트의 자금을 빨아들였다</strong> — 7월 10일 이후 한 주 동안 알트코인 시총에서 약 <strong>-$8.8B</strong>가 이탈했고, 스트레스는 ETH·HYPE·레버리지 트레이더에 집중됐다(<a href="https://cryptoslate.com/bitcoin-must-defend-62500-as-altcoins-lose-8-8-billion-in-a-week/">CryptoSlate</a>). ETH는 7월 고점 $1,946을 터치한 뒤 $1,830대로 되돌렸다(<a href="https://zebpay.com/blog/weekly-crypto-report-17th-july-2026">ZebPay</a>).</p>
<p>뒤를 돌아보면 2분기 결산이 이 구도를 요약한다 — CryptoRank 집계로 <strong>8개 내러티브 전부가 Q2 2026을 마이너스 중앙값으로 마감</strong>했고, 6월엔 상위 100개 알트의 82.1%가 하락(중앙값 -16.8%)했다(<a href="https://dailycoin.com/altcoins-sink-in-q2-but-one-tokens-1700-rally-skews-the-picture/">DailyCoin</a>). 최약체는 <strong>DePIN(중앙값 -24.8%)과 L2(-24.9%)</strong> — DePIN은 매출이 늘어나는데 토큰은 버려지는 기묘한 다이버전스의 한복판에 있으며, 이 역설은 오늘 함께 발행한 <a href="/research/sector-depin-revenue-up-tokens-down-2026-07">DePIN 섹터 딥다이브</a>에서 해부한다.</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th class="num">순위</th><th>섹터/자산</th><th>성격</th><th>이번 구간 동인</th></tr></thead>
<tbody>
<tr><td class="num">1</td><td>BTC</td><td>로테이션 승자</td><td>CPI 서프라이즈 + ETF 유입 전환의 1차 수혜, 도미넌스 우위</td></tr>
<tr><td class="num">2</td><td>RWA·AI</td><td>구조 촉매 유지</td><td>DTCC 토큰화 테스트(7월)·현물 TAO ETF 판단(~8월) 대기</td></tr>
<tr><td class="num">3</td><td>ETH</td><td>고점 후 되돌림</td><td>$1,946 터치 후 차익실현, 재단 구조조정 여진(#15)</td></tr>
<tr><td class="num">4</td><td>알트 전반</td><td>자금 이탈</td><td>7/10 이후 -$8.8B, 레버리지 청산 스트레스</td></tr>
<tr><td class="num">5</td><td>DePIN·L2</td><td>Q2 최약</td><td>중앙값 -24.8%/-24.9% — 매출·가격 다이버전스(딥다이브 참조)</td></tr>
</tbody>
</table>
</div>

<h2 id="s5">5. 관점이 바뀌는 조건 · 다음 관전 포인트</h2>
<ul>
  <li><strong>FOMC (7/28~29)</strong> — 이번 구간 최대 이벤트. 6월 CPI 균열에도 워시가 매파 톤을 유지하면 "해빙" 서사는 다시 밀리고, 완화 시사가 나오면 ETF 유입이 추세로 굳는다.</li>
  <li><strong>유가·호르무즈</strong> — 봉쇄 해제/격화 여부가 7월 CPI의 방향을 미리 말해준다. 유가 재급등 시 6월 CPI는 '일시 착시'로 격하.</li>
  <li><strong>ETF 유입의 지속성</strong> — 시티 감응도($100M당 +53bp) 기준, 주간 순유입이 유지되는 한 하방은 구조적으로 제한. 재유출 전환 시 #14~15의 약세 구도로 회귀.</li>
  <li><strong>BTC $62,500 지지</strong> — 기술적으로 시장이 합의한 방어선(보도 기준). 상실 시 6월 저점(~$58K) 재시험 논쟁 재점화.</li>
</ul>

<div class="prose-callout">
  <p><strong>우리가 틀리는 조건.</strong> "필요조건 충족·충분조건 대기" 읽기는 두 경우 깨진다 — (1) 호르무즈발 유가 충격이 7월 CPI를 재가속시켜 인플레 균열이 착시로 판명될 때(약세 방향), (2) 지정학이 조기 안정되고 FOMC가 완화를 시사하며 ETF 유입이 가속될 때(우리 예상보다 빠른 강세 방향). 어느 쪽이든 판정 지표는 같다 — 유가, 그리고 주간 ETF 순유입.</p>
</div>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 주간 시황은 시장 구조에 대한 관찰·교육 콘텐츠이며 BBDX 시그널과 무관하다. 본문의 가격·플로우 수치는 명시된 as-of/보도 기준 값으로 변동하며, 개별 진입·청산 판단은 시그널 스캐너의 RSI·BB·ADX 컨플루언스를 따른다. 본 글은 단독 매매 신호를 발행하지 않으며, 과거 성과는 미래를 보장하지 않는다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://www.coindesk.com/business/2026/07/14/live-updates-bitcoin-price-btc-higher-after-cpi-declined-in-june">CoinDesk — 6월 CPI 하회와 BTC 반등(7/14)</a></li>
  <li><a href="https://bitcoinmagazine.com/markets/bitcoin-price-jumps-above-64000">Bitcoin Magazine — CPI 하락에 BTC $64K 돌파</a></li>
  <li><a href="https://www.techtimes.com/articles/319974/20260709/bitcoin-etf-inflows-hit-510m-over-3-days-when-blackrock-leads-bitcoin-follows.htm">TechTimes — BTC ETF 3일 +$510M, IBIT 주도</a></li>
  <li><a href="https://www.livevolatile.com/blog/2026-07-15-bitcoin-etf-flows-510m-rebound-8-week-outflow-ends">LiveVolatile — ETF 유출 행진 종료·시티 감응도</a></li>
  <li><a href="https://finance.yahoo.com/personal-finance/investing/article/bitcoin-and-ethereum-prices-today-friday-july-17-2026-prices-ease-as-conflict-in-iran-escalates-125602208.html">Yahoo Finance — 이란 격화에 가격 되밀림(7/17)</a></li>
  <li><a href="https://cryptoslate.com/bitcoin-must-defend-62500-as-altcoins-lose-8-8-billion-in-a-week/">CryptoSlate — $62.5K 방어전·알트 -$8.8B</a></li>
  <li><a href="https://zebpay.com/blog/weekly-crypto-report-17th-july-2026">ZebPay — 주간 리포트(ETH $1,946 고점)</a></li>
  <li><a href="https://dailycoin.com/altcoins-sink-in-q2-but-one-tokens-1700-rally-skews-the-picture/">DailyCoin/CryptoRank — Q2 내러티브 전부 마이너스·6월 결산</a></li>
</ul>
`;

const DEPIN_DEEPDIVE_BODY = `
<h2 id="s1">1. 핵심 요약 — 매출은 5배가 됐는데 토큰은 90% 빠진 섹터</h2>
<p>DePIN(탈중앙 물리 인프라 네트워크)은 지금 크립토에서 가장 기묘한 다이버전스를 보여주는 섹터다. 한쪽 장부에는 <strong>온체인 수수료가 2025년 한 해 약 5배(~400% YoY)로 성장</strong>했다는 기록이 있고(<a href="https://1kx.capital/research/2025-onchain-revenue-report">1kx 2025 온체인 매출 리포트</a>), 다른 쪽 장부에는 2018~2022년에 출시된 DePIN 토큰들이 <strong>사상최고가 대비 -94~99%</strong>에 거래되고, Q2 2026 내러티브별 성과에서 <strong>중앙값 -24.8%로 최약체권</strong>이었다는 기록이 있다(<a href="https://decrypt.co/356349/depin-tokens-lag-revenues-rise-fundamentals">Decrypt</a>, <a href="https://cryptorank.io/insights/reports/crypto-market-recap-q2-2026">CryptoRank Q2 리캡</a>).</p>
<p><strong>우리 관점.</strong> 컨센서스는 이 괴리를 "DePIN은 실패한 내러티브"로 읽는다. 우리는 반대로 읽는다 — 이것은 <strong>섹터의 죽음이 아니라 밸류에이션 체계의 교체</strong>다. 2021년 사이클에서 DePIN은 매출 1,000배 이상의 멀티플로 '스토리'에 값이 매겨졌고, 지금 매출 상위 네트워크들은 <strong>매출 10~25배</strong>로 거래된다(보도 기준, <a href="https://decrypt.co/356349/depin-tokens-lag-revenues-rise-fundamentals">Decrypt/Messari</a>). 가격이 빠진 게 아니라 <strong>측정 단위가 '노드 수'에서 '매출'로 바뀐 것</strong>이다 — 공급측(장비 깔기) 성장으로 토큰을 띄우던 시대가 끝나고, 수요측(돈 내는 고객)이 처음으로 유일한 평가 기준이 됐다. 이 성인식을 통과하는 소수와 못 하는 다수를 가르는 것이 이 글의 목적이다.</p>

<div class="prose-table-wrap">
<table>
<thead><tr><th>지표</th><th class="num">값 (as-of 표기)</th><th>비고</th></tr></thead>
<tbody>
<tr><td>섹터 시총(CoinGecko DePIN)</td><td class="num">~$7.9B (7월 초)</td><td>집계 범위에 따라 ~$10B(Messari, 1월)·피크 ~$19B</td></tr>
<tr><td>2025 온체인 매출</td><td class="num">~$72M~$100M+</td><td>집계 충돌 — 아래 callout 참조</td></tr>
<tr><td>수수료 성장률</td><td class="num">~5x YoY (2025)</td><td>1kx 집계, Q3부터 성장 둔화</td></tr>
<tr><td>2026 수수료 전망</td><td class="num">&gt;$450M (1kx)</td><td>세 자릿수 성장 지속 가정</td></tr>
<tr><td>Q2 2026 성과</td><td class="num">중앙값 -24.8%</td><td>8개 내러티브 중 최약체권(L2와 나란히)</td></tr>
<tr><td>구세대 토큰 드로다운</td><td class="num">ATH 대비 -94~99%</td><td>2018~22 빈티지(1월 기준)</td></tr>
</tbody>
</table>
</div>
<div class="prose-callout" data-variant="warn">
  <p><strong>수치 충돌 주의.</strong> 이 섹터의 '매출' 수치는 집계마다 크게 다르다 — Messari 계열 보도는 <strong>2025년 온체인 매출 ~$72M</strong>(섹터 시총 ~$10B 대비 암묵 P/S ~140x)을 제시하고(<a href="https://finance.yahoo.com/news/depin-tokens-lag-revenues-rise-195756757.html">Yahoo/Messari</a>), 1kx는 <strong>H1 2025에만 전체 온체인 수수료 $9.7B의 ~1%(~$100M)</strong>를 DePIN으로 집계한다(<a href="https://1kx.capital/research/2025-onchain-revenue-report">1kx</a>). 차이의 뿌리는 방법론이다 — '수수료(fees)' vs '프로토콜 매출(revenue)', 바이백 포함 여부, 커버리지(어떤 프로젝트를 DePIN으로 분류하나). 본문 수치는 모두 출처·기준 시점과 함께 읽어야 하며, 어느 하나를 확정치로 취급하지 않는다.</p>
</div>

<h2 id="s2">2. 섹터 개요·시장 규모 — '650개 프로젝트'의 실체</h2>
<p>DePIN의 명제는 단순하다 — 통신 기지국, GPU 서버, 스토리지, 센서 같은 <strong>물리 인프라를 토큰 보상으로 크라우드소싱</strong>해서, 자본지출(CapEx)을 네트워크 참여자에게 분산시키고 중앙화 사업자보다 싸게 공급하겠다는 것. 2026년 3월 기준 집계로 <strong>650개+ 프로젝트</strong>가 이 라벨을 달고 있고, 섹터 시총은 피크 <strong>~$19B</strong>를 찍은 뒤 축소됐다(<a href="https://blockeden.xyz/blog/2026/03/21/depin-march-2026-reality-check-650-projects-19b-market-cap-revenue/">BlockEden — DePIN Reality Check</a>). 7월 초 CoinGecko DePIN 카테고리 기준 시총은 <strong>~$7.9B</strong> 수준까지 내려왔다(as-of 7/7, <a href="https://www.coingecko.com/en/categories/depin">CoinGecko</a>).</p>
<p>단, 이 카테고리 시총엔 착시가 하나 있다 — 최대 구성 토큰이 <strong>Bittensor(TAO, ~$2.0B)</strong>로 카테고리의 약 1/4을 차지하는데, TAO는 AI 섹터로도 분류되는 자산이다(우리 <a href="/research/ai-sector-relative-strength-2026-06">AI 딥다이브</a>의 주인공이기도 하다). 'DePIN 순수 성분'은 그보다 작다. 활성 디바이스 수는 수백만 대 규모로 집계되지만(집계별 200만~880만, 방법론 상이), 디바이스 수는 공급측 지표일 뿐이다 — 이 섹터에서 유일하게 중요한 질문은 <strong>"누가 돈을 내는가"</strong>다.</p>

<h2 id="s3">3. 하위분류·밸류체인 — 돈을 내는 고객이 있는 곳과 없는 곳</h2>
<p>DePIN은 대략 다섯 서브섹터로 나뉜다. 수요측 매출의 실재 여부로 갈라 보면 구조가 선명해진다.</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th>서브섹터</th><th>대표 프로토콜</th><th>수요측 매출 실재</th><th>비고</th></tr></thead>
<tbody>
<tr><td>컴퓨트(GPU/AI)</td><td>Aethir, io.net, Render, Akash</td><td><strong>있음 — 섹터 성장의 엔진</strong></td><td>AI 수요 스필오버. 단, 매출 '질' 논쟁(§4)</td></tr>
<tr><td>무선(통신)</td><td>Helium(HNT)</td><td><strong>있음 — 소액이나 실증</strong></td><td>Helium Mobile 월매출 ~$2.5M 기록(3월), AT&amp;T 제휴</td></tr>
<tr><td>스토리지</td><td>Filecoin, Arweave</td><td>있으나 정체</td><td>퍼스트무버, 성장률은 컴퓨트에 밀림</td></tr>
<tr><td>센서·모빌리티</td><td>Hivemapper, DIMO, GEODNET</td><td>초기</td><td>지도·차량 데이터 구매자 확보 단계</td></tr>
<tr><td>에너지</td><td>(다수 초기 프로젝트)</td><td>대부분 미실현</td><td>내러티브 단계</td></tr>
</tbody>
</table>
</div>
<p>1kx 집계의 구도가 이를 요약한다 — <strong>최대 수수료 기여자는 GPU 컴퓨트의 Aethir</strong>, 2위 성장 동력은 io.net이고, Helium·Akash·Arweave는 '퍼스트무버'로 분류된다(<a href="https://1kx.capital/research/2025-onchain-revenue-report">1kx</a>). 즉 섹터 매출 성장의 대부분은 <strong>AI 컴퓨팅 수요의 스필오버</strong>가 만들었고, 나머지 서브섹터는 아직 그 규모에 못 미친다.</p>

<h2 id="s4">4. 프로토콜 비교 — 매출의 '양'이 아니라 '질'을 보라</h2>
<p>아래 표는 주요 프로토콜의 as-of 시점 스냅샷이다(시총은 7월 초 CoinGecko 기준, 변동 큼 — 라이브는 <a href="/sectors">섹터 동향</a> 위임).</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th>프로토콜</th><th>서브섹터</th><th class="num">시총 (as-of 7월 초)</th><th>토큰 가치 귀속 메커니즘</th><th>매출 질 평가</th></tr></thead>
<tbody>
<tr><td>Bittensor(TAO)</td><td>AI 컴퓨트</td><td class="num">~$2.0B</td><td>서브넷 emission 경쟁</td><td>외부 매출 검증 곤란(AI 딥다이브 참조)</td></tr>
<tr><td>Render(RENDER)</td><td>GPU 렌더링</td><td class="num">~$0.82B</td><td>BME(Burn-Mint Equilibrium) — 사용량이 소각으로</td><td>실사용 기반, 규모는 제한적</td></tr>
<tr><td>Filecoin(FIL)</td><td>스토리지</td><td class="num">~$0.62B</td><td>스토리지 딜 수수료·소각</td><td>실사용 있으나 성장 정체</td></tr>
<tr><td>Helium(HNT)</td><td>무선</td><td class="num">30d -54%(7월 초)</td><td>Burn-and-Mint — 데이터 크레딧 구매가 HNT 소각</td><td><strong>가장 검증된 수요측</strong>: 유료 가입자·통신사 제휴</td></tr>
<tr><td>Aethir</td><td>GPU 컴퓨트</td><td class="num">—</td><td>수수료 최대 기여자</td><td><strong>주의: 바이백 기반 집계</strong> — 고객 직접 지불이 아님</td></tr>
<tr><td>io.net</td><td>GPU 컴퓨트</td><td class="num">—</td><td>컴퓨트 수수료</td><td>2위 성장 동력(1kx)</td></tr>
</tbody>
</table>
</div>
<p>핵심 경고는 <strong>매출의 질</strong>이다. 1kx 스스로 짚었듯, 최대 기여자 Aethir의 수수료는 상당 부분 <strong>바이백(buyback) 기반</strong>으로 집계된다 — 외부 고객이 서비스에 지불한 돈이 아니라 프로토콜이 자기 토큰을 사들인 흐름이 '수수료'로 잡힐 수 있다는 뜻이다(<a href="https://1kx.capital/research/2025-onchain-revenue-report">1kx</a>). DeFi 딥다이브에서 세운 기준 — "가격 스파이크가 아니라 수수료가 실제로 토큰에 귀속되는가" — 에 하나를 더해야 한다: <strong>"그 수수료는 실제 고객에게서 왔는가."</strong> 이 기준으로 보면 현재 가장 깨끗한 실증은 오히려 규모가 작은 Helium이다 — 유료 통신 가입자(Helium Mobile 월매출 ~$2.5M 기록, 3월 보도 기준)와 <strong>AT&amp;T 상업 계약</strong>(가입자가 인근 Helium 핫스팟에 자동 접속, 운영자는 사용량 기반 HNT 보상)이라는, 크립토 밖에서 온 수요다(<a href="https://solanafloor.com/news/helium-mobile-s-monthly-revenue-hits-2-5-m">SolanaFloor</a>, <a href="https://www.theblock.co/post/351856/att-subscribers-will-now-automatically-connect-to-nearby-helium-hotspots-through-new-commercial-agreement">The Block</a>).</p>

<h2 id="s5">5. 촉매 — 2026 하반기에 지켜볼 것</h2>
<ul>
  <li><strong>AI 컴퓨트 수요의 지속.</strong> 1kx는 2026년 DePIN 수수료가 <strong>$450M을 넘어설 것</strong>으로 전망한다(세 자릿수 성장 지속 가정). 이 전망의 대부분은 GPU 컴퓨트가 짊어진다 — AI 딥다이브에서 본 TAO ETF 신청(~8월 SEC 판단)도 같은 흐름의 촉매다.</li>
  <li><strong>통신사 제휴의 확산.</strong> AT&amp;T-Helium 모델(기존 통신사가 DePIN 커버리지를 오프로드로 활용)이 타 통신사·타 지역으로 복제되는지가 무선 서브섹터의 핵심 관전.</li>
  <li><strong>수요측 지표의 공시 표준화.</strong> Messari·Syndica 등의 State of DePIN 계열 리포트가 '디바이스 수'에서 '유료 고객·매출'로 공시 축을 옮기고 있다 — 옥석 가리기가 빨라진다.</li>
  <li><strong>섹터 재분류.</strong> TAO 같은 하이브리드가 AI로 재분류되면 DePIN 카테고리 시총이 기계적으로 줄어 보일 수 있다 — 지표 해석 시 주의.</li>
</ul>

<h2 id="s6">6. 리스크</h2>
<div class="prose-callout" data-variant="warn">
  <p><strong>① 공급측 과잉의 유산.</strong> 650개+ 프로젝트 대부분은 여전히 토큰 인센티브로 장비만 깔린 상태다 — 수요 없는 공급은 토큰 방출(dilution)로 보상되므로, 매출 없는 프로젝트의 토큰은 구조적 매도 압력을 안고 있다.</p>
  <p><strong>② 매출 집계의 신뢰성.</strong> §1 callout의 수치 충돌 + Aethir식 바이백 집계 문제. '매출 성장 5x' 헤드라인을 액면 그대로 받으면 안 된다.</p>
  <p><strong>③ 중앙화 클라우드와의 경쟁.</strong> AWS·하이퍼스케일러 대비 가격 우위는 실재하나, 신뢰성·SLA·엔터프라이즈 영업에서 열위 — AI 수요가 식으면 스팟 GPU 시장부터 붕괴한다.</p>
  <p><strong>④ 성장 둔화 신호.</strong> 1kx 집계에서도 수수료 성장은 2025 Q3부터 둔화했다(유일하게 3표 검증을 통과한 사실이 이것이다). '5x YoY'는 과거형일 수 있다.</p>
  <p><strong>⑤ 시장 성과의 관성.</strong> Q2 2026 중앙값 -24.8%, 구세대 토큰 -94~99% — 펀더멘털 개선이 가격으로 번역되기까지의 시차가 길고, 그 사이 상장폐지·팀 해체 리스크가 누적된다.</p>
</div>

<h2 id="s7">7. 전망 — 성인식을 통과하는 소수에 집중</h2>
<p>업계 스스로 전환을 인정한다 — XYO 공동창업자 마커스 레빈은 "정체된 토큰 가격이 펀더멘털을 강제한다"고, Messari 애널리스트 딜런 베인은 "수요측 제품-시장 적합(PMF)이 최우선"이라고 말한다(<a href="https://decrypt.co/356349/depin-tokens-lag-revenues-rise-fundamentals">Decrypt</a>). 우리 결론은 세 줄이다. <strong>첫째</strong>, DePIN '섹터 베타'를 사는 것은 650개 프로젝트의 평균을 사는 것 — 그 평균은 매출이 없다. <strong>둘째</strong>, 유의미한 것은 검증 가능한 외부 고객 매출 + 토큰 귀속(소각·바이백의 질 구분)을 갖춘 소수다 — 현재 그 필터를 통과하는 후보는 통신(Helium)과 실사용 컴퓨트(Render·io.net 계열) 정도이며, 각각도 규모는 아직 작다. <strong>셋째</strong>, 매출 10~25x로 압축된 멀티플은 "싸다"의 근거가 아니라 <strong>"이제부터는 매출로만 평가받는다"는 선고</strong>다 — 그 선고를 통과하는 프로토콜에게만 재평가가 열린다.</p>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 분석은 DePIN 섹터 구조에 대한 관찰·교육 콘텐츠이며 BBDX 시그널과 무관하다. 본문 수치는 명시된 as-of/보도 기준 값으로 집계 방법론에 따라 달라질 수 있으며(§1 수치 충돌 참조), 개별 진입·청산 판단은 시그널 스캐너의 RSI·BB·ADX 컨플루언스를 따른다. 본 글은 단독 매매 신호나 가격 목표를 발행하지 않으며, 과거 성과는 미래를 보장하지 않는다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://1kx.capital/research/2025-onchain-revenue-report">1kx — 2025 온체인 매출 리포트(DePIN 수수료 5x·2026 &gt;$450M 전망·Aethir 바이백 주의)</a></li>
  <li><a href="https://finance.yahoo.com/news/depin-tokens-lag-revenues-rise-195756757.html">Yahoo Finance/Messari — DePIN 시총 ~$10B vs 2025 매출 ~$72M</a></li>
  <li><a href="https://decrypt.co/356349/depin-tokens-lag-revenues-rise-fundamentals">Decrypt — 매출 10~25x 압축·ATH -94~99%·수요측 PMF 전환</a></li>
  <li><a href="https://cryptorank.io/insights/reports/crypto-market-recap-q2-2026">CryptoRank — Q2 2026 내러티브별 성과(DePIN -24.8%)</a></li>
  <li><a href="https://www.coingecko.com/en/categories/depin">CoinGecko — DePIN 카테고리 시총·구성</a></li>
  <li><a href="https://blockeden.xyz/blog/2026/03/21/depin-march-2026-reality-check-650-projects-19b-market-cap-revenue/">BlockEden — DePIN Reality Check(650 프로젝트·$19B 피크)</a></li>
  <li><a href="https://solanafloor.com/news/helium-mobile-s-monthly-revenue-hits-2-5-m">SolanaFloor/Syndica — Helium Mobile 월매출 $2.5M 기록</a></li>
  <li><a href="https://www.theblock.co/post/351856/att-subscribers-will-now-automatically-connect-to-nearby-helium-hotspots-through-new-commercial-agreement">The Block — AT&amp;T·Helium 상업 계약</a></li>
  <li><a href="https://coinmarketcap.com/cmc-ai/helium/price-analysis/">CoinMarketCap AI — HNT 가격 분석(30d -54%, 7월 초)</a></li>
</ul>
`;

const XRP_DEEPDIVE_BODY = `
<h2 id="s1">1. 핵심 요약 — 소송은 끝났고 ETF는 들어오는데, 가격은 아직 동의하지 않는다</h2>
<p>XRP는 2026년 상반기 크립토에서 가장 <strong>펀더멘털과 가격이 어긋난 자산</strong> 중 하나다. 5년을 끈 SEC 소송이 2025년 8월 규제 명확성으로 종결됐고, 미국에서 <strong>7개 현물 XRP ETF</strong>가 상장돼 누적 순유입이 10억 달러를 넘겼으며, 리플의 스테이블코인 RLUSD는 이더리움을 제치고 XRP 원장(XRPL)을 최대 호스트 체인으로 만들었다. 그럼에도 XRP는 7월 초 <strong>1달러 초반</strong>(as-of 2026-07 초)에 머물며 2025년 7월 사이클 고점(~$3.65)에서 크게 되돌린 상태다(<a href="https://www.cryptotimes.io/2026/07/03/xrp-price-prediction-july-2026-when-will-xrp-go-up-and-can-it-reach-3/">Crypto Times</a>).</p>
<p><strong>우리 관점.</strong> 컨센서스는 이 괴리를 두 가지로 읽는다 — 강세론은 "호재가 쌓였으니 곧 가격이 따라온다", 약세론은 "호재에도 못 오르니 끝났다". 우리는 <strong>둘 다 질문을 잘못 잡았다</strong>고 본다. XRP의 핵심 논쟁은 방향이 아니라 <strong>가치 귀속(value accrual)</strong>이다 — RLUSD·ETF·정산 볼륨이라는 '유틸리티'가 늘어난다고 해서 그것이 자동으로 <strong>XRP 토큰의 내재가치</strong>로 흘러들어오는가? 이 글은 그 배관을 뜯어본다. 결론부터 말하면, XRP는 DeFi 토큰처럼 <strong>수수료 매출로 평가할 수 있는 자산이 아니라</strong>(§5), 브릿지 유틸리티 + 모네터리 프리미엄 + 에스크로 공급이라는 세 힘의 줄다리기로 평가해야 하는 자산이다.</p>

<div class="prose-table-wrap">
<table>
<thead><tr><th>지표</th><th class="num">값 (as-of 2026-07 초)</th><th>비고</th></tr></thead>
<tbody>
<tr><td>가격</td><td class="num">~$1.0~1.1</td><td>2025.7 고점 ~$3.65 대비 -70%대, YTD ~-26%</td></tr>
<tr><td>시가총액</td><td class="num">~$700억</td><td>시총 순위 대략 5~6위권</td></tr>
<tr><td>순환/최대 공급</td><td class="num">~62B / 100B</td><td>약 62% 유통(2026-06 기준)</td></tr>
<tr><td>Ripple 에스크로</td><td class="num">~37.95B XRP</td><td>월 1B 해제, 60~80% 재락(2026-06-22)</td></tr>
<tr><td>현물 XRP ETF</td><td class="num">7종·AUM ~$1B</td><td>~9.7억 XRP 락업, 누적 순유입 ~$1.3B(7/4)</td></tr>
<tr><td>SEC 소송</td><td class="num">종결(2025-08)</td><td>규제 명확성 확보</td></tr>
</tbody>
</table>
</div>
<figure>
  <div class="prose-figure-placeholder" role="img" aria-label="XRP 펀더멘털-가격 괴리 개념도 자리"></div>
  <figcaption>그림 1. 소송 종결·ETF 유입·RLUSD 성장이라는 펀더멘털 개선과 1달러 초반에 머문 가격의 괴리(개념도, as-of 2026-07 초). 라이브 수치는 <a href="/sectors">섹터 동향</a>·<a href="/">시그널 스캐너</a> 참조.</figcaption>
</figure>

<h2 id="s2">2. 프로젝트 개요 — XRP는 무엇을 하는 자산인가</h2>
<p>혼동을 먼저 정리하자. <strong>리플(Ripple Labs)</strong>은 회사, <strong>XRP 원장(XRPL)</strong>은 2012년부터 가동된 퍼블릭 블록체인, <strong>XRP</strong>는 그 원장의 네이티브 자산이다. XRPL은 스마트컨트랙트 범용 체인(이더리움)이라기보다 <strong>결제·정산에 특화된 L1</strong>으로 설계됐다 — 3~5초 결제 완결성, 건당 수수료가 1센트의 수천분의 1 수준으로 저렴하고, 네이티브 DEX·발행(issuance) 기능을 원장 레벨에서 지원한다.</p>
<p>XRP의 원래 유틸리티는 리플의 <strong>ODL(On-Demand Liquidity)</strong>에서 국경 간 송금의 <strong>브릿지 자산</strong> 역할이다 — 법정화폐 A를 XRP로 바꿔 즉시 전송하고 반대편에서 법정화폐 B로 환전하는 구조. 2025~2026년 들어 XRPL의 서사는 세 갈래로 확장됐다: (1) 리플의 규제 스테이블코인 <strong>RLUSD</strong>, (2) 국채·주식 등 <strong>RWA 토큰화·정산 레일</strong>(우리 <a href="/research/rwa-resilience-tokenized-2026-06">RWA 딥다이브</a>에서 짚은 OUSG의 XRPL 국경 간 정산이 그 예), (3) 2025년 6월 30일 메인넷을 연 <strong>XRPL EVM 사이드체인</strong>으로 이더리움 스마트컨트랙트 생태계를 XRPL 유동성에 연결하는 것(<a href="https://www.coindesk.com/tech/2025/06/30/xrpl-evm-sidechain-goes-live-unlocking-ethereum-dapps-in-xrp-ecosystem">CoinDesk</a>).</p>

<h2 id="s3">3. 토크노믹스 — 100B 고정 공급과 에스크로의 그림자</h2>
<p>XRP의 공급 구조는 비트코인과 정반대다. 채굴이 없고, 2012년 제네시스에서 <strong>1,000억 개(100B)가 전량 선발행</strong>됐다. 2026년 6월 기준 순환 공급은 약 <strong>62.05B</strong>로 최대 공급의 ~62%다(<a href="https://www.cryptopolitan.com/xrp-tokenomics-supply-escrow-market-impact/">Cryptopolitan</a>). 나머지 상당수는 리플이 통제하는 <strong>에스크로</strong>에 잠겨 있으며, 2026년 6월 22일 기준 에스크로 잔량은 약 <strong>37.95B XRP</strong>다.</p>
<p>에스크로 메커니즘이 XRP 투자 논제의 핵심이다. 스마트컨트랙트가 <strong>매월 정확히 10억 XRP</strong>를 해제하지만, 리플은 통상 그중 <strong>60~80%를 새 에스크로로 재락(relock)</strong>한다. 결과적으로 순환 공급에 실제로 더해지는 순증분은 <strong>월 ~2~4억 XRP</strong> 수준이고, 이 물량이 ODL 유동성·파트너십·OTC 매각 등으로 흘러나간다. 현재 순 해제 속도라면 남은 에스크로가 완전히 풀리는 데 <strong>약 9년</strong>이 더 걸린다는 추정이다(<a href="https://coinedition.com/ripples-38b-xrp-escrow-could-take-9-more-years-to-fully-unlock/">Coin Edition</a>).</p>
<div class="prose-callout" data-variant="warn">
  <p><strong>해석 주의 — '오버행'인가 '유동성'인가.</strong> 에스크로 순증(월 ~2~4억)은 연 환산 대략 <strong>4~8%의 공급 인플레이션</strong>에 해당한다. 약세론은 이를 "상시 매도 압력(overhang)"으로, 강세론은 "ODL·생태계 유동성 공급"으로 읽는다. 진실은 <strong>수요가 이 순증을 흡수하느냐</strong>에 달렸다 — ETF·RLUSD 수요가 월 순증을 넘으면 오버행은 무력화되고, 미치지 못하면 구조적 역풍이 된다. 우리는 이것을 XRP의 가장 중요한 수급 변수로 본다.</p>
</div>

<h2 id="s4">4. 온체인·펀더멘털 — 유틸리티는 진짜다, 문제는 귀속</h2>
<p>펀더멘털 개선 자체는 부정하기 어렵다. 세 축이 모두 실측된다.</p>
<p><strong>① ETF 자금 — 가격과 어긋난 유입.</strong> 2025년 11월~2026년 초 상장된 <strong>7개 미국 현물 XRP ETF</strong>는 7월 4일 기준 합산 AUM 약 <strong>10억 달러</strong>, 약 <strong>9.7억 XRP</strong>를 락업했고 누적 순유입은 약 <strong>$1.3B</strong> 안팎이다(<a href="https://xrp-insights.com/">XRP Insights ETF Tracker</a>). 주목할 점은 <strong>가격이 빠지는 동안에도 ETF로는 자금이 들어왔다는 것</strong> — 우리가 BTC 주간 시황에서 반복한 '흐름과 가격의 괴리'가 XRP에서도 나타난다.</p>
<p><strong>② RLUSD — XRPL이 이더리움을 추월.</strong> 리플의 스테이블코인 RLUSD는 처음으로 발행량 다수가 <strong>XRPL 위에</strong> 존재하게 됐다 — XRPL ~$810M(51.7%) vs 이더리움 ~$756M(48.3%). RLUSD 기반 직접 정산 볼륨은 2026년 5월 약 <strong>$5.08B</strong>로, 2024년 12월의 ~$68M 대비 약 75배로 폭증했다(<a href="https://finance.biggo.com/news/0b3567e1-d685-4513-a252-d886ef95966d">BigGo Finance</a>). 7월 1일 하루에만 RLUSD가 XRPL에서 약 $2.5B의 정산을 처리했다(<a href="https://coinmarketcap.com/cmc-ai/xrp/latest-updates/">CoinMarketCap AI</a>).</p>
<p><strong>③ AI 결제 — x402의 부상.</strong> XRPL의 x402 결제 퍼실리테이터를 통한 자율 AI 에이전트 트랜잭션이 <strong>100만 건에 근접</strong>했다(같은 CMC AI 집계). 소액·고빈도 결제라는 XRPL의 원래 설계 강점이 AI 에이전트 경제라는 새 수요와 맞물리는 초기 신호다.</p>
<div class="prose-callout" data-variant="warn">
  <p><strong>귀속의 함정.</strong> 여기서 반드시 구분해야 한다 — <strong>RLUSD 정산 볼륨의 증가가 곧 XRP 수요의 증가는 아니다.</strong> RLUSD로 직접 정산하면 오히려 XRP를 브릿지로 거칠 필요가 줄 수 있다(카니벌라이제이션 논쟁). XRP에 실제로 흘러드는 것은 (a) XRPL 트랜잭션 수수료(극소·소각, §5)와 (b) 원장 활동이 만드는 XRP 담보·유동성 수요뿐이다. "XRPL이 바쁘다 = XRP가 오른다"는 등식은 검증이 필요한 가설이지 자동 성립하는 관계가 아니다.</p>
</div>

<h2 id="s5">5. 밸류에이션 — 왜 XRP엔 P/F가 통하지 않나</h2>
<p>DeFi 딥다이브(<a href="/research/defi-bluechip-fee-switch-2026-06">수수료 스위치</a>)에서 우리는 "수수료 매출이 토큰에 쌓이는가"를 핵심 기준으로 삼았다. 그 렌즈를 XRP에 그대로 대면 <strong>거의 아무것도 보이지 않는다</strong> — 그리고 그게 정상이다. XRPL의 트랜잭션 수수료는 건당 <strong>0.00001 XRP(=10 drops) 수준</strong>으로 설계상 극도로 낮고, 그마저도 보유자에게 분배되지 않고 <strong>소각(burn)</strong>된다. 즉 XRPL은 "프로토콜 매출"을 만들어 토큰에 귀속시키는 구조가 <strong>애초에 아니다</strong>. 따라서 DeFi식 <strong>P/F(주가/수수료)·P/S(주가/매출)는 XRP에 적용 불가</strong>다.</p>
<p>그러면 무엇으로 보는가. XRP는 <strong>현금흐름 자산이 아니라 통화형(monetary)·유틸리티 자산</strong>이다 — 가치의 원천은 (1) 브릿지·정산 유틸리티가 만드는 실수요, (2) 준비자산·투기가 부여하는 모네터리 프리미엄, (3) 에스크로 공급 정책이다. 이런 자산엔 <strong>NVT류(시가총액 ÷ 경제적 처리량)와 채택 지표</strong>가 더 맞는 렌즈다. 아래 표는 왜 같은 잣대로 세 자산을 재면 안 되는지를 보여준다.</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th>자산</th><th>가치 귀속 메커니즘</th><th>프로토콜 수수료 성격</th><th>적합한 밸류에이션 렌즈</th></tr></thead>
<tbody>
<tr><td>XRP</td><td>브릿지 유틸리티 + 모네터리 프리미엄</td><td>극소(drops)·<strong>소각</strong>, 보유자 분배 없음</td><td>NVT·정산볼륨·채택(P/F 부적합)</td></tr>
<tr><td>ETH</td><td>가스 수수료 + EIP-1559 소각 + 스테이킹</td><td>실질 매출 존재, burn/stake로 귀속</td><td>P/F·P/S·스테이킹 수익률</td></tr>
<tr><td>SOL</td><td>가스 + 우선수수료 + 스테이킹</td><td>매출 존재, 일부 소각/검증자 귀속</td><td>P/F·REV·스테이킹 수익률</td></tr>
</tbody>
</table>
</div>
<p>실용적 함의: XRP를 "싸다/비싸다"로 말하려면 <strong>완전희석가치(FDV) 대비 경제적 처리량</strong>과 <strong>월 에스크로 순증을 상쇄할 실수요</strong>를 봐야 한다. 시총 ~$700억, FDV(100B 전량 기준)는 그 위 — 이 숫자가 정당화되려면 정산·담보 수요가 지속 성장해야 한다는 뜻이다. 라이브 밸류에이션·정산 지표는 <a href="/sectors">섹터 동향</a>에 위임한다.</p>

<h2 id="s6">6. 로드맵·촉매 — 무엇이 배관을 바꾸나</h2>
<ul>
  <li><strong>규제 명확성(완료).</strong> SEC 소송은 2025년 8월 종결됐다 — Torres 판사는 프로그램적·공개시장 판매의 XRP는 증권이 아니라고 판시했고(기관 대상 판매는 증권으로 인정), 리플은 $50M(원 청구 $125M서 감액)을 부과받았으며 양측이 항소를 철회했다(<a href="https://www.coindesk.com/policy/2025/08/07/sec-s-long-running-case-against-ripple-officially-over">CoinDesk</a>). ETF 상장의 법적 토대가 여기서 나왔다.</li>
  <li><strong>CLARITY Act(진행).</strong> 미국 시장구조 법안이 2026년 5월 14일 상원 은행위를 통과해 본회의 표결을 대기 중이다 — 통과 시 XRP를 포함한 디지털자산의 상품/증권 경계를 명문화한다(<a href="https://www.cryptotimes.io/2026/07/03/xrp-price-prediction-july-2026-when-will-xrp-go-up-and-can-it-reach-3/">Crypto Times</a>).</li>
  <li><strong>은행·정산 인프라.</strong> 리플은 국법 신탁은행(national trust bank) 인가에 조건부 승인을 받아 RLUSD·커스터디를 제도권 레일에 얹으려 하고 있다(<a href="https://ripple.com/insights/xrp-etfs-the-institutional-era-has-begun/">Ripple</a>).</li>
  <li><strong>XRPL EVM 사이드체인(가동).</strong> 2025년 6월 30일 메인넷 라이브 이후 Axelar·Wormhole 브릿지로 크로스체인 연결을 확장 중이다 — XRPL에 스마트컨트랙트 dApp·RWA 토큰화를 붙이는 경로(<a href="https://ripple.com/insights/xrpl-evm-sidechain-mainnet-is-live/">Ripple</a>).</li>
  <li><strong>매크로(변수).</strong> 7월 28~29일 FOMC. 우리 <a href="/research/weekly-16-warsh-pivot-thaw-2026-07">주간 시황 #16</a>에서 짚은 워시 체제의 금리 경로가 XRP를 포함한 위험자산 전반의 배경 변수다.</li>
</ul>

<h2 id="s7">7. 리스크 — 유틸리티가 곧 가치는 아니다</h2>
<div class="prose-callout" data-variant="warn">
  <p><strong>① 에스크로 오버행.</strong> 월 ~2~4억 XRP 순증(연 4~8% 인플레)은 수요가 약할 때 상시 매도 압력으로 작동한다. 완전 해제까지 ~9년이 남아 이 변수는 장기간 유효하다.</p>
  <p><strong>② 가치 귀속의 불확실성.</strong> RLUSD·정산 볼륨 증가가 XRP 토큰 수요로 직결되지 않을 수 있다 — 오히려 RLUSD 직접 정산이 XRP 브릿지 수요를 잠식할 여지가 있다(카니벌라이제이션).</p>
  <p><strong>③ 집중도·거버넌스.</strong> 리플이 대규모 에스크로와 상당한 유통 물량을 통제한다 — 공급 정책·OTC 매각이 사실상 한 주체에 의존한다.</p>
  <p><strong>④ 밸류에이션 렌즈 부재.</strong> 현금흐름이 없어 전통적 P/F·P/S로 저평가/고평가를 판정하기 어렵다 — 가격이 상당 부분 내러티브·기대에 의존한다("호재에도 못 오른다"는 약세 서사의 뿌리).</p>
  <p><strong>⑤ 경쟁.</strong> 국경 간 정산·스테이블코인 레일에서 USDC·USDT, 은행 컨소시엄, 기타 L1과 경쟁한다. XRP만의 해자(브릿지 유동성·규제 지위)가 지속 가능한지는 검증 중이다.</p>
</div>

<h2 id="s8">8. 우리의 관점 — 방향이 아니라 배관을 보라</h2>
<p>XRP는 "소송에서 이겼고 ETF도 붙었으니 오를 일만 남았다"고 말하기엔 <strong>수급(에스크로)과 귀속(수수료 소각)이라는 두 개의 구조적 무게추</strong>를 달고 있고, "호재에도 못 오르니 죽었다"고 말하기엔 <strong>규제 명확성·기관 레일·RLUSD라는 실측 가능한 개선</strong>이 진행 중이다. 그래서 우리는 XRP를 <strong>이벤트 드리븐(소송·ETF·법안)에서 어댑션 드리븐(정산·담보 실수요)으로 넘어가는 전환기의 자산</strong>으로 규정한다.</p>
<p>확인해야 할 단 하나의 질문: <strong>월 에스크로 순증을 실수요가 흡수하기 시작하는가.</strong> ETF 순유입 + RLUSD·정산 기반 XRP 실수요가 순증을 넘어서면 오버행 서사는 무너지고 재평가 여지가 열린다. 반대로 유틸리티 지표는 오르는데 XRP 토큰 수요로 번역되지 않으면(카니벌라이제이션), 가격-펀더멘털 괴리는 '기회'가 아니라 '구조'로 굳는다. 우리는 이 배관을 <a href="/sectors">섹터 동향</a>과 ETF 흐름으로 추적한다.</p>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 분석은 XRP의 구조·펀더멘털에 대한 관찰·교육 콘텐츠이며 BBDX 시그널과 무관하다. 본문의 가격·공급·자금 수치는 명시된 as-of 시점 값으로 변동하며(특히 에스크로·ETF·RLUSD 수치는 자주 갱신됨), 개별 진입·청산 판단은 시그널 스캐너의 RSI·BB·ADX 컨플루언스를 따른다. 본 글은 단독 매매 신호나 가격 목표를 발행하지 않으며, 과거 성과는 미래를 보장하지 않는다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://www.cryptotimes.io/2026/07/03/xrp-price-prediction-july-2026-when-will-xrp-go-up-and-can-it-reach-3/">Crypto Times — XRP 7월 전망(가격·CLARITY·FOMC·ETF)</a></li>
  <li><a href="https://coinmarketcap.com/cmc-ai/xrp/latest-updates/">CoinMarketCap AI — XRP 최신 동향(RLUSD·x402·ETF)</a></li>
  <li><a href="https://xrp-insights.com/">XRP Insights — 현물 XRP ETF AUM·유입 트래커</a></li>
  <li><a href="https://finance.biggo.com/news/0b3567e1-d685-4513-a252-d886ef95966d">BigGo Finance — ETF 유입·RLUSD·AI 트랜잭션</a></li>
  <li><a href="https://www.cryptopolitan.com/xrp-tokenomics-supply-escrow-market-impact/">Cryptopolitan — XRP 토크노믹스·에스크로</a></li>
  <li><a href="https://coinedition.com/ripples-38b-xrp-escrow-could-take-9-more-years-to-fully-unlock/">Coin Edition — 리플 에스크로 ~38B, 완전 해제 ~9년</a></li>
  <li><a href="https://www.coindesk.com/policy/2025/08/07/sec-s-long-running-case-against-ripple-officially-over">CoinDesk — SEC-리플 소송 공식 종결(2025-08)</a></li>
  <li><a href="https://www.coindesk.com/tech/2025/06/30/xrpl-evm-sidechain-goes-live-unlocking-ethereum-dapps-in-xrp-ecosystem">CoinDesk — XRPL EVM 사이드체인 메인넷 라이브</a></li>
  <li><a href="https://ripple.com/insights/xrpl-evm-sidechain-mainnet-is-live/">Ripple — XRPL EVM 사이드체인 메인넷</a></li>
  <li><a href="https://ripple.com/insights/xrp-etfs-the-institutional-era-has-begun/">Ripple — XRP ETF와 기관 시대</a></li>
</ul>
`;

const WEEKLY_13_BODY = `
<h2 id="s1">1. 한 주 요약</h2>
<p>이번 주(6월 8~14일) 암호화폐 시장은 <strong>전형적인 위험회피(risk-off) 국면</strong>이었다. 비트코인은 6월 5일 장중 <strong>약 $59,100</strong>까지 밀리며 2026년 들어 가장 약한 한 주를 보냈고, 24시간 동안 35만 계좌·30억 달러 규모의 청산이 쏟아졌다(<a href="https://news.bitcoin.com/why-is-bitcoin-crashing-worst-week-of-2026-59100-low-and-more-than-half-of-all-btc-now-in-the-red/">Bitcoin.com</a>). 이후 6월 11~12일 "이란 전쟁 종료" 헤드라인에 위험자산이 일제히 반등하며 BTC는 <strong>$63,000대를 회복</strong>, 주간으로는 거의 보합으로 마감했다(<a href="https://finance.yahoo.com/personal-finance/investing/article/bitcoin-and-ethereum-prices-today-friday-june-12-2026-prices-rebound-this-morning-after-trump-claims-war-has-ended-115949042.html">Yahoo Finance</a>).</p>
<p><strong>우리 관점.</strong> 이번 하락을 "크립토 약세장의 시작"으로 읽는 컨센서스에 동의하지 않는다. 이건 <strong>매크로(지정학+인플레이션)가 주도한 외생 충격</strong>이지 온체인 펀더멘털 훼손이 아니다 — 결정적 증거는 ETF에서 자금이 빠지는 동안에도 스테이블코인 공급이 사상 최대를 유지했다는 점이다(§4). 따라서 읽어야 할 질문은 "무엇이 올랐나"가 아니라 <strong>"무엇이 덜 빠졌나"</strong> — 하락장에서의 상대강도다.</p>

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

<div class="prose-callout">
  <p><strong>우리가 틀리는 조건.</strong> 이 "외생 충격" 읽기는 두 경우 깨진다 — (1) 이란 종전이 불발돼 유가·인플레가 재점화되며 금리 인하가 더 멀어지거나, (2) 스테이블코인 총공급이 의미 있게 줄며 온체인 자본 자체가 이탈할 때. 그 전까지 우리는 ETF 유출을 구조적 이탈이 아니라 금리발 일시 재배분으로 본다.</p>
</div>

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

const WEEKLY_14_BODY = `
<h2 id="s1">1. 한 주 요약 — 매파 데뷔가 마지막 비둘기 버팀목을 치웠다</h2>
<p>지난 한 주(6/15~21, 그리고 그 직후)의 모든 것은 <strong>6월 17일 FOMC</strong> 하나로 수렴했다. 케빈 워시(Kevin Warsh) 신임 의장의 첫 회의에서 연준은 기준금리를 <strong>3.50~3.75%로 동결</strong>했지만 — 시장이 받아든 것은 동결이 아니라 <strong>매파 톤</strong>이었다. 점도표상 19명 중 9명이 연내 최소 1회 <em>인상</em>을 전망했고, 2026년 말 중앙값 금리 전망은 3.4%에서 <strong>3.8%로 상향</strong>됐다(<a href="https://www.theblock.co/post/405152/crypto-markets-wobble-hawkish-fed-outlook-kevin-warsh-first-fomc-meeting">The Block</a>). 워시는 관례를 깨고 본인 경제 전망치 제출을 거부했고, 포워드 가이던스를 폐기한 채 "물가 안정·데이터 의존"만 반복했다(<a href="https://cryptobriefing.com/warsh-fed-remarks-pressure-bitcoin-gold-silver/">Crypto Briefing</a>). 비둘기 신호를 기다리던 위험자산은 일제히 빠졌다 — 발표 당일 BTC -2.2%, ETH -3.6%(<a href="https://beincrypto.com/kevin-warsh-sends-bitcoin-and-gold-lower-in-first-fomc-press-conference/">BeInCrypto</a>).</p>
<p><strong>우리 관점 — #13에서 한 칸 이동.</strong> 직전 호(#13)에서 우리는 6월 초 하락을 "매크로가 주도한 외생 충격이지 펀더멘털 훼손이 아니다"로 읽었다. 그 골격은 유지하되 <strong>변수 하나가 교체됐다 — 외생 충격이 '지정학(이란)'에서 '통화정책(워시)'으로 바뀌었고, 후자는 헤드라인처럼 하루 만에 되돌지 않는다.</strong> 워시 체제는 적어도 한 분기 동안 "인하는 없다"를 기본값으로 만든다. 그래서 <strong>입증 책임이 뒤집혔다</strong>: 6월 초엔 약세론자가 "구조적 이탈"을 증명해야 했다면, 지금은 강세론자가 "고금리에도 자금이 돌아온다"를 증명해야 한다. 그럼에도 이건 <strong>항복(capitulation)이 아니라 정책발 디리스킹</strong>이다 — 읽어야 할 질문은 여전히 "무엇이 올랐나"가 아니라 <strong>"무엇이 덜 빠졌나"</strong>이고, 이번 주 그 답은 <strong>AI·RWA·Hyperliquid</strong>였다(§4).</p>

<div class="prose-table-wrap">
<table>
<thead><tr><th>지표</th><th class="num">값 (as-of 6/24)</th><th>비고</th></tr></thead>
<tbody>
<tr><td>BTC</td><td class="num">~$62,600</td><td>주간 -4.5%, 5/25 고점 $77.6K서 -18%</td></tr>
<tr><td>ETH</td><td class="num">~$1,665</td><td>BTC 대비 지속 열위</td></tr>
<tr><td>BTC 현물 ETF</td><td class="num">-$5.94B</td><td>6주 연속 순유출 누적</td></tr>
<tr><td>공포·탐욕 지수</td><td class="num">23</td><td>극단적 공포 — 7일 평균 20, 저점 13</td></tr>
<tr><td>알트시즌 지수</td><td class="num">39~48</td><td>중립 — 선택적·내러티브 로테이션</td></tr>
</tbody>
</table>
</div>
<figure>
  <div class="prose-figure-placeholder" role="img" aria-label="FOMC 전후 비트코인 흐름 차트 자리"></div>
  <figcaption>그림 1. 6/17 FOMC(워시 데뷔)를 분기점으로 위험회피가 심화, BTC는 고점 대비 -18%·F&G 23(개념도, as-of 6/24). 라이브 수치는 <a href="/sectors">섹터 동향</a>·<a href="/">시그널 스캐너</a> 참조.</figcaption>
</figure>

<h2 id="s2">2. 매크로 — 워시의 매파 데뷔</h2>
<p>회의 결과 자체는 무난했다. 동결(3.50~3.75%)은 컨센서스였다. 충격은 <strong>'어떻게'</strong>에서 왔다. 워시는 의장 데뷔 기자회견에서 <strong>본인의 점도표·전망치 제출을 생략</strong>했다 — 파월·옐런이 항상 개인 전망을 점도표에 포함시켜 온 10년 넘은 관례를 깬 것이다(<a href="https://www.cryptotimes.io/2026/06/17/live-fomc-june-2026-kevin-warsh-debut-rate-hold-bitcoin-volatility/">Crypto Times</a>). 시장은 이를 "포워드 가이던스의 의도적 제거 = 연준 풋의 약화"로 해석했다. 점도표는 <strong>연내 인상 쪽으로 9표</strong>가 몰리며 중앙값을 3.8%로 끌어올렸고, 최근의 안도 랠리 뒤 새 호재가 없던 트레이더들은 위험자산 전반에서 차익을 실현했다 — 한 집계는 주식·금·은·BTC 합산 <strong>약 $2조 시가가 증발</strong>했다고 추산한다(<a href="https://cryptobriefing.com/warsh-fed-remarks-pressure-bitcoin-gold-silver/">Crypto Briefing</a>, 합산 추정치).</p>
<p><strong>왜 크립토에 직격인가.</strong> 이자가 없는 BTC에게 "고금리 장기화"는 가장 직접적인 역풍이다 — 무위험 채권 수익률이 높게 유지되는 한, 기관 배분에서 BTC의 상대 매력은 떨어지고 이는 §3의 ETF 유출로 곧장 번역된다. #13의 5월 CPI +4.2%가 "인하 기대"를 흔들었다면, 이번 FOMC는 그 흔들림을 <strong>정책으로 확정</strong>했다.</p>

<h2 id="s3">3. 시장 구조 — 6주째 ETF 출혈과 Extreme Fear</h2>
<p>가격보다 <strong>흐름</strong>이 더 많은 것을 말한다. 비트코인 현물 ETF는 <strong>6주 연속 순유출</strong>로 누적 약 <strong>-$59.4억(-$5.94B)</strong>을 기록했다(<a href="https://coinstats.app/ai/a/latest-news-for-bitcoin">CoinStats</a>). BTC는 5월 25일 고점 $77,623에서 약 <strong>-18%</strong> 밀린 ~$62,600 부근, 전체 시총은 ~$2.17조로 위축됐다. 공포·탐욕 지수는 <strong>23(극단적 공포)</strong>, 7일 평균 20, 한때 저점 13까지 내려갔다(<a href="https://www.bitdegree.org/cryptocurrency-prices/fear-and-greed-index">BitDegree F&amp;G</a>).</p>
<p>하락의 메커니즘은 <strong>BTC발 매도 + 파생 청산</strong>의 익숙한 조합이었고, 여기에 두 개의 유동성 변수가 겹쳤다 — (1) 6주째 이어진 ETF 유출, (2) <strong>사상 최대급 SpaceX IPO 수요가 투기 자본을 주식 쪽으로 빨아들인다</strong>는 논쟁(<a href="https://www.tradingkey.com/analysis/cryptocurrencies/btc/261945885-crypto-bitcoin-btc-price-crashing-usd-strategy-fed-tradingkey">TradingKey</a>). #13에서 "관전 포인트"로 올렸던 SpaceX IPO·Deribit 만기가 이번 주 실제 변수로 작동한 셈이다.</p>
<blockquote>6주 연속 ETF 유출은 "한 번의 충격"이 아니라 "추세"다. 단, 같은 기간 온체인 달러(스테이블코인)가 사상 최대 부근을 유지하는 한, 우리는 이를 이탈이 아니라 고금리발 재배분으로 본다 — 이 전제가 깨지는 순간이 §5의 '관점이 바뀌는 조건'이다.</blockquote>

<h2 id="s4">4. 섹터별 상대강도 — 셋이 버텼다</h2>
<p>-18% 드로다운 안에서 "리더십"은 절대 상승이 아니라 <strong>덜 빠진 것 + 고유 촉매가 살아있는 것</strong>을 뜻한다. 이번 주 셋이 두드러졌다.</p>
<p><strong>① AI — 고유 촉매로 분리 거래.</strong> AI 섹터는 매크로와 어느 정도 디커플됐다. <strong>Bittensor(TAO)</strong>는 6월 중순 주간 <strong>+28%</strong> 급등하며 $220~260 구간을 테스트했고, 이번 강세의 가장 구체적인 토대는 가격이 아니라 <strong>구조</strong>다 — Grayscale·Bitwise가 <strong>현물 TAO ETF를 신청</strong>했고 SEC 판단이 ~8월로 잡혀 있다(<a href="https://coinmarketcap.com/cmc-ai/bittensor/latest-updates/">CoinMarketCap AI</a>). <strong>FET</strong>는 5월 띄운 Agent Launchpad로 "내러티브→유틸리티" 전환을 시도 중이고, <strong>RENDER</strong>는 GPU 컴퓨팅이라는 만질 수 있는 수요로 차별화된다(<a href="https://bitcoinfoundation.org/news/ai-news/top-ai-crypto-tokens/">Bitcoin Foundation</a>). 다만 #5(AI 딥다이브)에서 짚은 "수익 사막"은 그대로다 — 모멘텀은 진짜, 매출 검증은 여전히 빈약.</p>
<p><strong>② DeFi — Hyperliquid의 펀더멘털이 가격을 압도.</strong> <strong>HYPE</strong>는 6월 16일 사상최고 <strong>$76.67</strong>를 찍고 주간 -15%대(~$60)로 되돌렸지만, 정작 주목할 건 가격이 아니라 <strong>현금흐름</strong>이다 — 최근 30일 수수료 약 <strong>$53M</strong>으로 이더리움(~$5.1M)·솔라나(&lt;$2M)를 크게 앞섰고, FDV가 솔라나($56B)에 근접한 $50B까지 올라왔다(<a href="https://www.banklesstimes.com/articles/2026/06/01/hyperliquid-is-slowly-taking-over-ethereum-and-solana-key-metrics-reveal/">BanklessTimes</a>). 수수료 대부분을 HYPE 소각에 쓰는 디플레 구조는 #4(DeFi 수수료 스위치) 테제의 가장 선명한 실사례다(<a href="https://www.coingecko.com/en/coins/hyperliquid">CoinGecko</a>).</p>
<p><strong>③ RWA — 방어적 로테이션의 승자.</strong> <strong>ONDO</strong>는 시장이 빠지는 동안 30일 <strong>+59%</strong>로 메이저 알트 중 최상위 성과를 냈다(<a href="https://crypto.com/en/market-updates/best-altcoins-june-2026">Crypto.com</a>). #3(RWA 딥다이브)의 핵심 — 수요가 리테일 투기가 아니라 기관 온체인 수익에서 나오기에 BTC 사이클과 상관이 낮다 — 가 하락장에서 다시 한번 확인됐다.</p>
<p><strong>그 외.</strong> ETH는 ~$1,665로 BTC 대비 열위가 지속됐고, DEX 거래·수수료 점유를 Hyperliquid에 잠식당하는 구도가 부각됐다. 알트시즌 지수는 39~48 중립 — Glassnode의 알트 사이클 지표가 86까지 튄 건 알트 랠리가 아니라 <strong>BTC가 더 빨리 빠진 착시</strong>다(<a href="https://www.thecoinrepublic.com/2026/06/24/altcoin-season-index-hits-86-but-bitcoin-weakness-drives-signal/">The Coin Republic</a>).</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th class="num">순위</th><th>섹터</th><th>성격</th><th>이번 주 동인</th></tr></thead>
<tbody>
<tr><td class="num">1</td><td>AI</td><td>매크로와 디커플</td><td>TAO +28% 주간, 현물 TAO ETF 신청(~8월); FET 유틸 전환</td></tr>
<tr><td class="num">2</td><td>DeFi(Perps)</td><td>펀더멘털 강세</td><td>HYPE 수수료 $53M/30d·소각, FDV가 SOL 추월권</td></tr>
<tr><td class="num">3</td><td>RWA</td><td>방어적 버팀</td><td>ONDO 30d +59%, 기관 수익 수요</td></tr>
<tr><td class="num">4</td><td>BTC</td><td>alt 대비 우위</td><td>안전자산 선호·도미넌스</td></tr>
<tr><td class="num">5</td><td>ETH·L1·L2</td><td>열위</td><td>ETF 약세, DEX 점유 잠식, 고베타 디리스킹</td></tr>
</tbody>
</table>
</div>
<div class="prose-callout" data-variant="warn">
  <p><strong>내러티브 검증 주의.</strong> TAO·FET의 이번 주 급등 촉매로 "미국이 Anthropic 등 AI 모델 접근을 제한하는 수출 명령을 내려 탈중앙 AI로 자본이 이동했다"는 서사가 널리 인용된다. 가격 무브(TAO +28%)와 ETF 신청은 복수 출처로 확인되지만, <strong>그 '수출 명령' 촉매 자체는 단일·검증 미흡한 SEO성 서사</strong>로 보여 우리는 독립 확인 전까지 동인으로 채택하지 않는다. 섹터별 라이브 등락은 <a href="/sectors">섹터 동향</a>을 참고하라.</p>
</div>

<h2 id="s5">5. 관점이 바뀌는 조건 · 다음 주 관전 포인트</h2>
<ul>
  <li><strong>ETF 흐름의 반전</strong> — 6주 유출이 2주 연속 순유입으로 돌아서면 "고금리발 재배분" 읽기가 "바닥 통과"로 업그레이드된다. 반대로 스테이블코인 총공급이 의미 있게 줄면 온체인 자본 이탈 — 약세 시나리오.</li>
  <li><strong>월말·분기말 리밸런싱(6/30)</strong> — 분기 마감 기관 리밸런싱으로 변동성 확대 가능.</li>
  <li><strong>현물 TAO ETF SEC 판단(~8월)</strong> — AI 섹터의 다음 구조적 촉매. 승인 기대가 선반영될 구간.</li>
  <li><strong>다음 인플레·고용 지표</strong> — 워시 체제에선 데이터 한 줄이 곧 정책. CPI·고용이 식으면 매파 톤 완화 여지, 뜨거우면 인상 시나리오 강화.</li>
</ul>

<div class="prose-callout">
  <p><strong>우리가 틀리는 조건.</strong> "정책발 디리스킹(이탈 아님)" 읽기는 두 경우 깨진다 — (1) 인플레가 재가속해 워시 점도표가 실제 <strong>인상</strong>으로 현실화되며 고금리가 '장기화'를 넘어 '강화'로 갈 때, (2) ETF 유출과 동시에 스테이블코인 공급까지 줄며 온체인 달러 자체가 빠질 때. 그 전까지 우리는 6주 ETF 유출을 추세적 경고로 인정하되, 자본의 '이탈'이 아니라 '관망 이동'으로 본다.</p>
</div>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 주간 시황은 시장 구조에 대한 관찰·교육 콘텐츠이며 BBDX 시그널과 무관하다. 본문의 가격·등락률은 명시된 as-of 시점 값으로 변동하며, 개별 진입·청산 판단은 시그널 스캐너의 RSI·BB·ADX 컨플루언스를 따른다. 본 글은 단독 매매 신호를 발행하지 않으며, 과거 성과는 미래를 보장하지 않는다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://www.theblock.co/post/405152/crypto-markets-wobble-hawkish-fed-outlook-kevin-warsh-first-fomc-meeting">The Block — 워시 첫 FOMC 매파 전망에 크립토 흔들</a></li>
  <li><a href="https://www.cryptotimes.io/2026/06/17/live-fomc-june-2026-kevin-warsh-debut-rate-hold-bitcoin-volatility/">Crypto Times — FOMC 6월 라이브(워시 데뷔·동결)</a></li>
  <li><a href="https://cryptobriefing.com/warsh-fed-remarks-pressure-bitcoin-gold-silver/">Crypto Briefing — 워시 발언에 BTC·금·은 하락</a></li>
  <li><a href="https://beincrypto.com/kevin-warsh-sends-bitcoin-and-gold-lower-in-first-fomc-press-conference/">BeInCrypto — 워시 기자회견 후 BTC·금 하락</a></li>
  <li><a href="https://coinstats.app/ai/a/latest-news-for-bitcoin">CoinStats — BTC 6주 연속 ETF 유출($5.94B)</a></li>
  <li><a href="https://www.bitdegree.org/cryptocurrency-prices/fear-and-greed-index">BitDegree — 공포·탐욕 지수(23, 극단적 공포)</a></li>
  <li><a href="https://www.tradingkey.com/analysis/cryptocurrencies/btc/261945885-crypto-bitcoin-btc-price-crashing-usd-strategy-fed-tradingkey">TradingKey — BTC 급락·SpaceX 유동성 논쟁</a></li>
  <li><a href="https://coinmarketcap.com/cmc-ai/bittensor/latest-updates/">CoinMarketCap AI — Bittensor(TAO) 동향·현물 ETF 신청</a></li>
  <li><a href="https://bitcoinfoundation.org/news/ai-news/top-ai-crypto-tokens/">Bitcoin Foundation — 6월 AI 토큰(FET·TAO·RENDER)</a></li>
  <li><a href="https://www.banklesstimes.com/articles/2026/06/01/hyperliquid-is-slowly-taking-over-ethereum-and-solana-key-metrics-reveal/">BanklessTimes — Hyperliquid 수수료·점유 지표</a></li>
  <li><a href="https://www.coingecko.com/en/coins/hyperliquid">CoinGecko — HYPE ATH $76.67(6/16)·소각 구조</a></li>
  <li><a href="https://crypto.com/en/market-updates/best-altcoins-june-2026">Crypto.com — 6월 알트 성과(ONDO +59%)</a></li>
  <li><a href="https://www.thecoinrepublic.com/2026/06/24/altcoin-season-index-hits-86-but-bitcoin-weakness-drives-signal/">The Coin Republic — 알트시즌 지수 86의 착시</a></li>
</ul>
`;

const WEEKLY_15_BODY = `
<h2 id="s1">1. 한 주 요약 — 6만 달러 바닥이 깨졌다, 그러나…</h2>
<p>지난 한 주(6/22~28) 시장은 #14에서 우리가 던진 질문 — "강세론자가 고금리에도 자금이 돌아온다를 증명할 수 있나" — 에 일단 <strong>아니오</strong>로 답했다. 6월 25일 목요일, 비트코인은 심리적 지지선 <strong>$60,000을 하향 이탈</strong>해 장중 <strong>~$59,770</strong>, 2024년 9월 이후 최저까지 밀렸고 또 한 번 약 <strong>$10억 규모의 선물 포지션</strong>이 청산됐다(<a href="https://finance.yahoo.com/personal-finance/investing/article/bitcoin-and-ethereum-prices-today-thursday-june-25-2026-bitcoin-hits-its-lowest-levels-in-years-125308371.html">Yahoo Finance</a>). 직후 <strong>Aave와 솔라나 생태계 토큰이 반등을 주도</strong>하며 BTC를 $60K 부근으로 끌어올렸다 — 토큰화 주식(tokenized stock) 거래가 솔라나 생태계에 새 모멘텀을 불어넣은 게 결정적이었다(<a href="https://www.coindesk.com/markets">CoinDesk Markets</a>).</p>
<p><strong>우리 관점 — #14에서 한 발 더.</strong> 컨센서스는 이제 두 갈래다: ① "$60K 붕괴 + 이더리움 재단 구조조정 = 약세장 확정", ② "극단적 공포 = 역발상 매수". 우리는 둘 다 성급하다고 본다. <strong>핵심은 자금이 '떠났는가'가 아니라 '어디로 갈아탔는가'다.</strong> BTC가 바닥을 깨는 동안 자본은 시장을 이탈한 게 아니라 <strong>현금흐름·유틸리티 내러티브(Aave·솔라나 토큰화 주식·AI ETF·RWA 정산 레일)로 회전</strong>했고, 온체인 달러(스테이블코인 ~$299B)는 줄지 않았다(§3). 다만 #13·#14와 달리 이번엔 <strong>진짜 펀더멘털 균열이 하나 생겼다</strong> — 이더리움 재단의 인력 ~20%·예산 ~40% 감축(§3)은 단순 가격 약세가 아니라 ETH-베타 복합체의 구조적 후퇴 신호다. 그래서 우리 결론은 <strong>"광범위 항복(capitulation)이 아니라, 레버리지 청산 + 섹터 회전 + ETH 복합체의 구조 약화가 겹친 국면"</strong>이다. 읽어야 할 질문은 여전히 <strong>"무엇이 덜 빠졌고, 무엇이 반등을 이끌었나"</strong>이고, 이번 주 그 답은 <strong>DeFi(Aave)·솔라나 토큰화 주식·AI·RWA</strong>였다(§4).</p>

<div class="prose-table-wrap">
<table>
<thead><tr><th>지표</th><th class="num">값 (as-of 6/26~28)</th><th>비고</th></tr></thead>
<tbody>
<tr><td>BTC</td><td class="num">~$60,000 부근</td><td>6/25 저점 ~$59.8K(2024년 9월 이후 최저) 후 반등</td></tr>
<tr><td>ETH</td><td class="num">지속 열위</td><td>재단 구조조정 + DEX 점유 잠식</td></tr>
<tr><td>BTC 현물 ETF</td><td class="num">-$5.94B 누적</td><td>6주 연속 순유출(6월 합산 ~-$3.6B)</td></tr>
<tr><td>공포·탐욕 지수</td><td class="num">극단적 공포 구간</td><td>$60K 이탈로 심리 재악화</td></tr>
<tr><td>선물 청산</td><td class="num">~$1B(6/25 1일)</td><td>BTC 매도 + 파생 청산 콤보 지속</td></tr>
</tbody>
</table>
</div>
<figure>
  <div class="prose-figure-placeholder" role="img" aria-label="BTC 6만 달러 이탈과 섹터 반등 차트 자리"></div>
  <figcaption>그림 1. BTC가 6/25 $60K를 이탈(~$59.8K)한 뒤 Aave·솔라나 토큰화 주식 주도로 반등(개념도, as-of 6/28). 라이브 수치는 <a href="/sectors">섹터 동향</a>·<a href="/">시그널 스캐너</a> 참조.</figcaption>
</figure>

<h2 id="s2">2. 매크로 — 워시의 톤이 '인플레이션 벽'으로 굳었다</h2>
<p>#14에서 6/17 FOMC를 "외생 충격이 지정학에서 통화정책으로 교체된 분기점"으로 읽었다. 이번 주, 그 점도표 뒤에 깔린 <strong>전망치 자체</strong>가 시장에 더 무겁게 다가왔다. 연준은 2026년 PCE 인플레이션 전망을 3월 2.7%에서 <strong>3.6%로 상향</strong> — 2021년 인플레 급등 이후 <strong>단일 회의 최대 상향폭</strong>이었고, 근원 PCE도 2.7%→3.3%로 올렸다. 위원회는 이제 인플레가 2% 목표로 복귀하는 시점을 <strong>2028년</strong>으로 미뤘다(<a href="https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20260617.htm">Federal Reserve — SEP</a>).</p>
<p><strong>왜 이번에 더 무거운가 — 에너지가 구조 변수로.</strong> 이 상향의 뿌리는 일시적 헤드라인이 아니라 <strong>공급 충격</strong>이다. 중동 분쟁과 호르무즈 해협의 사실상 봉쇄로 IEA가 "시장 역사상 최대 규모의 원유 공급 차질"이라 부른 상황이 발생, 미국 휘발유가 갤런당 <strong>$4 이상</strong>으로 뛰며 운송·식품·비료 비용으로 번졌다(<a href="https://cryptobriefing.com/fed-dot-plot-june-2026-rate-hike/">Crypto Briefing</a>). 달러지수(DXY)는 높은 금리에 +1% 강세를 보였다. #13의 "이란 쇼크"가 일회성 헤드라인이었다면, 이제 그것은 <strong>인플레 전망에 박힌 구조적 가정</strong>으로 승격됐다 — 워시의 매파 톤은 취향이 아니라 데이터의 산물이 됐고, 이자가 없는 BTC에는 가장 직접적이고 끈질긴 역풍이다.</p>

<h2 id="s3">3. 시장 구조 — 출혈은 이어지고, 균열이 하나 생겼다</h2>
<p><strong>① ETF 유출 — 추세 지속.</strong> 비트코인 현물 ETF는 <strong>6주 연속 순유출</strong>로 누적 약 <strong>-$5.94B</strong>, 6월 합산 약 <strong>-$3.6B</strong>를 기록했다(<a href="https://tokenmetrics.com/btc/news/bitcoin-etf-696m-outflows-june-2026/">Token Metrics</a>). 1분기 $52K~58K 구간에서 잡은 기관 포지션이 금리 환경 변화에 차익을 실현하는 흐름이 이어졌다(<a href="https://www.investing.com/analysis/bitcoins-34-billion-etf-bleed-looks-more-cyclical-than-structural-200681474">Investing.com</a>).</p>
<p><strong>② 그러나 마른 화약은 여전히 쌓여 있다.</strong> 같은 기간 스테이블코인 층은 <strong>~$299B</strong> 규모를 유지했다(<a href="https://app.rwa.xyz/">RWA.xyz</a>). #13·#14에서 반복한 핵심 — 가격이 빠지는 동안에도 온체인 달러가 줄지 않으면 그건 '이탈'이 아니라 '관망 이동' — 이 이번 주에도 유지됐다. §4의 섹터 반등이 바로 이 사이드라인 자본의 선택적 재투입이다.</p>
<p><strong>③ 진짜 균열 — 이더리움 재단의 후퇴.</strong> 이번 주 가장 중요한 구조 신호는 가격이 아니라 조직에서 나왔다. <strong>이더리움 재단이 인력 약 20%를 감축</strong>하고 예산을 약 40% 줄여, 연간 지출을 트레저리 자산의 ~15%에서 2030년까지 ~5%로 낮추겠다고 밝혔다(<a href="https://www.theblock.co/">The Block</a>). 우리는 이를 ETH-베타 복합체(ETH·L2·관련 DeFi)에 대한 <strong>실질 펀더멘털 차감</strong>으로 본다 — 단기 호재(긴축 재무)로 포장될 수 있으나, DEX·수수료 점유를 Hyperliquid에 잠식당하는 구도와 겹치면 ETH의 상대 열위는 사이클 변수가 아니라 구조 변수에 가깝다.</p>
<blockquote>BTC는 바닥을 깼지만 스테이블코인은 그대로다. 자본은 시장을 떠난 게 아니라 'BTC 베타'에서 '현금흐름·유틸리티'로 갈아탔다 — 단, ETH 재단 구조조정은 그 회전 안에서도 진짜로 약해진 한 축이다.</blockquote>

<h2 id="s4">4. 섹터별 상대강도 — 반등을 누가 이끌었나</h2>
<p>$60K 이탈 뒤의 반등에서 "리더십"은 절대 상승이 아니라 <strong>바닥에서 먼저, 더 강하게 튄 것 + 고유 촉매가 살아있는 것</strong>을 뜻한다. 이번 주 넷이 두드러졌다.</p>
<p><strong>① DeFi · 솔라나 생태계 — 반등의 선두.</strong> BTC가 $60K에서 안정되자 <strong>Aave와 솔라나 생태계 토큰이 반등을 주도</strong>했고, 동력은 <strong>토큰화 주식 거래</strong>였다(<a href="https://www.coindesk.com/markets">CoinDesk Markets</a>). 한편 DeFi 현금흐름의 대장 <strong>Hyperliquid</strong>는 연환산 수수료 약 <strong>$958M</strong>, 그 <strong>99%를 Assistance Fund의 HYPE 매입(소각)</strong>에 투입하는 구조를 유지했다(<a href="https://defillama.com/protocol/hyperliquid">DefiLlama</a>). #4(수수료 스위치) 테제 — 가격과 별개로 매출이 토큰에 쌓인다 — 가 하락장에서도 작동 중이다.</p>
<p><strong>② RWA — 가장 큰 '다음 촉매'를 손에 쥐다.</strong> <strong>Ondo</strong>는 토큰화 주식 70%+ 점유와 TVL 약 <strong>$3.78B</strong>로 섹터를 지배한다(<a href="https://app.rwa.xyz/platforms/ondo">RWA.xyz — Ondo</a>). 무엇보다 이번 주 최대 구조 촉매는 <strong>DTCC(미 예탁결제기관)가 7월부터 토큰화 증권 운영 테스트를 시작</strong>한다는 발표다 — Russell 1000 주식·주요 ETF·미 국채를 처음으로 블록체인 인프라에 올린다(<a href="https://www.coingecko.com/research/publications/rwa-report-2026">CoinGecko RWA Report 2026</a>). RWA 수요가 리테일 투기가 아니라 기관 정산 레일에서 나온다는 #3의 테제를 가장 강하게 뒷받침하는 이벤트다.</p>
<p><strong>③ AI — 매크로와 디커플 + ETF 촉매 대기.</strong> AI 섹터(시총 ~$26.6B)는 TAO·RENDER·FET를 중심으로 매크로와 어느 정도 분리 거래됐다. 가장 구체적인 토대는 가격이 아니라 <strong>Grayscale·Bitwise의 현물 TAO ETF 신청(SEC 판단 ~8월)</strong>이다(<a href="https://bitcoinfoundation.org/news/ai-news/top-ai-crypto-tokens/">Bitcoin Foundation</a>). #5(AI 딥다이브)의 "수익 사막" 경고는 유효 — 모멘텀은 진짜, 매출 검증은 빈약.</p>
<p><strong>④ 후행 — ETH 복합체.</strong> §3의 재단 구조조정으로 ETH는 BTC 대비 열위가 구조화됐고, DEX 점유를 Hyperliquid에 내주는 흐름이 부각됐다. 알트시즌 신호가 일부 튄 것은 알트 강세가 아니라 <strong>BTC가 더 빨리 빠진 착시</strong>에 가깝다.</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th class="num">순위</th><th>섹터</th><th>성격</th><th>이번 주 동인</th></tr></thead>
<tbody>
<tr><td class="num">1</td><td>DeFi · 솔라나 eco</td><td>반등 선두</td><td>Aave·솔라나 토큰화 주식 모멘텀; HYPE 수수료 $958M 연환산·소각</td></tr>
<tr><td class="num">2</td><td>RWA</td><td>구조 촉매</td><td>DTCC 7월 토큰화 증권 테스트(Russell 1000·국채); Ondo $3.78B TVL</td></tr>
<tr><td class="num">3</td><td>AI</td><td>매크로와 디커플</td><td>현물 TAO ETF 신청(~8월); 섹터 시총 ~$26.6B</td></tr>
<tr><td class="num">4</td><td>BTC</td><td>바닥 테스트</td><td>$60K 이탈 후 반등, 도미넌스 우위</td></tr>
<tr><td class="num">5</td><td>ETH·L2</td><td>구조적 후행</td><td>재단 인력 -20%·예산 -40%, DEX 점유 잠식</td></tr>
</tbody>
</table>
</div>
<div class="prose-callout" data-variant="warn">
  <p><strong>내러티브 검증 주의.</strong> 바이낸스 창업자 CZ는 지난 1년 크립토 ~50% 하락의 원인을 "AI·지정학·4년 사이클의 혼합"으로 지목했는데, 이는 <strong>사후적 서사</strong>이지 검증된 단일 인과가 아니다. 또한 CLARITY Act가 일부 종교계 반대 등으로 지연될 수 있다는 보도가 있으나 입법 타임라인은 유동적이다 — 우리는 둘 다 동인이 아니라 배경 리스크로만 둔다. 섹터별 라이브 등락은 <a href="/sectors">섹터 동향</a>을 참고하라.</p>
</div>

<h2 id="s5">5. 관점이 바뀌는 조건 · 다음 주 관전 포인트</h2>
<ul>
  <li><strong>DTCC 토큰화 증권 테스트 개시(7월)</strong> — RWA 섹터의 가장 구체적인 구조 촉매. 실제 가동·참여 기관 규모가 확인되면 "기관 정산 레일" 테제가 한 단계 격상된다.</li>
  <li><strong>ETF 흐름의 반전 여부</strong> — 6주 유출이 2주 연속 순유입으로 돌면 "고금리발 재배분"이 "바닥 통과"로 업그레이드. 반대로 스테이블코인 총공급이 의미 있게 줄면 진짜 이탈 신호.</li>
  <li><strong>$60K 재이탈 vs 회복</strong> — $60K를 깨고 안착하면 항복 위험, 회복·횡보하면 §4의 섹터 회전 지속에 무게.</li>
  <li><strong>현물 TAO ETF SEC 판단(~8월) · 다음 인플레/고용 지표</strong> — 워시 체제에선 데이터 한 줄이 곧 정책. 지표가 식으면 매파 톤 완화 여지.</li>
</ul>

<div class="prose-callout">
  <p><strong>우리가 틀리는 조건.</strong> "항복이 아니라 회전 + ETH 구조 약화" 읽기는 두 경우 깨진다 — (1) 이번 주 반등을 이끈 리더(Aave·솔라나 eco·AI·RWA)가 BTC와 함께 동반 붕괴하면 그건 회전이 아니라 <strong>광범위 항복</strong>이다, (2) ETF 유출과 동시에 스테이블코인 공급까지 줄며 온체인 달러 자체가 빠지면 '관망 이동' 전제가 무너진다. 그 전까지 우리는 $60K 이탈을 추세적 경고로 인정하되, 자본의 성격을 '이탈'이 아니라 '현금흐름·유틸리티로의 회전'으로 본다.</p>
</div>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 주간 시황은 시장 구조에 대한 관찰·교육 콘텐츠이며 BBDX 시그널과 무관하다. 본문의 가격·등락률은 명시된 as-of 시점 값으로 변동하며, 개별 진입·청산 판단은 시그널 스캐너의 RSI·BB·ADX 컨플루언스를 따른다. 본 글은 단독 매매 신호를 발행하지 않으며, 과거 성과는 미래를 보장하지 않는다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://finance.yahoo.com/personal-finance/investing/article/bitcoin-and-ethereum-prices-today-thursday-june-25-2026-bitcoin-hits-its-lowest-levels-in-years-125308371.html">Yahoo Finance — BTC $60K 이탈, 2024년 이후 최저(6/25)</a></li>
  <li><a href="https://www.coindesk.com/markets">CoinDesk Markets — Aave·솔라나 토큰화 주식 주도 반등</a></li>
  <li><a href="https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20260617.htm">Federal Reserve — 6/17 SEP(PCE 전망 3.6% 상향)</a></li>
  <li><a href="https://cryptobriefing.com/fed-dot-plot-june-2026-rate-hike/">Crypto Briefing — 점도표·호르무즈 공급 충격</a></li>
  <li><a href="https://tokenmetrics.com/btc/news/bitcoin-etf-696m-outflows-june-2026/">Token Metrics — BTC ETF 6월 순유출</a></li>
  <li><a href="https://www.investing.com/analysis/bitcoins-34-billion-etf-bleed-looks-more-cyclical-than-structural-200681474">Investing.com — ETF 유출은 구조적이라기보다 순환적</a></li>
  <li><a href="https://app.rwa.xyz/">RWA.xyz — 스테이블코인 ~$299B·RWA 시장 규모</a></li>
  <li><a href="https://www.theblock.co/">The Block — 이더리움 재단 인력·예산 감축</a></li>
  <li><a href="https://defillama.com/protocol/hyperliquid">DefiLlama — Hyperliquid 수수료 연환산 $958M·소각</a></li>
  <li><a href="https://app.rwa.xyz/platforms/ondo">RWA.xyz — Ondo TVL·토큰화 주식 점유</a></li>
  <li><a href="https://www.coingecko.com/research/publications/rwa-report-2026">CoinGecko — RWA Report 2026(DTCC 7월 토큰화 테스트)</a></li>
  <li><a href="https://bitcoinfoundation.org/news/ai-news/top-ai-crypto-tokens/">Bitcoin Foundation — AI 토큰·현물 TAO ETF 신청</a></li>
</ul>
`;

const WEEKLY_16_BODY = `
<h2 id="s1">1. 한 주 요약 — 워시가 처음으로 물러섰다</h2>
<p>지난 한 주(6/29~7/4)는 <strong>매파 3주(#14·#15)의 각본이 뒤집힌 분기점</strong>이었다. 비트코인은 주 초 <strong>~$58,200</strong>까지 밀리며 연중 저점을 다시 시험했지만(<a href="https://www.coindesk.com/markets/2026/07/02/bitcoin-zooms-above-usd61-000-as-inflation-fears-soften">CoinDesk</a>), 주 후반 두 개의 촉매가 겹치며 <strong>$62,000선까지 반등</strong>했다. ① 케빈 워시 연준 의장이 ECB 신트라 포럼에서 <strong>"인플레이션 위험이 낮아졌다"</strong>고 발언 — 6월 매파 데뷔 이후 <strong>처음으로 톤을 누그러뜨렸고</strong>(<a href="https://www.coindesk.com/markets/2026/07/01/bitcoin-retakes-usd60-000-level-after-fed-chair-warsh-said-inflation-risks-has-come-down">CoinDesk</a>), ② 7월 2일 발표된 <strong>6월 미국 고용이 크게 미스</strong>(비농업 신규고용 5.2만 vs 컨센서스 ~11만, 5월치도 17.2만→12.9만 하향)하며 금리 인상 우려가 완화됐다(<a href="https://finance.yahoo.com/markets/crypto/articles/bitcoin-etfs-draw-222m-snapping-114634374.html">Yahoo Finance</a>).</p>
<p><strong>우리 관점 — #15의 회전 테제가 반등으로 검증됐다, 단 '해빙'이지 '전환'이 아니다.</strong> 이번 반등을 두고 컨센서스는 다시 두 갈래다: ① "워시가 선회했으니 바닥은 지났고 알트시즌이 온다", ② "약한 고용 한 번에 튄 데드캣 바운스". 우리는 둘 다 성급하다고 본다. #15에서 우리는 $60K 이탈을 "광범위 항복이 아니라 현금흐름·유틸리티로의 회전"으로 읽었는데, 이번 주 그 진단이 <strong>가격으로 확인됐다</strong> — 반등을 이끈 건 잡코인 전반의 무차별 랠리가 아니라 <strong>#15에서 버텼던 바로 그 리더들(SOL·HYPE·ONDO·AI 인프라)</strong>이었고(§4), 6주 넘게 이어지던 BTC 현물 ETF 유출이 <strong>10일 만에 순유입으로 돌아섰다</strong>(§3). 그래서 우리는 입장을 한 칸 옮긴다 — <strong>#14~#15의 "강세론자가 입증하라(risk-off)"에서 "조건부 해빙(conditional thaw)"으로</strong>. 다만 <strong>확정은 아니다</strong>: #15에서 우리가 스스로 세운 기준은 "ETF가 <em>2주 연속</em> 순유입"이었는데, 지금은 <strong>단 하루의 유입 + 발언 한 문장</strong>이다. 게다가 이번 해빙의 방아쇠가 <strong>'약해진 노동시장'</strong>이라는 점은 양날의 검이다 — 금리엔 우호적이지만, 실물경기가 정말 식는 거라면 위험자산의 순풍이 아니라 역풍이 될 수도 있다. 컨센서스가 놓치는 지점이 바로 이 결이다.</p>

<div class="prose-table-wrap">
<table>
<thead><tr><th>지표</th><th class="num">값 (as-of 7/2)</th><th>비고</th></tr></thead>
<tbody>
<tr><td>BTC</td><td class="num">~$62,000 부근</td><td>주 초 저점 ~$58.2K 후 ~7% 반등, 약 10일 만에 $62K 상회</td></tr>
<tr><td>ETH</td><td class="num">~$1,745</td><td>반등엔 동참했으나 BTC 대비 열위 지속</td></tr>
<tr><td>SOL</td><td class="num">~$82</td><td>고베타 반등, 주중 장중 +10%대</td></tr>
<tr><td>BTC 현물 ETF</td><td class="num">+$221.7M (7/2)</td><td>10일 연속 유출 종료, 약 2개월래 최대 일일 유입</td></tr>
<tr><td>6월 비농업 고용</td><td class="num">+5.2만 (보도 기준)</td><td>컨센서스 ~11만 대폭 하회, 5월치 하향</td></tr>
</tbody>
</table>
</div>
<figure>
  <div class="prose-figure-placeholder" role="img" aria-label="워시 선회·약한 고용 후 비트코인 반등 차트 자리"></div>
  <figcaption>그림 1. BTC는 주 초 ~$58.2K 연중 저점 재시험 후 워시 선회(7/1)+약한 고용(7/2)에 $62K대로 반등, ETF 유출도 10일 만에 종료(개념도, as-of 7/2). 라이브 수치는 <a href="/sectors">섹터 동향</a>·<a href="/">시그널 스캐너</a> 참조.</figcaption>
</figure>

<h2 id="s2">2. 매크로 — 워시의 첫 후퇴, 그리고 '나쁜 소식이 좋은 소식'</h2>
<p>#14에서 워시의 매파 데뷔를 "외생 충격이 지정학에서 통화정책으로 교체된 분기점"으로, #15에서 그 톤이 "인플레이션 벽으로 굳었다"고 읽었다. 이번 주, 그 벽에 <strong>첫 균열</strong>이 갔다. 워시는 ECB 신트라 포럼에서 <strong>"인플레이션 위험이 낮아졌다"</strong>고 인정했다 — 6월 이후 처음이다. 더 주목할 건 그가 <strong>AI발 투자가 미국 경제의 생산능력(productive capacity)을 확장</strong>해 향후 통화정책에 유의미한 함의를 가질 수 있다고 언급한 대목이다(<a href="https://www.coindesk.com/markets/2026/07/02/bitcoin-zooms-above-usd61-000-as-inflation-fears-soften">CoinDesk</a>). 이는 공급 측 디스인플레이션 논리로, "고금리 장기화"라는 #15의 기본값을 흔드는 서사다.</p>
<p>여기에 <strong>7월 2일 6월 고용보고서가 결정타</strong>였다. 신규고용이 <strong>5.2만 건에 그쳐 컨센서스 약 11만을 대폭 하회</strong>했고, 5월치도 하향 수정됐다(<a href="https://finance.yahoo.com/markets/crypto/articles/bitcoin-etfs-draw-222m-snapping-114634374.html">Yahoo Finance</a>). 시장은 이를 "인상 시나리오 후퇴"로 해석했고 BTC·금이 동반 반등했다(<a href="https://www.coindesk.com/daybook-us/2026/07/02/warsh-s-comments-set-the-stage-for-u-s-jobs-data-to-ignite-bitcoin-gold-rally">CoinDesk Daybook</a>). 전형적인 <strong>'나쁜 경제지표 = 좋은 시장'</strong> 반응이다.</p>
<div class="prose-callout" data-variant="warn">
  <p><strong>해석 주의.</strong> 이번 반등의 근본 동력이 "성장 가속"이 아니라 <strong>"고용 둔화 → 인상 회피 기대"</strong>라는 점을 놓치면 안 된다. 이는 <strong>지속되면 오히려 경기 침체 우려</strong>로 뒤집힐 수 있는 종류의 순풍이다. 단발 지표(5.2만)의 신뢰도, 후속 수정, 향후 CPI가 관건이며, 워시 체제에선 "데이터 한 줄이 곧 정책"이라는 #14의 관찰이 이번엔 <em>비둘기 방향</em>으로 작동한 것뿐이다.</p>
</div>

<h2 id="s3">3. 시장 구조 — 6주 출혈이 처음 멈췄다 (단 하루)</h2>
<p><strong>① ETF 유출의 첫 반전 신호.</strong> 이번 주 가장 중요한 구조 변화는 자금 흐름에서 나왔다. 미국 BTC 현물 ETF는 7월 2일 <strong>약 $221.7M 순유입</strong>으로 <strong>10일 연속 유출을 끊었다</strong> — 약 2개월래 최대 일일 유입이다(<a href="https://finance.yahoo.com/markets/crypto/articles/bitcoin-etfs-draw-222m-snapping-114634374.html">Yahoo Finance</a>). 약한 고용과 워시의 완화 신호가 위험자산 압력을 낮춘 결과다. #13~#15 내내 우리가 "고금리발 재배분(이탈 아님)"으로 읽은 흐름이, 금리 기대가 돌자 <strong>실제로 되돌아오기 시작</strong>했다는 첫 증거다.</p>
<p><strong>② 그러나 '단 하루'와 '2주'는 다르다.</strong> #15에서 우리는 "6주 유출이 <em>2주 연속</em> 순유입으로 돌면 바닥 통과로 업그레이드"라는 기준을 스스로 못박았다. 지금은 그 기준의 <strong>1/10</strong>이 충족됐을 뿐이다. 6월 한 달 누적 유출은 여전히 수십억 달러 규모였고(<a href="https://99bitcoins.com/news/bitcoin-btc/bitcoin-etf-outflows-june-2026/">99Bitcoins</a>), 하루의 유입이 추세 반전을 뜻하진 않는다. 우리는 이를 "반전"이 아니라 <strong>"반전의 첫 후보 캔들"</strong>로 본다.</p>
<p><strong>③ ETH의 구조적 후행은 그대로.</strong> 반등장에서도 이더리움 현물 ETF는 <strong>두 달째 $500M+ 순유출</strong>을 이어갔다(<a href="https://news.bitcoin.com/bitcoin-etf-inflows-ethereum-outflows-june-2026/">Bitcoin.com</a>). #15에서 짚은 이더리움 재단 구조조정(인력 -20%·예산 -40%)과 겹치며, ETH의 상대 열위는 사이클 변수가 아니라 <strong>구조 변수</strong>라는 진단이 유지된다. 반등에 ETH가 동참은 했으나(~$1,745), 이끌진 못했다.</p>
<blockquote>ETF 유출이 6주 만에 멈춘 건 진짜 신호다. 단, 하루짜리 유입은 '바닥 확인'이 아니라 '바닥 후보'다 — 우리가 #15에서 세운 문턱은 여전히 2주 연속 유입이고, 그건 아직 오지 않았다.</blockquote>

<h2 id="s4">4. 섹터별 상대강도 — 반등을 '누가' 이끌었나가 핵심</h2>
<p>이번 주 반등의 성격을 규정하는 건 폭이 아니라 <strong>주도 세력</strong>이다. 결론부터 — <strong>#15에서 버틴 리더가 반등도 이끌었다</strong>. 무차별 잡코인 랠리가 아니라 <strong>선택적(selective) 회전</strong>이었고, 이는 우리의 회전 테제를 강화한다(<a href="https://blog.millionero.com/blog/selective-altseason-2026-not-2021/">Millionero</a>).</p>
<p><strong>① 고베타 반등의 선두 — SOL·HYPE.</strong> 솔라나는 주중 장중 <strong>+10%대</strong>의 전형적 고베타 바운스를 냈고(as-of ~$82), <strong>Hyperliquid(HYPE)는 ~$66로 시장 평균을 크게 상회</strong>하며 리스크온 회전의 대장 역할을 했다(<a href="https://coinmarketcap.com/cmc-ai/hyperliquid/price-analysis/">CoinMarketCap AI</a>). #15에서 강조한 HYPE의 수수료·소각 구조(연환산 ~$958M, 99% AF 매입)라는 펀더멘털 토대가 반등장에서 프리미엄으로 작동했다.</p>
<p><strong>② 금리 완화의 직접 수혜 — RWA(ONDO).</strong> 금리 인하 기대가 커지면 토큰화 국채 수요와 위험선호가 동시에 붙는다. Ondo는 H2 2026 기관 수익·토큰화 상품 수요의 최대 수혜 후보로 다시 지목됐고(<a href="https://coinpedia.org/price-analysis/top-altcoins-to-buy-in-july-2026-cryptos-that-could-outperform-bitcoin-in-h2/">Coinpedia</a>), #15에서 짚은 <strong>DTCC 토큰화 증권 테스트가 7월 실제 개시</strong>된다는 점이 구조 촉매로 살아있다(정식 서비스는 10월 목표, <a href="https://cryptoticker.io/en/dtcc-tokenized-securities-wall-street-stocks-on-chain/">CryptoTicker</a>).</p>
<p><strong>③ 온체인 매출이 검증되는 소수 — AI 인프라.</strong> 선택적 회전의 승자는 "서사"가 아니라 <strong>공개 프로토콜 데이터로 양(+)의 온체인 매출 궤적이 확인되는</strong> 소수다 — Akash·Hyperliquid·Bittensor가 그 문턱을 넘는 대표 사례로 꼽혔다(<a href="https://www.spotedcrypto.com/altcoin-sector-rotation-2026-depin-ai-rwa-gaming/">Spoted Crypto</a>). NEAR·TAO 같은 AI 인프라는 전통 AI 기업 대비 저평가 논리로 여전히 배분 대상이다.</p>
<p><strong>④ 앵커의 부재 — ETH.</strong> 알트시즌의 전통적 벨웨더인 이더리움이 이번 사이클 내내 뒤처지면서, <strong>"ETH/BTC 강세 없이는 광범위 로테이션의 닻이 없다"</strong>는 구도가 이번 주에도 유지됐다(<a href="https://coinpedia.org/price-analysis/top-altcoins-to-buy-in-july-2026-cryptos-that-could-outperform-bitcoin-in-h2/">Coinpedia</a>). 이것이 이번 반등이 "선택적"에 그치고 "전면적"이 되지 못한 구조적 이유다.</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th class="num">순위</th><th>섹터</th><th>성격</th><th>이번 주 동인</th></tr></thead>
<tbody>
<tr><td class="num">1</td><td>DeFi(Perps)·SOL eco</td><td>고베타 반등 선두</td><td>HYPE ~$66 시장 상회, SOL 장중 +10%대; 수수료·소각 펀더멘털</td></tr>
<tr><td class="num">2</td><td>RWA</td><td>금리 완화 수혜</td><td>DTCC 7월 토큰화 테스트 개시; ONDO H2 수혜 후보</td></tr>
<tr><td class="num">3</td><td>AI 인프라</td><td>매출 검증 소수</td><td>Akash·HYPE·Bittensor 양(+) 온체인 매출; NEAR·TAO 저평가 논리</td></tr>
<tr><td class="num">4</td><td>BTC</td><td>반등 트리거</td><td>워시 선회+약한 고용, ETF 유입 첫 전환</td></tr>
<tr><td class="num">5</td><td>ETH·L2</td><td>구조적 후행</td><td>ETF 2개월째 유출, 재단 긴축, 로테이션 앵커 부재</td></tr>
</tbody>
</table>
</div>
<div class="prose-callout" data-variant="warn">
  <p><strong>수치·내러티브 주의.</strong> 본문의 알트 가격(SOL ~$82, HYPE ~$66, ETH ~$1,745)은 <strong>7/2 전후 as-of 값</strong>으로 변동성이 크다 — 정확한 라이브 등락은 <a href="/sectors">섹터 동향</a>을 참고하라. 또한 "AI가 다음 알트 랠리를 이끈다"류 전망은 다수 매체의 <em>예측</em>이지 확정 사실이 아니며, 우리는 <strong>온체인 매출이 검증되는 종목</strong>으로 범위를 좁혀 본다.</p>
</div>

<h2 id="s5">5. 관점이 바뀌는 조건 · 다음 주 관전 포인트</h2>
<ul>
  <li><strong>ETF 유입의 지속 여부(문턱: 2주 연속)</strong> — 7/2 유입이 <strong>다수 세션 연속 유입</strong>으로 이어지면 "조건부 해빙"을 "바닥 통과"로 격상한다. 하루로 끝나면 데드캣 쪽에 무게.</li>
  <li><strong>GENIUS Act 이행규정(7/18 시한)</strong> — 연방 규제당국의 스테이블코인 이행규정 발표 기한. 온체인 달러 인프라의 제도화 분수령(<a href="https://www.lw.com/en/us-crypto-policy-tracker/regulatory-developments">L&amp;W Policy Tracker</a>).</li>
  <li><strong>DTCC 토큰화 증권 7월 테스트</strong> — 실제 참여 기관·규모가 확인되면 RWA "기관 정산 레일" 테제가 한 단계 격상(10월 정식 서비스 예정).</li>
  <li><strong>후속 인플레·고용 지표</strong> — 이번 반등이 '고용 둔화발'인 만큼, 다음 지표가 <em>더</em> 약하면 침체 우려로 되돌 수 있고, 반대로 인플레가 재가속하면 워시의 완화 톤이 하루 만에 철회될 수 있다.</li>
</ul>

<div class="prose-callout">
  <p><strong>우리가 틀리는 조건.</strong> "조건부 해빙(회전 검증)" 읽기는 두 경우 깨진다 — (1) 7/2 ETF 유입이 하루짜리로 끝나고 유출 추세가 재개되며, 이번 주 반등을 이끈 리더(SOL·HYPE·ONDO)가 BTC와 함께 되밀리면 그건 회전이 아니라 <strong>데드캣 바운스</strong>다, (2) 반등의 방아쇠였던 '약한 고용'이 지표 악화로 이어져 <strong>인상 회피 기대가 침체 공포로 전환</strong>되면 '나쁜 뉴스=좋은 시장' 등식 자체가 무너진다. 그 전까지 우리는 이번 주를 매파 3주의 첫 해빙으로 인정하되, 문턱(2주 연속 유입·주간 $60K 안착)이 아직 충족되지 않았음을 명확히 한다.</p>
</div>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 주간 시황은 시장 구조에 대한 관찰·교육 콘텐츠이며 BBDX 시그널과 무관하다. 본문의 가격·등락률·고용 수치는 명시된 as-of/보도 기준 값으로 변동·수정될 수 있으며, 개별 진입·청산 판단은 시그널 스캐너의 RSI·BB·ADX 컨플루언스를 따른다. 본 글은 단독 매매 신호를 발행하지 않으며, 과거 성과는 미래를 보장하지 않는다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://www.coindesk.com/markets/2026/07/02/bitcoin-zooms-above-usd61-000-as-inflation-fears-soften">CoinDesk — 인플레 우려 완화에 BTC $61K 상회(워시 신트라 발언·알트 시세)</a></li>
  <li><a href="https://www.coindesk.com/markets/2026/07/01/bitcoin-retakes-usd60-000-level-after-fed-chair-warsh-said-inflation-risks-has-come-down">CoinDesk — 워시 "인플레 위험 하락"에 BTC $60K 회복</a></li>
  <li><a href="https://finance.yahoo.com/markets/crypto/articles/bitcoin-etfs-draw-222m-snapping-114634374.html">Yahoo Finance — BTC ETF $221.7M 유입, 10일 유출 종료·약한 고용</a></li>
  <li><a href="https://www.coindesk.com/daybook-us/2026/07/02/warsh-s-comments-set-the-stage-for-u-s-jobs-data-to-ignite-bitcoin-gold-rally">CoinDesk Daybook — 워시 발언·고용지표가 BTC·금 랠리 점화</a></li>
  <li><a href="https://news.bitcoin.com/bitcoin-etf-inflows-ethereum-outflows-june-2026/">Bitcoin.com — BTC ETF 유입 vs ETH ETF 유출 지속</a></li>
  <li><a href="https://99bitcoins.com/news/bitcoin-btc/bitcoin-etf-outflows-june-2026/">99Bitcoins — 6월 BTC ETF 순유출 규모</a></li>
  <li><a href="https://blog.millionero.com/blog/selective-altseason-2026-not-2021/">Millionero — 선택적 알트시즌 2026(≠2021)</a></li>
  <li><a href="https://coinmarketcap.com/cmc-ai/hyperliquid/price-analysis/">CoinMarketCap AI — Hyperliquid 가격 분석</a></li>
  <li><a href="https://coinpedia.org/price-analysis/top-altcoins-to-buy-in-july-2026-cryptos-that-could-outperform-bitcoin-in-h2/">Coinpedia — H2 2026 아웃퍼폼 후보 알트(ONDO·HYPE·AI)</a></li>
  <li><a href="https://www.spotedcrypto.com/altcoin-sector-rotation-2026-depin-ai-rwa-gaming/">Spoted Crypto — 섹터 로테이션·온체인 매출 검증(Akash·HYPE·Bittensor)</a></li>
  <li><a href="https://cryptoticker.io/en/dtcc-tokenized-securities-wall-street-stocks-on-chain/">CryptoTicker — DTCC 토큰화 증권 7월 테스트·10월 서비스</a></li>
  <li><a href="https://www.lw.com/en/us-crypto-policy-tracker/regulatory-developments">Latham &amp; Watkins — 미 크립토 정책 트래커(GENIUS Act 7/18 시한)</a></li>
</ul>
`;

const AI_DEEPDIVE_BODY = `
<h2 id="s1">1. 핵심 — 하락장 속 상대강도, 그러나 "수익 사막"</h2>
<p>2026년 6월 현재 AI 섹터는 크립토에서 가장 두드러진 <strong>상대강도</strong>를 보이는 영역이다. 다만 결정적으로, 그 강세는 <em>강세장이 아니라 광범위한 하락장 안에서의 아웃퍼폼</em>이다. BTC가 ~$60K대로 밀리고 시장이 극단적 공포에 잠긴 동안에도 TAO·FET·RENDER·NEAR·WLD 같은 AI 토큰은 양(+)의 월간 수익률을 지켰다.</p>
<p><strong>변동 관점.</strong> 컨센서스는 AI 토큰을 "다음 메가 내러티브"로 매수한다. 우리 견해는 더 좁다 — <strong>모멘텀은 진짜지만, 그 모멘텀은 펀더멘털이 아니라 AI 주식 복합체(NVIDIA·OpenAI·Anthropic)와의 상관 트레이드 + 토큰별 공급 축소가 만든 것</strong>이다. 가격은 검증 가능한 매출을 <strong>수십 배</strong> 앞서고(§3 — 발행:외부매출 22~40배), 그 위에서 모멘텀 리더십과 "수익 사막(income desert)"이 공존한다. 결론적으로 이 섹터는 <em>방향이 아니라 종목 선별</em>의 게임이다.</p>

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

<div class="prose-callout">
  <p><strong>관점이 바뀌는 조건.</strong> "내러티브 ≫ 매출" 진단은 다음 중 하나면 재고한다 — (1) Bittensor·Venice 등에서 <em>외부(비-발행) 매출</em>이 분기 단위로 의미 있게 증가, (2) AI 추론 사용량의 온체인 검증 가능성 확보, (3) TAO 현물 ETF 승인(~8월)으로 기관 수요가 구조적으로 유입. 그 전까지 우리는 프리미엄을 매출이 아니라 베타로 본다.</p>
</div>

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
<p><strong>변동 관점.</strong> 컨센서스는 RWA를 "다음 내러티브 로테이션"으로 묶지만, 우리는 다르게 본다 — <strong>RWA는 내러티브가 아니라 금리 상품</strong>이다. 수요가 리테일 투기가 아니라 <strong>기관의 온체인 수익(yield) 수요</strong>에서 나오기 때문에 BTC 가격 사이클과 상관이 낮고, 그래서 이번 risk-off 주간에 가장 잘 버텼다. 가격이 빠질 때 "온체인 현금성 자산"으로 피신하는 자본이 오히려 RWA로 흘러든다. 단, 같은 논리로 <strong>금리 하락이 이 테제의 가장 큰 적</strong>이다(§5).</p>

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

<div class="prose-callout">
  <p><strong>관점이 바뀌는 조건.</strong> "RWA = 금리 상품" 테제는 두 경우 약해진다 — (1) 연준 완화 사이클로 토큰화 국채 수익률(4~5%)이 압축돼 기관 유인이 줄거나, (2) 발행사·커스터디언에서 신용 사고가 터져 "온체인이 곧 안전"이라는 전제가 깨질 때. 우리는 후자를 섹터의 진짜 꼬리 위험으로 본다.</p>
</div>

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
<p><strong>변동 관점.</strong> 이번 주 DeFi 랠리를 "알트 회전의 시작"으로 추격하는 흐름에 우리는 거리를 둔다. 가격 무브의 상당수는 <strong>이벤트(거버넌스·M&amp;A) 주도</strong>이지 유기적 수요가 아니다(<a href="https://beincrypto.com/defi-tokens-uni-crv-and-aave-lead-crypto-gains-can-near-follow-suit/">BeInCrypto</a> — UNI·CRV·AAVE 선두, STG는 고베타 돌발). 우리가 추적하는 단 하나의 지속 가능한 신호는 따로 있다 — <strong>수수료 스위치(fee switch)로 프로토콜 매출이 토큰에 실제로 귀속되기 시작했다</strong>는 것. STG의 +100% 캔들은 잊어도, UNI·CRV·ENA의 매출 적립 구조는 잊으면 안 된다.</p>

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

<div class="prose-callout">
  <p><strong>관점이 바뀌는 조건.</strong> "수수료 귀속이 진짜 신호" 테제는 (1) 켜진 수수료 스위치가 거버넌스에서 되돌려지거나, (2) 인센티브가 빠졌을 때 TVL·수수료가 급감하면 — 즉 매출이 끈적하지 않다는 증거가 나오면 — 약해진다. 반대로 약세장에서도 fee 매출이 유지되면 우리 컨빅션은 강화된다.</p>
</div>

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
<p>핵심 논쟁은 이 유출이 <strong>순환적(cyclical)</strong>이냐 <strong>구조적(structural)</strong>이냐다. <strong>우리 견해는 순환적</strong>이다 — 근거는 둘. (1) 유출의 트리거가 가격·온체인이 아니라 <em>금리</em>이고(<a href="https://www.investing.com/analysis/bitcoins-34-billion-etf-bleed-looks-more-cyclical-than-structural-200681474">Investing.com</a>도 같은 해석 — 금리 기대가 돌면 되돌아올 자금), (2) 가격이 빠지는 동안에도 <strong>스테이블코인 공급이 사상 최대(~$320B)</strong>를 유지했다. 자본은 시장을 "떠난" 게 아니라 "관망"으로 옮겨갔다. 구조적 이탈이라면 온체인 달러부터 줄었어야 한다.</p>
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

const MACRO_REGIME_BODY = `
<h2 id="m1">1. 왜 매크로가 크립토를 지배하는가</h2>
<p>2026년의 비트코인은 점점 더 <strong>거시 유동성의 함수</strong>로 움직인다. 반감기 캘린더나 온체인 내러티브보다, 글로벌 유동성·달러·실질금리 같은 톱다운(top-down) 변수가 위험자산 전반의 방향을 결정한다. 기관 리서치가 크립토를 다룰 때 개별 토큰이 아니라 <strong>매크로 → 섹터 → 자산</strong> 순서로 내려오는 이유다(<a href="https://www.fidelity.com/webcontent/ap101883-markets_sectors-content/21.01.0/business_cycle/Business_Cycle_Sector_Approach_2020.pdf">Fidelity, Business Cycle Sector Approach</a>).</p>
<p>본 리포트는 그 톱다운 틀을 두 축으로 정리한다. (1) 무엇을 볼 것인가 — <strong>매크로 트리오</strong>, (2) 그것을 어떻게 포지셔닝으로 옮길 것인가 — <strong>유동성 레짐</strong>. 프레임의 출처는 Onramp Institutional 의 매크로-유동성 사이클 리서치(2026-01)이며, 그 한계(특히 인과성 논쟁)도 §4에서 정직하게 다룬다.</p>

<h2 id="m2">2. 매크로 트리오 — M2 · DXY · 실질금리</h2>
<p>Onramp 은 비트코인 사이클을 "게이팅"하는 변수를 <strong>딱 세 개</strong>로 압축한다(<a href="https://onrampbitcoin.com/research/bitcoins-macro-liquidity-cycle">Onramp — The Macro Trio</a>). 핵심은 <em>단일 수치</em>가 아니라 <strong>변화율·전환점(rate-of-change·turning points)</strong>을 본다는 것.</p>
<div class="prose-table-wrap">
<table>
<thead><tr><th>지표</th><th>역할</th><th>무엇을 보나</th></tr></thead>
<tbody>
<tr><td>글로벌 M2</td><td>광의 유동성</td><td>YoY 증가율의 방향·전환점 (확장 vs 수축)</td></tr>
<tr><td>DXY (달러지수)</td><td>세계의 펀딩 통화</td><td>달러 강세 = 위험자산 역풍 / 약세 = 순풍</td></tr>
<tr><td>10년 실질금리</td><td>무이자 자산의 할인율</td><td>실질금리↑ = 금·BTC 등 무이자 자산에 역풍</td></tr>
</tbody>
</table>
</div>
<blockquote>매크로 트리오는 "예측"이 아니라 "체제 인식"의 도구다. 세 변수가 같은 방향을 가리킬 때 신뢰도가 가장 높다.</blockquote>

<h2 id="m3">3. 유동성 레짐 분류</h2>
<p>트리오를 포지셔닝으로 옮기는 다리가 <strong>레짐 분류</strong>다. Onramp 의 전이 가능한 규칙은 단순하다 — <strong>글로벌 M2 YoY 증가율이 표본 중앙값(median) 이상이면 "유동성 확장", 미만이면 "유동성 수축"</strong>으로 분류(표본 2014-05~2026-01).</p>
<p>그리고 포지션 크기는 캘린더(반감기)가 아니라 <strong>레짐 + 기관의 손실 감내(risk budget)</strong>로 결정한다. Onramp 은 "반감기 타이밍 트레이드를 신탁 프로세스에 넣지 말라"며, 레짐-리밸런싱 접근이 더 견고하고 문서화하기 쉽다고 본다.</p>
<div class="prose-callout" data-variant="warn">
  <p><strong>적용 주의.</strong> 레짐은 <em>방향과 사이징</em>의 프레임이지 진입·청산 신호가 아니다. Tradelab 에서 개별 매매 판단은 BBDX(RSI·BB·ADX)를 따르며, 레짐은 그 위의 "위험 예산" 레이어로만 쓴다(헌장: 리서치는 단독 시그널 미발행).</p>
</div>

<h2 id="m4">4. 반론과 한계 — M2가 정말 가격을 "예측"하나</h2>
<p>가장 정직해야 할 지점이다. M2와 비트코인의 높은 상관(보도상 ~84%)이 <strong>인과인지 우연인지는 논쟁 중</strong>이다. CFBenchmarks 등은 이 상관이 <strong>허위상관(spurious)</strong>일 수 있다고 본다(<a href="https://www.cfbenchmarks.com">CFBenchmarks</a>) — 둘 다 "위험선호"라는 공통 요인에 동시 반응할 뿐, M2가 가격을 끌어올린다는 보장은 없다는 것.</p>
<p>또한 Onramp 데이터셋은 2026-01 에서 끝나고, 단일 기관의 자체(브랜디드) 리서치다. 결론: <strong>레짐 프레임은 "맥락"으로 유용하되, M2→가격을 기계적 매매 규칙으로 쓰지 말 것.</strong> 상관은 언제든 깨질 수 있다.</p>

<h2 id="m5">5. 크립토 적용 — 레짐 기반 포지셔닝</h2>
<p>실무 적용은 세 단계다. (1) <strong>현재 레짐 판정</strong> — M2 YoY 가 중앙값 위/아래인가, DXY·실질금리가 우호적인가. (2) <strong>위험 예산 설정</strong> — 확장 레짐 + 우호적 트리오면 위험자산 비중 상단, 수축 레짐이면 하단·현금성(스테이블·토큰화 국채). (3) <strong>리밸런싱 케이던스</strong> — 레짐 전환점에서만 조정, 데일리 노이즈 무시.</p>
<p>섹터 레벨에서는 이 매크로 레이어 위에 <strong>섹터 분류(coverage taxonomy)</strong>를 얹는다 — Messari 식 다층 분류(섹터→서브섹터→태그, 13섹터·124서브섹터)로 커버리지를 잡고, 각 섹터의 상대강도를 레짐 맥락에서 해석한다(<a href="https://docs.messari.io/glossary/classification-system">Messari Classification</a>). 매크로가 "썰물·밀물"이라면 섹터 분석은 "어느 배가 먼저 뜨나"를 본다.</p>

<div class="prose-callout" data-variant="warn">
  <p><strong>면책.</strong> 본 매크로 리포트는 톱다운 프레임워크·교육 콘텐츠로 BBDX 시그널과 무관하며, 단독 매매 신호를 발행하지 않는다. 인용된 상관·레짐은 과거 데이터 기반이며 미래를 보장하지 않는다.</p>
</div>

<h2 id="src">참고 자료</h2>
<ul>
  <li><a href="https://onrampbitcoin.com/research/bitcoins-macro-liquidity-cycle">Onramp — Bitcoin's Macro Liquidity Cycle (Macro Trio·레짐)</a></li>
  <li><a href="https://www.cfbenchmarks.com">CFBenchmarks — M2-BTC 상관 인과성 논쟁</a></li>
  <li><a href="https://docs.messari.io/glossary/classification-system">Messari — Classification System (섹터 분류 backbone)</a></li>
  <li><a href="https://www.fidelity.com/webcontent/ap101883-markets_sectors-content/21.01.0/business_cycle/Business_Cycle_Sector_Approach_2020.pdf">Fidelity — Business Cycle Sector Approach</a></li>
</ul>
`;

// ── seed 기사 (2026-06-14 발행분) ───────────────────────────────────
export const RESEARCH_ARTICLES: ResearchArticle[] = [
  {
    slug: "weekly-17-cpi-crack-vs-hormuz-2026-07",
    type: "weekly",
    title: "주간 시황 #17 — 인플레이션 벽의 첫 균열, 호르무즈의 덮개: ETF 유출 추세가 끝났다",
    dek: "6월 CPI가 예상을 하회하며(근원 YoY 2.6%, 보도 기준) 인플레이션 벽에 첫 금이 갔고, 10일 -$2.73B의 ETF 유출 행진은 3일 +$510M 순유입으로 공식 종료됐다. 그러나 이란 공습 6일째·호르무즈 봉쇄가 유가→인플레 경로로 그 균열을 도로 메울 수 있다. 강세 전환의 필요조건은 갖췄고, 충분조건(지정학)이 빠진 국면 — 승부처는 7/28~29 FOMC다.",
    sector: "btc",
    tags: ["주간 시황", "매크로", "CPI", "ETF", "이란", "섹터 로테이션", "FOMC"],
    assets: ["BTC", "ETH"],
    author: "Tradelab 리서치",
    readMinutes: 9,
    publishedAt: "2026-07-20T17:00:00+09:00",
    featured: true,
    takeaways: [
      "인플레이션 벽의 첫 균열 — 6월 CPI 하회(근원 전월比 보합·전년比 2.6% vs 예상 2.8%, 보도 기준)에 BTC가 한때 $65.6K까지 반등. #16의 약한 고용과 합쳐 완화 데이터 2연속.",
      "구조 전환: 10거래일 -$2.73B ETF 유출 행진이 3거래일 +$510M(IBIT 주도)으로 종료 — #15~16의 판정 문턱(유입 지속) 충족. 시티는 '유입 $100M당 +53bp' 감응도를 공식화.",
      "그러나 호르무즈가 덮개 — 이란 공습 6일째·해협 봉쇄로 유가 재상승. 유가→7월 CPI 재가속 시 균열은 '착시'로 격하. BTC는 $62.5K 방어전으로 회귀.",
      "로테이션 반전: BTC 반등이 알트 자금을 흡수(7/10 이후 -$8.8B), Q2는 8개 내러티브 전부 마이너스·DePIN 최약(-24.8%, 동반 발행 딥다이브 참조). 단독 매매신호는 발행하지 않는다.",
    ],
    toc: [
      { no: "01", title: "두 주 요약 — 균열과 미사일" },
      { no: "02", title: "매크로 — 나쁜 물가의 종료 vs 나쁜 지정학의 연장" },
      { no: "03", title: "시장 구조 — 유출 추세의 공식 종료" },
      { no: "04", title: "섹터 로테이션 — 반등의 대가" },
      { no: "05", title: "관점이 바뀌는 조건 · 다음 관전 포인트" },
    ],
    bodyHtml: WEEKLY_17_BODY,
    canonical: null,
  },
  {
    slug: "sector-depin-revenue-up-tokens-down-2026-07",
    type: "deepdive",
    title: "DePIN 섹터 분석: 매출은 5배, 토큰은 -94% — 밸류에이션 체계가 교체되고 있다",
    dek: "온체인 수수료는 2025년 ~5배로 성장했는데 구세대 DePIN 토큰은 ATH 대비 -94~99%, Q2 2026 최약체(-24.8%). 컨센서스는 '실패한 내러티브'로 읽지만 우리는 밸류에이션 체계의 교체로 읽는다 — 1,000x 스토리 멀티플이 매출 10~25x로, '노드 수'가 '유료 고객'으로. Aethir 바이백 집계 문제부터 AT&T-Helium 계약까지, 매출의 질로 옥석을 가린다.",
    sector: "depin",
    tags: ["DePIN", "Helium", "Render", "io.net", "AI 컴퓨트", "온체인 매출", "밸류에이션"],
    assets: ["HNT", "RENDER", "FIL", "TAO"],
    author: "Tradelab 리서치",
    readMinutes: 12,
    publishedAt: "2026-07-20T11:00:00+09:00",
    takeaways: [
      "다이버전스의 실체: 2025 온체인 수수료 ~5x YoY(1kx, 검증) vs 구세대 토큰 ATH 대비 -94~99%·Q2 중앙값 -24.8% — 죽음이 아니라 측정 단위의 교체('노드 수'→'매출').",
      "매출 집계는 충돌한다 — Messari ~$72M(2025) vs 1kx H1에만 ~$100M. 방법론(fees vs revenue·바이백 포함 여부) 차이라 어느 것도 확정치가 아니다.",
      "매출의 '질'이 관건: 최대 기여자 Aethir는 바이백 기반 집계(고객 직접 지불 아님). 가장 깨끗한 실증은 규모가 작은 Helium — 유료 가입자(월매출 ~$2.5M 기록)·AT&T 상업 계약이라는 크립토 밖 수요.",
      "매출 10~25x 압축은 '싸다'가 아니라 '이제 매출로만 평가받는다'는 선고 — 섹터 베타가 아니라 그 선고를 통과하는 소수(통신·실사용 컴퓨트)에 집중. 단독 매매신호는 발행하지 않는다.",
    ],
    toc: [
      { no: "01", title: "핵심 요약 — 매출 5배, 토큰 -90%" },
      { no: "02", title: "섹터 개요·시장 규모 — '650개 프로젝트'의 실체" },
      { no: "03", title: "하위분류·밸류체인 — 돈을 내는 고객" },
      { no: "04", title: "프로토콜 비교 — 매출의 양이 아니라 질" },
      { no: "05", title: "촉매 — 2026 하반기" },
      { no: "06", title: "리스크" },
      { no: "07", title: "전망 — 성인식을 통과하는 소수" },
    ],
    bodyHtml: DEPIN_DEEPDIVE_BODY,
    canonical: null,
  },
  {
    slug: "asset-xrp-etf-clarity-vs-escrow-2026-07",
    type: "deepdive",
    title: "리플 XRP(XRP) 분석: 소송은 끝났고 ETF는 들어오는데, 왜 가격은 확인해주지 않나",
    dek: "5년 소송 종결·현물 ETF 7종(AUM ~$1B)·RLUSD의 XRPL 추월까지 펀더멘털은 개선됐는데 XRP는 1달러 초반. 핵심 논쟁은 방향이 아니라 '가치 귀속'이다 — 늘어난 유틸리티가 정말 XRP 토큰으로 흘러드는가. 100B 고정 공급·에스크로 오버행·수수료 소각 구조까지, XRP를 왜 P/F로 재면 안 되는지부터 정리한다.",
    sector: "layer-1",
    tags: ["XRP", "Ripple", "RLUSD", "ETF", "토크노믹스", "에스크로", "밸류에이션"],
    assets: ["XRP"],
    author: "Tradelab 리서치",
    readMinutes: 11,
    publishedAt: "2026-07-05T10:00:00+09:00",
    featured: false,
    takeaways: [
      "펀더멘털-가격 괴리: SEC 소송 종결(2025-08)·현물 XRP ETF 7종(AUM ~$1B, 누적 유입 ~$1.3B)·RLUSD의 XRPL 추월에도 XRP는 1달러 초반(2025.7 고점 ~$3.65 대비 -70%대).",
      "핵심 논쟁은 방향이 아니라 '가치 귀속' — RLUSD·정산 볼륨 증가가 XRP 토큰 수요로 직결되지 않을 수 있다(RLUSD 직접 정산의 XRP 브릿지 카니벌라이제이션).",
      "토크노믹스: 100B 고정 선발행, 순환 ~62B, 리플 에스크로 ~37.95B. 월 1B 해제 중 60~80% 재락 → 순증 월 ~2~4억(연 4~8% 인플레)이 최대 수급 변수.",
      "XRP는 현금흐름 자산이 아니다 — XRPL 수수료는 극소·소각되어 보유자에 분배되지 않음. DeFi식 P/F·P/S 부적합, NVT·정산볼륨·채택으로 봐야. 단독 매매신호·가격목표는 발행하지 않는다.",
    ],
    toc: [
      { no: "01", title: "핵심 요약 — 펀더멘털과 가격의 괴리" },
      { no: "02", title: "프로젝트 개요 — XRP는 무엇을 하는 자산인가" },
      { no: "03", title: "토크노믹스 — 고정 공급과 에스크로" },
      { no: "04", title: "온체인·펀더멘털 — 유틸리티와 귀속" },
      { no: "05", title: "밸류에이션 — 왜 P/F가 안 통하나" },
      { no: "06", title: "로드맵·촉매" },
      { no: "07", title: "리스크" },
      { no: "08", title: "우리의 관점" },
    ],
    bodyHtml: XRP_DEEPDIVE_BODY,
    canonical: null,
  },
  {
    slug: "weekly-16-warsh-pivot-thaw-2026-07",
    type: "weekly",
    title: "주간 시황 #16 — 워시의 비둘기 선회와 약한 고용: 해빙인가, 데드캣 바운스인가",
    dek: "매파 3주의 각본이 뒤집혔다. BTC가 연중 저점 ~$58.2K를 재시험한 뒤, 워시 의장의 첫 완화 발언(신트라)과 6월 고용 대폭 미스(5.2만)에 $62K대로 반등. 6주 넘게 이어지던 현물 ETF 유출도 10일 만에 순유입(+$221.7M)으로 돌아섰다. #15의 회전 테제가 반등으로 검증됐지만 — 이건 해빙인가, 데드캣인가.",
    sector: "btc",
    tags: ["주간 시황", "매크로", "FOMC", "워시", "ETF", "섹터 로테이션"],
    assets: ["BTC", "ETH", "SOL", "HYPE", "ONDO"],
    author: "Tradelab 리서치",
    readMinutes: 9,
    publishedAt: "2026-07-04T09:00:00+09:00",
    featured: false,
    takeaways: [
      "각본 반전: 워시 의장이 신트라에서 '인플레 위험 하락'을 처음 인정, 6월 고용 5.2만(컨센 ~11만 대폭 미스)에 BTC가 ~$58.2K서 $62K대로 ~7% 반등.",
      "#15 회전 테제 검증 — 반등을 이끈 건 무차별 잡코인이 아니라 버텼던 리더(SOL·HYPE·ONDO·AI 인프라). 선택적 회전이지 전면적 알트시즌이 아니다(ETH 앵커 부재).",
      "6주+ 이어지던 BTC 현물 ETF 유출이 10일 만에 +$221.7M 순유입으로 첫 반전 — 단 '하루'일 뿐, #15의 문턱(2주 연속 유입)은 미충족.",
      "해빙의 방아쇠가 '약한 고용'이라는 점은 양날의 검 — 지속되면 인상 회피가 침체 공포로 뒤집힐 수 있다. 단독 매매신호는 발행하지 않는다.",
    ],
    toc: [
      { no: "01", title: "한 주 요약 — 워시가 처음으로 물러섰다" },
      { no: "02", title: "매크로 — 워시의 첫 후퇴, '나쁜 소식이 좋은 소식'" },
      { no: "03", title: "시장 구조 — 6주 출혈이 처음 멈췄다 (단 하루)" },
      { no: "04", title: "섹터별 상대강도 — 반등을 '누가' 이끌었나" },
      { no: "05", title: "관점이 바뀌는 조건 · 다음 주 관전 포인트" },
    ],
    bodyHtml: WEEKLY_16_BODY,
    canonical: null,
  },
  {
    slug: "weekly-15-btc-breaks-60k-rotation-2026-06",
    type: "weekly",
    title: "주간 시황 #15 — BTC가 6만 달러 바닥을 깨다: 항복인가, 자금이 갈아탄 것인가",
    dek: "6/25 비트코인이 $60,000을 이탈해 2024년 9월 이후 최저(~$59.8K)로 밀렸다. 그러나 Aave·솔라나 토큰화 주식이 반등을 주도하고 AI·RWA가 고유 촉매로 버텼다. 연준 PCE 전망 3.6% 상향(2021년 이후 최대)과 이더리움 재단 구조조정이라는 진짜 균열까지 — 이건 항복인가, 회전인가.",
    sector: "btc",
    tags: ["주간 시황", "매크로", "ETF", "섹터 로테이션", "RWA", "DeFi"],
    assets: ["BTC", "ETH", "ONDO", "HYPE"],
    author: "Tradelab 리서치",
    readMinutes: 9,
    publishedAt: "2026-06-28T09:00:00+09:00",
    takeaways: [
      "6/25 BTC가 $60K를 이탈해 2024년 9월 이후 최저(~$59.8K), 1일 ~$10억 선물 청산 — #14의 '강세론자 입증 책임'에 일단 '아니오'.",
      "그러나 자본은 '떠난' 게 아니라 '갈아탔다' — Aave·솔라나 토큰화 주식이 반등 주도, 스테이블코인 ~$299B 유지(마른 화약 그대로).",
      "매크로 경화: 연준 2026 PCE 전망 2.7%→3.6%(2021년 이후 단일 회의 최대 상향), 호르무즈 공급 충격이 인플레를 구조 변수로 승격.",
      "진짜 균열은 ETH — 재단 인력 -20%·예산 -40% 감축은 ETH-베타 복합체의 구조적 후퇴. 단독 매매신호는 발행하지 않는다.",
    ],
    toc: [
      { no: "01", title: "한 주 요약 — 6만 달러 바닥이 깨졌다" },
      { no: "02", title: "매크로 — 워시의 톤이 '인플레이션 벽'으로 굳었다" },
      { no: "03", title: "시장 구조 — 출혈은 이어지고, 균열이 하나 생겼다" },
      { no: "04", title: "섹터별 상대강도 — 반등을 누가 이끌었나" },
      { no: "05", title: "관점이 바뀌는 조건 · 다음 주 관전 포인트" },
    ],
    bodyHtml: WEEKLY_15_BODY,
    canonical: null,
  },
  {
    slug: "weekly-14-warsh-hawkish-risk-off-2026-06",
    type: "weekly",
    title: "주간 시황 #14 — 워시의 매파 데뷔, 위험회피 심화 속 셋이 버텼다",
    dek: "6/17 FOMC에서 케빈 워시 신임 의장이 동결하면서도 매파 톤(점도표 중앙값 3.4→3.8%)으로 데뷔, 위험회피가 '지정학'에서 '통화정책'으로 갈아탔다. BTC 고점 대비 -18%·현물 ETF 6주 연속 유출·공포탐욕 23. 그 하락장에서 덜 빠진 건 AI·RWA·Hyperliquid다.",
    sector: "btc",
    tags: ["주간 시황", "FOMC", "워시", "ETF", "섹터 로테이션"],
    assets: ["BTC", "ETH"],
    author: "Tradelab 리서치",
    readMinutes: 8,
    publishedAt: "2026-06-24T09:00:00+09:00",
    takeaways: [
      "이번 주 하락의 주범은 6/17 FOMC — 워시 신임 의장이 동결(3.50~3.75%)하면서도 점도표를 매파로(중앙값 3.4→3.8%) 올리고 포워드 가이던스를 폐기.",
      "외생 충격이 '지정학(이란)'에서 '통화정책(워시)'으로 교체 — 되돌기 어려운 변수라 입증 책임이 강세론자로 이동.",
      "구조 악화: BTC 고점 대비 -18%, 현물 ETF 6주 연속 순유출(-$5.94B), 공포·탐욕 지수 23(극단적 공포).",
      "하락장 상대강도 = AI(TAO +28%·현물 ETF 신청)·DeFi(HYPE 수수료 $53M/30d·소각)·RWA(ONDO 30d +59%). 단독 매매신호는 발행하지 않는다.",
    ],
    toc: [
      { no: "01", title: "한 주 요약 — 매파 데뷔" },
      { no: "02", title: "매크로 — 워시의 매파 데뷔" },
      { no: "03", title: "시장 구조 — 6주째 ETF 출혈과 Extreme Fear" },
      { no: "04", title: "섹터별 상대강도 — 셋이 버텼다" },
      { no: "05", title: "관점이 바뀌는 조건 · 다음 주 관전 포인트" },
    ],
    bodyHtml: WEEKLY_14_BODY,
    canonical: null,
  },
  {
    slug: "macro-liquidity-regime-2026-06",
    type: "deepdive",
    title: "매크로 리포트: 유동성 레짐으로 보는 크립토 — M2·DXY·실질금리",
    dek: "기관은 크립토를 톱다운(매크로→섹터→자산)으로 본다. 비트코인 사이클을 게이팅하는 '매크로 트리오'(M2·DXY·실질금리)와 유동성 레짐 분류를, 그 한계(M2→가격 인과 논쟁)까지 정직하게 정리한다.",
    sector: "btc",
    tags: ["매크로", "유동성", "M2", "레짐", "톱다운"],
    assets: ["BTC", "ETH"],
    author: "Tradelab 리서치",
    readMinutes: 11,
    publishedAt: "2026-06-14T10:00:00+09:00",
    takeaways: [
      "기관은 크립토를 매크로→섹터→자산 톱다운으로 분석 — 반감기 캘린더보다 거시 유동성이 방향을 지배.",
      "매크로 트리오: 글로벌 M2(유동성)·DXY(펀딩통화)·10년 실질금리(할인율) — 수치가 아니라 변화율·전환점을 본다.",
      "포지셔닝은 'M2 YoY 중앙값 위/아래' 레짐 + 위험 예산으로 — 반감기·캘린더 타이밍이 아니라.",
      "정직한 한계: M2→가격은 인과가 아닐 수 있음(허위상관 논쟁). 레짐은 '맥락'이지 기계적 매매 규칙이 아니다.",
    ],
    toc: [
      { no: "01", title: "왜 매크로가 크립토를 지배하는가" },
      { no: "02", title: "매크로 트리오 — M2·DXY·실질금리" },
      { no: "03", title: "유동성 레짐 분류" },
      { no: "04", title: "반론과 한계 — M2가 정말 가격을 예측하나" },
      { no: "05", title: "크립토 적용 — 레짐 기반 포지셔닝" },
    ],
    bodyHtml: MACRO_REGIME_BODY,
    canonical: null,
  },
  {
    slug: "weekly-13-risk-off-rotation",
    type: "weekly",
    title: "주간 시황 #13 — 이란 쇼크와 안전자산 회귀, 그 속의 상대강도 리더",
    dek: "BTC가 6/5 연중 저점(~$59K)까지 밀린 risk-off 한 주. 이란발 유가 충격과 뜨거운 5월 CPI가 금리 인하 기대를 꺾었고, 11~12일 종전 헤드라인에 반등. 하락장 속 어느 섹터가 덜 빠졌나.",
    sector: "btc",
    tags: ["주간 시황", "매크로", "ETF", "섹터 로테이션"],
    assets: ["BTC", "ETH"],
    author: "Tradelab 리서치",
    readMinutes: 7,
    publishedAt: "2026-06-14T09:00:00+09:00",
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
    author: "Tradelab 리서치",
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
    author: "Tradelab 리서치",
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
    author: "Tradelab 리서치",
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
    author: "Tradelab 리서치",
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
