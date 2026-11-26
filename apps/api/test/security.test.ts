import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  emailVerificationToken: { findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  authSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../src/infrastructure/database.js', () => ({ prisma: db }));
const { createApp } = await import('../src/app.js');

const servers: Server[] = [];

async function request(path: string, init?: RequestInit) {
  const server = createApp({ databaseHealthCheck: async () => undefined }).listen(0);
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, init);
}

const json = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('authentication rate limits', () => {
  it('rate limits repeated login attempts', async () => {
    db.user.findUnique.mockResolvedValue(null);

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request('/api/v1/auth/login', json({ email: 'user@example.test', password: 'password123456' }));
      if (attempt < 10) {
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
      } else {
        expect(response.status).toBe(429);
        await expect(response.json()).resolves.toMatchObject({ error: { code: 'AUTH_RATE_LIMITED' } });
      }
    }
  });

  it('rate limits repeated verification resend attempts', async () => {
    db.user.findUnique.mockResolvedValue(null);

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request('/api/v1/auth/resend-verification', json({ email: 'missing@example.test' }));
      if (attempt < 10) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(429);
        await expect(response.json()).resolves.toMatchObject({ error: { code: 'AUTH_RATE_LIMITED' } });
      }
    }
  });
});
