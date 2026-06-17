import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit config for migrations / studio.
 *
 * The app uses Supabase's hosted Postgres. For `db:push` / `studio`, point
 * DATABASE_URL at the Supabase connection string (direct connection or pooler).
 *
 * Note: schema lives in lib/db/schema.ts and is written to the `app` schema.
 */
export default {
  schema: "./lib/db/schema.ts",
  out: "./supabase/migrations/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ["app"],
  verbose: true,
  strict: true,
} satisfies Config;
