import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({
  university: { findMany: vi.fn(), findFirst: vi.fn() },
  faculty: { findMany: vi.fn(), findFirst: vi.fn() },
  department: { findMany: vi.fn(), findFirst: vi.fn() },
  programme: { findMany: vi.fn(), findFirst: vi.fn() },
  course: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
}));

vi.mock('../src/infrastructure/database.js', () => ({ prisma: db }));

const { createApp } = await import('../src/app.js');
const servers: Server[] = [];
const uni = 'university-of-lagos';
const faculty = 'faculty-of-engineering';
const department = 'computer-engineering';
const programme = 'bsc-computer-engineering';
const courseId = 'd9428888-122b-11e1-b85c-61cd3cbb3210';

async function request(path: string) {
  const server = createApp({ databaseHealthCheck: async () => undefined }).listen(0);
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

beforeEach(() => {
  vi.clearAllMocks();
  db.university.findMany.mockResolvedValue([{ id: 'u1', name: 'University of Lagos', slug: uni }]);
  db.university.findFirst.mockResolvedValue({ id: 'u1', name: 'University of Lagos', slug: uni });
  db.faculty.findMany.mockResolvedValue([{ id: 'f1', name: 'Faculty of Engineering', slug: faculty }]);
  db.faculty.findFirst.mockResolvedValue({ id: 'f1' });
  db.department.findMany.mockResolvedValue([{ id: 'd1', name: 'Computer Engineering', slug: department }]);
  db.department.findFirst.mockResolvedValue({ id: 'd1' });
  db.programme.findMany.mockResolvedValue([{ id: 'p1', name: 'B.Sc. Computer Engineering', slug: programme }]);
  db.programme.findFirst.mockResolvedValue({ id: 'p1', slug: programme });
  db.course.count.mockResolvedValue(1);
  db.course.findMany.mockResolvedValue([{ id: courseId, code: 'CPE 101', title: 'Introduction to Computing' }]);
  db.course.findFirst.mockResolvedValue({ id: courseId, code: 'CPE 101', title: 'Introduction to Computing' });
});

describe('academic endpoints', () => {
  it('fetches universities', async () => {
    const response = await request('/api/v1/universities');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [{ slug: uni }] });
  });

  it('fetches a university and its faculties and departments', async () => {
    db.university.findFirst.mockResolvedValueOnce({ id: 'u1', slug: uni, faculties: [{ slug: faculty, departments: [{ slug: department }] }] });
    const response = await request(`/api/v1/universities/${uni}`);
    await expect(response.json()).resolves.toMatchObject({ data: { faculties: [{ departments: [{ slug: department }] }] } });
  });

  it('fetches faculties and departments', async () => {
    const facultiesResponse = await request(`/api/v1/universities/${uni}/faculties`);
    expect(facultiesResponse.status).toBe(200);
    await expect(facultiesResponse.json()).resolves.toMatchObject({ data: [{ slug: faculty }] });
    const departmentsResponse = await request(`/api/v1/universities/${uni}/faculties/${faculty}/departments`);
    expect(departmentsResponse.status).toBe(200);
    await expect(departmentsResponse.json()).resolves.toMatchObject({ data: [{ slug: department }] });
  });

  it('fetches a department and its programmes', async () => {
    db.department.findFirst.mockResolvedValueOnce({ id: 'd1', name: 'Computer Engineering', slug: department, faculty: { name: 'Faculty of Engineering', slug: faculty }, programmes: [] });
    const departmentResponse = await request(`/api/v1/universities/${uni}/faculties/${faculty}/departments/${department}`);
    expect(departmentResponse.status).toBe(200);
    const programmesResponse = await request(`/api/v1/universities/${uni}/faculties/${faculty}/departments/${department}/programmes`);
    expect(programmesResponse.status).toBe(200);
    await expect(programmesResponse.json()).resolves.toMatchObject({ data: [{ slug: programme }] });
  });

  it('fetches a programme and courses', async () => {
    const programmeResponse = await request(`/api/v1/universities/${uni}/faculties/${faculty}/departments/${department}/programmes/${programme}`);
    expect(programmeResponse.status).toBe(200);
    const coursesResponse = await request('/api/v1/courses');
    expect(coursesResponse.status).toBe(200);
    await expect(coursesResponse.json()).resolves.toMatchObject({ data: [{ code: 'CPE 101' }], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
  });

  it('applies university, department and level course filters', async () => {
    const response = await request(`/api/v1/courses?university=${uni}&department=${department}&level=100&page=2&pageSize=5`);
    expect(response.status).toBe(200);
    const where = db.course.findMany.mock.calls[0][0].where;
    expect(where.programme.department.faculty.university).toMatchObject({ slug: uni });
    expect(where.OR).toContainEqual({ programme: { department: { slug: department } } });
    expect(where.OR).toContainEqual({ code: { contains: 'GET', mode: 'insensitive' } });
    expect(where.offerings.some.AND).toContainEqual({ semester: { programmeLevel: { code: '100' } } });
    expect(db.course.findMany.mock.calls[0][0]).toMatchObject({ skip: 5, take: 5 });
  });

  it('fetches a course by UUID', async () => {
    const response = await request(`/api/v1/courses/${courseId}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { id: courseId, code: 'CPE 101' } });
  });

  it('returns 400 for malformed slugs, course IDs, and filters', async () => {
    for (const path of ['/api/v1/universities/Bad_Slug', '/api/v1/courses/not-a-uuid', '/api/v1/courses?level=1000']) {
      const response = await request(path);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
  });

  it('returns consistent 404 envelopes for missing records', async () => {
    db.university.findFirst.mockResolvedValueOnce(null);
    const response = await request('/api/v1/universities/missing-university');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNIVERSITY_NOT_FOUND' } });
    db.course.findFirst.mockResolvedValueOnce(null);
    const missingCourse = await request(`/api/v1/courses/${courseId}`);
    expect(missingCourse.status).toBe(404);
    await expect(missingCourse.json()).resolves.toMatchObject({ error: { code: 'COURSE_NOT_FOUND' } });
  });

  it('returns 200 with an empty list when filters match no courses', async () => {
    db.course.count.mockResolvedValueOnce(0);
    db.course.findMany.mockResolvedValueOnce([]);
    const response = await request(`/api/v1/courses?university=${uni}&department=${department}&level=200`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [], meta: { total: 0, totalPages: 0 } });
  });
});
