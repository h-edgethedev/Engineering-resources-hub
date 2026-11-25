import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../../config/env.js';

export interface ResourceStorage {
  readonly provider: string;
  put(sourcePath: string, originalFilename: string): Promise<{ storageKey: string }>;
  get(storageKey: string): Promise<Readable>;
  delete(storageKey: string): Promise<void>;
}

class LocalResourceStorage implements ResourceStorage {
  readonly provider = 'local';
  private readonly root = resolve(env.resourceStorageDir);

  async put(sourcePath: string, originalFilename: string) {
    const extension = extname(originalFilename).toLowerCase();
    const storageKey = `${randomUUID()}${extension}`;
    const target = this.pathFor(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(sourcePath, target);
    return { storageKey };
  }

  async get(storageKey: string) {
    const path = this.pathFor(storageKey);
    await stat(path);
    return createReadStream(path);
  }

  async delete(storageKey: string) {
    await rm(this.pathFor(storageKey), { force: true });
  }

  private pathFor(storageKey: string) {
    const path = resolve(this.root, storageKey);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error('Invalid storage key.');
    return path;
  }
}

class R2ResourceStorage implements ResourceStorage {
  readonly provider = 'r2';
  private readonly bucket = env.r2BucketName!;
  private readonly client = new S3Client({
    region: 'auto',
    endpoint: env.r2Endpoint,
    credentials: { accessKeyId: env.r2AccessKeyId!, secretAccessKey: env.r2SecretAccessKey! },
  });

  async put(sourcePath: string, originalFilename: string) {
    const storageKey = `${randomUUID()}${extname(originalFilename).toLowerCase()}`;
    const file = await stat(sourcePath);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      Body: createReadStream(sourcePath),
      ContentLength: file.size,
    }));
    return { storageKey };
  }

  async get(storageKey: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    if (!result.Body) throw new Error('The R2 object response did not contain a file stream.');
    return result.Body as Readable;
  }

  async delete(storageKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}

const storageProviders = new Map<string, ResourceStorage>([['local', new LocalResourceStorage()]]);
if (env.r2Endpoint && env.r2BucketName && env.r2AccessKeyId && env.r2SecretAccessKey) {
  storageProviders.set('r2', new R2ResourceStorage());
}

export function getResourceStorage(provider: string): ResourceStorage {
  const storage = storageProviders.get(provider);
  if (!storage) throw new Error(`Storage provider "${provider}" is not configured.`);
  return storage;
}

export const resourceStorage = getResourceStorage(env.resourceStorageProvider);
