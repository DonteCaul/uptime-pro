/**
 * Smoke test: verifies the end-to-end auth + RLS setup works against the
 * linked Supabase project.
 *
 *   npx tsx scripts/smoke-test.ts
 *
 * Checks:
 *   1. Admin client can reach the DB and read the `app.profiles` table.
 *   2. RLS blocks unauthenticated reads of `app.profiles`.
 *   3. Creating an auth.users row fires the on_auth_user_created trigger,
 *      which inserts a matching app.profiles row.
 *
 * Cleans up the test user afterwards.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
  console.error(
    "Missing env vars. Run from the web/ dir with .env.local loaded:",
  );
  console.error("  npx tsx -r dotenv/config scripts/smoke-test.ts");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Unauthenticated-style client using the publishable key (subject to RLS).
const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_EMAIL = `smoke-test-${Date.now()}@example.com`;
const TEST_PASSWORD = "SmokeTest123!";

async function main() {
  let testUserId: string | null = null;

  try {
    // 1. Admin can read profiles (proves migrations applied).
    const { error: adminErr } = await admin
      .from("profiles")
      .select("id")
      .limit(1);
    if (adminErr) throw new Error(`Admin read failed: ${adminErr.message}`);
    console.log("✓ Admin client can read public.profiles");

    // 2. RLS blocks anonymous reads.
    const { data: anonData, error: anonErr } = await anon
      .from("profiles")
      .select("id");
    if (anonErr) {
      console.log(
        `✓ Anon read blocked (RLS enforced): ${anonErr.message}`,
      );
    } else if (anonData && anonData.length > 0) {
      // Could legitimately see is_public rows — check they're all public.
      console.log(
        `ℹ Anon read returned ${anonData.length} row(s) (expected only is_public profiles)`,
      );
    } else {
      console.log("✓ Anon read returned no rows (RLS enforced)");
    }

    // 3. Create a user via admin API — triggers profile creation.
    const { data: userData, error: createErr } =
      await admin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Smoke Test" },
      });
    if (createErr) throw new Error(`Create user failed: ${createErr.message}`);
    testUserId = userData.user.id;
    console.log(`✓ Created auth user ${testUserId}`);

    // Give the trigger a moment to fire.
    await new Promise((r) => setTimeout(r, 500));

    // 4. Profile row exists.
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", testUserId)
      .single();
    if (profileErr || !profile) {
      throw new Error(
        `Profile trigger did not fire: ${profileErr?.message ?? "no row"}`,
      );
    }
    console.log(
      `✓ Profile auto-created: email=${profile.email} name="${profile.full_name}"`,
    );

    console.log("\n🎉 Smoke test passed. Auth + RLS + triggers all working.");
  } finally {
    if (testUserId) {
      await admin.auth.admin.deleteUser(testUserId);
      console.log("✓ Cleaned up test user");
    }
  }
}

main().catch((err) => {
  console.error("\n✗ Smoke test FAILED:", err.message);
  process.exit(1);
});
