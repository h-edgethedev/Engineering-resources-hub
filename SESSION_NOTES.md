# Session notes

Updated: 2026-11-20

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
- This is a planning note, not an implemented feature. No authentication or authorization code has been added.

## Current development state

- The active focus shifted from authentication to completing the academic API.
- Academic endpoints were added for listing faculties, departments, and programmes; fetching a programme; listing courses with academic filters and pagination; and fetching a course by UUID. Existing university and department endpoints remain.
- Zod validation, not-found behavior, empty-list behavior, response envelopes, pagination metadata, and endpoint documentation were updated.
- API typecheck, API build, and the API test suite passed after these changes. Academic HTTP tests mock Prisma; this does not establish a live PostgreSQL integration check.
- The last inspected Git status showed uncommitted changes in the academic API controller, routes, schemas, and service, `docs/API_DOCUMENTATION.md`, and the new `apps/api/test/academics.test.ts`. Preserve and review these changes before editing.
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

Define and implement authentication, ownership checks, and scoped RBAC before public deployment. Add a malware scanning policy and, when cloud storage is needed, implement the Cloudflare R2 adapter. Preserve owner-reviewed course data; do not silently rewrite the course import.
