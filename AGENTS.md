# Repository guidance

- Read `PROJECT_CONTEXT.md` and `SESSION_NOTES.md` before substantial changes. Treat session notes as a snapshot and verify them against the current repository and Git state.
- This is the Engineering Resources Hub npm workspaces monorepo. Preserve the existing workspace boundaries: `apps/web`, `apps/api`, and `packages/shared`.
- The initial academic scope is University of Lagos, Faculty of Engineering, with Computer Engineering and Electrical and Electronics Engineering as the first departments. Course-data accuracy is owner validated; do not invent or silently alter catalogue records.
- Follow the existing TypeScript, ESM, Express, React, Prisma, and Zod patterns. Put API routes, controllers, schemas, and services in their existing modules; reflect Prisma schema changes in migrations where appropriate.
- Do not commit credentials, tokens, local `.env` files, generated Prisma output, or other secrets. Use `.env.example` for variable names and placeholders only.
- Avoid overwriting unrelated user changes. Inspect `git status` and relevant files before editing; report pre-existing or unrelated modifications accurately.
- Run relevant workspace typechecks, builds, or tests when requested or needed to verify a change. API tests run from the repository root with `npm run test:api`.
