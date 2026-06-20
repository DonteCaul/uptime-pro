"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  validateEmail,
  validatePassword,
  validateName,
  type FormErrors,
} from "@/lib/auth";
import { cn } from "@/lib/utils";
import { resendConfirmation, requestPasswordReset } from "@/lib/actions/auth";

type Mode = "login" | "register";
type View = "form" | "verify-email" | "forgot-password" | "reset-sent";

export function LoginForm({ initialMode = "login" }: { initialMode?: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const authError = searchParams.get("error");

  const [view, setView] = useState<View>("form");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Field-level validation on blur ───────────────────────────────────────
  function validateField(field: "email" | "password" | "name") {
    setErrors((prev) => ({
      ...prev,
      [field]:
        field === "email"
          ? validateEmail(email)
          : field === "password"
            ? validatePassword(password)
            : mode === "register"
              ? validateName(fullName)
              : null,
    }));
  }

  // ── Submit handler for login + register ──────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setInfo(null);

    // Full validation before submit.
    const nextErrors: FormErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
      name: mode === "register" ? validateName(fullName) : null,
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password || nextErrors.name) return;

    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();

      if (mode === "login") {
        const { data: signInData, error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });
        if (error) {
          // Supabase returns "Email not confirmed" when confirmation is
          // required and the user hasn't clicked the link yet.
          if (error.message.toLowerCase().includes("not confirmed")) {
            setView("verify-email");
            return;
          }
          // Don't leak whether the email exists — generic message for
          // invalid credentials.
          if (
            error.message.toLowerCase().includes("invalid login") ||
            error.message.toLowerCase().includes("invalid credentials")
          ) {
            throw new Error("Incorrect email or password");
          }
          throw error;
        }
        if (signInData.user) {
          posthog.identify(signInData.user.id, {
            email: signInData.user.email,
          });
          posthog.capture("user_signed_in", { email: signInData.user.email });
        }
        router.push(redirect);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        if (data.user) {
          posthog.identify(data.user.id, {
            email: data.user.email,
            name: fullName,
          });
          posthog.capture("user_signed_up", { email: data.user.email });
        }

        // If email confirmation is enabled, no session is returned — show
        // the "check your email" view. If confirmation is disabled, a
        // session is returned and we redirect.
        if (data.session) {
          router.push(redirect);
          router.refresh();
        } else {
          setView("verify-email");
        }
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Resend confirmation email ────────────────────────────────────────────
  async function handleResend() {
    setActionLoading(true);
    setInfo(null);
    setSubmitError(null);
    try {
      const res = await resendConfirmation(email);
      if ("error" in res) throw new Error(res.error);
      setInfo("Confirmation email sent. Check your inbox (and spam folder).");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not resend email",
      );
    } finally {
      setActionLoading(false);
    }
  }

  // ── Forgot password ──────────────────────────────────────────────────────
  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    setErrors({ email: emailErr });
    if (emailErr) return;

    setActionLoading(true);
    setSubmitError(null);
    try {
      const res = await requestPasswordReset(email);
      if ("error" in res) throw new Error(res.error);
      setView("reset-sent");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setActionLoading(false);
    }
  }

  // ── Reset state when switching modes ─────────────────────────────────────
  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
    setSubmitError(null);
    setInfo(null);
  }

  // ── Auth-callback error (from /auth/callback) ────────────────────────────
  if (authError === "auth_callback_failed" && view === "form") {
    // Shown inline; the param is cleared on next navigation.
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VERIFY EMAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "verify-email") {
    return (
      <AuthShell>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <div className="bg-primary/15 border-primary/30 flex h-12 w-12 items-center justify-center rounded-full border text-2xl">
              📬
            </div>
            <h2 className="text-foreground text-lg font-bold">
              Check your email
            </h2>
            <p className="text-muted-foreground text-sm">
              We sent a confirmation link to
              <br />
              <span className="text-foreground font-medium">{email}</span>
            </p>
            <p className="text-muted-foreground text-xs">
              Click the link in the email to verify your account, then sign in.
            </p>

            {submitError && (
              <p className="text-destructive bg-destructive/10 border-destructive/30 w-full rounded-md border px-3 py-2 text-sm">
                {submitError}
              </p>
            )}
            {info && (
              <p className="text-primary bg-primary/10 border-primary/30 w-full rounded-md border px-3 py-2 text-sm">
                {info}
              </p>
            )}

            <div className="mt-2 flex w-full flex-col gap-2">
              <Button
                variant="secondary"
                onClick={handleResend}
                disabled={actionLoading}
              >
                {actionLoading ? "Sending…" : "Resend email"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setView("form");
                  setMode("login");
                  setSubmitError(null);
                  setInfo(null);
                }}
              >
                Back to sign in
              </Button>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORGOT PASSWORD VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "forgot-password") {
    return (
      <AuthShell>
        <Card>
          <CardHeader className="pb-0">
            <h2 className="text-foreground text-lg font-bold">
              Reset password
            </h2>
            <p className="text-muted-foreground text-xs">
              Enter your email and we&apos;ll send a reset link.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleForgotPassword}
              className="flex flex-col gap-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="fp-email">Email</Label>
                <Input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => validateField("email")}
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <p className="text-destructive text-xs">{errors.email}</p>
                )}
              </div>

              {submitError && (
                <p className="text-destructive bg-destructive/10 border-destructive/30 rounded-md border px-3 py-2 text-sm">
                  {submitError}
                </p>
              )}

              <Button type="submit" disabled={actionLoading}>
                {actionLoading ? "Sending…" : "Send reset link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setView("form");
                  setSubmitError(null);
                  setErrors({});
                }}
              >
                Back to sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESET SENT VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "reset-sent") {
    return (
      <AuthShell>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <div className="bg-primary/15 border-primary/30 flex h-12 w-12 items-center justify-center rounded-full border text-2xl">
              ✉️
            </div>
            <h2 className="text-foreground text-lg font-bold">
              Reset link sent
            </h2>
            <p className="text-muted-foreground text-sm">
              Check <span className="text-foreground font-medium">{email}</span>{" "}
              for a password-reset link. It expires in 1 hour.
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setView("form");
                setMode("login");
              }}
            >
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN FORM VIEW (login / register)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="bg-card border-border mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl border">
            <span className="text-primary text-3xl">⬡</span>
          </div>
          <h1 className="text-foreground text-2xl font-bold">UpTime.Pro</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your personal jump logbook
          </p>
        </div>

        <Card>
          <CardHeader className="pb-0">
            <div className="bg-muted flex gap-1 rounded-md p-1">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={cn(
                    "flex-1 rounded py-1.5 text-sm font-medium transition-colors",
                    mode === m
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "login" ? "Sign In" : "Register"}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => validateField("email")}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={!!errors.email}
                  disabled={loading}
                />
                {errors.email && (
                  <p className="text-destructive text-xs">{errors.email}</p>
                )}
              </div>

              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onBlur={() => validateField("name")}
                    required
                    placeholder="Jane Skydiver"
                    aria-invalid={!!errors.name}
                    disabled={loading}
                  />
                  {errors.name && (
                    <p className="text-destructive text-xs">{errors.name}</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setView("forgot-password");
                        setErrors({});
                        setSubmitError(null);
                      }}
                      className="text-primary text-xs hover:underline"
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => validateField("password")}
                  required
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  disabled={loading}
                />
                {errors.password ? (
                  <p className="text-destructive text-xs">{errors.password}</p>
                ) : (
                  mode === "register" && (
                    <p className="text-muted-foreground text-xs">
                      At least 8 characters
                    </p>
                  )
                )}
              </div>

              {submitError && (
                <p className="text-destructive bg-destructive/10 border-destructive/30 rounded-md border px-3 py-2 text-sm">
                  {submitError}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign In"
                    : "Create Account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}

/** Shared centered layout for all auth views. */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
      {children}
    </div>
  );
}
