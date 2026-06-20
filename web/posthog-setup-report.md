<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into UpTime.Pro. Client-side PostHog is initialized via `instrumentation-client.ts` (the recommended Next.js 15.3+ approach using the instrumentation hook — no provider component needed). A reverse proxy through `/ingest` was added to `next.config.ts` so events are routed server-side, which improves reliability and bypasses ad-blockers. A shared server-side client in `lib/posthog-server.ts` is used by both API routes. Users are identified by their Supabase UUID at login and signup, so client and server events are correlated. Error tracking via `posthog.captureException()` is wired into the avatar upload and profile save flows.

| Event Name | Description | File |
|---|---|---|
| `user_signed_up` | A new user completes account registration via the sign-up form. | `app/(auth)/login/login-form.tsx` |
| `user_signed_in` | An existing user successfully signs in with email and password. | `app/(auth)/login/login-form.tsx` |
| `jump_files_uploaded` | A user finishes uploading Dekunu CSV+JSON jump log pairs via the upload page. | `app/(app)/upload/page.tsx` |
| `system_logs_uploaded` | A user finishes uploading Dekunu system log TXT files via the upload page. | `app/(app)/upload/page.tsx` |
| `jump_summaries_updated` | A user finishes uploading Dekunu summary JSON files to update existing jump metadata. | `app/(app)/upload/page.tsx` |
| `upload_cancelled` | A user cancels an in-progress file upload session. | `app/(app)/upload/page.tsx` |
| `jump_notes_saved` | A user saves discipline, notes, or visibility changes on a jump detail page. | `app/(app)/jumps/[id]/JumpDetailClient.tsx` |
| `jump_deleted` | A user permanently deletes a jump and all its sensor telemetry. | `app/(app)/jumps/[id]/JumpDetailClient.tsx` |
| `profile_saved` | A user saves their profile information including gear and credentials. | `app/(app)/profile/ProfileEditForm.tsx` |
| `avatar_uploaded` | A user successfully uploads a new profile avatar image. | `app/(app)/profile/ProfileEditForm.tsx` |
| `account_deleted` | A user confirms and submits a request to permanently delete their account and all data. | `app/(app)/profile/ProfileEditForm.tsx` |
| `jump_ingested` | A jump CSV+JSON pair is successfully parsed and stored by the upload API route. | `app/api/jumps/upload/route.ts` |
| `log_ingested` | A system log TXT file is successfully parsed and stored by the upload API route. | `app/api/logs/upload/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/478976/dashboard/1739380)
- [New User Signups](https://us.posthog.com/project/478976/insights/zjgUR64l)
- [Jumps Ingested](https://us.posthog.com/project/478976/insights/e9LwXPWp)
- [Upload Sessions by Type](https://us.posthog.com/project/478976/insights/KpkcgKIb)
- [Signup to Upload Conversion](https://us.posthog.com/project/478976/insights/0oy6Uknb)
- [Account Deletions (Churn)](https://us.posthog.com/project/478976/insights/jrBj0waK)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — currently `posthog.identify()` is called on explicit login/signup, but returning users whose session is restored from a Supabase cookie will be anonymous until they log in again. Consider calling `identify` in the app layout once the session is available server-side.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
