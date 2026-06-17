/**
 * Strongly-typed Supabase database schema.
 *
 * Re-exports the generated type (lib/db/types.gen.ts), produced by:
 *
 *   supabase gen types --linked --lang typescript --schema app > lib/db/types.gen.ts
 *
 * Re-run that command after any migration changes the `app` schema.
 */
export type Database = import("./types.gen").Database;
