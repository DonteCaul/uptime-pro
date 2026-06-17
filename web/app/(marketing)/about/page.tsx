export const metadata = { title: "About · UpTime.Pro" };

export default function AboutPage() {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none">
      <h1>About UpTime.Pro</h1>
      <p>
        UpTime.Pro is a modern jump logbook built for skydivers who want more
        than a spreadsheet. It ingests raw telemetry from Dekunu altitude
        sensors, replays every jump in 3D, and computes detailed analysis —
        glide ratios, landing speeds, opening G-forces, swoop detection.
      </p>
      <p>
        The project started as a personal tool and grew into a full platform
        with community leaderboards, public profiles, and automatic device
        sync. It&apos;s built on Next.js and Supabase, with row-level security
        enforcing privacy at the database level.
      </p>
      <h2>How it works</h2>
      <p>
        Upload your Dekunu CSV files manually, or let your device sync
        automatically via the compatibility layer. Each jump is parsed,
        deduplicated, and archived. The telemetry is then available for replay,
        analysis, and sharing — all under your control with per-jump visibility
        settings.
      </p>
      <h2>Privacy first</h2>
      <p>
        Your jump data is yours. Every query is scoped by row-level security in
        Postgres — there&apos;s no application-level &quot;trust me&quot; filtering.
        You decide which jumps are public, and you can change your mind at any
        time.
      </p>
    </article>
  );
}
