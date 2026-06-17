import Link from "next/link";
import {
  Activity,
  PlaneTakeoff,
  Map,
  Zap,
  Users,
  Shield,
  CloudRain,
  Cpu,
  Database,
} from "lucide-react";

export const metadata = { title: "Features · UpTime.Pro" };

const SECTIONS = [
  {
    icon: Activity,
    title: "Telemetry Replay",
    body: "Every jump can be replayed in full detail. A 4-channel telemetry strip (altitude AGL, vertical speed, GPS speed, G-force) syncs with a scrubber and time-accurate playback at 1×, 5×, 10×, 30×, or 100× speed. Phase bands highlight climb, freefall, and canopy.",
  },
  {
    icon: Map,
    title: "3D Map Replay",
    body: "Watch your track on a satellite map with terrain elevation. The path is color-coded by flight phase, with a jump-run heading arrow, exit and landing markers, and a live cursor that tracks the scrubber. Toggle between 2D and 3D terrain views.",
  },
  {
    icon: Zap,
    title: "Automatic Analysis",
    body: "Glide ratio, landing speed, swoop detection (peak speed under 100m AGL), opening G-force, average G-force, and average freefall speed — all computed from raw sensor data, no manual entry.",
  },
  {
    icon: PlaneTakeoff,
    title: "Flexible Ingest",
    body: "Drag-and-drop Dekunu CSV files in the browser, or let your device sync automatically over WiFi via the compatibility layer. Files are deduplicated by filename, parsed with firmware-quirk handling, and archived to cloud storage.",
  },
  {
    icon: CloudRain,
    title: "Historical Weather",
    body: "Every jump shows the weather at the time and place it happened — surface winds, gusts, and a multi-level wind profile up to 18,000ft. Historical data is cached permanently (it never changes); recent forecasts refresh every 10 minutes.",
  },
  {
    icon: Users,
    title: "Community",
    body: "Public leaderboards for most jumps, most dropzones visited, and top jumpers by discipline — filterable by today, month, year, or all time. Share your stats on a public profile with your gear, ratings, and recent jumps.",
  },
  {
    icon: Shield,
    title: "Per-Jump Privacy",
    body: "Control visibility at two levels: your profile (public/private) and each individual jump. Mark sensitive jumps private without hiding your whole logbook. Enforced by row-level security in Postgres — not application code.",
  },
  {
    icon: Cpu,
    title: "Device Management",
    body: "See all your paired devices with firmware versions, serial numbers, and jump counts. Devices register automatically when they sync — no manual setup.",
  },
  {
    icon: Database,
    title: "System Logs",
    body: "Upload and browse device syslog files for debugging. Filtered and stored per device, with a full-content viewer.",
  },
];

export default function FeaturesPage() {
  return (
    <div>
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-foreground mb-3">Features</h1>
        <p className="text-muted-foreground max-w-2xl">
          A complete skydiving logbook — from raw sensor data to shareable
          replays. Here&apos;s everything UpTime.Pro does.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {SECTIONS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="bg-card border border-border rounded-lg p-6"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
              <Icon size={20} />
            </div>
            <h2 className="font-semibold text-foreground mb-2">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center">
        <Link
          href="/register"
          className="inline-flex items-center text-primary hover:underline"
        >
          Get started →
        </Link>
      </div>
    </div>
  );
}
