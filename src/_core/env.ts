export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 3000),

  databaseUrl: process.env.DATABASE_URL ?? "",
  directUrl: process.env.DIRECT_URL ?? "",

  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  // Comma-separated list of Supabase user UUIDs treated as admins.
  adminUserIds: (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),

  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openrouterModel:
    process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6",
  openrouterSiteUrl: process.env.OPENROUTER_SITE_URL ?? "",
  openrouterAppName: process.env.OPENROUTER_APP_NAME ?? "Tradelab",

  // P2-#4 (2026-05-23): LLM fallback (Anthropic direct).
  // OpenRouter 장애 시 backup. .env.example 의 ANTHROPIC_API_KEY 와 동일 변수
  // 재사용 (JeonInGu 트래커도 같은 키 사용).
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929",
};
