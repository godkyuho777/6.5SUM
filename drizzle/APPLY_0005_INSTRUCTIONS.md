# Drizzle 0005 Migration 적용 가이드

> **이유**: drizzle-kit push 는 production DB 안전을 위해 본 세션에서 자동 실행 차단됨.
> 사용자가 직접 Supabase Dashboard 또는 CLI 로 적용 필요.

---

## 방법 1 — Supabase Dashboard (권장)

1. Supabase project 접속 → **SQL Editor**
2. `drizzle/migrations/0005_calibrated_weights_thresholds.sql` 의 SQL 전체 복사
3. SQL Editor 에 붙여넣기 + **Run**
4. 성공 시 다음 테이블 3개 생성 확인:
   - `calibrated_weights`
   - `calibrated_weights_history`
   - `calibrated_thresholds`

## 방법 2 — 로컬 drizzle-kit push (개발 환경만)

```powershell
cd tradelab-backend
# .env 에 DATABASE_URL 또는 DIRECT_URL 이 dev 환경 가리키는지 확인 후
pnpm db:push
```

⚠️ `db:push` 는 dev DB 에만 사용. Production DB 에는 `db:migrate` 또는 Dashboard SQL Editor 사용.

## 방법 3 — psql

```powershell
$env:DIRECT_URL = "postgres://..."  # Supabase 의 connection string (poolerless)
psql $env:DIRECT_URL -f drizzle/migrations/0005_calibrated_weights_thresholds.sql
```

---

## 적용 검증

Supabase Dashboard → **Table Editor** → 다음 3개 테이블 존재 확인:
- `calibrated_weights` (15 columns)
- `calibrated_weights_history`
- `calibrated_thresholds` (10 columns)

또는 SQL Editor 에서:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'calibrated_%';
```

3 rows 반환되면 성공.

---

## 적용 후 다음 단계

1. `.env` 또는 deployment env 에 `BBDX_VERSION=v6.6` + `ENABLE_SHORT_SIGNALS=true` 설정
2. `pnpm backtest:compare` 재실행 → v6.6 calibrated weights 가 DB 에 저장
3. 일주일 후 cron 또는 수동 `triggerManualWeights` 호출로 calibration 갱신

---

## Rollback

```sql
DROP TABLE IF EXISTS calibrated_weights CASCADE;
DROP TABLE IF EXISTS calibrated_weights_history CASCADE;
DROP TABLE IF EXISTS calibrated_thresholds CASCADE;
```
