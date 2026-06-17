"use client";

import { useState, useRef, useTransition } from "react";
import { Camera, Check, Loader2 } from "lucide-react";
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
import { updateProfile } from "@/lib/actions/profile";
import type { Database } from "@/lib/db/types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

interface Profile {
  full_name: string | null;
  email: string | null;
  uptime_user_id: number | null;
  bio: string | null;
  avatar_url: string | null;
  home_dz: string | null;
  home_dz_lat: string | null;
  home_dz_lon: string | null;
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

export function ProfileEditForm({
  initialProfile,
}: {
  initialProfile: Profile | null;
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
    try {
      const placesRes = await fetch(
        `/api/places/nearby?lat=${lat}&lon=${lon}&radius=16093`,
      );
      if (placesRes.ok) {
        const places = await placesRes.json();
        if (places.places?.length) {
          const first = places.places[0];
          return {
            lat: first.lat ?? lat,
            lon: first.lon ?? lon,
            name: first.name ?? trimmed,
          };
        }
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
    setResolvingDz(true);

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
      if (homeDzAddress.trim()) {
        const result = await resolveHomeDz(homeDzAddress);
        if (result) {
          body.home_dz = result.name;
          body.home_dz_lat = result.lat;
          body.home_dz_lon = result.lon;
          setResolvedDz(result.name);
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
            <Input
              type="date"
              value={form.reserve_repack_date}
              onChange={(e) => update("reserve_repack_date", e.target.value)}
            />
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
    </form>
  );
}
