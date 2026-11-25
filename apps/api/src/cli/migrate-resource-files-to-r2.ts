import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { prisma } from '../infrastructure/database.js';
import { getResourceStorage } from '../modules/resources/storage.js';

async function main() {
  const localStorage = getResourceStorage('local');
  const r2Storage = getResourceStorage('r2');
  const files = await prisma.resourceFile.findMany({ where: { provider: 'local' } });
  let migrated = 0;
  let skipped = 0;

  for (const file of files) {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'enghub-r2-migration-'));
    const tempPath = join(tempDirectory, 'resource-file');
    let newStorageKey: string | undefined;
    try {
      const localHash = createHash('sha256');
      const localStream = await localStorage.get(file.storageKey);
      localStream.on('data', (chunk: Buffer) => localHash.update(chunk));
      await pipeline(localStream, createWriteStream(tempPath));
      const expectedHash = localHash.digest('hex');
      const sourceStat = await stat(tempPath);
      if (sourceStat.size !== file.byteSize) throw new Error(`Local file size mismatch for resource ${file.resourceId}.`);

      const stored = await r2Storage.put(tempPath, file.originalFilename);
      newStorageKey = stored.storageKey;
      let verifiedBytes = 0;
      const verifiedHash = createHash('sha256');
      for await (const chunk of await r2Storage.get(newStorageKey)) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        verifiedBytes += bytes.byteLength;
        verifiedHash.update(bytes);
      }
      if (verifiedBytes !== file.byteSize) throw new Error(`R2 verification size mismatch for resource ${file.resourceId}.`);
      if (verifiedHash.digest('hex') !== expectedHash) throw new Error(`R2 verification checksum mismatch for resource ${file.resourceId}.`);

      const changed = await prisma.$transaction(async (tx) => {
        const result = await tx.resourceFile.updateMany({
          where: { id: file.id, provider: 'local', storageKey: file.storageKey },
          data: { provider: 'r2', storageKey: newStorageKey! },
        });
        if (result.count !== 1) return false;
        await tx.resourcePurgeJob.updateMany({
          where: { resourceIdSnapshot: file.resourceId, provider: 'local', storageKey: file.storageKey, status: { in: ['PENDING', 'RETRY', 'PROCESSING'] } },
          data: { provider: 'r2', storageKey: newStorageKey! },
        });
        return true;
      });

      if (!changed) {
        await r2Storage.delete(newStorageKey);
        newStorageKey = undefined;
        skipped += 1;
        console.info(`Skipped changed resource file ${file.resourceId}.`);
        continue;
      }

      migrated += 1;
      console.info(`Migrated resource file ${file.resourceId}.`);
      // Keep the local copy for rollback; remove it only after the R2 migration is verified.
    } catch (error) {
      if (newStorageKey) await r2Storage.delete(newStorageKey).catch(() => undefined);
      throw error;
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  console.info(`R2 migration complete: ${migrated} migrated, ${skipped} skipped. Local copies were retained.`);
}

main().catch((error: unknown) => {
  console.error('R2 file migration failed.', error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
