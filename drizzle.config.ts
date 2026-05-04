import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // DIRECT_URL bypasses the Supabase pooler — required for `drizzle-kit migrate`.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
