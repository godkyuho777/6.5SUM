# tradelab-backend

Express + tRPC API server for Tradelab. Auth via Supabase, DB via Supabase Postgres
(Drizzle), LLM via OpenRouter. Designed for deployment on Railway.

## Local development

```bash
cp .env.example .env   # then fill in values
pnpm install
pnpm db:generate       # offline — emits SQL into ./drizzle (no DB needed)
pnpm db:migrate        # online — applies migrations to DIRECT_URL
pnpm dev
```

`/api/health` returns `{ ok: true }`. `/api/trpc/coins.list` returns the
top-coins list with no auth.

## Type sharing with `tradelab-frontend`

The frontend installs this repo as a git dependency:

```json
"@tradelab/backend": "github:OWNER/REPO#main"
```

The `prepare` script runs `pnpm build:types` on install, emitting
`dist/types/index.d.ts`. The frontend imports `AppRouter`:

```ts
import type { AppRouter } from "@tradelab/backend/router";
```

## Deploy (Railway)

1. Push to GitHub, connect Railway service to the repo.
2. Set env vars from `.env.example`. `PORT` is provided by Railway.
3. Railway nixpacks autodetects Node + pnpm and runs `pnpm build` then
   `pnpm start`. The included `Dockerfile` is an alternative if explicit
   builds are preferred.
