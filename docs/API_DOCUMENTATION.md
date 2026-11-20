# API foundation

The API is an Express 5 REST service. The app composition lives in `apps/api/src/app.ts`; `server.ts` starts the listener, reads validated environment configuration and closes the HTTP server and Prisma client on shutdown. Routes are grouped by module and mounted under `/api/v1`.

## Configuration

Copy `.env.example` to `.env`. Startup validates `NODE_ENV`, `API_PORT`, `WEB_ORIGIN` and a PostgreSQL `DATABASE_URL` with Zod. Invalid values stop startup with field names and messages; secret values are not printed. JSON request bodies are limited to 1 MB. CORS permits the configured web origin.

## Health endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check; confirms the process can respond |
| `GET` | `/health/live` | Explicit liveness alias |
| `GET` | `/health/ready` | Readiness check that runs `SELECT 1` against PostgreSQL |

The readiness endpoint returns `200` when ready and `503` when the database check fails. It does not reveal database errors or connection details.

## Academic endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/universities` | List active universities |
| `GET` | `/api/v1/universities/:slug` | Get a university with faculties and departments |
| `GET` | `/api/v1/universities/:universitySlug/faculties` | List faculties in an active university |
| `GET` | `/api/v1/universities/:universitySlug/faculties/:facultySlug/departments` | List departments in a faculty |
| `GET` | `/api/v1/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug` | Get department programmes, levels, semesters and courses |
| `GET` | `/api/v1/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug/programmes` | List active programmes and levels in a department |
| `GET` | `/api/v1/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug/programmes/:programmeSlug` | Get a programme with levels, semesters and active courses |
| `GET` | `/api/v1/courses` | Search active courses with academic filters and pagination |
| `GET` | `/api/v1/courses/:courseId` | Get an active course by UUID, including programme and offerings |

Route parameters and course query filters are validated with Zod. Course filters can be combined: `university`, `faculty`, `department`, `level` (three digits, such as `100`), `session` (`YYYY/YYYY`) and `semester` (semester code). Pagination uses `page` (default `1`) and `pageSize` (default `20`, maximum `100`). For example: `/api/v1/courses?university=university-of-lagos&department=computer-engineering&level=100`.

List endpoints return `200` with `data: []` when there are no matching records. Course lists also include `meta` with `page`, `pageSize`, `total` and `totalPages`. A malformed slug, UUID, filter or pagination value returns `400 VALIDATION_ERROR`; a valid identifier that does not resolve to a record (including a missing parent in a nested path) returns `404` with a resource-specific error code. Controllers translate service results into HTTP responses; services contain Prisma queries.

## Response format

Successful responses use `{ "data": ... }`. Errors use `{ "error": { "code": "...", "message": "...", "details": ... } }`. Validation details include only field paths and messages, not rejected values. Unhandled errors return a generic 500 response.

## Tests

Run API endpoint tests from the repository root with `npm run test:api`. The HTTP academic endpoint tests mock Prisma, so they verify route behavior, validation, response shapes, filters and not-found/empty behavior without requiring PostgreSQL. The readiness check also has an injected database health check.
