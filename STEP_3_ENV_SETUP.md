# Step 3 — v6.6 Feature Flag 활성화 가이드

> **이유**: 본 세션은 .env 파일을 자동 편집하지 않음 (secrets 보호).
> 사용자가 직접 환경별로 적용 필요.

---

## 로컬 개발 (.env)

`tradelab-backend/.env` 의 끝부분에 추가 (이미 있으면 값만 갱신):

```env
# === BBDX v6.6 Feature Flag (Step 3) ===
BBDX_VERSION=v6.6
BBDX_MARKET=perp
ENABLE_SHORT_SIGNALS=true
```

저장 후 dev 서버 재시작:
```powershell
pnpm dev
```

---

## Production (Railway)

Railway Dashboard → tradelab-backend service → **Variables** 에 추가:
- `BBDX_VERSION = v6.6`
- `BBDX_MARKET = perp` (또는 `spot` 유지)
- `ENABLE_SHORT_SIGNALS = true`

→ 자동 redeploy 발생.

---

## Vercel (프론트 — 옵션)

프론트는 백엔드 라우트만 호출하므로 env 변수 직접 필요 없음. 단 일부 UI 가 flag 확인 시 `VITE_*` prefix 필요할 수 있음:

`tradelab-frontend/.env` 또는 Vercel Dashboard:
```env
VITE_BBDX_VERSION=v6.6
VITE_ENABLE_SHORT_SIGNALS=true
```

---

## 활성화 검증

### 백엔드 (tRPC)
```powershell
curl -X GET "http://localhost:3000/api/trpc/bbdxV66.flags?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D"
```
→ `BBDX_VERSION: "v6.6"`, `ENABLE_SHORT_SIGNALS: true` 응답 확인.

### 프론트엔드
1. `pnpm dev` 부팅 후 `/coin/BTCUSDT` 진입
2. SignalCard 옆에 **ShortSignalCard** 가 렌더링되는지 확인
3. Home.tsx 코인 행에 LONG/SHORT chip 표시 확인

---

## Rollback

`.env` 또는 Railway Variables 에서 `BBDX_VERSION` 을 `v6.5` 로 변경. 또는 `ENABLE_SHORT_SIGNALS=false`.
