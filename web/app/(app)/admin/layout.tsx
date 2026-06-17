import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LayoutDashboard, Users, Cpu, ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Admin layout — guards all /admin/* routes. Only role='admin' users proceed;
 * others are redirected to the dashboard.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  const navItems = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/devices", label: "Devices", icon: Cpu },
    { href: "/admin/logs", label: "Logs", icon: ScrollText },
  ];

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Admin</h2>
        <span className="text-xs text-muted-foreground">Admin Area</span>
      </div>

      {/* Admin sub-nav */}
      <div className="flex gap-2 overflow-x-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors whitespace-nowrap border border-border"
          >
            <Icon size={14} />
            {label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
