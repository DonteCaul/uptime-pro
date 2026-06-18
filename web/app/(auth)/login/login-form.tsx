"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  resendConfirmation,
  requestPasswordReset,
} from "@/lib/actions/auth";

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
        const { error } = await supabase.auth.signInWithPassword({
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
        router.push(redirect);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

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
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
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
          <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-2xl">
              📬
            </div>
            <h2 className="text-lg font-bold text-foreground">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to
              <br />
              <span className="font-medium text-foreground">{email}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Click the link in the email to verify your account, then sign in.
            </p>

            {submitError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 w-full">
                {submitError}
              </p>
            )}
            {info && (
              <p className="text-sm text-primary bg-primary/10 border border-primary/30 rounded-md px-3 py-2 w-full">
                {info}
              </p>
            )}

            <div className="flex flex-col gap-2 w-full mt-2">
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
            <h2 className="text-lg font-bold text-foreground">Reset password</h2>
            <p className="text-xs text-muted-foreground">
              Enter your email and we&apos;ll send a reset link.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
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
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>

              {submitError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
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
          <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-2xl">
              ✉️
            </div>
            <h2 className="text-lg font-bold text-foreground">Reset link sent</h2>
            <p className="text-sm text-muted-foreground">
              Check <span className="font-medium text-foreground">{email}</span>{" "}
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-card border border-border mb-4">
            <span className="text-3xl text-primary">⬡</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">UpTime.Pro</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your personal jump logbook
          </p>
        </div>

        <Card>
          <CardHeader className="pb-0">
            <div className="flex bg-muted rounded-md p-1 gap-1">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={cn(
                    "flex-1 py-1.5 rounded text-sm font-medium transition-colors",
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
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
                  <p className="text-xs text-destructive">{errors.email}</p>
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
                    <p className="text-xs text-destructive">{errors.name}</p>
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
                      className="text-xs text-primary hover:underline"
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
                  <p className="text-xs text-destructive">{errors.password}</p>
                ) : (
                  mode === "register" && (
                    <p className="text-xs text-muted-foreground">
                      At least 8 characters
                    </p>
                  )
                )}
              </div>

              {submitError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
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

            {/* Social auth divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  or continue with
                </span>
              </div>
            </div>

            {/* OAuth buttons */}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  const supabase = createBrowserSupabaseClient();
                  await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}` },
                  });
                }}
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  const supabase = createBrowserSupabaseClient();
                  await supabase.auth.signInWithOAuth({
                    provider: "facebook",
                    options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}` },
                  });
                }}
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Facebook
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}

/** Shared centered layout for all auth views. */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      {children}
    </div>
  );
}
