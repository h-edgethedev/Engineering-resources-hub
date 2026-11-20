# Session notes

Updated: 2026-11-20

## Resource API milestone

- Added Prisma `Resource` and one-to-one `ResourceFile` models with a migration. Resources reference a course and can optionally reference an academic session and semester; provided academic context is checked against the course's offerings.
- Added `POST`, `GET` list/detail, `PATCH`, and `DELETE` under `/api/v1/resources`, with input validation, filtering, pagination, standard errors, and resource file metadata.
- New resources are always `PENDING`; create/update bodies reject client-supplied status, leaving approval actions for an authorized moderation workflow.
- The API stores file metadata and a provider/storage key only. It does not upload or delete binary files. Resource routes currently have no authentication/authorization, so they are not ready for public deployment.
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

## Next logical development task

Apply and verify the new resource migration against the configured PostgreSQL database, then exercise resource creation, retrieval, updates, deletes, course-offering context checks, and list filters against real seeded data. Before production use, select and implement file storage/upload lifecycle and add authentication, ownership checks, and RBAC-aware moderation so only authorized moderators can approve/reject resources. Automated API tests mock Prisma and do not replace that integration/security work.

If the database is unavailable or course data still needs owner review, resolve that prerequisite with the project owner and continue using the mocked tests meanwhile. Do not silently rewrite the course import data.
