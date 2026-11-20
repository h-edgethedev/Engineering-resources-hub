# Project context

## Purpose and scope

Engineering Resources Hub (EngHub) is an open academic resource platform. Its first catalogue is for the University of Lagos (UNILAG), within the official Faculty of Engineering. The initial departments are Computer Engineering and Electrical and Electronics Engineering. The project owner validates course data; the seed/import workflow currently loads a reviewed Computer Engineering course CSV.

The repository is an npm workspaces monorepo and requires Node.js 24 or newer. The root package provides scripts for development, typechecking, builds, API tests, and Prisma database tasks.

## Workspace structure

- `apps/web`: React 19, TypeScript, Vite 7, React Router 7, TanStack Query, Tailwind CSS 4. The current UI loads UNILAG and its departments through the API. Search is not connected yet; the course and resource areas currently show placeholder/empty states. Authentication and uploads are not implemented.
- `apps/api`: Express 5 and TypeScript REST API, mounted at `/api/v1`. Zod validates environment configuration and request data. The API has health/readiness checks, centralized error handling, and academic endpoints.
- `packages/shared`: small TypeScript package exposed as `@erh/shared`; inspect its source before assuming what it exports.

Root commands include `npm run dev:web`, `npm run dev:api`, `npm run typecheck`, `npm run build`, `npm run test:api`, and `npm run db:{generate,migrate,seed,studio}`.

## API behavior currently in the repository

- Health: `GET /health`, `/health/live`, `/health/ready`.
- Academic data: list universities; fetch a university with its faculty/department hierarchy; list faculties, departments, and programmes; fetch department/programme details; list courses with university, faculty, department, level, session, semester, and pagination filters; fetch a course by UUID.
- Resource metadata: create, list/filter, retrieve, update, and delete course-linked resources. Resource types and approval statuses are modeled; newly created resources begin in `PENDING` status.
- Success responses use a `data` property; course lists also return pagination `meta`. Errors use an `error` object with a code and message.
- `apps/api/test` contains HTTP-level tests. Academic route tests mock Prisma so they do not require PostgreSQL.

## Proposed access control (not implemented)

The product owner has proposed six roles for a future role-based access control system: Super Administrator (platform-wide), University Administrator (scoped to one university), Moderator (scoped content review), Contributor (submits and maintains own resources), Student (registered community/resource access), and Guest (public access without an account). The intended responsibilities include managing users and academic catalogues at the appropriate scope; reviewing and moderating resources; and giving students and guests access to approved public materials. Contributors must not gain approval authority over their own submissions by virtue of contribution status. A student should not need contributor status to access resources.

This is a product proposal only. Authentication, user accounts, role/permission storage, authorization middleware, resource workflows, and enforcement are not currently implemented. Before implementation, define the permission matrix, university/faculty scope boundaries, role assignment rules, and how overlapping roles and resource ownership are handled. Guests describe public access behavior and may not need to be persisted as user accounts.

## Data and database

Prisma is configured for PostgreSQL. The schema is in `apps/api/prisma/schema.prisma`; the generated client is configured at `apps/api/src/generated/prisma` and that generated directory is ignored by Git. The database adapter is `@prisma/adapter-pg` with `pg` and reads `DATABASE_URL`.

The implemented schema contains `University`, `Faculty`, `Department`, `Programme`, `ProgrammeLevel`, `Semester`, `AcademicSession`, `ProgrammeSession`, `Course`, `CourseOffering`, `Resource`, and `ResourceFile`. Resource records reference a course and optionally an academic session and semester; file metadata records a provider and storage key. The resource API does not upload, download, or remove external binary files. Its new migration is under `apps/api/prisma/migrations/`. `apps/api/prisma/seed.ts` imports `docs/COMPUTER_ENGINEERING_COURSE_REVIEW.csv`, validates 36 Computer Engineering offerings for 100 and 200 Level, and upserts the UNILAG hierarchy. It also creates the Electrical and Electronics Engineering department, but current imported course rows target Computer Engineering.

Environment configuration uses `DATABASE_URL`, `API_PORT`, `WEB_ORIGIN`, and `NODE_ENV`. `.env.example` documents placeholders. Local `.env` files may exist and are ignored by Git; never copy their values into project notes or source control.

## Product and design references

Useful references include `README.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, and `docs/API_DOCUMENTATION.md`. Some documents describe proposals or future work; check the Prisma schema and application code to determine what is implemented.
