import { createServerClient } from "@/lib/supabase/server";
import { ProfileClient } from "./ProfileClient";
import { ProfileEditForm } from "./ProfileEditForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profile · UpTime.Pro" };

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

export default async function ProfilePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch the current user's profile by explicit user_id (not .single()).
  // Using .single() is unsafe here because the profiles table has a
  // "profiles_select_public" RLS policy that lets authenticated users
  // read any public profile — so .single() would error with PGRST116
  // ("more than one row returned") when multiple public profiles exist.
  const { data: profile } = (await supabase
    .from("profiles")
    .select(
      "full_name, email, uptime_user_id, bio, avatar_url, home_dz, home_dz_lat, home_dz_lon, uspa_license, uspa_member_number, burble_name, ratings, canopy_size, wing_load, rig_type, canopy_type, reserve_repack_date, is_public, units, theme",
    )
    .eq("id", user!.id)
    .single()) as {
    data: (Profile & { units: string | null; theme: string | null }) | null;
  };

  // Fetch total jump count for the tab badge.
  const { count: jumpCount } = await supabase
    .from("jumps")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user!.id);

  return (
    <ProfileClient
      jumpCount={jumpCount ?? 0}
      editForm={
        <ProfileEditForm
          initialProfile={profile}
          initialUnits={(profile?.units as "metric" | "imperial") ?? "metric"}
          initialTheme={(profile?.theme as "light" | "dark") ?? "light"}
        />
      }
    />
  );
}
