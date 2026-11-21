import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
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

export const resourceStorage: ResourceStorage = new LocalResourceStorage();
