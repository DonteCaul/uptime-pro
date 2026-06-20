import Link from "next/link";
import {
  LayoutDashboard,
  PlaneTakeoff,
  Upload,
  User,
  Users,
  Cpu,
} from "lucide-react";
import { SignOutButton } from "./SignOutButton";

const links = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/jumps", label: "Jumps", icon: PlaneTakeoff },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/social", label: "Social", icon: Users },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/profile", label: "Profile", icon: User },
] as const;

/**
 * Responsive navigation shell.
 *
 * - Desktop (sm+): top header with inline nav links + sign-out, no bottom bar.
 * - Mobile: minimal header (logo only) + fixed bottom nav with all links.
 *
 * Server component; SignOutButton is the only client piece.
 */
export function Nav({ userEmail }: { userEmail: string | null }) {
  return (
    <>
      {/* Desktop header */}
      <header className="hidden sm:flex sticky top-0 z-40 bg-card/80 backdrop-blur-sm border-b border-border">
        <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="text-primary text-xl">⬡</span>
            <span className="font-bold text-foreground tracking-wide text-sm">
              UPTIME.PRO
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              >
                <Icon size={15} strokeWidth={1.75} />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            ))}
            <div className="w-px h-5 bg-border mx-1" />
            <span
              className="text-xs text-muted-foreground max-w-[180px] truncate hidden md:inline"
              title={userEmail ?? undefined}
            >
              {userEmail}
            </span>
            <SignOutButton className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" />
          </nav>
        </div>
      </header>

      {/* Mobile header (logo only — nav is at the bottom) */}
      <header className="sm:hidden sticky top-0 z-40 bg-card/90 backdrop-blur-sm border-b border-border px-4 h-12 flex items-center justify-center">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-primary text-lg">⬡</span>
          <span className="font-bold text-foreground tracking-wide text-xs">
            UPTIME.PRO
          </span>
        </Link>
      </header>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border flex z-50 pb-[env(safe-area-inset-bottom)]">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center py-2.5 text-[10px] gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon size={18} strokeWidth={1.75} />
            {label}
          </Link>
        ))}
        <SignOutButton className="flex-1 flex flex-col items-center py-2.5 text-[10px] gap-0.5 text-muted-foreground hover:text-destructive transition-colors" />
      </nav>

      {/* Spacer for mobile bottom nav */}
      <div className="sm:hidden h-16" />
    </>
  );
}
