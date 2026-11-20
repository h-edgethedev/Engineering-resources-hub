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
| `GET` | `/api/v1/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug` | Get department programmes, levels, semesters and courses |

Route parameters are validated with Zod before controller logic runs. Controllers translate service results into HTTP responses; services contain Prisma queries.

## Response format

Successful responses use `{ "data": ... }`. Errors use `{ "error": { "code": "...", "message": "...", "details": ... } }`. Validation details include only field paths and messages, not rejected values. Unhandled errors return a generic 500 response.

## Tests

Run API endpoint tests from the repository root with `npm run test:api`. Tests use an injected database health check so they do not require PostgreSQL. Academic database-backed success responses still require a running PostgreSQL instance and seeded data.
