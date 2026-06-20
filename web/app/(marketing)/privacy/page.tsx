export const metadata = { title: "Privacy Policy · UpTime.Pro" };

export default function PrivacyPage() {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">
        Last updated: June 17, 2026
      </p>

      <p>
        UpTime.Pro (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the
        website{" "}
        <a href="https://next.uptime.pro" className="text-primary">
          https://next.uptime.pro
        </a>
        . This page informs you of our policies regarding the collection, use,
        and disclosure of personal information when you use our Service.
      </p>

      <h2>Information We Collect</h2>
      <h3>Information You Provide</h3>
      <ul>
        <li>
          <strong>Account information:</strong> email address, display name, and
          password. Passwords are hashed by Supabase Auth and never stored in
          plaintext.
        </li>
        <li>
          <strong>OAuth information:</strong> when you sign in with Google, we
          receive your name and email address from that provider. We do not store
          or have access to your social media passwords.
        </li>
        <li>
          <strong>Profile details:</strong> optional fields such as home
          dropzone, USPA license number, burble name, gear information (rig
          type, canopy type/size, wing load), and ratings.
        </li>
        <li>
          <strong>Bio:</strong> an optional free-text biography you choose to
          display on your public profile.
        </li>
      </ul>

      <h3>Information Collected Automatically</h3>
      <ul>
        <li>
          <strong>Jump telemetry:</strong> altitude, speed, GPS coordinates,
          device sensor readings, and other data from your uploaded or
          device-synced jump logs.
        </li>
        <li>
          <strong>Device information:</strong> hardware serials and firmware
          versions from paired devices.
        </li>
        <li>
          <strong>Usage data:</strong> we collect log data such as pages
          visited, time spent on pages, and navigation paths to improve our
          service.
        </li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>
          To provide, maintain, and improve the Service (jump logging, telemetry
          replay, statistics, and leaderboards).
        </li>
        <li>
          To authenticate you and manage your account.
        </li>
        <li>
          To display your jump log, compute statistics, render replays, and —
          if you opt in — show you on public leaderboards and profiles.
        </li>
        <li>
          To communicate with you regarding your account, such as password
          resets and service announcements.
        </li>
      </ul>
      <p>
        <strong>We do not sell your personal data to third parties.</strong>
      </p>

      <h2>Data Sharing</h2>
      <ul>
        <li>
          <strong>Private by default:</strong> only you can see your jumps and
          full profile.
        </li>
        <li>
          <strong>Public opt-in:</strong> you control whether your profile is
          public (for leaderboards) and whether individual jumps are visible on
          your public profile.
        </li>
        <li>
          <strong>Row-level security:</strong> access is enforced in the
          database, not just the application.
        </li>
      </ul>

      <h2>Third-Party Services</h2>
      <p>We use the following services to operate UpTime.Pro:</p>
      <ul>
        <li>
          <strong>Supabase:</strong> database hosting, authentication, and file
          storage. Data is stored in Supabase&apos;s infrastructure and governed
          by their{" "}
          <a
            href="https://supabase.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary"
          >
            privacy policy
          </a>
          .
        </li>
        <li>
          <strong>Vercel:</strong> web application hosting and serverless
          functions. Governed by their{" "}
          <a
            href="https://vercel.com/legal/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary"
          >
            privacy policy
          </a>
          .
        </li>
        <li>
          <strong>Google OAuth:</strong> used for optional sign-in. We receive
          only your name and email. Governed by the{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary"
          >
            Google Privacy Policy
          </a>
          .
        </li>
        <li>
          <strong>Mapbox:</strong> renders map tiles in your browser using a
          scoped public token.
        </li>
        <li>
          <strong>Google Places API:</strong> resolves dropzone names from
          coordinates (called server-side only; the API key never reaches your
          browser). Results are cached for 30 days.
        </li>
        <li>
          <strong>Open-Meteo:</strong> provides historical weather data (called
          server-side, cached permanently for past dates).
        </li>
      </ul>

      <h2>Data Retention</h2>
      <p>
        Your data is retained for as long as your account exists. You can delete
        your account at any time from your profile settings, which cascades to
        all your jumps, telemetry, logs, and personal information.
      </p>

      <h2>Data Deletion</h2>
      <p>
        You have the right to request deletion of your personal data at any
        time. Contact us using the information below, or delete your account
        directly from your profile settings.
      </p>

      <h2>Children&apos;s Privacy</h2>
      <p>
        Our Service is not intended for individuals under the age of 13. We do
        not knowingly collect personal information from children under 13. If
        we discover that a child under 13 has provided us with personal
        information, we will delete such information immediately.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you
        of any changes by posting the new Privacy Policy on this page and
        updating the &quot;Last updated&quot; date. You are advised to review
        this Privacy Policy periodically for any changes.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have any questions about this Privacy Policy, please contact us
        at:{" "}
        <a href="mailto:support@uptime.pro" className="text-primary">
          support@uptime.pro
        </a>
      </p>
    </article>
  );
}
