# Architecture: Engineering Resources Hub

## 1. Architectural direction

Use a TypeScript monorepo organized as a modular monolith. The web client and REST API are separate deployable applications, but share a small package of API contracts and validation primitives. The API owns business rules, authorization, persistence and storage coordination. PostgreSQL is the source of truth for academic structure and resource metadata; PDF bytes live in local development storage or Cloudflare R2.

This keeps the first release understandable and deployable without the operational cost of microservices. Modules can be extracted later only if scale or team boundaries justify it.

## 2. Proposed repository layout

```text
apps/
  web/                         React, TypeScript, Vite, Tailwind, Router, TanStack Query
  api/                         Express, TypeScript, REST API
    src/
      modules/                 auth, users, academics, resources, community, moderation, search, admin
      middleware/              auth, authorization, validation, error handling, rate limits
      infrastructure/           config, database, storage, logging
      app.ts                    Express composition
      server.ts                 process entry point
packages/
  shared/                      API schemas/types; no server secrets or browser-specific code
docs/
  PRODUCT_REQUIREMENTS.md
  ARCHITECTURE.md
  DATABASE_DESIGN.md
.github/
  workflows/
  ISSUE_TEMPLATE/
```

Each API module should keep routes/controllers thin and delegate business rules to services. Data access should be explicit through Prisma and service-level queries; avoid generic repository layers that only wrap Prisma. Validate request boundaries with Zod. Use a centralized error handler and a stable response format, for example `{ data, meta }` on success and `{ error: { code, message, details? } }` on failure.

## 3. Request and upload flows

### Standard API request

```text
Browser -> React route/component -> TanStack Query -> REST API
        -> validation/auth middleware -> module route/controller -> service
        -> Prisma/PostgreSQL -> response serializer -> browser
```

Business authorization belongs in API middleware and service checks, with resource ownership and moderation state checked close to the operation.

### Resource file workflow

The storage interface currently provides `put`, `get` and `delete`. Local filesystem storage is the development default; the Cloudflare R2 adapter uses the S3-compatible API and keeps bucket access private. The API continues to authorize and proxy file bytes, which keeps existing moderation and ownership checks in force. Short-lived presigned URLs may be added later to reduce API bandwidth, with a separate authorization design for pending and quarantined resources.

For either provider, the API first validates user, metadata and upload policy, reserves a unique key, then verifies the object before committing the resource record as pending. Failures should clean up unreferenced objects or mark the reservation for retryable cleanup. Approved resources alone receive public read access. Pending and rejected content stays private. A production launch requires a concrete malware scanning and quarantine strategy; a PDF signature check is not malware scanning.

## 4. Key technology responsibilities

| Concern | Choice | Boundary |
|---|---|---|
| Web | React + TypeScript + Vite | UI, navigation, API client, PDF.js viewer |
| Server | Node.js + Express + TypeScript | REST endpoints, sessions, policy and business logic |
| Contracts | Zod + shared TypeScript package | Validate inputs and keep browser/API shapes aligned |
| Database | PostgreSQL + Prisma | Relational data, migrations and queries |
| Authentication | Opaque server-side sessions in HTTP-only cookies | Revocation and role checks remain server-controlled |
| Development files | Local filesystem adapter | Ignored local upload directory; never committed |
| Production files | Cloudflare R2 via S3-compatible SDK | Private bucket; API-authorized streaming |
| Search | PostgreSQL indexes and text search initially | Search module isolates implementation for later evolution |
| API reference | OpenAPI/Swagger | Generated or maintained from API contracts |

## 5. Dependency foundation

Use current stable releases compatible with the selected Node.js LTS and pin them through the lockfile. At foundation setup, establish only the essentials: `react`, `react-dom`, `typescript`, `vite`, `tailwindcss`, `react-router-dom`, `@tanstack/react-query`, `express`, `zod`, `prisma`, `@prisma/client`, and development tooling for type checks and linting. Add the S3-compatible SDK, session store, password hashing, PDF.js, OpenAPI and test packages in the milestone where their behavior is implemented. Avoid choosing versions in this planning document because compatibility should be checked at installation time.

Use npm workspaces unless the project has a concrete need for another package manager. Root scripts should orchestrate app scripts (for example `dev:web`, `dev:api`, `typecheck`, `lint`) without requiring containers. PostgreSQL remains a native local service.

## 6. Security and operations

- Centralize validated environment configuration and fail fast on missing required production settings.
- Store only password hashes; use secure cookie attributes in production and rotate session IDs after authentication/privilege changes.
- Protect state-changing cookie-authenticated endpoints against CSRF; configure CORS to known origins.
- Apply rate limits to authentication, uploads and reporting; avoid logging passwords, cookies, signed URLs or document contents.
- Use Prisma parameterized operations; validate and bound pagination, sorting and filter inputs.
- Set upload size and request time limits. Check PDF signatures and metadata, and serve downloads with safe content disposition and content type.
- Keep storage private by default. Presigned links must be short-lived and generated only after current authorization checks.
- Use migrations as the schema change mechanism and document backup/restore expectations before production.
- CI should install from the lockfile, typecheck, lint and run tests. Deployment remains a later phase.

## 7. Native development

Install a supported Node.js LTS and PostgreSQL natively. Copy `.env.example` to an untracked `.env`, create a local database/user, install workspace dependencies, run Prisma migrations, then start API and web processes with npm scripts. No Docker service is part of the required workflow. Exact setup commands belong in the root README once the package layout and chosen versions exist.

## 8. Architectural risks and decisions to settle

1. **Copyright and takedowns:** a contributor declaration is not enough on its own. Define rights metadata, reporting, review, takedown and appeal procedures before accepting public contributions.
2. **Malware scanning:** signature/MIME checks only validate file shape. Select a scanning/quarantine service or operational process before production uploads.
3. **Academic structure variance:** the first rollout targets the Computer Engineering and Electrical and Electronics Engineering departments within UNILAG's Faculty of Engineering, but the hierarchy must remain institution-configurable. Confirm programme labels and validate the proposed schema against UNILAG's structure before committing migrations; the project owner will validate course data. Use a second university as a portability check before expanding rollout.
4. **Session deployment:** server-side sessions need a shared durable store when API instances scale beyond one process. Choose a PostgreSQL-backed or compatible store before horizontal scaling.
5. **Upload consistency:** object storage and PostgreSQL do not share a transaction. Use upload reservations, idempotent verification and cleanup jobs to handle partial failures.
6. **Moderation and privacy:** define retention for reports, comments and access history, plus audit permissions, before those features are broadly enabled.
7. **Search expectations:** PostgreSQL is a sound MVP start, but Nigerian course naming, typo tolerance and language/content quality should be evaluated with real data.

