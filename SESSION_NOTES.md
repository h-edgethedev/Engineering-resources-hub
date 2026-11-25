# Session notes

Updated: 2026-11-25

## Cloudflare R2 storage adapter (2026-11-25)

- Added optional Cloudflare R2 object storage through the AWS S3-compatible SDK. Local filesystem storage remains the default; R2 configuration is validated at API startup when selected.
- Kept the R2 bucket private and routed reads and writes through the API so existing resource authorization remains enforced. File reads, replacement, restore, and Trash purge now resolve the provider recorded on each file, allowing local and R2 records to coexist.
- Added `npm run storage:migrate-r2 --workspace @erh/api` to copy local files to R2 sequentially, verify byte counts and SHA-256 checksums, update file/purge metadata transactionally, and retain local source copies for rollback.
- Added R2 setup and migration instructions in `docs/STORAGE.md`; updated architecture, API, README, and project context.
- API typecheck/build and `git diff --check` pass. R2 was not configured in this environment, so live bucket integration remains unverified. Malware scanning and failed-upload cleanup remain future production hardening.

## Resource API milestone

- Added Prisma `Resource` and one-to-one `ResourceFile` models with a migration. Resources reference a course and can optionally reference an academic session and semester; provided academic context is checked against the course's offerings.
- Added `POST`, `GET` list/detail, `PATCH`, and `DELETE` under `/api/v1/resources`, with input validation, filtering, pagination, standard errors, and resource file metadata.
- New resources are always `PENDING`; create/update bodies reject client-supplied status, leaving approval actions for an authorized moderation workflow.
- Resource files are uploaded through multipart form data and stored via a `ResourceStorage` interface. Local development storage, inline viewing, downloads, and local-file cleanup on resource deletion are implemented. Resource routes currently have no authentication/authorization, so they are not ready for public deployment.
- API typecheck, build, and endpoint tests passed after the resource implementation (25 API tests total). Tests mock Prisma and do not confirm a migration against a live database.

## Product note captured

- The proposed EngHub RBAC hierarchy has six roles: Super Administrator, University Administrator, Moderator, Contributor, Student, and Guest.
- Scope/intent: platform-wide administration; university-scoped academic administration; scoped resource moderation; resource contribution; registered student access/community participation; and public guest browsing of approved materials.
- Important constraints: university administrators are limited to their university; moderator authority is scoped; contributors cannot approve their own uploads; student access to approved resources does not require contributor status; guests cannot use account-dependent actions such as upload, bookmark, or comment.
- These initial role constraints informed the policy in `docs/AUTHORIZATION_POLICY.md` and the implementation recorded below.

## Prior academic API milestone

- Academic endpoints were added for listing faculties, departments, and programmes; fetching a programme; listing courses with academic filters and pagination; and fetching a course by UUID. Existing university and department endpoints remain.
- Zod validation, not-found behavior, empty-list behavior, response envelopes, pagination metadata, and endpoint documentation were updated.
- API typecheck, API build, and the API test suite passed after these changes. Academic HTTP tests mock Prisma; this does not establish a live PostgreSQL integration check.
- The repository contains a Prisma schema and initial migration. Local API environment files exist but their contents are intentionally not recorded here.

## File upload and storage milestone (2026-11-21)

- Added multipart uploads for PDF, legacy/OpenXML Office documents, and plain text with extension and media type allowlists, signature checks, and a configurable 20 MiB default limit (100 MiB maximum).
- Added local filesystem storage behind a streaming `ResourceStorage` interface, generated storage keys, and inline/download endpoints. Resource deletion removes the local binary and its database metadata.
- Updated API documentation and environment examples. Prisma schema and migrations did not need changes.
- API typecheck passed. API HTTP tests passed: 27 tests across 3 files. Tests mock Prisma and storage; live PostgreSQL/file persistence integration has not been exercised in this milestone.
- Owner reports the resource migration now works and database configuration is mostly complete on this computer.
- Authentication, authorization, ownership checks, malware scanning, and Cloudflare R2 integration remain unimplemented.

## Live upload integration verification (2026-11-21)

- The configured database was reachable, but the catalogue initially had the University of Lagos row and no active courses. Ran the repository seed script using its reviewed course CSV; it reported 36 courses and 36 course offerings.
- Exercised the API against a seeded Computer Engineering course and its actual 100 Level, Second Semester ID: multipart upload returned `201`; the local file was created; inline view and attachment download returned the uploaded bytes; deletion returned `204`, removed the file, and the resource subsequently returned `404`.
- The temporary test resource and uploaded file were cleaned up. Seeded catalogue data remains in the configured database as expected. API server was stopped after verification.

## Next logical development task (updated 2026-11-22)

The API auth and moderation flows and local upload workflow have already been implemented and verified. The web app has registration/login, session restoration, sign-out, a protected account page, and an authenticated resource submission form. The next product slice is a university-wide moderation queue in the web app. After that, add email verification and account recovery. Before public deployment, choose a malware scanning/quarantine service and deployment-grade session/rate-limit stores; add Cloudflare R2 when cloud storage is needed. Preserve owner-reviewed course data; do not silently rewrite the course import.

## Authentication and authorization milestone (2026-11-21)

- Owner decisions: every authenticated Student can submit resources; moderators cover their whole assigned university.
- Added User, RoleAssignment, AuthSession, and ModerationAction models; resources now store uploader ownership. Migration `20261121125018_add_auth_and_moderation` was applied to the configured local PostgreSQL database.
- Added registration, login, logout, current-user, CSRF refresh, and scoped role grant/revoke endpoints. Passwords use bcrypt hashes; sessions are opaque random cookie tokens stored as hashes, with CSRF protection for authenticated mutations and an in-memory credential rate limit.
- Added one-time Super Administrator bootstrap command. Student registration grants Student; Super Administrators can grant platform/university roles; University Administrators can grant Moderator or Contributor only in their own university.
- Resource uploads require Student or Contributor; guests see only approved resources; uploaders can access their own submissions; moderators see and review their university's resources; self-moderation is denied; review actions are recorded; edits to approved/rejected resources return them to pending; removal hides content and deletes its stored binary.
- API typecheck passed and API tests passed: 38 tests across 4 files. Migration applied successfully. Live auth smoke check passed: registration, `/me`, CSRF refresh, logout, and confirmed revoked-session denial. The temporary Student account was deleted afterward. Live upload lifecycle was also verified in the prior milestone.
- The configured database currently has no Super Administrator role grant. Run the one-time bootstrap command with process-only credentials before granting moderator/admin roles.
- Pre-existing user edit in `prompt.txt` was left untouched.

## Current development checkpoint (2026-11-21)

- Branch is `main` at `c04d04e`; the auth/authorization implementation and policy documentation are in progress and have not been committed.
- A pre-existing user edit in `prompt.txt` was present before the auth work and must remain untouched.
- The local database now has the auth migration applied and the reviewed 36-course seed. No test accounts or upload smoke-test resources remain.

## Web authentication milestone (2026-11-22)

- Added `/register` and `/login` pages wired to the existing API. Registration enforces the API's 12-character password minimum and displays API validation/authentication messages.
- Added session restoration through `GET /api/v1/auth/me`, cookie-backed login/registration, CSRF-safe sign-out using `GET /auth/csrf` followed by `POST /auth/logout`, and a protected `/account` page showing the current user's role grants.
- Updated landing navigation and contribution calls to action based on sign-in state; updated project and API documentation to reflect the web auth milestone.
- The Super Administrator bootstrap should be considered complete only if the command printed its success message; the application database was not inspected during this UI work.

## Web resource submission milestone (2026-11-22)

- Added a resource submission form to `/account` for users with a Student, Contributor, or Super Administrator grant. It loads the UNILAG course catalogue from the API and lets students choose a course, material type, title, optional description, and one supported file.
- The form checks allowed file extensions and the 20 MiB default size in the browser, requests a fresh CSRF token, and submits multipart form data. API validation remains authoritative, and successful submissions are shown as pending moderation.
- The local account page checks the user's roles before showing the form; the API also authorizes Super Administrators to submit.
- Next: implement the university-wide moderation queue in the web app. Account recovery remains future work.

## Email verification and Super Administrator uploads (2026-11-22)

- Allowed Super Administrators to submit resources in the API and account UI, alongside Students and Contributors.
- New registrations now create a Student account without a session and send a 30-minute, single-use verification link. Tokens are random, stored as hashes, and deleted when replaced or after a delivery failure. Added verify and resend endpoints with request limits and enumeration-safe resend responses.
- Login and session restoration require a verified email. The migration backfills current users as verified, and new bootstrapped Super Administrators are marked verified.
- Added a verification page with resend support. In development without SMTP configuration, the API prints the link to its console. Production requires `EMAIL_SMTP_URL` and `EMAIL_FROM` and uses Nodemailer.
- Added migration `20261122040000_add_email_verification`; Prisma Client generation, API typecheck, full monorepo typecheck, and full build succeeded. The first sandboxed migration attempt failed, then it applied successfully with local PostgreSQL access; the database reports schema in sync.
- In development without SMTP settings, use the link printed in the API console. Production requires `EMAIL_SMTP_URL` and `EMAIL_FROM`; credentials belong only in the local `.env`.
- Next: continue with the university-wide moderation queue UI. Account recovery remains future work.

## Registration and verification experience polish (2026-11-23)

- Reused the existing account registration, bcrypt hashing, one-time email verification tokens, SMTP setup, session controls, and server-side authentication rate limits; no schema or API endpoint changes were needed.
- Signup now confirms the password in the browser, offers an accessible show/hide control, and displays live password requirements. It sends only the password field to the API.
- The verification page only says an email was sent after successful registration. Paths reached after an email-send failure or from an unverified login use neutral copy and can request a resend. Resend adds a 60-second UI cooldown; the existing API rate limiter remains authoritative.
- Updated auth API tests for the current verify-before-login flow and added coverage for normalized registration, duplicate addresses, verification token validity/expiry/reuse, and resend behavior. Updated resource test session fixtures to include verified-email state required by the current auth middleware.
- `npm run test:api` passed: 43 tests across 4 files. `npm run typecheck` and `npm run build` passed. No live SMTP delivery check was performed.
- At the end of this milestone, academic onboarding, academic profile persistence, preferences, and profile setup remained outstanding; see the subsequent milestone entries below.

## Academic onboarding milestone (2026-11-23)

- Added optional `AcademicProfile` storage and migration `20261123110000_add_academic_profiles`, with nullable foreign keys for university, faculty, department, programme, current level, and current semester.
- Added authenticated `GET` and CSRF-protected `PUT /api/v1/auth/me/academic-profile` endpoints. Zod checks hierarchy shape; the service verifies selected records belong to the selected parent records before saving.
- Added `/onboarding`, an optional two-step flow that derives countries from active university records, loads university/faculty/department/programme/level/semester options from existing academic APIs, and saves each selection as progress. Users can skip, return, or edit from the account page. Public browsing is not gated.
- Documented the endpoints and updated project context. API tests pass: 47 tests across 4 files. Prisma schema validation, client generation, monorepo typecheck, and full build succeeded.
- The migration is not applied to the configured local database: `localhost:5433` returned no response during `npm run db:migrate`, including the elevated attempt. Start the configured PostgreSQL instance, then run `npm run db:migrate` before using profile persistence.
- At the end of this milestone, personalization preferences and username/avatar/bio/social links remained for subsequent work. No database migration was applied and no data was changed.

## Preferences and profile onboarding milestone (2026-11-23)

- Added `UserProfile` and `UserPreferences` models plus `PreferredResourceKind`, `LearningInterest`, and `LearningGoal` enums in migration `20261123130000_add_user_profiles_preferences`.
- Added authenticated GET/PUT APIs for optional user profile fields and preference selections. The API normalizes unique usernames, validates HTTPS avatar URLs and GitHub/LinkedIn domains, caps bio length, and validates typed preference values.
- Expanded onboarding into four optional steps: institution, academic progress, learning preferences, and profile setup. Preferences save as choices change; academic selections save as users make them; profile fields save on blur and on finish. Account page links to update the profile later. Public browsing remains available without onboarding.
- `npm run test:api` passed: 50 tests across 4 files. `npm run typecheck`, `npm run build`, Prisma schema validation/client generation, and `git diff --check` passed.
- Both onboarding migrations remain unapplied because PostgreSQL at the configured `localhost:5433` endpoint was offline. Start that database and run `npm run db:migrate` before testing onboarding against real data. Live database or UI end-to-end verification was not performed.

## Public discovery foundation milestone (2026-11-23)

- Added public Explore/Search routes backed by course and approved-resource APIs, with course/resource metadata text queries and a real resource-type filter. The landing page now loads real course and approved-resource previews instead of presenting static placeholder content.
- Added university listing/detail, course detail with associated approved resources, and resource detail with metadata, downloads, and inline preview for PDF/plain text. Department course rows link to course details; unknown routes show a not-found state.
- Extended the academic API to search courses by code/title/description and resources by title/description/course code/title. Department detail and department-filtered course queries now include GET-coded courses from the same university as general engineering courses. Existing course records and reviewed CSV were not changed; course-to-department sharing is inferred from the owner's stated GET code rule.
- Updated API and project documentation. No schema change or migration was required.
- `npm run typecheck` and `npm run build` passed. `npm run test:api` could not execute in the restricted environment because the HTTP tests attempt to bind `0.0.0.0` and Node returned `listen EPERM`; no test assertion ran. Live API/database/UI integration has not been verified.
- Next: verify the discovery pages against the configured database once available; add explicit user-controlled pagination and course/resource context filters; then proceed to the student workspace. Keep cross-department GET accessibility when implementing personalized course lists.

## Resource review and moderator assignment milestone (2026-11-23)

- Added `/app/admin/resources` for Super Administrators and university admins to inspect resources by status; the Super Administrator can review platform-wide pending uploads, preview/download files, approve, or reject with a required reason. Added `/app/moderation/queue` for Moderators and Super Administrators, using the existing scoped list and moderation APIs. The backend continues to prevent self-moderation and records decisions.
- Added a reviewer-only, actionable pending count in the public header. The role-protected `reviewQueue=true` resource filter respects reviewer visibility and excludes each reviewer's own submissions. The count refreshes every 30 seconds and when stale on window focus. When pending resources exist, the header shows count badges on review links and a bottom-right pulsing alert that opens the appropriate review page; moderation decisions invalidate the count immediately. The shared header is also used on the account page reached after sign-in.
- Review queue/resource review pages now refresh every 30 seconds, refetch on focus, key cached submissions by reviewer account, and provide a manual Refresh button so uploads from other accounts appear without reopening the page.
- Added `/app/admin/users` for Super Administrators to search accounts, inspect role scopes, grant a Moderator role for a selected university, and revoke role assignments. Added `GET /api/v1/auth/admin/users` with search and pagination, protected by Super Administrator authorization.
- Elevated role grants now require the target user's email to be verified. UI selection excludes inactive/unverified users; backend validation enforces the rule too.
- Added privileged navigation links and documented the new workflows. No database migration was needed.
- `npm run typecheck` and `npm run build` passed after this milestone. API tests remain unverified in the sandbox because their HTTP harness cannot bind `0.0.0.0` (`listen EPERM`). Live moderation/role workflows have not been exercised against the configured database.

## Super Administrator resource review visibility fix (2026-11-23)

- Investigated why a Student's `Week 4: Combinational Logic and Circuits` upload was absent from the Super Administrator's review page. The pending row existed in the configured database, and both browser sessions used the same local API/database.
- The resource list query incorrectly used an empty Prisma `OR` condition (`{}`) as a wildcard for Super Administrators. Prisma did not treat it as match-all, so the API returned only the administrator's own upload.
- Updated `listResources` so Super Administrators bypass the ordinary visibility `OR` filter while retaining requested status, search, and review-queue conditions.
- Verified the service query returned all seven pending resources, including the Week 4 upload. Reloaded `/app/admin/resources` in Safari and confirmed the Week 4 card is visible with Approve/Reject controls. No moderation decision was submitted.
- `npm run typecheck` and `git diff --check` passed. API test suite was not run.

## Account dashboard and upload separation (2026-11-23)

- Reworked `/account` into a dashboard showing core account identity/roles, profile and academic details, learning preferences, and uploaded resources with status filters and pagination.
- Moved resource submission to `/app/resources/new`, linked from the account dashboard for Student, Contributor, and Super Administrator accounts.
- Added authenticated `mine=true` filtering to `GET /api/v1/resources` so the account page loads only the current user's uploads, including all moderation statuses.
- Regenerated the ignored Prisma Client for this checkout, then `npm run typecheck`, the web production build, and `git diff --check` passed. No schema change or migration was needed.

## Verified signup onboarding and Electrical programme levels (2026-11-23)

- Email verification now creates the signed-in session and directs the verified user to onboarding. Existing verified accounts missing a username are directed to onboarding after login; accounts with a username follow their requested destination.
- A unique username is now required by the profile API and to finish onboarding. Academic affiliation and learning preferences remain optional, and users may still edit their profile from the account page.
- Extended both seeded programmes to include 100, 200, and 300 Level and semester structure. Added the Electrical and Electronics Engineering programme named Bachelor of Science in Electrical and Electronics Engineering. No Electrical course records were created because those still require owner validation.
- At the end of that implementation turn, the seed had not yet been applied to PostgreSQL and compile verification was pending; the follow-up below records the completed seed and checks.

## Onboarding data and validation follow-up (2026-11-24)

- Ran `npm run db:seed` successfully against the configured PostgreSQL database. The seed upserted the Electrical and Electronics Engineering programme and matching 100, 200, and 300 Level / First and Second Semester choices while retaining the reviewed Computer Engineering catalogue.
- The onboarding UI now includes API validation detail paths/messages instead of hiding them behind the generic “Request data is invalid” response. The server response is produced when a request fails its Zod input schema; the previous client UI discarded its `details`, so the specific invalid field was not visible in the screenshot.
- Follow-up screenshot pinpointed the validation error: the preferences GET endpoint returned database metadata (`id`, `userId`, `createdAt`, `updatedAt`), and the UI spread that response into its PUT payload. The strict update schema correctly rejected those extra keys. The GET endpoint now returns only `resourceKinds`, `learningInterests`, and `learningGoals`.
- The subsequent profile-save screenshot showed the same issue for `UserProfile`: profile GET included database metadata and onboarding submitted it back to the strict profile schema. The profile GET response now selects only username, avatar URL, bio, GitHub URL, and LinkedIn URL; the web client also constructs a field allowlist before saving.
- The account dashboard read the academic-profile response from `data.profile`, although that endpoint returns `data.academicProfile`, making saved academic selections appear unset. Corrected the response mapping and updated preference labels to match current enums.
- Typechecking, the web production build, and `git diff --check` passed. Reload onboarding after seeding so the programme options are fetched again.

## Resource governance implementation (2026-11-24)

- Added recoverable resource Trash, reasoned moderator deletion requests, Super Administrator decisions, quarantine, restore, permanent purge, scheduled purge retries, report submission/review, metadata edits, file replacement, and governance history. Public discovery and file access exclude trashed or quarantined resources.
- Super Administrators can approve their own pending submissions and their own deletion requests. Moderators remain unable to self-approve submissions or decide deletion requests.
- Added `20261124150000_resource_governance` Prisma migration with resource governance fields, purge/report/request tables, and audit snapshots that survive permanent resource deletion. It was subsequently applied to PostgreSQL.
- Added a web governance workspace and report form, plus API documentation for the new routes.
- Verification passed: `npm run typecheck`, `npm run build`, `npm run test:api` (56 tests across 4 files), and `git diff --check`. API tests bind a localhost port, so they were run with loopback access after sandbox restrictions blocked the initial attempt.
- Live database migration, scheduled purge against persisted records, and external object storage have not been integration-tested. Replacement-file cleanup logs an orphaned old-storage-file error if deletion fails after a successful replacement; durable retry currently applies to Trash purges.
- Governance follow-up: the edit panel now uses the upload form fields prefilled from the resource, including course/session/semester, and displays the current file read-only; file replacement remains a separate Super Admin action. History resolves actor IDs to display names and usernames. API suite now passes 57 tests; typecheck/build and `git diff --check` pass.
- Reviewer inbox follow-up: replaced the always-visible review pill and duplicated nav badges with an icon-only notification launcher. Its panel combines pending resource reviews, deletion requests, and open reports; the badge counts items created since that reviewer last opened the inbox. `GovernanceInboxState` stores that per-user timestamp. The inbox table migration has now been applied.
- Notification appearance follow-up: restored the original pulse-wave icon and ring animation, changed the panel to appear on hover/focus and close on pointer exit, and styled it with a translucent surface and tinted activity cards to match the reference. Typecheck/build pass.
- Database migration recovery (2026-11-24): a stray empty directory caused P3015 because its SQL file had been removed even though PostgreSQL recorded that migration as applied. Restored the exact SQL and checksum, renamed the applied cleanup migration to sort after the governance migration it depends on, and updated only that exact migration-history row guarded by its existing checksum. Applied `20261124170000_governance_inbox_state`; `npx prisma migrate status` now reports the database schema is up to date. No schema reset was run.
