"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { Camera, Check, Link2, Loader2, Moon, Sun, Unlink2, Wifi } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { updateProfile, updatePreferences } from "@/lib/actions/profile";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/db/types";
import type { Provider, UserIdentity } from "@supabase/auth-js";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

interface Profile {
  full_name: string | null;
  email: string | null;
  uptime_user_id: number | null;
  bio: string | null;
  avatar_url: string | null;
  home_dz: string | null;
  home_dz_lat: number | null;
  home_dz_lon: number | null;
  uspa_license: string | null;
  uspa_member_number: string | null;
  burble_name: string | null;
  ratings: string | null;
  canopy_size: number | null;
  wing_load: string | null;
  rig_type: string | null;
  canopy_type: string | null;
  reserve_repack_date: string | null;
  is_public: boolean;
}

interface FormState {
  full_name: string;
  email: string;
  bio: string;
  uspa_license: string;
  uspa_member_number: string;
  burble_name: string;
  ratings: string;
  rig_type: string;
  canopy_type: string;
  canopy_size: string;
  wing_load: string;
  reserve_repack_date: string;
  is_public: boolean;
}

function toForm(p: Profile | null): FormState {
  return {
    full_name: p?.full_name ?? "",
    email: p?.email ?? "",
    bio: p?.bio ?? "",
    uspa_license: p?.uspa_license ?? "",
    uspa_member_number: p?.uspa_member_number ?? "",
    burble_name: p?.burble_name ?? "",
    ratings: p?.ratings ?? "",
    rig_type: p?.rig_type ?? "",
    canopy_type: p?.canopy_type ?? "",
    canopy_size: p?.canopy_size?.toString() ?? "",
    wing_load: p?.wing_load ?? "",
    reserve_repack_date: p?.reserve_repack_date
      ? p.reserve_repack_date.slice(0, 10)
      : "",
    is_public: p?.is_public ?? false,
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Countdown badge for reserve repack — 180-day window, green→red heat gradient. */
function RepackCountdown({ date }: { date: string }) {
  const [now, setNow] = useState(() => Date.now());

  // Tick every minute so the badge updates if left open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const repackDate = new Date(date + "T00:00:00").getTime();
  const deadline = repackDate + 180 * 24 * 60 * 60 * 1000; // 180 days
  const remainingMs = deadline - now;
  const remaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
  const ratio = Math.min(1, Math.max(0, remainingMs / (180 * 24 * 60 * 60 * 1000)));

  // Overdue → red pulse, otherwise interpolate green→yellow→red.
  const isOverdue = remaining === 0;
  let bg: string;
  let text: string;
  if (isOverdue) {
    bg = "bg-red-500/20 border-red-500/40";
    text = "text-red-500";
  } else if (ratio > 0.5) {
    // Green zone — fade toward yellow.
    const t = (ratio - 0.5) / 0.5; // 1 = full green, 0 = yellow
    const r = Math.round(234 - t * 198); // 234 → 34
    const g = Math.round(179 + t * 33); // 179 → 197
    bg = `rgba(${r}, ${g}, 8, 0.15)`;
    text = `rgb(${r}, ${g}, 8)`;
  } else {
    // Yellow→Red zone.
    const t = ratio / 0.5; // 1 = yellow, 0 = red
    const r = Math.round(239 - t * 5); // 239 → 234
    const g = Math.round(68 + t * 111); // 68 → 179
    bg = `rgba(${r}, ${g}, 8, 0.2)`;
    text = `rgb(${r}, ${g}, 8)`;
  }

  return (
    <span
      className="shrink-0 inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold tabular-nums"
      style={{ backgroundColor: bg, color: text, borderColor: text.replace("rgb", "rgba").replace(")", ", 0.3)") }}
    >
      {isOverdue ? "⚠ Overdue" : `${remaining}d`}
    </span>
  );
}

/** Provider icons for linked accounts. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

/** Card showing linked OAuth providers with link/unlink actions. */
function LinkedAccountsCard() {
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);

  const fetchIdentities = async () => {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.getUserIdentities();
    if (!error && data) setIdentities(data.identities);
    setLoading(false);
  };

  useEffect(() => {
    fetchIdentities();
  }, []);

  const isLinked = (provider: string) =>
    identities.some((i) => i.provider === provider);

  const getIdentity = (provider: string): UserIdentity | undefined =>
    identities.find((i) => i.provider === provider);

  const handleLink = async (provider: string) => {
    setAction(provider);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.linkIdentity({
      provider: provider as Provider,
    });
    // linkIdentity redirects the browser — if we return, something went wrong
    setAction(null);
  };

  const handleUnlink = async (provider: string) => {
    const identity = getIdentity(provider);
    if (!identity) return;
    setAction(provider);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (!error) {
      await fetchIdentities();
    }
    setAction(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Google */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GoogleIcon className="w-5 h-5" />
            <div>
              <Label className="text-sm text-foreground">Google</Label>
              {loading ? null : isLinked("google") ? (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Check size={12} className="text-green-500" /> Linked
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">Not linked</p>
              )}
            </div>
          </div>
          {loading ? (
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          ) : isLinked("google") ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={action === "google"}
              onClick={() => handleUnlink("google")}
            >
              {action === "google" ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <Unlink2 size={14} className="mr-1" />
              )}
              Unlink
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={action === "google"}
              onClick={() => handleLink("google")}
            >
              {action === "google" ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <Link2 size={14} className="mr-1" />
              )}
              Link
            </Button>
          )}
        </div>

        <Separator />

        {/* Facebook */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FacebookIcon className="w-5 h-5" />
            <div>
              <Label className="text-sm text-foreground">Facebook</Label>
              {loading ? null : isLinked("facebook") ? (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Check size={12} className="text-green-500" /> Linked
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">Not linked</p>
              )}
            </div>
          </div>
          {loading ? (
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          ) : isLinked("facebook") ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={action === "facebook"}
              onClick={() => handleUnlink("facebook")}
            >
              {action === "facebook" ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <Unlink2 size={14} className="mr-1" />
              )}
              Unlink
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={action === "facebook"}
              onClick={() => handleLink("facebook")}
            >
              {action === "facebook" ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <Link2 size={14} className="mr-1" />
              )}
              Link
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProfileEditForm({
  initialProfile,
  initialUnits,
  initialTheme,
}: {
  initialProfile: Profile | null;
  initialUnits: "metric" | "imperial";
  initialTheme: "light" | "dark";
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initialProfile));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialProfile?.avatar_url ?? null,
  );
  const [homeDzAddress, setHomeDzAddress] = useState("");
  const [resolvedDz, setResolvedDz] = useState<string | null>(
    initialProfile?.home_dz ?? null,
  );
  const [saving, startSaveTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [resolvingDz, setResolvingDz] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Live settings (theme, units) ──────────────────────────────────
  const [units, setUnits] = useState<"metric" | "imperial">(initialUnits);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const [, startPrefTransition] = useTransition();

  // Sync theme to the DOM + localStorage immediately (prevents flash).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("uptime-theme", theme);
  }, [theme]);

  // Keep localStorage units in sync.
  useEffect(() => {
    localStorage.setItem("uptime-units", units);
    window.dispatchEvent(new StorageEvent("storage", { key: "uptime-units", newValue: units }));
  }, [units]);

  function persistTheme(next: "light" | "dark") {
    setTheme(next);
    startPrefTransition(() => {
      void updatePreferences({ theme: next });
    });
  }

  function persistUnits(next: "metric" | "imperial") {
    setUnits(next);
    startPrefTransition(() => {
      void updatePreferences({ units: next });
    });
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setAvatarUrl(data.avatar_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Avatar upload failed");
    } finally {
      setAvatarUploading(false);
    }
  }

  /** Geocode the entered address via the cached server proxies. */
  /** Haversine distance between two lat/lon points in meters. */
  function haversineM(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6_371_000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function resolveHomeDz(address: string): Promise<{
    lat: number;
    lon: number;
    name: string | null;
  } | null> {
    const trimmed = address.trim();
    if (!trimmed) return null;

    // 1. Forward geocode via cached /api/geocode.
    const geoRes = await fetch(
      `/api/geocode?q=${encodeURIComponent(trimmed)}`,
    );
    if (!geoRes.ok) return null;
    const geo = await geoRes.json();
    // The geocode route returns the Mapbox raw payload under `raw`.
    const feature = geo?.raw?.features?.[0];
    if (!feature?.center) return null;
    const [lon, lat] = feature.center as [number, number];

    // 2. Look up nearby dropzones via cached /api/places/nearby.
    //    Google Places locationBias is a *suggestion*, not a hard filter,
    //    so we verify distance client-side with Haversine.
    const MAX_RADIUS_M = 16093; // 10 miles
    try {
      const placesRes = await fetch(
        `/api/places/nearby?lat=${lat}&lon=${lon}&radius=${MAX_RADIUS_M}`,
      );
      if (placesRes.ok) {
        const places = await placesRes.json();
        for (const p of places.places ?? []) {
          if (p.lat == null || p.lon == null) continue;
          const d = haversineM(lat, lon, p.lat, p.lon);
          if (d <= MAX_RADIUS_M) {
            return { lat: p.lat, lon: p.lon, name: p.name ?? trimmed };
          }
        }
        // No dropzone within 10 miles — fall through to raw geocode.
      }
    } catch {
      // fall through to raw geocode result
    }
    return { lat, lon, name: geo.name ?? trimmed };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);

    const hasDzAddress = homeDzAddress.trim().length > 0;
    if (hasDzAddress) setResolvingDz(true);

    try {
      const body: ProfileUpdate = {};

      // String fields — only send if non-empty.
      const strFields = [
        "full_name", "bio", "uspa_license", "uspa_member_number",
        "burble_name", "ratings", "rig_type", "canopy_type",
      ] as const;
      for (const k of strFields) {
        if (form[k]) body[k] = form[k] as string;
      }

      // Numeric fields.
      if (form.canopy_size) body.canopy_size = Number(form.canopy_size);
      if (form.wing_load) body.wing_load = parseFloat(form.wing_load);
      if (form.reserve_repack_date) {
        body.reserve_repack_date = new Date(form.reserve_repack_date).toISOString();
      }
      body.is_public = form.is_public;

      // Resolve home DZ from the address field (if provided).
      if (hasDzAddress) {
        const result = await resolveHomeDz(homeDzAddress);
        if (result) {
          body.home_dz = result.name;
          body.home_dz_lat = result.lat;
          body.home_dz_lon = result.lon;
          setResolvedDz(result.name);
        } else {
          setError(
            "Could not resolve that address to a location. Try a more specific address.",
          );
          setResolvingDz(false);
          return;
        }
      }

      startSaveTransition(async () => {
        try {
          await updateProfile(body);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Save failed");
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setResolvingDz(false);
    }
  }

  const initials = (form.full_name || "U")[0]?.toUpperCase() ?? "U";

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Profile</h2>
        {saved && (
          <Badge variant="default" className="gap-1">
            <Check size={11} /> Saved
          </Badge>
        )}
      </div>

      {/* Avatar + identity */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-4">
          <div className="relative">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="avatar"
                className="w-16 h-16 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-primary text-2xl font-bold">
                {initials}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              className="absolute bottom-0 right-0 bg-card border border-border rounded-full p-1 hover:bg-accent transition-colors"
            >
              {avatarUploading ? (
                <Loader2 size={12} className="text-muted-foreground animate-spin" />
              ) : (
                <Camera size={12} className="text-muted-foreground" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatar}
            />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {form.full_name || "Jumper"}
            </p>
            <p className="text-xs text-muted-foreground">
              UpTime.Pro ID #{initialProfile?.uptime_user_id ?? "—"}
            </p>
            {avatarUploading && (
              <p className="text-xs text-muted-foreground mt-0.5">Uploading…</p>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Full Name">
            <Input
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              placeholder="Your name"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              disabled
              className="opacity-60"
            />
          </Field>
          <Field label="Bio">
            <Textarea
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
              rows={3}
              placeholder="Tell other jumpers about yourself…"
            />
          </Field>
          <div className="flex items-center justify-between">
            <div>
              <Label>Public Profile</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Show on leaderboards
              </p>
            </div>
            <Switch
              checked={form.is_public}
              onCheckedChange={(v) => update("is_public", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Home DZ */}
      <Card>
        <CardHeader>
          <CardTitle>Home Dropzone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {resolvedDz && (
            <div className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
              <span className="text-xs text-primary font-medium">
                📍 {resolvedDz}
              </span>
            </div>
          )}
          <Field label="Set home DZ by address">
            <Input
              value={homeDzAddress}
              onChange={(e) => setHomeDzAddress(e.target.value)}
              placeholder="e.g. Lodi, CA"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            {resolvingDz
              ? "Looking up dropzone…"
              : "Geocoded via Mapbox + matched to a known DZ via Google Places."}
          </p>
        </CardContent>
      </Card>

      {/* Gear & credentials */}
      <Card>
        <CardHeader>
          <CardTitle>Gear &amp; Credentials</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="USPA License">
              <Input
                value={form.uspa_license}
                onChange={(e) => update("uspa_license", e.target.value)}
                placeholder="D-12345"
              />
            </Field>
            <Field label="USPA Member #">
              <Input
                value={form.uspa_member_number}
                onChange={(e) => update("uspa_member_number", e.target.value)}
              />
            </Field>
            <Field label="Burble Name">
              <Input
                value={form.burble_name}
                onChange={(e) => update("burble_name", e.target.value)}
              />
            </Field>
            <Field label="Ratings">
              <Input
                value={form.ratings}
                onChange={(e) => update("ratings", e.target.value)}
                placeholder="Coach, AFF-I"
              />
            </Field>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rig Type">
              <Input
                value={form.rig_type}
                onChange={(e) => update("rig_type", e.target.value)}
                placeholder="Vector"
              />
            </Field>
            <Field label="Canopy Type">
              <Input
                value={form.canopy_type}
                onChange={(e) => update("canopy_type", e.target.value)}
                placeholder="Sabre 3"
              />
            </Field>
            <Field label="Canopy Size (sq ft)">
              <Input
                type="number"
                value={form.canopy_size}
                onChange={(e) => update("canopy_size", e.target.value)}
                placeholder="170"
              />
            </Field>
            <Field label="Wing Load">
              <Input
                type="number"
                step="0.01"
                value={form.wing_load}
                onChange={(e) => update("wing_load", e.target.value)}
                placeholder="1.30"
              />
            </Field>
          </div>

          <Separator />

          <Field label="Reserve Repack Date">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  type="date"
                  value={form.reserve_repack_date}
                  onChange={(e) => update("reserve_repack_date", e.target.value)}
                />
              </div>
              {form.reserve_repack_date && <RepackCountdown date={form.reserve_repack_date} />}
            </div>
          </Field>
        </CardContent>
      </Card>

      <Button type="submit" disabled={saving || resolvingDz} className="w-full">
        {saving || resolvingDz ? (
          <>
            <Loader2 size={14} className="animate-spin mr-1" /> Saving…
          </>
        ) : (
          "Save Changes"
        )}
      </Button>

      {/* Linked Accounts */}
      <LinkedAccountsCard />

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {theme === "dark" ? (
                <Moon size={16} className="text-muted-foreground" />
              ) : (
                <Sun size={16} className="text-muted-foreground" />
              )}
              <div>
                <Label className="text-sm text-foreground">Dark mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {theme === "dark" ? "Using dark theme" : "Using light theme"}
                </p>
              </div>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(v) => persistTheme(v ? "dark" : "light")}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-foreground">Imperial units</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Feet · MPH · °F
              </p>
            </div>
            <Switch
              checked={units === "imperial"}
              onCheckedChange={(v) => persistUnits(v ? "imperial" : "metric")}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {units === "imperial"
              ? "Showing imperial — altitudes in ft, speeds in mph."
              : "Showing metric — altitudes in m, speeds in m/s."}
          </p>
        </CardContent>
      </Card>

      {/* Device sync (Phase 3 — disabled for now) */}
      <Card>
        <CardHeader>
          <CardTitle>Device Sync</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between opacity-60">
            <div className="flex items-center gap-2">
              <Wifi size={16} className="text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-foreground">
                    Dekunu device sync
                  </Label>
                  <span className="text-[10px] font-semibold bg-red-500 text-white rounded px-1.5 py-0.5 leading-none">
                    Needs Device
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set DEKUNU_COMPAT=true to enable
                </p>
              </div>
            </div>
            <Switch checked={false} disabled />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
