import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

const db = vi.hoisted(() => ({
  user: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  authSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  roleAssignment: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), count: vi.fn() },
  university: { findFirst: vi.fn() },
}));

vi.mock('../src/infrastructure/database.js', () => ({ prisma: db }));
const { createApp } = await import('../src/app.js');

const servers: Server[] = [];
const userId = '941e3fa0-08a3-42a4-9e6b-13a32a32e401';
const universityId = '941e3fa0-08a3-42a4-9e6b-13a32a32e402';
const targetUserId = '941e3fa0-08a3-42a4-9e6b-13a32a32e403';
const password = 'secure-Password-123';
const sessionToken = 'auth-test-session-token';
const csrfToken = 'auth-test-csrf-token';
const csrfTokenHash = createHash('sha256').update(csrfToken).digest('hex');
let passwordHash: string;

const student = {
  id: userId,
  email: 'student@example.test',
  displayName: 'Example Student',
  status: 'ACTIVE',
  createdAt: new Date('2026-11-20T00:00:00.000Z'),
  roleAssignments: [{ id: 'student-grant', role: 'STUDENT', universityId: null, scopeKey: 'global' }],
};

async function request(path: string, init?: RequestInit, authenticated = false) {
  const server = createApp({ databaseHealthCheck: async () => undefined }).listen(0);
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const headers = new Headers(init?.headers);
  if (authenticated) {
    headers.set('Cookie', `enghub_session=${sessionToken}; enghub_csrf=${csrfToken}`);
    headers.set('X-CSRF-Token', csrfToken);
  }
  return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, { ...init, headers });
}

const json = (value: unknown, method = 'POST'): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

beforeAll(async () => { passwordHash = await bcrypt.hash(password, 12); });

beforeEach(() => {
  vi.clearAllMocks();
  db.user.create.mockResolvedValue(student);
  db.user.findUnique.mockResolvedValue({ ...student, passwordHash });
  db.user.findUniqueOrThrow.mockResolvedValue(student);
  db.authSession.create.mockResolvedValue({ id: 'session-id' });
  db.authSession.findUnique.mockResolvedValue({
    id: 'session-id',
    csrfTokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    user: student,
  });
  db.authSession.update.mockResolvedValue({ id: 'session-id' });
  db.roleAssignment.create.mockResolvedValue({ id: 'grant-id', role: 'MODERATOR', universityId, scopeKey: `university:${universityId}`, createdAt: new Date() });
  db.university.findFirst.mockResolvedValue({ id: universityId });
});

describe('authentication and role grants', () => {
  it('registers a Student, hashes the password, and issues secure session and CSRF cookies', async () => {
    const response = await request('/api/v1/auth/register', json({ email: '  STUDENT@example.test ', displayName: 'Example Student', password }));
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.data.user).toMatchObject({ email: 'student@example.test', roleAssignments: [{ role: 'STUDENT' }] });
    expect(JSON.stringify(result)).not.toContain(password);
    expect(db.user.create.mock.calls[0][0].data.passwordHash).not.toBe(password);
    expect(db.user.create.mock.calls[0][0].data.roleAssignments.create.role).toBe('STUDENT');
    expect(db.authSession.create.mock.calls[0][0].data.tokenHash).not.toBe(sessionToken);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('enghub_csrf=');
  });

  it('logs in, exposes the current account, and revokes the server session on logout', async () => {
    const login = await request('/api/v1/auth/login', json({ email: 'STUDENT@example.test', password }));
    expect(login.status).toBe(200);
    const me = await request('/api/v1/auth/me', undefined, true);
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({ data: { user: { id: userId, roleAssignments: [{ role: 'STUDENT' }] } } });

    const logout = await request('/api/v1/auth/logout', { method: 'POST' }, true);
    expect(logout.status).toBe(204);
    expect(db.authSession.update).toHaveBeenCalledWith({ where: { id: 'session-id' }, data: { revokedAt: expect.any(Date) } });
  });

  it('rejects incorrect credentials and malformed registration input', async () => {
    db.user.findUnique.mockResolvedValueOnce(null);
    const denied = await request('/api/v1/auth/login', json({ email: 'missing@example.test', password }));
    expect(denied.status).toBe(401);

    const invalid = await request('/api/v1/auth/register', json({ email: 'not-an-email', displayName: '', password: 'short' }));
    expect(invalid.status).toBe(400);
  });

  it('lets a University Administrator grant a Moderator only in their own university', async () => {
    db.authSession.findUnique.mockResolvedValueOnce({
      id: 'session-id', csrfTokenHash, expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
      user: { ...student, roleAssignments: [{ id: 'admin-grant', role: 'UNIVERSITY_ADMIN', universityId, scopeKey: `university:${universityId}` }] },
    });
    const response = await request(`/api/v1/auth/admin/users/${targetUserId}/roles`, json({ role: 'MODERATOR', universityId }), true);
    expect(response.status).toBe(201);
    expect(db.roleAssignment.create.mock.calls[0][0].data).toMatchObject({ userId: targetUserId, role: 'MODERATOR', universityId, grantedById: userId });
  });

  it('does not allow a University Administrator to grant Super Administrator', async () => {
    db.authSession.findUnique.mockResolvedValueOnce({
      id: 'session-id', csrfTokenHash, expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
      user: { ...student, roleAssignments: [{ id: 'admin-grant', role: 'UNIVERSITY_ADMIN', universityId, scopeKey: `university:${universityId}` }] },
    });
    const response = await request(`/api/v1/auth/admin/users/${targetUserId}/roles`, json({ role: 'SUPER_ADMIN' }), true);
    expect(response.status).toBe(403);
  });
});
