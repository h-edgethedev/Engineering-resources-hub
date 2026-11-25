# Resource file storage

The API supports local filesystem storage for development and Cloudflare R2 for deployments. PostgreSQL stores file metadata and the storage provider/key; file bytes stay outside the database.

## Local development

Local storage is the default. Files are saved under `.data/uploads` in the API working directory, or under `RESOURCE_STORAGE_DIR` if configured. Keep this directory persistent and backed up if it contains files you need.

## Configure Cloudflare R2

1. Create a **private** R2 bucket. Do not enable public access for course materials.
2. Create an R2 S3 API token limited to this bucket with Object Read & Write permission.
3. Set these API environment variables in the deployment secret store:

   ```dotenv
   RESOURCE_STORAGE_PROVIDER=r2
   R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   R2_BUCKET_NAME=engineering-resources
   R2_ACCESS_KEY_ID=<access-key-id>
   R2_SECRET_ACCESS_KEY=<secret-access-key>
   ```

The API connects using the S3-compatible endpoint and `auto` region. Uploads are still authorized and streamed through the API; the R2 bucket does not need public access or browser CORS rules. The file metadata records `r2` as the provider. Existing local files remain readable while the local directory and provider are configured.

## Migrate existing local files

Back up PostgreSQL and the local upload directory first. Configure R2 as above while keeping `RESOURCE_STORAGE_DIR` pointed at the existing local files. Stop all API instances so scheduled purge jobs and file replacements cannot race the migration, then run:

```sh
npm run storage:migrate-r2 --workspace @erh/api
```

The command copies local files to R2 one at a time, checks each copied byte count against the database metadata and verifies a SHA-256 checksum, then updates the file record and any matching Trash purge job in a transaction. It skips records that changed during the copy, stops on storage errors, and retains local source copies so the migration can be rolled back. It is safe to rerun: only records still marked `local` are considered.

After reviewing the output and verifying the application against R2, retain or archive the local backup according to the data retention policy. Do not delete local originals until the migration and backup have been checked.

## Production follow-up

Uploads and reads currently pass through the API. Short-lived presigned upload/download URLs can reduce API bandwidth later, but would need to preserve the existing authorization rules for pending, quarantined, and approved files. Malware scanning, failed-upload cleanup, and an operational alert for missing objects remain separate production hardening work.
