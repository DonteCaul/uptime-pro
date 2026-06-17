import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Drizzle ORM client (server-only).
 *
 * Use for privileged or batch operations where the Supabase RLS-bound client
 * is too restrictive or slow (e.g. CSV bulk insert). Pass the user's
 * `userId` explicitly — this client does NOT enforce RLS.
 *
 * Reads for normal app flows should prefer the Supabase server client
 * (lib/supabase/server) which scopes automatically via cookies + RLS.
 */

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_client) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    _client = postgres(process.env.DATABASE_URL, { max: 10, prepare: false });
    _db = drizzle(_client, { schema });
  }
  return _db!;
}

export { schema };
