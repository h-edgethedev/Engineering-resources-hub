# Project context

## Purpose and scope

Engineering Resources Hub (EngHub) is an open academic resource platform. Its first catalogue is for the University of Lagos (UNILAG), within the official Faculty of Engineering. The initial departments are Computer Engineering and Electrical and Electronics Engineering. The project owner validates course data; the seed/import workflow currently loads a reviewed Computer Engineering course CSV.

The repository is an npm workspaces monorepo and requires Node.js 24 or newer. The root package provides scripts for development, typechecking, builds, API tests, and Prisma database tasks.

## Workspace structure

- `apps/web`: React 19, TypeScript, Vite 7, React Router 7, TanStack Query, Tailwind CSS 4. The UI loads UNILAG and its departments through the API and includes registration, email verification, login, sign-out, session restoration, a protected account page, and resource submission for Student, Contributor, and Super Administrator accounts. Search and moderation review screens are not connected yet.
- `apps/api`: Express 5 and TypeScript REST API, mounted at `/api/v1`. Zod validates environment configuration and request data. The API has health/readiness checks, centralized error handling, academic endpoints, email-verified cookie-based authentication, role grants, resource ownership checks, and moderation authorization.
- `packages/shared`: small TypeScript package exposed as `@erh/shared`; inspect its source before assuming what it exports.

Root commands include `npm run dev:web`, `npm run dev:api`, `npm run typecheck`, `npm run build`, `npm run test:api`, `npm run db:{generate,migrate,seed,studio}`, and `npm run auth:bootstrap-admin`.

## API behavior currently in the repository

- Health: `GET /health`, `/health/live`, `/health/ready`.
- Academic data: list universities; fetch a university with its faculty/department hierarchy; list faculties, departments, and programmes; fetch department/programme details; list courses with university, faculty, department, level, session, semester, and pagination filters; fetch a course by UUID.
- Resources: create, list/filter, retrieve, update, and delete course-linked resources. Creation accepts validated multipart file uploads; local development storage, inline viewing, and download endpoints are implemented. New resources begin in `PENDING` status.
- Authentication: registration sends a one-time email verification link; verified users can log in and use current-user/CSRF/logout endpoints backed by bcrypt password hashes and opaque server-side sessions in HTTP-only cookies. Students, Contributors, and Super Administrators can submit; public resource access is limited to approved items; role assignment and moderation are scoped to the user's grants.
- Success responses use a `data` property; course lists also return pagination `meta`. Errors use an `error` object with a code and message.
- `apps/api/test` contains HTTP-level tests. Academic route tests mock Prisma so they do not require PostgreSQL.

## Access control

The initial six-role access policy is documented in `docs/AUTHORIZATION_POLICY.md`: Super Administrator (platform-wide), University Administrator (one university), Moderator (all of one university), Contributor (university-scoped resource contribution), Student (registered user who may submit resources), and Guest (anonymous public access). API enforcement is implemented for email-verified authentication, sessions, role grants, approved-only public visibility, uploader ownership, university-wide moderation, and self-moderation prevention. The web app supports registration, email verification, login, session restoration, sign-out, a protected account page, and resource submission. `Guest` is not a stored role. Password recovery, account suspension workflows, academic-structure write APIs, and moderation review screens are not yet implemented.

## Data and database

Prisma is configured for PostgreSQL. The schema is in `apps/api/prisma/schema.prisma`; the generated client is configured at `apps/api/src/generated/prisma` and that generated directory is ignored by Git. The database adapter is `@prisma/adapter-pg` with `pg` and reads `DATABASE_URL`.

The implemented schema contains the academic models, `User`, `RoleAssignment`, `AuthSession`, `EmailVerificationToken`, `Resource`, `ResourceFile`, and `ModerationAction`. Resources reference a course, optionally an academic session and semester, and optionally a legacy-nullable uploader for pre-auth records. File metadata records a provider and storage key. Binary files use the `ResourceStorage` interface with local development storage in `.data/uploads` by default; Cloudflare R2 support is future work. Migration `20261122040000_add_email_verification` is applied to the configured local PostgreSQL database. `apps/api/prisma/seed.ts` imports `docs/COMPUTER_ENGINEERING_COURSE_REVIEW.csv`, validates 36 Computer Engineering offerings for 100 and 200 Level, and upserts the UNILAG hierarchy. It also creates the Electrical and Electronics Engineering department, but current imported course rows target Computer Engineering.

Environment configuration uses `DATABASE_URL`, `API_PORT`, `WEB_ORIGIN`, `NODE_ENV`, `RESOURCE_STORAGE_DIR`, and `RESOURCE_MAX_FILE_SIZE_BYTES`. Email verification uses `EMAIL_SMTP_URL` and `EMAIL_FROM`; production requires both, while development prints links to the API console if they are omitted. `.env.example` documents placeholders. Bootstrap admin credentials are runtime-only `BOOTSTRAP_ADMIN_*` variables for the one-time command; never store them in `.env.example`, notes, or source control.

## Product and design references

Useful references include `README.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, and `docs/API_DOCUMENTATION.md`. Some documents describe proposals or future work; check the Prisma schema and application code to determine what is implemented.
