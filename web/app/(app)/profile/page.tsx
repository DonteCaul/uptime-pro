import { Camera } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

interface Profile {
  full_name: string | null;
  email: string | null;
  uptime_user_id: number | null;
  bio: string | null;
  avatar_url: string | null;
  home_dz: string | null;
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

interface DeviceRow {
  id: number;
  device_id: number;
  device_type: string | null;
  last_seen_at: string | null;
}

function daysUntil(dateStr: string): number {
  const packed = new Date(dateStr);
  const due = new Date(packed.getTime() + 180 * 24 * 60 * 60 * 1000);
  return Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function ReserveCountdown({ date }: { date: string | null }) {
  if (!date) return null;
  const days = daysUntil(date);
  const color =
    days < 0
      ? "text-destructive"
      : days < 30
        ? "text-yellow-500"
        : "text-green-500";
  const label =
    days < 0
      ? `Overdue by ${Math.abs(days)} days`
      : days === 0
        ? "Due today"
        : `${days} days remaining`;
  return <p className={`text-xs font-medium mt-1 ${color}`}>{label}</p>;
}

function Field({
  label,
  value,
  placeholder = "—",
}: {
  label: string;
  value: string | number | null | undefined;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm text-foreground">
        {value == null || value === "" ? placeholder : value}
      </p>
    </div>
  );
}

export default async function ProfilePage() {
  const supabase = await createServerClient();

  const { data: profile } = (await supabase
    .from("profiles")
    .select(
      "full_name, email, uptime_user_id, bio, avatar_url, home_dz, uspa_license, uspa_member_number, burble_name, ratings, canopy_size, wing_load, rig_type, canopy_type, reserve_repack_date, is_public",
    )
    .single()) as { data: Profile | null };

  const { data: devices } = (await supabase
    .from("devices")
    .select("id, device_id, device_type, last_seen_at")
    .order("last_seen_at", { ascending: false, nullsFirst: false })) as {
    data: DeviceRow[] | null;
  };

  const p = profile;
  const initials = (p?.full_name ?? "U")[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex flex-col gap-5 pb-4">
      <h2 className="text-xl font-bold text-foreground">Profile</h2>

      {/* Avatar + name card */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-4">
          <div className="relative">
            {p?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.avatar_url}
                alt="avatar"
                className="w-16 h-16 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-primary text-2xl font-bold">
                {initials}
              </div>
            )}
            <div className="absolute bottom-0 right-0 bg-card border border-border rounded-full p-1">
              <Camera size={12} className="text-muted-foreground" />
            </div>
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {p?.full_name ?? "Jumper"}
            </p>
            <p className="text-xs text-muted-foreground">
              UpTime.Pro ID #{p?.uptime_user_id ?? "—"}
            </p>
            {p?.is_public && (
              <Badge variant="secondary" className="mt-1">
                Public
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Email" value={p?.email} />
          <Field label="Bio" value={p?.bio} />
        </CardContent>
      </Card>

      {/* Home DZ */}
      <Card>
        <CardHeader>
          <CardTitle>Home Dropzone</CardTitle>
        </CardHeader>
        <CardContent>
          {p?.home_dz ? (
            <div className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
              <span className="text-xs text-primary font-medium">
                📍 {p.home_dz}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not set</p>
          )}
        </CardContent>
      </Card>

      {/* Gear & credentials */}
      <Card>
        <CardHeader>
          <CardTitle>Gear &amp; Credentials</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="USPA License" value={p?.uspa_license} />
          <Field label="USPA Member Number" value={p?.uspa_member_number} />
          <Field label="Burble Name" value={p?.burble_name} />
          <Field label="Ratings" value={p?.ratings} />

          <Separator />

          <Field
            label="Canopy Size"
            value={p?.canopy_size ? `${p.canopy_size} sq ft` : null}
          />
          <Field label="Wing Load" value={p?.wing_load} />
          <Field label="Rig Type" value={p?.rig_type} />
          <Field label="Canopy Type" value={p?.canopy_type} />

          <Separator />

          <div>
            <Field
              label="Reserve Repack Date"
              value={
                p?.reserve_repack_date
                  ? new Date(p.reserve_repack_date).toLocaleDateString()
                  : null
              }
            />
            <ReserveCountdown date={p?.reserve_repack_date ?? null} />
          </div>
        </CardContent>
      </Card>

      {/* Devices */}
      {devices && devices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {devices.map((d, i) => (
              <div key={d.id}>
                {i > 0 && <Separator className="my-2" />}
                <div className="flex justify-between py-1">
                  <div>
                    <p className="text-sm text-foreground">
                      {d.device_type ?? `Device #${d.device_id}`}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground self-center">
                    {d.last_seen_at
                      ? new Date(d.last_seen_at).toLocaleDateString()
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Profile editing lands in Phase 2.
      </p>
    </div>
  );
}
