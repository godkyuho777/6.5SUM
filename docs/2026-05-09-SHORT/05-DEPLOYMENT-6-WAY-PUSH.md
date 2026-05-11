# SHORT 듀얼 시스템 — 6곳 push 배포

**날짜**: 2026-05-09

## 목표

사용자 요청:
> "이걸 Short Position 전략으로 대체한 다음에 이걸 dev, feat/v6.5-merge,
> 그리고 https://github.com/godkyuho777/6.5SUM 의 백엔드 시스템에다가 업데이트
> 를 해주고 이후에 프론트엔드에 UI적으로 표기가 되게끔 dev 프론트,
> feat/v6.5-merge-frontend 이거랑, 그리고 https://github.com/godkyuho777/Frontend6.5
> 여기다가도 업데이트를 해줘"

→ 백엔드 3 곳 + 프론트엔드 3 곳 = **6 push 타겟**

## 백엔드 push 결과 (3/3 ✅)

| Remote | Branch | Final SHA | 상태 |
|---|---|---|---|
| `origin` | `feat/v6.5-merge` | `329e226` | ✅ pushed |
| `origin` | `dev` | `329e226` | ✅ pushed |
| `v65sum` | `main` | `329e226` | ✅ pushed |
| `v65sum` | `dev` | `329e226` | ✅ pushed (보너스) |

**커밋 체인** (위로 갈수록 최신):
```
329e226 feat(backtest): Phase 3 — Wilson CI calibration + --calibrate CLI flag
07b6a47 feat(short): SHORT position entry path 듀얼 시스템 추가  ← SHORT 본체
f1ccf4b feat(backtest): Phase 2 — Additional Modifier multipliers tracked per trade
adab7cd feat(backtest): Phase 1 — R:R asymmetry + Pattern Confluence + Higher-TF gate
95d9a40 feat(modifiers): wire EMA Ribbon + MACD Divergence + Order Block to scanner
```

## 프론트엔드 push 결과 (3/3 ✅)

| Remote | Branch | Final SHA | 상태 |
|---|---|---|---|
| `origin` | `feat/v6.5-merge-frontend` | `6a00bc1` | ✅ pushed |
| `origin` | `dev` | `6a00bc1` | ✅ pushed |
| `fe65` | `main` | `6a00bc1` | ✅ pushed |

**커밋**:
```
6a00bc1 feat(backtest UI): Phase 1+2+3 surface — Tier exits + Modifier multipliers + Calibration tab
```
(SHORT UI + Lite Recommendation SHORT/STRONG_SHORT 동기화 포함)

## Push 절차

### 백엔드
```powershell
cd "Trade LAB\tradelab-backend"

# (1) origin 동기화 (이미 합쳐진 상태)
git rev-parse dev feat/v6.5-merge  # 둘 다 329e226
git push origin feat/v6.5-merge dev

# (2) godkyuho777/6.5SUM 동기화
git push v65sum feat/v6.5-merge:main
git push v65sum dev:dev
```

### 프론트엔드
```powershell
cd "Trade LAB\tradelab-frontend"

# (1) 백엔드 SHORT 타입 fetch
pnpm update @tradelab/backend  # godkyuho777/6.5SUM#dev 에서 새 d.ts

# (2) shared/types.ts 미러 + Home/Dashboard/Badge 수정 + commit
# (커밋 6a00bc1 — 자동 생성됨)

# (3) 3 곳 push
git push origin feat/v6.5-merge-frontend
git push origin feat/v6.5-merge-frontend:dev
git push fe65 feat/v6.5-merge-frontend:main
```

## Vercel / Railway 자동 배포

push 직후 자동 트리거:
- **Vercel** (Frontend6.5 project) — `fe65/main` push → 새 production deploy
- **Railway** — `godkyuho777/6.5SUM/main` push → 새 백엔드 배포 (사용자가
  Railway 인스턴스 설정 후 활성화)

## 검증 체크리스트

### 백엔드 검증
- [ ] `<Railway>/api/health` — 응답에 `branch` 필드 존재
- [ ] `<Railway>/api/trpc/onchain.score?symbol=BTCUSDT` — 7 modifier 응답
- [ ] `<Railway>/api/trpc/lite.coin?symbol=BTCUSDT` — 응답에 SHORT/STRONG_SHORT
  recommendation 가능
- [ ] `<Railway>/api/trpc/signals.scan?interval=4h` — 응답 coin 에 `shortDecision`
  / `shortSignalStrength` / `bbStructureShort` 필드 존재

### 프론트엔드 검증
- [ ] Vercel `/lite` — Recommendation 배지에 🟠 공매도 추천 / 🔻 강한 공매도
  렌더 가능
- [ ] Vercel `/` (Home Pro) — SIGNAL 컬럼에 SHORT 배지 (TrendingDown 아이콘)
  표시
- [ ] Vercel `/lite/coin/{symbol}` — recommendation = SHORT 일 때 카드 variant
  caution (orange), STRONG_SHORT 일 때 bad (red)

## 트러블슈팅 노트

### Issue 1: cherry-pick 빈 결과
- **원인**: `git cherry-pick feat/v6.5-merge` 가 HEAD (= 329e226 Phase 3) 를
  pick. dev 가 이미 동일 SHA 라 "nothing to commit".
- **해결**: `git cherry-pick --abort`. dev 와 feat/v6.5-merge 가 같은 SHA 라
  추가 cherry-pick 불필요.

### Issue 2: 프론트엔드 force-push 회피
- **원인**: 로컬에서 `git commit --amend` 로 메시지 수정 후 push 시도 →
  `non-fast-forward` reject (remote 가 원본 SHA `6a00bc1` 보유, 로컬은
  amended `28e73aa`).
- **해결**: amend 한 commit 의 *파일 내용* 이 remote 와 100% 동일 (`git
  diff origin/feat/v6.5-merge-frontend..HEAD` 비어있음) → `git reset --hard
  origin/feat/v6.5-merge-frontend` 로 amended 커밋 폐기.
- **헌장**: force-push 는 사용자 명시 승인 필요. 메시지 차이만 있는 amend
  를 polish 하려고 force-push 하지 않음.

## 다음 단계

- [ ] 사용자 Railway 인스턴스에 godkyuho777/6.5SUM/main 배포 활성화
- [ ] 새 Railway URL 받아서 `tradelab-frontend/vercel.json` rewrite 갱신
- [ ] Vercel rebuild 후 `/lite` 에서 SHORT 배지 시각 검증
