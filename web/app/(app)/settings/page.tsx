import { createServerClient } from "@/lib/supabase/server";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings · UpTime.Pro" };

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("units, theme")
    .single();

  return (
    <SettingsClient
      initialUnits={(profile?.units as "metric" | "imperial") ?? "metric"}
      initialTheme={(profile?.theme as "light" | "dark") ?? "light"}
    />
  );
}
