/**
 * Strongly-typed Supabase database schema.
 *
 * For now we re-export the untyped default so the Supabase clients compile
 * during Phase 0. Once the first migration (supabase/migrations/0001) is
 * applied against the Supabase project, generate the real type with:
 *
 *   supabase gen types --lang=typescript --project-id <ref> > lib/db/types.gen.ts
 *
 * and replace the export below with `export type Database = GeneratedDatabase;`.
 */
export type Database = Record<string, never>;
