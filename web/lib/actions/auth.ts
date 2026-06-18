"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

/**
 * Resend the email-confirmation link. Called when a user tries to log in
 * before confirming their email.
 */
export async function resendConfirmation(email: string) {
  const supabase = await createServerClient();
  const origin = (await headers()).get("origin") ?? "";

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Send a password-reset email.
 */
export async function requestPasswordReset(email: string) {
  const supabase = await createServerClient();
  const origin = (await headers()).get("origin") ?? "";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/profile`,
  });

  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Sign out — clears the session cookie and redirects to /login.
 */
export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

