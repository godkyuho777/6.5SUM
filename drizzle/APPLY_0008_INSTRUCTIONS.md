# Drizzle 0008 Migration 적용 가이드 — Simulator Leaderboard

> **이유**: drizzle-kit push 는 production DB 안전을 위해 자동 실행 차단됨.
> 사용자가 직접 Supabase Dashboard 또는 CLI 로 적용 필요.
>
> **명세**: `INVESTMENT_SIMULATOR_AUDIT.md` §5 (Leaderboard) Phase 2.
> **상태**: Phase 1 (frontend mock) 완료. Phase 2 (backend opt-in + 보안) 가 본 마이그레이션.

---

## 적용 대상

```
drizzle/migrations/0008_simulator_leaderboard.sql
```

생성 테이블 2개:

- `simulator_leaderboard_users`     — opt-in 사용자 + 현재 stats (1 clientToken = 1 row)
- `simulator_leaderboard_snapshots` — 히스토리 (24h / 7d / 30d period 비교, Phase 2 reserve)

인덱스 (3개):

- `sim_lb_pnl_idx`            — `(pnl_pct DESC)` 부분 인덱스 (opted_out_at IS NULL).  Leaderboard 정렬 가속.
- `sim_lb_opted_out_idx`      — opt-out filter 빠른 제외.
- `sim_lb_snap_user_time_idx` — `(user_id, snapshot_at DESC)`.  Period query 가속.

---

## 방법 1 — Supabase Dashboard (권장)

1. Supabase project 접속 → **SQL Editor**
2. `drizzle/migrations/0008_simulator_leaderboard.sql` 전체 SQL 복사
3. SQL Editor 에 붙여넣기 + **Run**
4. 성공 시 다음 검증 SQL 실행:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'simulator_leaderboard_%';
```

→ `simulator_leaderboard_users`, `simulator_leaderboard_snapshots` 2 rows 반환되면 성공.

인덱스 검증:

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'simulator_leaderboard_%';
```

→ `sim_lb_pnl_idx`, `sim_lb_opted_out_idx`, `sim_lb_snap_user_time_idx` 포함되면 성공.

## 방법 2 — 로컬 drizzle-kit push (개발 환경만)

```powershell
cd tradelab-backend
# .env 에 DATABASE_URL 또는 DIRECT_URL 이 dev 환경 가리키는지 확인 후
pnpm db:push
```

⚠️ `db:push` 는 dev DB 에만 사용. Production DB 에는 Dashboard SQL Editor.

## 방법 3 — psql

```powershell
$env:DIRECT_URL = "postgres://..."
psql $env:DIRECT_URL -f drizzle/migrations/0008_simulator_leaderboard.sql
```

---

## 적용 후 검증 (production)

```bash
# Opt-in (publicProcedure — Supabase Auth 불필요)
curl -X POST 'https://<api>/api/trpc/simulatorLeaderboard.optIn' \
  -H 'Content-Type: application/json' \
  -d '{"json":{"clientToken":"550e8400-e29b-41d4-a716-446655440000","nickname":"TestUser"}}'

# Sync
curl -X POST 'https://<api>/api/trpc/simulatorLeaderboard.sync' \
  -H 'Content-Type: application/json' \
  -d '{"json":{"clientToken":"550e8400-e29b-41d4-a716-446655440000","currentCapital":250000,"totalPnl":50000,"pnlPct":25,"totalTrades":10,"wins":7,"losses":3,"winRate":0.7,"maxDrawdownPct":-0.05}}'

# Fetch
curl 'https://<api>/api/trpc/simulatorLeaderboard.fetch?input=%7B%22json%22%3A%7B%22period%22%3A%22all%22%7D%7D'
```

---

## 보안 정책 요약

1. **clientToken UUID** — frontend localStorage 의 simUser.id (`crypto.randomUUID`).
   ownership token 역할. 122 bit UUID v4 = brute-force 비현실적.
2. **Rate limit** — sync 는 5분 간격 (`last_synced_at` 비교, DB 부하 방지).
3. **Opt-in only** — `opted_out_at IS NULL` 사용자만 fetch 결과에 포함.
4. **익명성** — response 에 `clientToken` 절대 노출 X. 익명 hash id (`anon_<sha256(uuid)[0:8]>`) + nickname 만.
5. **응답 차단** — opt-out 후 동일 clientToken 으로 sync 시도 → `optedOut` 에러.

향후 보강 (Phase 3):

- Supabase Auth 통합 시 `clientToken` → `userId` (JWT 검증) 으로 교체.
- IP rate limit (`express-rate-limit`) — 같은 IP 에서 빠른 다중 clientToken 등록 방어.

---

## Rollback

```sql
DROP TABLE IF EXISTS simulator_leaderboard_snapshots CASCADE;
DROP TABLE IF EXISTS simulator_leaderboard_users CASCADE;
```

CASCADE 가 부분 인덱스 + FK 까지 자동 정리.
