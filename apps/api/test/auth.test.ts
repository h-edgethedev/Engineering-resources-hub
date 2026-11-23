import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

const db = vi.hoisted(() => ({
  user: { create: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  authSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  roleAssignment: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), count: vi.fn() },
  university: { findFirst: vi.fn() },
  faculty: { findFirst: vi.fn() },
  department: { findFirst: vi.fn() },
  programme: { findFirst: vi.fn() },
  programmeLevel: { findFirst: vi.fn() },
  semester: { findFirst: vi.fn() },
  academicProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  userProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  userPreferences: { findUnique: vi.fn(), upsert: vi.fn() },
  emailVerificationToken: { create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../src/infrastructure/database.js', () => ({ prisma: db }));
const { createApp } = await import('../src/app.js');

const servers: Server[] = [];
const userId = '941e3fa0-08a3-42a4-9e6b-13a32a32e401';
const universityId = '941e3fa0-08a3-42a4-9e6b-13a32a32e402';
const facultyId = '941e3fa0-08a3-42a4-9e6b-13a32a32e404';
const departmentId = '941e3fa0-08a3-42a4-9e6b-13a32a32e405';
const programmeId = '941e3fa0-08a3-42a4-9e6b-13a32a32e406';
const levelId = '941e3fa0-08a3-42a4-9e6b-13a32a32e407';
const semesterId = '941e3fa0-08a3-42a4-9e6b-13a32a32e408';
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
  emailVerifiedAt: new Date('2026-11-20T00:00:00.000Z'),
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
  db.user.update.mockResolvedValue(student);
  db.$transaction.mockImplementation(async (callback: (transaction: typeof db) => unknown) => callback(db));
  db.emailVerificationToken.create.mockResolvedValue({ id: 'verification-token-id' });
  db.emailVerificationToken.deleteMany.mockResolvedValue({ count: 1 });
  db.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });
  db.academicProfile.findUnique.mockResolvedValue(null);
  db.academicProfile.upsert.mockImplementation(async ({ create }) => create);
  db.userProfile.findUnique.mockResolvedValue(null);
  db.userProfile.upsert.mockImplementation(async ({ create }) => create);
  db.userPreferences.findUnique.mockResolvedValue(null);
  db.userPreferences.upsert.mockImplementation(async ({ create }) => create);
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
  db.faculty.findFirst.mockResolvedValue({ id: facultyId });
  db.department.findFirst.mockResolvedValue({ id: departmentId });
  db.programme.findFirst.mockResolvedValue({ id: programmeId });
  db.programmeLevel.findFirst.mockResolvedValue({ id: levelId });
  db.semester.findFirst.mockResolvedValue({ id: semesterId });
});

describe('authentication and role grants', () => {
  it('registers a Student with a normalized email, hashed password, and verification token but no session', async () => {
    const response = await request('/api/v1/auth/register', json({ email: '  STUDENT@example.test ', displayName: 'Example Student', password }));
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.data).toMatchObject({ email: 'student@example.test', verificationRequired: true });
    expect(JSON.stringify(result)).not.toContain(password);
    expect(db.user.create.mock.calls[0][0].data.passwordHash).not.toBe(password);
    expect(db.user.create.mock.calls[0][0].data.email).toBe('student@example.test');
    expect(db.user.create.mock.calls[0][0].data.emailVerifiedAt).toBeUndefined();
    expect(db.user.create.mock.calls[0][0].data.roleAssignments.create.role).toBe('STUDENT');
    expect(db.emailVerificationToken.create.mock.calls[0][0].data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(db.emailVerificationToken.create.mock.calls[0][0].data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(db.authSession.create).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toBeNull();
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

  it('returns a safe conflict when an email is already registered', async () => {
    db.user.create.mockRejectedValueOnce({ code: 'P2002' });
    const response = await request('/api/v1/auth/register', json({ email: 'student@example.test', displayName: 'Example Student', password }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'EMAIL_ALREADY_REGISTERED' } });
  });

  it('prevents an unverified account from logging in', async () => {
    db.user.findUnique.mockResolvedValueOnce({ ...student, emailVerifiedAt: null, passwordHash });
    const response = await request('/api/v1/auth/login', json({ email: student.email, password }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });
  });

  it('verifies a valid single-use email token', async () => {
    const token = 'verification-token-value-which-is-long-enough';
    db.emailVerificationToken.findUnique.mockResolvedValueOnce({
      id: 'verification-token-id', userId, tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000), usedAt: null,
    });
    const response = await request('/api/v1/auth/verify-email', json({ token }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { verified: true } });
    expect(db.emailVerificationToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'verification-token-id', usedAt: null, expiresAt: { gt: expect.any(Date) } } }));
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { emailVerifiedAt: expect.any(Date) } });
  });

  it('rejects expired and previously used verification tokens', async () => {
    const token = 'verification-token-value-which-is-long-enough';
    const base = { id: 'verification-token-id', userId, expiresAt: new Date(Date.now() + 60_000), usedAt: null };
    db.emailVerificationToken.findUnique
      .mockResolvedValueOnce({ ...base, expiresAt: new Date(Date.now() - 60_000) })
      .mockResolvedValueOnce({ ...base, usedAt: new Date() });
    const expired = await request('/api/v1/auth/verify-email', json({ token }));
    const reused = await request('/api/v1/auth/verify-email', json({ token }));
    expect(expired.status).toBe(400);
    expect(reused.status).toBe(400);
    expect(db.emailVerificationToken.updateMany).not.toHaveBeenCalled();
  });

  it('resends verification through the enumeration-safe endpoint', async () => {
    db.user.findUnique.mockResolvedValueOnce({ ...student, emailVerifiedAt: null });
    const response = await request('/api/v1/auth/resend-verification', json({ email: ' STUDENT@example.test ' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { message: expect.any(String) } });
    expect(db.emailVerificationToken.create).toHaveBeenCalledOnce();
  });

  it('returns the signed-in user academic profile without requiring one to exist', async () => {
    const response = await request('/api/v1/auth/me/academic-profile', undefined, true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { academicProfile: null } });
    expect(db.academicProfile.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId } }));
  });

  it('saves a valid academic hierarchy and optional progress selections', async () => {
    const profile = { universityId, facultyId, departmentId, programmeId, currentLevelId: levelId, currentSemesterId: semesterId };
    const response = await request('/api/v1/auth/me/academic-profile', json(profile, 'PUT'), true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { academicProfile: { userId, ...profile } } });
    expect(db.academicProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId }, create: { userId, ...profile }, update: profile,
    }));
  });

  it('rejects a department that does not belong to the chosen faculty', async () => {
    db.department.findFirst.mockResolvedValueOnce(null);
    const response = await request('/api/v1/auth/me/academic-profile', json({
      universityId, facultyId, departmentId, programmeId: null, currentLevelId: null, currentSemesterId: null,
    }, 'PUT'), true);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_ACADEMIC_PROFILE' } });
    expect(db.academicProfile.upsert).not.toHaveBeenCalled();
  });

  it('allows the academic profile to be skipped and rejects child selections without parents', async () => {
    const skipped = await request('/api/v1/auth/me/academic-profile', json({
      universityId: null, facultyId: null, departmentId: null, programmeId: null, currentLevelId: null, currentSemesterId: null,
    }, 'PUT'), true);
    expect(skipped.status).toBe(200);

    const invalid = await request('/api/v1/auth/me/academic-profile', json({
      universityId: null, facultyId, departmentId: null, programmeId: null, currentLevelId: null, currentSemesterId: null,
    }, 'PUT'), true);
    expect(invalid.status).toBe(400);
  });

  it('saves optional public profile fields and normalizes a username', async () => {
    const response = await request('/api/v1/auth/me/profile', json({
      username: '  Eng_User ', avatarUrl: 'https://images.example.test/avatar.png', bio: 'Learning engineering.',
      githubUrl: 'https://github.com/example', linkedInUrl: 'https://www.linkedin.com/in/example',
    }, 'PUT'), true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { profile: { username: 'eng_user', bio: 'Learning engineering.' } } });
    expect(db.userProfile.upsert.mock.calls[0][0].create).toMatchObject({ userId, username: 'eng_user' });
  });

  it('validates profile URLs and reports username conflicts safely', async () => {
    const invalidUrl = await request('/api/v1/auth/me/profile', json({
      username: null, avatarUrl: null, bio: null, githubUrl: 'https://github.com.attacker.test/user', linkedInUrl: null,
    }, 'PUT'), true);
    expect(invalidUrl.status).toBe(400);

    db.userProfile.upsert.mockRejectedValueOnce({ code: 'P2002' });
    const conflict = await request('/api/v1/auth/me/profile', json({
      username: 'taken_user', avatarUrl: null, bio: null, githubUrl: null, linkedInUrl: null,
    }, 'PUT'), true);
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: { code: 'USERNAME_ALREADY_TAKEN' } });
  });

  it('saves optional resource, interest, and goal preferences', async () => {
    const preferences = {
      resourceKinds: ['LECTURE_NOTE', 'PROJECT'],
      learningInterests: ['PROGRAMMING', 'ROBOTICS'],
      learningGoals: ['CONCEPT_MASTERY'],
    };
    const response = await request('/api/v1/auth/me/preferences', json(preferences, 'PUT'), true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { preferences: { userId, ...preferences } } });
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
