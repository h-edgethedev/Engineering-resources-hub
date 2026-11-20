import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

const servers: Server[] = [];

async function request(path: string, origin?: string) {
  const server = createApp({ databaseHealthCheck: async () => undefined }).listen(0);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    headers: origin ? { Origin: origin } : undefined,
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('API configuration and endpoints', () => {
  it('loads the validated test environment configuration', () => {
    expect(env.nodeEnv).toBe('test');
    expect(env.apiPort).toBe(4000);
    expect(env.databaseUrl.startsWith('postgresql://')).toBe(true);
  });

  it('serves a liveness check without requiring a database query', async () => {
    const response = await request('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { status: 'ok', service: 'engineering-resources-hub-api' },
    });
  });

  it('reports readiness when the database check succeeds', async () => {
    const response = await request('/health/ready', 'http://localhost:5173');

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    await expect(response.json()).resolves.toMatchObject({
      data: { status: 'ready', checks: { database: 'ok' } },
    });
  });

  it('returns a safe 503 response when the database check fails', async () => {
    const app = createApp({ databaseHealthCheck: async () => { throw new Error('private database detail'); } });
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'The API is not ready to serve requests.' },
    });
    expect(JSON.stringify(payload)).not.toContain('private database detail');
  });

  it('validates academic route parameters with Zod', async () => {
    const response = await request('/api/v1/universities/Not_A_Valid_Slug');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Request data is invalid.' },
    });
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const response = await request('/not-a-route');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });
});
