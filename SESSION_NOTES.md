# Session notes

Updated: 2026-11-21

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
