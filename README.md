# Engineering Resources Hub

An open-source academic resource platform launching at the University of Lagos (UNILAG). The initial departments are Computer Engineering and Electrical and Electronics Engineering within the Faculty of Engineering. The project owner will validate course data before it is added.

The platform is being built incrementally. This foundation provides a native-development TypeScript monorepo and the first academic-structure database schema. Authentication, uploads and other product workflows are not implemented yet.

## Requirements

- Node.js 24 LTS (see `.nvmrc`) and npm.
- PostgreSQL 15 or newer installed and running locally.
- No Docker or Docker Desktop required.

## Local setup

1. Create a local PostgreSQL database named `engineering_resources_hub` and a user/password with access to it.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to match your local PostgreSQL user and password.
3. Install dependencies from the repository root:

   ```sh
   npm install
   ```

4. Generate the Prisma client and apply the initial migration:

   ```sh
   npm run db:generate
   npm run db:migrate
   ```

5. Add the agreed UNILAG academic hierarchy (university, faculty and two departments; no courses are inserted):

   ```sh
   npm run db:seed
   ```

6. Start the API and web app in separate terminals:

   ```sh
   npm run dev:api
   npm run dev:web
   ```

The API health endpoint is `http://localhost:4000/health`; the web app runs at `http://localhost:5173`.

## Workspace commands

| Command | Purpose |
|---|---|
| `npm run dev:web` | Start Vite development server |
| `npm run dev:api` | Start Express development server |
| `npm run typecheck` | Type-check all workspaces |
| `npm run build` | Build shared package, API and web app |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Create/apply a local development migration |
| `npm run db:seed` | Insert or update the agreed initial UNILAG structure |
| `npm run db:studio` | Open Prisma Studio |

## Project documents

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database design](docs/DATABASE_DESIGN.md)
- [MIT License](LICENSE) (applies to software, not uploaded academic documents)

## Current milestone

Phase 1 establishes project structure, local development, and the initial academic hierarchy. No login, file upload, moderation UI or production storage workflow is available yet. See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for the development workflow.
