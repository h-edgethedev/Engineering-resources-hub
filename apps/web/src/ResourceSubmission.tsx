import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './api';

export interface Course {
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

export async function fetchCourses(universitySlug = 'university-of-lagos'): Promise<Course[]> {
  const pageSize = 100;
  const firstPage = await apiRequest<Course[]>(`/courses?university=${encodeURIComponent(universitySlug)}&page=1&pageSize=${pageSize}`);
  const pages = await Promise.all(Array.from({ length: Math.max(0, (firstPage.meta?.totalPages ?? 1) - 1) }, async (_, index) => {
    return (await apiRequest<Course[]>(`/courses?university=${encodeURIComponent(universitySlug)}&page=${index + 2}&pageSize=${pageSize}`)).data;
  }));
  return [...firstPage.data, ...pages.flat()];
}

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function ResourceSubmission() {
  const coursesQuery = useQuery({ queryKey: ['courses', 'resource-submission', 'university-of-lagos'], queryFn: () => fetchCourses(), staleTime: 5 * 60_000 });
  const [courseId, setCourseId] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const [activeCourseIndex, setActiveCourseIndex] = useState(0);
  const coursePickerRef = useRef<HTMLDivElement>(null);
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
  const filteredCourses = useMemo(() => {
    const query = courseSearch.trim().toLocaleLowerCase();
    if (!query) return courses;
    return courses.filter((course) => `${course.code} ${course.title} ${course.programme.name} ${course.programme.department.name}`.toLocaleLowerCase().includes(query));
  }, [courseSearch, courses]);
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

  function selectCourse(course: Course) {
    setCourseId(course.id);
    setCourseSearch('');
    setCourseMenuOpen(false);
    setActiveCourseIndex(0);
    setAcademicSessionId('');
    setSemesterId('');
  }

  function handleCourseKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCourseMenuOpen(true);
      setActiveCourseIndex((index) => Math.min(index + 1, Math.max(filteredCourses.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCourseMenuOpen(true);
      setActiveCourseIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && courseMenuOpen && filteredCourses[activeCourseIndex]) {
      event.preventDefault();
      selectCourse(filteredCourses[activeCourseIndex]);
    } else if (event.key === 'Escape') {
      setCourseMenuOpen(false);
      setCourseSearch('');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!courseId) {
      setError('Choose a course for this resource.');
      return;
    }
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
      const formData = new FormData();
      formData.set('courseId', courseId);
      if (academicSessionId) formData.set('academicSessionId', academicSessionId);
      if (semesterId) formData.set('semesterId', semesterId);
      formData.set('title', title.trim());
      formData.set('description', description.trim());
      formData.set('type', type);
      formData.set('file', file);
      await apiRequest('/resources', { method: 'POST', body: formData });
      setSubmittedTitle(title.trim());
      setTitle('');
      setDescription('');
      setCourseId('');
      setCourseSearch('');
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
        <div className="course-picker-field">
          <label htmlFor="resource-course-search">Course</label>
          <div className="course-picker" ref={coursePickerRef}>
            <input id="resource-course-search" role="combobox" aria-autocomplete="list" aria-expanded={courseMenuOpen} aria-controls="resource-course-options" aria-activedescendant={courseMenuOpen && filteredCourses[activeCourseIndex] ? `resource-course-option-${filteredCourses[activeCourseIndex].id}` : undefined} value={courseMenuOpen ? courseSearch : selectedCourse ? `${selectedCourse.code} · ${selectedCourse.title}` : ''} onFocus={() => { setCourseMenuOpen(true); setCourseSearch(''); }} onChange={(event) => { setCourseSearch(event.target.value); setActiveCourseIndex(0); setCourseMenuOpen(true); }} onKeyDown={handleCourseKeyDown} onBlur={(event) => { if (!coursePickerRef.current?.contains(event.relatedTarget as Node | null)) { setCourseMenuOpen(false); setCourseSearch(''); } }} placeholder={coursesQuery.isPending ? 'Loading courses…' : coursesQuery.isError ? 'Courses could not be loaded' : courses.length ? 'Search by course code, title, or department…' : 'No courses available'} disabled={coursesQuery.isPending || courses.length === 0} autoComplete="off" />
            <span className="course-picker-chevron" aria-hidden="true">⌄</span>
            {courseMenuOpen && courses.length > 0 && <div className="course-picker-options" id="resource-course-options" role="listbox" aria-label="Courses">
              {filteredCourses.length ? filteredCourses.map((course, index) => <button id={`resource-course-option-${course.id}`} className={`course-picker-option${index === activeCourseIndex ? ' is-active' : ''}`} key={course.id} type="button" role="option" aria-selected={course.id === courseId} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveCourseIndex(index)} onClick={() => selectCourse(course)}><strong>{course.code}</strong><span>{course.title}</span><small>{course.programme.department.name}</small></button>) : <p className="course-picker-empty">No matching courses. Try another search.</p>}
            </div>}
          </div>
          {courseId && <button className="course-picker-clear" type="button" onClick={() => { setCourseId(''); setCourseSearch(''); setCourseMenuOpen(true); setAcademicSessionId(''); setSemesterId(''); }}>Clear selection</button>}
        </div>
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
