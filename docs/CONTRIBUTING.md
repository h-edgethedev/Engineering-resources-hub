# Contributing

Thanks for helping build Engineering Resources Hub. The project is in its foundation phase; changes should stay small, documented and easy for a student contributor to understand.

## Local development

Follow the native setup in the root [README](../README.md). Docker is not required. Use Node.js 24 LTS and a local PostgreSQL 15+ service.

## Working agreements

- Check the product, architecture and database documents before changing project boundaries or data relationships.
- Keep API routes thin; put business rules in module services and validate request input at the boundary.
- Do not add real course seed data until it has been validated by the project owner.
- Do not commit secrets, local `.env` files, database dumps, uploaded documents or generated Prisma output.
- Document new environment variables and keep `.env.example` limited to placeholders.
- Do not include academic documents in the source-code licence; each resource needs its own rights information.

## Before proposing a change

Run the relevant workspace typecheck/build commands and describe what you ran. Add automated tests when the change introduces business behavior. Include migration notes for database changes and update the relevant docs.

