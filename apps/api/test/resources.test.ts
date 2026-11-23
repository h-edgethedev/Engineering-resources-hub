import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const db = vi.hoisted(() => ({
  resource: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  course: { findFirst: vi.fn() },
  courseOffering: { findFirst: vi.fn() },
  authSession: { findUnique: vi.fn(), update: vi.fn() },
  moderationAction: { create: vi.fn() },
  $transaction: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  provider: 'local',
  put: vi.fn(async () => ({ storageKey: 'generated/resource.pdf' })),
  get: vi.fn(),
  delete: vi.fn(async () => undefined),
}));

vi.mock('../src/infrastructure/database.js', () => ({ prisma: db }));
vi.mock('../src/modules/resources/storage.js', () => ({ resourceStorage: storage }));

const { createApp } = await import('../src/app.js');
const servers: Server[] = [];
const resourceId = 'd9428888-122b-11e1-b85c-61cd3cbb3210';
const courseId = 'd9428888-122b-11e1-b85c-61cd3cbb3211';
const sessionId = 'd9428888-122b-11e1-b85c-61cd3cbb3212';
const semesterId = 'd9428888-122b-11e1-b85c-61cd3cbb3213';
const userId = 'd9428888-122b-11e1-b85c-61cd3cbb3214';
const universityId = 'd9428888-122b-11e1-b85c-61cd3cbb3215';
const sessionToken = 'test-session-token';
const csrfToken = 'test-csrf-token';
const csrfTokenHash = createHash('sha256').update(csrfToken).digest('hex');
const resource = {
  id: resourceId,
  courseId,
  academicSessionId: sessionId,
  semesterId,
  title: 'Lecture 1 notes',
  description: 'Introduction notes',
  type: 'LECTURE_NOTE',
  status: 'PENDING',
  uploadedById: userId,
  course: { id: courseId, code: 'CPE 101', title: 'Introduction to Computing' },
  academicSession: { id: sessionId, label: '2025/2026' },
  semester: { id: semesterId, code: 'first', label: 'First Semester', programmeLevel: { code: '100', label: '100 Level' } },
  file: { id: 'file1', provider: 'local', storageKey: 'resources/cpe101/notes.pdf', originalFilename: 'notes.pdf', mediaType: 'application/pdf', byteSize: 4096 },
};
const resourceScope = {
  id: resourceId,
  status: 'PENDING',
  uploadedById: userId,
  course: { programme: { department: { faculty: { universityId } } } },
  file: { provider: 'local', storageKey: 'resources/cpe101/notes.pdf', originalFilename: 'notes.pdf', mediaType: 'application/pdf' },
};
const payload = {
  courseId,
  academicSessionId: sessionId,
  semesterId,
  title: 'Lecture 1 notes',
  description: 'Introduction notes',
  type: 'LECTURE_NOTE',
};
let testFilePath: string;

async function uploadForm(overrides: Record<string, string> = {}, fileName = 'notes.pdf', contents = '%PDF-1.7 test pdf', mimeType = 'application/pdf') {
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...payload, ...overrides })) form.append(key, value);
  form.append('file', new Blob([contents], { type: mimeType }), fileName);
  return form;
}

async function request(path: string, init?: RequestInit, authenticated = true, includeCsrfHeader = true) {
  const server = createApp({ databaseHealthCheck: async () => undefined }).listen(0);
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const headers = new Headers(init?.headers);
  if (authenticated) {
    headers.set('Cookie', `enghub_session=${sessionToken}; enghub_csrf=${csrfToken}`);
    if (includeCsrfHeader) headers.set('X-CSRF-Token', csrfToken);
  }
  return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, { ...init, headers });
}

const json = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

beforeAll(async () => {
  testFilePath = join(await mkdtemp(join(tmpdir(), 'enghub-test-')), 'sample.pdf');
  await writeFile(testFilePath, '%PDF-1.7 test pdf');
  storage.get.mockImplementation(async () => createReadStream(testFilePath));
});

afterAll(async () => { await rm(join(testFilePath, '..'), { recursive: true, force: true }); });

beforeEach(() => {
  vi.clearAllMocks();
  db.resource.count.mockResolvedValue(1);
  db.resource.findMany.mockResolvedValue([resource]);
  db.resource.findUnique.mockImplementation((query) => {
    if (query.select?.uploadedById) return Promise.resolve(resourceScope);
    if (query.select?.courseId) return Promise.resolve({ courseId, academicSessionId: sessionId, semesterId, status: 'PENDING', uploadedById: userId });
    return Promise.resolve(resource);
  });
  db.resource.create.mockResolvedValue(resource);
  db.resource.update.mockResolvedValue({ ...resource, title: 'Updated title' });
  db.moderationAction.create.mockResolvedValue({ id: 'action-1' });
  db.$transaction.mockImplementation((callback) => callback(db));
  storage.put.mockResolvedValue({ storageKey: 'generated/resource.pdf' });
  db.course.findFirst.mockResolvedValue({ id: courseId });
  db.courseOffering.findFirst.mockResolvedValue({ courseId });
  db.authSession.findUnique.mockResolvedValue({
    id: 'test-session-id',
    csrfTokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    user: { id: userId, email: 'student@example.test', displayName: 'Test Student', status: 'ACTIVE', emailVerifiedAt: new Date(), roleAssignments: [{ id: 'student-role', role: 'STUDENT', universityId: null, scopeKey: 'global' }] },
  });
});

describe('resource management endpoints', () => {
  it('creates a pending resource linked to a course and file metadata', async () => {
    const response = await request('/api/v1/resources', { method: 'POST', body: await uploadForm() });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ data: { status: 'PENDING', course: { id: courseId }, file: { originalFilename: 'notes.pdf' } } });
    expect(db.resource.create.mock.calls[0][0].data.status).toBe('PENDING');
    expect(db.resource.create.mock.calls[0][0].data.file.create).toMatchObject({
      provider: 'local', storageKey: 'generated/resource.pdf', originalFilename: 'notes.pdf', mediaType: 'application/pdf',
    });
  });

  it('lists resources with filters and pagination', async () => {
    const response = await request(`/api/v1/resources?courseId=${courseId}&type=LECTURE_NOTE&page=2&pageSize=5`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [{ id: resourceId }], meta: { page: 2, pageSize: 5, total: 1 } });
    expect(db.resource.findMany.mock.calls[0][0]).toMatchObject({
      where: { courseId, type: 'LECTURE_NOTE', AND: [{ OR: [{ status: 'APPROVED' }, { uploadedById: userId }] }] },
      skip: 5,
      take: 5,
    });
  });

  it('fetches a resource by UUID', async () => {
    const response = await request(`/api/v1/resources/${resourceId}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { id: resourceId, file: { mediaType: 'application/pdf' } } });
  });

  it('hides pending resources from guests, including the file endpoint', async () => {
    const detail = await request(`/api/v1/resources/${resourceId}`, undefined, false);
    expect(detail.status).toBe(404);
    const file = await request(`/api/v1/resources/${resourceId}/file`, undefined, false);
    expect(file.status).toBe(404);
  });

  it('serves the stored file inline and as an attachment', async () => {
    const inline = await request(`/api/v1/resources/${resourceId}/file`);
    expect(inline.status).toBe(200);
    expect(inline.headers.get('content-type')).toBe('application/pdf');
    expect(inline.headers.get('content-disposition')).toContain('inline');
    expect(await inline.text()).toContain('%PDF-1.7');

    const download = await request(`/api/v1/resources/${resourceId}/file/download`);
    expect(download.headers.get('content-disposition')).toContain('attachment');
  });

  it('rejects mismatched content and unsupported media types', async () => {
    const badSignature = await request('/api/v1/resources', { method: 'POST', body: await uploadForm({}, 'notes.pdf', 'not really a PDF') });
    expect(badSignature.status).toBe(415);
    await expect(badSignature.json()).resolves.toMatchObject({ error: { code: 'INVALID_RESOURCE_FILE_CONTENT' } });

    const unsupported = await request('/api/v1/resources', { method: 'POST', body: await uploadForm({}, 'archive.zip', 'PK', 'application/zip') });
    expect(unsupported.status).toBe(415);
    await expect(unsupported.json()).resolves.toMatchObject({ error: { code: 'UNSUPPORTED_RESOURCE_FILE_TYPE' } });
  });

  it('updates editable resource metadata', async () => {
    const response = await request(`/api/v1/resources/${resourceId}`, { ...json({ title: 'Updated title' }), method: 'PATCH' });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { title: 'Updated title' } });
    expect(db.resource.update.mock.calls[0][0].data).toMatchObject({ title: 'Updated title' });
  });

  it('deletes a resource and returns 204', async () => {
    const response = await request(`/api/v1/resources/${resourceId}`, { method: 'DELETE' });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(db.resource.update.mock.calls[0][0].data.status).toBe('REMOVED');
    expect(db.moderationAction.create).toHaveBeenCalledWith({ data: { resourceId, actorId: userId, action: 'REMOVED' } });
  });

  it('returns 400 for malformed IDs and invalid resource data', async () => {
    const badId = await request('/api/v1/resources/not-a-uuid');
    expect(badId.status).toBe(400);
    await expect(badId.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const badBody = await request('/api/v1/resources', { method: 'POST', body: await uploadForm({ type: 'UNSUPPORTED' }) });
    expect(badBody.status).toBe(400);
    await expect(badBody.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const attemptedApproval = await request('/api/v1/resources', { method: 'POST', body: await uploadForm({ status: 'APPROVED' }) });
    expect(attemptedApproval.status).toBe(400);
    await expect(attemptedApproval.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 404 for unknown resources and courses', async () => {
    db.resource.findUnique.mockResolvedValueOnce(null);
    const missing = await request(`/api/v1/resources/${resourceId}`);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: 'RESOURCE_NOT_FOUND' } });

    db.course.findFirst.mockResolvedValueOnce(null);
    const missingCourse = await request('/api/v1/resources', { method: 'POST', body: await uploadForm() });
    expect(missingCourse.status).toBe(404);
    await expect(missingCourse.json()).resolves.toMatchObject({ error: { code: 'COURSE_NOT_FOUND' } });
  });

  it('rejects academic session or semester values not offered for the course', async () => {
    db.courseOffering.findFirst.mockResolvedValueOnce(null);
    const response = await request('/api/v1/resources', { method: 'POST', body: await uploadForm() });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_RESOURCE_ACADEMIC_CONTEXT' } });
  });

  it('returns an empty list when no resources match', async () => {
    db.resource.count.mockResolvedValueOnce(0);
    db.resource.findMany.mockResolvedValueOnce([]);
    const response = await request(`/api/v1/resources?courseId=${courseId}&status=APPROVED`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [], meta: { total: 0, totalPages: 0 } });
  });

  it('restricts guests to approved resources even when they request another status', async () => {
    db.resource.count.mockResolvedValueOnce(0);
    db.resource.findMany.mockResolvedValueOnce([]);
    const response = await request(`/api/v1/resources?status=PENDING`, undefined, false);
    expect(response.status).toBe(200);
    expect(db.resource.findMany.mock.calls[0][0].where.AND).toEqual([
      { OR: [{ status: 'APPROVED' }] },
      { status: 'PENDING' },
    ]);
  });

  it('requires a valid CSRF token for signed-in mutations', async () => {
    const response = await request(`/api/v1/resources/${resourceId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Update' }) }, true, false);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CSRF_VALIDATION_FAILED' } });
  });

  it('prevents moderators from approving their own submissions', async () => {
    db.authSession.findUnique.mockResolvedValueOnce({
      id: 'test-session-id', csrfTokenHash, expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
      user: { id: userId, email: 'student@example.test', displayName: 'Test Student', status: 'ACTIVE', emailVerifiedAt: new Date(), roleAssignments: [{ id: 'moderator-role', role: 'MODERATOR', universityId, scopeKey: `university:${universityId}` }] },
    });
    const response = await request(`/api/v1/resources/${resourceId}/moderation`, json({ action: 'APPROVED' }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'SELF_MODERATION_FORBIDDEN' } });
  });

  it('enforces the university boundary for moderator decisions', async () => {
    db.authSession.findUnique.mockResolvedValueOnce({
      id: 'test-session-id', csrfTokenHash, expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
      user: { id: '941e3fa0-122b-11e1-b85c-61cd3cbb3216', email: 'moderator@example.test', displayName: 'Moderator', status: 'ACTIVE', emailVerifiedAt: new Date(), roleAssignments: [{ id: 'moderator-role', role: 'MODERATOR', universityId: '941e3fa0-122b-11e1-b85c-61cd3cbb3217', scopeKey: 'university:other' }] },
    });
    const response = await request(`/api/v1/resources/${resourceId}/moderation`, json({ action: 'APPROVED' }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('allows an in-scope moderator to approve a different user submission', async () => {
    db.authSession.findUnique.mockResolvedValueOnce({
      id: 'test-session-id', csrfTokenHash, expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
      user: { id: '941e3fa0-122b-11e1-b85c-61cd3cbb3218', email: 'moderator@example.test', displayName: 'Moderator', status: 'ACTIVE', emailVerifiedAt: new Date(), roleAssignments: [{ id: 'moderator-role', role: 'MODERATOR', universityId, scopeKey: `university:${universityId}` }] },
    });
    const response = await request(`/api/v1/resources/${resourceId}/moderation`, json({ action: 'APPROVED' }));
    expect(response.status).toBe(200);
    expect(db.resource.update.mock.calls[0][0].data.status).toBe('APPROVED');
    expect(db.moderationAction.create).toHaveBeenCalledWith({ data: { resourceId, actorId: '941e3fa0-122b-11e1-b85c-61cd3cbb3218', action: 'APPROVED', reason: undefined } });
  });
});
