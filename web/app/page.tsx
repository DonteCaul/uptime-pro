import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PlaneTakeoff,
  Activity,
  Map,
  Users,
  Shield,
  Zap,
  ChevronRight,
} from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: Activity,
    title: "Telemetry Replay",
    desc: "Relive every jump with synchronized 3D map tracks, multi-channel telemetry, and frame-accurate playback.",
  },
  {
    icon: PlaneTakeoff,
    title: "Auto-Ingest",
    desc: "Upload your CSVs and let the system handle parsing, dedupe, and archival automatically.",
  },
  {
    icon: Map,
    title: "Dropzone Mapping",
    desc: "See all your jumps on an interactive map, grouped by dropzone with cached geocoding.",
  },
  {
    icon: Zap,
    title: "Jump Analysis",
    desc: "Glide ratio, landing speed, swoop detection, opening G-force — computed automatically from raw sensor data.",
  },
  {
    icon: Users,
    title: "Community Leaderboards",
    desc: "Compete on jumps, dropzones visited, and disciplines. Share your stats on a public profile.",
  },
  {
    icon: Shield,
    title: "Private by Default",
    desc: "Per-jump visibility controls. Your data is yours — RLS-enforced at the database level.",
  },
];

const STATS = [
  { value: "26", label: "sensor channels per second" },
  { value: "3D", label: "satellite + terrain replay" },
  { value: "∞", label: "jumps, no limits" },
];

export default async function LandingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If the visitor is already signed in, redirect straight to the dashboard.
  // This catches edge cases where the OAuth callback redirect doesn't land on
  // /dashboard (e.g., Site URL misconfiguration, cookie issues, etc.).
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-primary text-xl">⬡</span>
            <span className="font-bold text-foreground tracking-wide text-sm">
              UPTIME.PRO
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link href="/dashboard">
                  Dashboard <ChevronRight size={14} />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 sm:py-28">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <PlaneTakeoff size={12} /> Built for skydivers, by skydivers
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold text-foreground tracking-tight mb-6">
            Your jumps,
            <br />
            <span className="text-primary">in full detail.</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            UpTime.Pro is a modern jump logbook with 3D replay, telemetry
            analysis, and community leaderboards. Upload manually and
            relive every jump.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <Button size="lg" asChild>
                <Link href="/dashboard">
                  Open Dashboard <ChevronRight size={16} />
                </Link>
              </Button>
            ) : (
              <Button size="lg" asChild>
                <Link href="/register">
                  Create a free account <ChevronRight size={16} />
                </Link>
              </Button>
            )}
            <Button variant="outline" size="lg" asChild>
              <Link href="/features">Explore features</Link>
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex gap-8 sm:gap-16 mt-16">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl sm:text-4xl font-bold text-primary">
                {s.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[120px]">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="bg-card/50 border-y border-border py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-3">
              Everything you need to log every jump
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From raw sensor data to shareable replays — built for serious
              skydivers who want the full picture.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-background border border-border rounded-lg p-6 hover:border-primary/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                  <Icon size={20} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 text-center px-4">
        <h2 className="text-3xl font-bold text-foreground mb-4">
          Ready to log your next jump?
        </h2>
        <p className="text-muted-foreground mb-8">
          Free forever. No credit card. Your data stays yours.
        </p>
        <Button size="lg" asChild>
          <Link href="/register">
            Get started <ChevronRight size={16} />
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-primary">⬡</span>
            <span className="text-sm text-muted-foreground">
              UpTime.Pro · {new Date().getFullYear()}
            </span>
          </div>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground">
              About
            </Link>
            <Link href="/features" className="hover:text-foreground">
              Features
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
