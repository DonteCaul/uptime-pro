/**
 * Diagnostic: prints the actual error messages for table probes so we can see
 * exactly what state the partial migration left the DB in.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;
const admin = createClient(url, key, { auth: { persistSession: false } });

const TABLES = ["profiles", "jumps", "_legacy_users"];

async function main() {
  for (const t of TABLES) {
    const pub = await admin.from(t).select("*").limit(0);
    console.log(`--- ${t} (unqualified / public) ---`);
    console.log(pub.error ? `ERROR: ${pub.error.message}` : "OK");
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
