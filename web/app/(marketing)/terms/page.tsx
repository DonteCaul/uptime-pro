export const metadata = { title: "Terms of Service · UpTime.Pro" };

export default function TermsPage() {
  return (
    <article className="prose prose-sm dark:prose-invert max-w-none">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

      <h2>Acceptance</h2>
      <p>
        By creating an account or using UpTime.Pro, you agree to these terms.
        If you don&apos;t agree, don&apos;t use the service.
      </p>

      <h2>Your account</h2>
      <p>
        You are responsible for maintaining the security of your account and
        password. You must be at least 18 years old (or have guardian consent)
        to use this service, and you agree to provide accurate information.
      </p>

      <h2>Your content</h2>
      <p>
        You retain ownership of all jump data, profile information, and other
        content you upload. You grant us a limited license to store, process,
        and display your content solely to provide the service to you (and, if
        you opt in, to other users via public profiles and leaderboards).
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t upload content you don&apos;t have the right to.</li>
        <li>Don&apos;t attempt to access other users&apos; private data.</li>
        <li>Don&apos;t abuse, overload, or reverse-engineer the service.</li>
        <li>Don&apos;t use the service for anything illegal.</li>
      </ul>

      <h2>Service availability</h2>
      <p>
        UpTime.Pro is provided &quot;as is&quot; without guarantees of uptime
        or data permanence. While we take reasonable care to protect your data,
        we recommend keeping local backups of your original jump logs.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        UpTime.Pro is a logging tool, not an altimeter or safety device. Do
        not rely on it for life-critical decisions. We are not liable for any
        damages arising from use of the service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms from time to time. Continued use after
        changes constitutes acceptance of the revised terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Reach out via the support channels listed
        in your account settings.
      </p>
    </article>
  );
}
