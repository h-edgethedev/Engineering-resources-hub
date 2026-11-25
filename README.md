# Engineering Resources Hub

An open-source academic resource platform launching at the University of Lagos (UNILAG). The initial departments are Computer Engineering and Electrical and Electronics Engineering within the Faculty of Engineering. The project owner will validate course data before it is added.

The platform is being built incrementally. The current implementation includes the UNILAG academic API, local file uploads with optional Cloudflare R2 storage, moderation and governance workflows, role authorization, email-verified accounts, public course/resource discovery, and web resource submission. Account recovery and malware scanning remain in progress.

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

5. Seed the agreed UNILAG academic hierarchy and the owner-confirmed Computer Engineering offerings for 100 and 200 Level:

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
| `npm run db:seed` | Insert or update UNILAG structure and Computer Engineering course offerings |
| `npm run db:studio` | Open Prisma Studio |
| `npm run test:api` | Run Express endpoint and health-check tests |

## Project documents

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database design](docs/DATABASE_DESIGN.md)
- [API documentation](docs/API_DOCUMENTATION.md)
- [Resource file storage](docs/STORAGE.md)
- [MIT License](LICENSE) (applies to software, not uploaded academic documents)

## Current milestone

The web app supports public discovery, registration with email verification, login, account sessions, resource submissions, moderation queues, and resource governance. In development, verification links appear in the API console unless SMTP is configured. Production requires `EMAIL_SMTP_URL` and `EMAIL_FROM`. See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for the development workflow.
