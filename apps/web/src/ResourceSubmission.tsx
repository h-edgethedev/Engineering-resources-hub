import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';

interface Course {
  id: string;
  code: string;
  title: string;
  programme: {
    name: string;
    department: { name: string };
  };
  offerings: Array<{
    academicSession: { id: string; label: string };
    semester: { id: string; code: string; label: string; programmeLevel: { id: string; code: string; label: string | null } };
  }>;
}

interface ApiEnvelope<T> {
  data: T;
  error?: { message?: string };
}

interface CourseListResponse extends ApiEnvelope<Course[]> {
  meta: { page: number; totalPages: number; total: number };
}

const resourceTypes = [
  ['LECTURE_NOTE', 'Lecture notes'],
  ['TEXTBOOK', 'Textbook'],
  ['PAST_QUESTION', 'Past question'],
  ['SOLUTION', 'Solution'],
  ['LAB_MANUAL', 'Lab manual'],
  ['PROGRAMMING_EXERCISE', 'Programming exercise'],
  ['OTHER', 'Other academic material'],
] as const;

const supportedExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'];
const maxUploadBytes = 20 * 1024 * 1024;

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as ApiEnvelope<unknown>;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function fetchCourses(): Promise<Course[]> {
  const pageSize = 100;
  const firstResponse = await fetch(`/api/v1/courses?university=university-of-lagos&page=1&pageSize=${pageSize}`);
  if (!firstResponse.ok) throw new Error(await responseError(firstResponse, 'Could not load courses for resource submission.'));
  const firstPage = (await firstResponse.json()) as CourseListResponse;
  const pages = await Promise.all(Array.from({ length: Math.max(0, firstPage.meta.totalPages - 1) }, async (_, index) => {
    const response = await fetch(`/api/v1/courses?university=university-of-lagos&page=${index + 2}&pageSize=${pageSize}`);
    if (!response.ok) throw new Error(await responseError(response, 'Could not load the full course list.'));
    return (await response.json() as CourseListResponse).data;
  }));
  return [...firstPage.data, ...pages.flat()];
}

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function ResourceSubmission() {
  const coursesQuery = useQuery({ queryKey: ['courses', 'resource-submission', 'university-of-lagos'], queryFn: fetchCourses, staleTime: 5 * 60_000 });
  const [courseId, setCourseId] = useState('');
  const [academicSessionId, setAcademicSessionId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<(typeof resourceTypes)[number][0]>('LECTURE_NOTE');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [submittedTitle, setSubmittedTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const selectedCourse = courses.find((course) => course.id === courseId);
  const academicSessions = useMemo(() => [...new Map((selectedCourse?.offerings ?? []).map(({ academicSession }) => [academicSession.id, academicSession])).values()], [selectedCourse]);
  const semesters = useMemo(() => [...new Map((selectedCourse?.offerings ?? []).map(({ semester }) => [semester.id, semester])).values()], [selectedCourse]);

  function chooseAcademicSession(id: string) {
    setAcademicSessionId(id);
    if (semesterId && id && !selectedCourse?.offerings.some((offering) => offering.academicSession.id === id && offering.semester.id === semesterId)) setSemesterId('');
  }

  function chooseSemester(id: string) {
    setSemesterId(id);
    if (academicSessionId && id && !selectedCourse?.offerings.some((offering) => offering.academicSession.id === academicSessionId && offering.semester.id === id)) setAcademicSessionId('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!supportedExtensions.includes(extension)) {
      setError('Choose a PDF, Word, PowerPoint, Excel, or plain text file.');
      return;
    }
    if (file.size < 1) {
      setError('The selected file is empty.');
      return;
    }
    if (file.size > maxUploadBytes) {
      setError('The file exceeds the 20 MB upload limit.');
      return;
    }

    setIsSubmitting(true);
    try {
      const csrfResponse = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
      if (!csrfResponse.ok) throw new Error(await responseError(csrfResponse, 'Your sign-in session may have expired. Sign in again and retry.'));
      const csrfBody = (await csrfResponse.json()) as ApiEnvelope<{ csrfToken: string }>;
      const formData = new FormData();
      formData.set('courseId', courseId);
      if (academicSessionId) formData.set('academicSessionId', academicSessionId);
      if (semesterId) formData.set('semesterId', semesterId);
      formData.set('title', title.trim());
      formData.set('description', description.trim());
      formData.set('type', type);
      formData.set('file', file);
      const response = await fetch('/api/v1/resources', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfBody.data.csrfToken },
        body: formData,
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not submit this resource. Please try again.'));
      setSubmittedTitle(title.trim());
      setTitle('');
      setDescription('');
      setCourseId('');
      setAcademicSessionId('');
      setSemesterId('');
      setType('LECTURE_NOTE');
      setFile(null);
      const input = document.getElementById('resource-file') as HTMLInputElement | null;
      if (input) input.value = '';
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Could not submit this resource. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="submission-panel" aria-labelledby="submission-title">
      <div className="submission-heading">
        <span className="account-next-icon" aria-hidden="true">＋</span>
        <div><p className="card-kicker">SHARE WITH YOUR COURSE</p><h2 id="submission-title">Submit a resource</h2><p>Upload useful material for your classmates. A moderator or administrator must approve it before it becomes public.</p></div>
      </div>
      {submittedTitle && <div className="submission-success" role="status"><strong>Submitted for review</strong><span>“{submittedTitle}” is saved as pending moderation.</span><button type="button" onClick={() => setSubmittedTitle('')}>Submit another</button></div>}
      <form className="submission-form" onSubmit={handleSubmit}>
        <label>Course
          <select value={courseId} onChange={(event) => { setCourseId(event.target.value); setAcademicSessionId(''); setSemesterId(''); }} required disabled={coursesQuery.isPending || courses.length === 0}>
            <option value="">{coursesQuery.isPending ? 'Loading courses…' : courses.length ? 'Choose a course' : 'No courses available'}</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title} — {course.programme.department.name}</option>)}
          </select>
        </label>
        {coursesQuery.isError && <p className="auth-error" role="alert">{coursesQuery.error.message} <button className="inline-button" type="button" onClick={() => void coursesQuery.refetch()}>Try again</button></p>}
        {courses.length > 0 && <label>Academic session <span className="optional-label">Optional</span>
          <select value={academicSessionId} onChange={(event) => chooseAcademicSession(event.target.value)} disabled={!selectedCourse?.offerings.length}>
            <option value="">Not specified</option>
            {academicSessions.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
          </select>
        </label>}
        {courses.length > 0 && <label>Level and semester <span className="optional-label">Optional</span>
          <select value={semesterId} onChange={(event) => chooseSemester(event.target.value)} disabled={!selectedCourse?.offerings.length}>
            <option value="">Not specified</option>
            {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.programmeLevel.label ?? `${semester.programmeLevel.code} Level`} · {semester.label}</option>)}
          </select>
          {!selectedCourse?.offerings.length && <span className="field-hint">No session or semester offerings are listed for this course yet.</span>}
        </label>}
        {courses.length > 0 && <label>Resource title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={250} required placeholder="e.g. Week 4 lecture notes" /></label>}
        {courses.length > 0 && <label>Material type<select value={type} onChange={(event) => setType(event.target.value as (typeof resourceTypes)[number][0])}>{resourceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {courses.length > 0 && <label>Description <span className="optional-label">Optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10_000} rows={4} placeholder="Add context that helps students understand this material." /></label>}
        {courses.length > 0 && <label>File
          <input id="resource-file" type="file" accept={supportedExtensions.join(',')} required onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} />
          <span className="field-hint">PDF, Word, PowerPoint, Excel, or plain text · up to 20 MB. Selected files are checked again by the server.</span>
        </label>}
        {file && <p className="selected-file">Selected: {file.name} ({formatFileSize(file.size)})</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {courses.length > 0 && <button className="button button-purple submission-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Uploading…' : 'Submit for review'}</button>}
      </form>
      <p className="submission-privacy">Your pending upload is visible to you and authorized moderators while it is reviewed.</p>
    </section>
  );
}
