import Link from "next/link";
import {
  LayoutDashboard,
  PlaneTakeoff,
  Upload,
  User,
  Users,
} from "lucide-react";
import { SignOutButton } from "./SignOutButton";

const links = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/jumps", label: "Jumps", icon: PlaneTakeoff },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/social", label: "Social", icon: Users },
  { href: "/profile", label: "Profile", icon: User },
] as const;

/**
 * Top-bar + bottom-nav shell. Server component; the sign-out button is the
 * only interactive piece and lives in its own client component.
 */
export function Nav({ userEmail }: { userEmail: string | null }) {
  return (
    <>
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-primary text-xl">⬡</span>
          <span className="font-bold text-foreground tracking-wide text-sm">
            UPTIME.PRO
          </span>
        </Link>
        <span className="text-xs text-muted-foreground">
          {userEmail ?? ""}
        </span>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex z-50">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center py-2.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon size={18} strokeWidth={1.75} />
            {label}
          </Link>
        ))}
        <SignOutButton className="flex-1 flex flex-col items-center py-2.5 text-[10px] gap-1 text-muted-foreground hover:text-destructive-foreground transition-colors" />
      </nav>

      <div className="h-16" />
    </>
  );
}
