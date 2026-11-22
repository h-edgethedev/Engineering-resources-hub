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

## Next logical development task

Build the web registration/login and session-aware resource flows, then add email verification and account recovery. Before public deployment, choose a malware scanning/quarantine service and deployment-grade session/rate-limit stores; add Cloudflare R2 when cloud storage is needed. Preserve owner-reviewed course data; do not silently rewrite the course import.

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
