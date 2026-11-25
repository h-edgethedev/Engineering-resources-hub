# API foundation

The API is an Express 5 REST service. The app composition lives in `apps/api/src/app.ts`; `server.ts` starts the listener, reads validated environment configuration and closes the HTTP server and Prisma client on shutdown. Routes are grouped by module and mounted under `/api/v1`.

## Configuration

Copy `.env.example` to `.env`. Startup validates `NODE_ENV`, `API_PORT`, `WEB_ORIGIN`, PostgreSQL `DATABASE_URL`, resource storage, and email settings with Zod. Set `EMAIL_SMTP_URL` and `EMAIL_FROM` together for SMTP delivery; both are required in production. In development without them, verification links are printed by the API for local testing. Invalid values stop startup with field names and messages; secret values are not printed. JSON request bodies are limited to 1 MB. CORS permits the configured web origin with credentials for session cookies.

## Health endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check; confirms the process can respond |
| `GET` | `/health/live` | Explicit liveness alias |
| `GET` | `/health/ready` | Readiness check that runs `SELECT 1` against PostgreSQL |

The readiness endpoint returns `200` when ready and `503` when the database check fails. It does not reveal database errors or connection details.

## Authentication and role management

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Create an unverified Student account and send a verification link |
| `POST` | `/api/v1/auth/login` | Authenticate and start a session |
| `POST` | `/api/v1/auth/verify-email` | Verify an email using a one-time token and start an authenticated session |
| `POST` | `/api/v1/auth/resend-verification` | Request a new verification link without revealing account existence |
| `GET` | `/api/v1/auth/me` | Get the signed-in account and role grants |
| `GET` | `/api/v1/auth/admin/users` | Search/paginate user accounts and role assignments (Super Administrator only) |
| `GET` | `/api/v1/auth/me/academic-profile` | Get the signed-in user's optional academic profile |
| `PUT` | `/api/v1/auth/me/academic-profile` | Save or clear academic institution and progress selections |
| `GET` | `/api/v1/auth/me/profile` | Get the signed-in user's optional public profile fields |
| `PUT` | `/api/v1/auth/me/profile` | Create or update username and optional profile details |
| `GET` | `/api/v1/auth/me/preferences` | Get the signed-in user's learning preferences |
| `PUT` | `/api/v1/auth/me/preferences` | Save resource, interest, and goal preferences |
| `GET` | `/api/v1/auth/csrf` | Rotate and return a CSRF token after a page reload |
| `POST` | `/api/v1/auth/logout` | Revoke the current server-side session |
| `POST` | `/api/v1/auth/admin/users/:userId/roles` | Grant a scoped role if permitted |
| `DELETE` | `/api/v1/auth/admin/role-assignments/:grantId` | Revoke a scoped role if permitted |

Registration requires `email`, `displayName`, and a password of at least 12 characters and at most 72 UTF-8 bytes. Passwords are bcrypt-hashed. New users must verify their email before login; verification links expire after 30 minutes and are single-use. Only a hash of each verification token is stored. Existing users are marked verified by the migration, and the bootstrap Super Administrator is created verified. Login sessions use random opaque tokens in an HTTP-only, SameSite=Lax cookie; only the token hash is stored in PostgreSQL. Login and registration are limited to 10 attempts per IP per 15 minutes; verification requests have a separate in-memory limit. Configure a shared rate-limit store before running multiple API instances.

The CSRF token is returned by login and can be refreshed from `/auth/csrf`. Registration does not create a session until email verification; successful verification starts a session and the web app proceeds to onboarding. Send the CSRF token in the `X-CSRF-Token` header with every signed-in POST, PUT, PATCH, or DELETE request. The browser must send credentials. Production session and CSRF cookies use the `Secure` attribute.

Academic profile fields are optional and may be set to `null`. `PUT /auth/me/academic-profile` accepts `universityId`, `facultyId`, `departmentId`, `programmeId`, `currentLevelId`, and `currentSemesterId`. The API verifies each selected record belongs to its selected parent. A faculty requires a university; department, programme, level, and semester selections require their preceding parent. The endpoint returns `422 INVALID_ACADEMIC_PROFILE` for mismatched existing records and `400 VALIDATION_ERROR` for structurally incomplete selections. Academic profiles do not gate public browsing or resource downloads.

The profile username is required, normalized to lowercase, must be 3–30 characters using letters, numbers, or underscores, and is unique. Avatar URLs require HTTPS; GitHub and LinkedIn URLs must use their respective domains. Bios are limited to 280 characters. Preference selections are validated against server-defined resource-kind, learning-interest, and learning-goal enums. Other profile fields and preferences are optional. All profile and preference updates require authentication and a CSRF token.

New accounts receive the Student role after signup and must verify their email before signing in. Students, Contributors, and Super Administrators may submit resources; submissions remain private and pending until moderated. A University Administrator can grant Moderator or Contributor roles inside their own university. Only a Super Administrator can grant University Administrator or Super Administrator roles. Privileged role grants require the target account to have a verified email. Super Administrators manage users and roles through the user administration API and web workspace. Guest is anonymous public access, not an account role. The first Super Administrator is created from the repository root with `npm run auth:bootstrap-admin`, with `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` set only in that command's process environment. Never commit or add bootstrap credentials to `.env.example`.

## Academic endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/universities` | List active universities |
| `GET` | `/api/v1/universities/:slug` | Get a university with faculties and departments |
| `GET` | `/api/v1/universities/:universitySlug/faculties` | List faculties in an active university |
| `GET` | `/api/v1/universities/:universitySlug/faculties/:facultySlug/departments` | List departments in a faculty |
| `GET` | `/api/v1/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug` | Get department programmes, levels, semesters, courses and university-wide GET courses |
| `GET` | `/api/v1/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug/programmes` | List active programmes and levels in a department |
| `GET` | `/api/v1/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug/programmes/:programmeSlug` | Get a programme with levels, semesters and active courses |
| `GET` | `/api/v1/courses` | Search active courses with academic filters and pagination |
| `GET` | `/api/v1/courses/:courseId` | Get an active course by UUID, including programme and offerings |

## Resource endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/resources` | Create a resource in `PENDING` status |
| `GET` | `/api/v1/resources` | Search resource/course metadata; filter by course, type, status, session, or semester; paginate |
| `GET` | `/api/v1/resources/:resourceId` | Get a resource and its course/file metadata |
| `PATCH` | `/api/v1/resources/:resourceId` | Update resource metadata or academic context |
| `DELETE` | `/api/v1/resources/:resourceId` | Super Administrator only; move the resource into Trash with a required reason |
| `GET` | `/api/v1/resources/:resourceId/file` | View the stored file inline |
| `GET` | `/api/v1/resources/:resourceId/file/download` | Download the stored file as an attachment |
| `POST` | `/api/v1/resources/:resourceId/moderation` | Approve or reject a pending resource within moderator scope; Super Admin may approve their own upload |
| `POST` | `/api/v1/resources/:resourceId/file` | Super Administrator only; replace the stored file |
| `POST` | `/api/v1/resources/:resourceId/deletion-requests` | Submit a reasoned deletion request for moderator review |
| `GET` | `/api/v1/resources/governance/deletion-requests` | List scoped deletion requests (Super Administrator: platform-wide) |
| `GET` | `/api/v1/resources/governance/inbox` | Get pending governance items and counts not yet seen by the signed-in reviewer |
| `POST` | `/api/v1/resources/governance/inbox/seen` | Mark the current governance inbox as seen for this reviewer |
| `POST` | `/api/v1/resources/governance/deletion-requests/:requestId/decision` | Super Administrator only; approve or reject a request, including their own |
| `POST` | `/api/v1/resources/:resourceId/reports` | Submit an authenticated report about a published resource |
| `GET` | `/api/v1/resources/governance/reports` | List reports in the caller's governance scope |
| `POST` | `/api/v1/resources/governance/reports/:reportId/decision` | Resolve or dismiss a report |
| `GET` | `/api/v1/resources/governance/trash` | List trashed resources in the caller's scope |
| `POST` | `/api/v1/resources/:resourceId/restore` | Restore a trashed resource, subject to file, course, and duplicate checks |
| `POST` | `/api/v1/resources/:resourceId/quarantine` | Immediately hide a resource pending investigation |
| `POST` | `/api/v1/resources/:resourceId/purge` | Super Administrator only; permanently purge with confirmation and reason |
| `GET` | `/api/v1/resources/:resourceId/history` | Read resource governance and moderation history |
| `POST` | `/api/v1/resources/:resourceId/quarantine/clear` | Clear a quarantine after review |

Create uses `multipart/form-data` with one `file` field and the `courseId`, `title`, and `type` fields. Optional text fields are `description`, `academicSessionId`, and `semesterId`. Supported file formats are PDF, legacy and OpenXML Word/PowerPoint/Excel documents, and plain text. The API checks the filename extension and declared media type, then checks file signatures for PDF and office documents. Uploads default to a 20 MiB limit; configure `RESOURCE_MAX_FILE_SIZE_BYTES` to change it (maximum 100 MiB). The local storage directory defaults to `.data/uploads` in the API working directory and can be changed with `RESOURCE_STORAGE_DIR`. Storage keys are generated by the API and are not accepted from clients. Resource types are `LECTURE_NOTE`, `TEXTBOOK`, `PAST_QUESTION`, `SOLUTION`, `LAB_MANUAL`, `PROGRAMMING_EXERCISE`, and `OTHER`. If a session or semester is supplied, it must match an offering for the selected course. New resources are always `PENDING`; the CRUD API does not accept approval status changes. Resource removal now moves the item into Trash and retains its binary for recovery; permanent deletion is a separate Super Administrator action.

The storage provider is behind a `ResourceStorage` interface. Local filesystem storage is the development default; set `RESOURCE_STORAGE_PROVIDER=r2` and configure `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` to use Cloudflare R2. Keep the bucket private and scope its API token to that bucket. Files are streamed through the API, and each file record tracks its provider so local and R2 objects can coexist during migration. See [Resource file storage](STORAGE.md) for setup and the verified local-to-R2 migration command. Files are streamed for inline viewing or attachment downloads. Guests see only approved resources. Trashed and quarantined resources are excluded from public discovery and downloads. Signed-in users can access approved resources and their own submissions; moderators and administrators can access records in their university scope. Students, Contributors and Super Administrators can upload; owners can maintain their submissions; moderators can approve/reject pending resources in their university but cannot self-approve. Super Administrators can approve their own uploads and their own deletion requests. Moderators can submit deletion requests, while Super Administrators decide them. Governance changes are audited; trash is recoverable until purge. Expired trash is processed by the API's scheduled purge worker (`RESOURCE_PURGE_INTERVAL_MS`, default 24 hours), with failed jobs retained for retry. The reviewer notification inbox combines pending uploads, deletion requests, and open reports, and stores a per-user last-viewed timestamp so its badge counts newly arrived work. Cookie-authenticated mutations require CSRF tokens. The web app includes public Explore/Search, university/course/resource detail pages, governance workspaces for deletion requests, reports, Trash, quarantine and history, plus Super Administrator user/role management and resource submission. Account recovery and malware scanning are not implemented yet.

Route parameters, academic profile selections, and course query filters are validated with Zod. Course filters can be combined: `university`, `faculty`, `department`, `q` (course code, title, or description), `level` (three digits, such as `100`), `session` (`YYYY/YYYY`) and `semester` (semester code). Department-filtered results include GET-coded general engineering courses from the same university while retaining each course's catalogue programme relationship. Pagination uses `page` (default `1`) and `pageSize` (default `20`, maximum `100`). For example: `/api/v1/courses?university=university-of-lagos&department=computer-engineering&level=100`.

Resource list filters accept `q` (resource title, description, course code, or course title), `courseId`, `type`, `status`, `academicSessionId`, and `semesterId`; pagination uses the same `page` and `pageSize` limits. Signed-in users can request `mine=true` to restrict results to resources they uploaded. Reviewer interfaces may request `reviewQueue=true`, which requires a Moderator or Super Administrator session and returns only pending submissions within that user's visibility scope, excluding their own submissions. Guest queries only return approved resources regardless of a requested status.

List endpoints return `200` with `data: []` when there are no matching records. Course lists also include `meta` with `page`, `pageSize`, `total` and `totalPages`. A malformed slug, UUID, filter or pagination value returns `400 VALIDATION_ERROR`; a valid identifier that does not resolve to a record (including a missing parent in a nested path) returns `404` with a resource-specific error code. Controllers translate service results into HTTP responses; services contain Prisma queries.

## Response format

Successful responses use `{ "data": ... }`. Errors use `{ "error": { "code": "...", "message": "...", "details": ... } }`. Validation details include only field paths and messages, not rejected values. Unhandled errors return a generic 500 response.

## Tests

Run API endpoint tests from the repository root with `npm run test:api`. The HTTP academic endpoint tests mock Prisma, so they verify route behavior, validation, response shapes, filters and not-found/empty behavior without requiring PostgreSQL. The readiness check also has an injected database health check.
