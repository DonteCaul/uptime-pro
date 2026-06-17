export const metadata = { title: "Privacy Policy · UpTime.Pro" };

export default function PrivacyPage() {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account info:</strong> your email address and the name you
          provide. Passwords are hashed by Supabase Auth and never stored in
          plaintext.
        </li>
        <li>
          <strong>Jump data:</strong> telemetry from your uploaded or
          device-synced jump logs — altitude, speed, GPS coordinates, and
          sensor readings.
        </li>
        <li>
          <strong>Device info:</strong> hardware serials and firmware versions
          from paired Dekunu devices.
        </li>
        <li>
          <strong>Profile details:</strong> optional fields like home dropzone,
          USPA license, gear, and ratings.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Your data is used to display your jump log, compute statistics, render
        replays, and (if you opt in) show you on public leaderboards and
        profiles. We do not sell your data to third parties.
      </p>

      <h2>Who can see what</h2>
      <ul>
        <li>
          <strong>Private by default:</strong> only you can see your jumps and
          full profile.
        </li>
        <li>
          <strong>Public opt-in:</strong> you control whether your profile is
          public (for leaderboards) and whether each individual jump is visible
          on your public profile.
        </li>
        <li>
          <strong>Row-level security:</strong> access is enforced in the
          database, not just the application. Even a bug in the app
          can&apos;t leak another user&apos;s private data.
        </li>
      </ul>

      <h2>External services</h2>
      <ul>
        <li>
          <strong>Supabase:</strong> hosts our database, authentication, and
          file storage.
        </li>
        <li>
          <strong>Mapbox:</strong> renders map tiles (a scoped public token is
          loaded in your browser).
        </li>
        <li>
          <strong>Google Places:</strong> resolves dropzone names from
          coordinates (called server-side only; the key never reaches your
          browser). Results are cached for 30 days.
        </li>
        <li>
          <strong>Open-Meteo:</strong> provides historical weather data
          (called server-side, cached permanently for past dates).
        </li>
      </ul>

      <h2>Data retention</h2>
      <p>
        Your data is retained for as long as your account exists. You can
        delete your account at any time, which cascades to all your jumps,
        telemetry, and logs.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Reach out via the support channels listed in
        your account settings.
      </p>
    </article>
  );
}
