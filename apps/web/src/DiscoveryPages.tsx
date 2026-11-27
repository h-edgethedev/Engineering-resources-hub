import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { PdfFirstPagePreview } from './PdfFirstPagePreview';
import { useAuth } from './auth';
import { fetchCourses } from './ResourceSubmission';
import { apiMutation, apiRequest } from './api';

interface Envelope<T> { data: T; meta?: { page: number; pageSize: number; total: number; totalPages: number }; }
interface University { id: string; name: string; slug: string; countryCode: string; faculties?: Faculty[]; _count?: { faculties: number }; }
interface Faculty { id: string; name: string; slug: string; departments?: Department[]; _count?: { departments: number }; }
interface Department { id: string; name: string; slug: string; }
interface Course {
  id: string; code: string; title: string; description?: string | null; creditUnits?: number | null;
  isGeneralEngineering?: boolean;
  programme: { id: string; name: string; slug: string; department: { id: string; name: string; slug: string; faculty: { id: string; name: string; slug: string; university: { id: string; name: string; slug: string } } } };
  offerings: Array<{ academicSession: { label: string }; semester: { code: string; label: string; programmeLevel: { code: string; label: string | null } } }>;
}
interface Resource {
  id: string; title: string; description: string | null; type: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED'; createdAt: string; quarantinedAt?: string | null; sourceAttribution?: string | null; tags?: string[];
  course: { id: string; code: string; title: string; programme: { department: { faculty: { university: { slug: string } } } } };
  academicSession: { id: string; label: string } | null;
  semester: { id: string; code: string; label: string; programmeLevel: { code: string; label: string | null } } | null;
  file: { id: string; originalFilename: string; mediaType: string; byteSize: number } | null;
  uploader: { id: string; displayName: string; profile: { username: string | null } | null } | null;
}

const editableResourceTypes = ['LECTURE_NOTE', 'TEXTBOOK', 'PAST_QUESTION', 'SOLUTION', 'LAB_MANUAL', 'PROGRAMMING_EXERCISE', 'OTHER'];

async function api<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  return apiRequest<T>(path, init);
}

function formatResourceType(type: string) { return type.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [type, setType] = useState(params.get('type') ?? '');
  const q = params.get('q')?.trim() ?? '';
  const typeFilter = params.get('type') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1));

  useEffect(() => {
    setQuery(params.get('q') ?? '');
    setType(params.get('type') ?? '');
  }, [params]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      const trimmedQuery = query.trim();

      if (trimmedQuery) next.set('q', trimmedQuery);
      else next.delete('q');
      next.delete('page');

      const currentQuery = params.get('q')?.trim() ?? '';
      if (trimmedQuery !== currentQuery) setParams(next, { replace: true });
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [query, params, setParams]);

  const coursesQuery = useQuery({
    queryKey: ['discovery', 'courses', q, page],
    queryFn: () => api<Course[]>(`/courses?page=${page}&pageSize=12${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  const resourcesQuery = useQuery({
    queryKey: ['discovery', 'resources', q, typeFilter, page],
    queryFn: async () => {
      const search = new URLSearchParams({ page: String(page), pageSize: '12' });
      if (q) search.set('q', q);
      if (typeFilter) search.set('type', typeFilter);
      return api<Resource[]>(`/resources?${search.toString()}`);
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim());
    if (type) next.set('type', type);
    setParams(next, { replace: true });
  }
  function changePage(nextPage: number) {
    const next = new URLSearchParams(params);
    nextPage > 1 ? next.set('page', String(nextPage)) : next.delete('page');
    setParams(next);
  }
  function clearSearch() {
    setQuery('');
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('page');
    setParams(next, { replace: true });
  }
  const courses = coursesQuery.data?.data ?? [];
  const resources = resourcesQuery.data?.data ?? [];
  return <div className="site-shell"><PublicHeader /><main className="discovery-page">
    <div className="discovery-heading"><p className="eyebrow">OPEN ACADEMIC DISCOVERY</p><h1>Explore courses and resources</h1><p>Search course codes, titles, and approved learning materials.</p></div>
    <form className="discovery-controls" onSubmit={submit} role="search"><label className="discovery-search"><span className="sr-only">Search courses and resources</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try a course code, topic, or resource title" />{query && <button className="discovery-clear" type="button" onClick={clearSearch} aria-label="Clear search">×</button>}</label>
      <label className="resource-type-filter">Resource type <select value={type} onChange={(event) => { setType(event.target.value); const next = new URLSearchParams(params); event.target.value ? next.set('type', event.target.value) : next.delete('type'); next.delete('page'); setParams(next); }}><option value="">All types</option><option value="LECTURE_NOTE">Lecture notes</option><option value="TEXTBOOK">Textbooks</option><option value="PAST_QUESTION">Past questions</option><option value="SOLUTION">Solutions</option><option value="LAB_MANUAL">Lab manuals</option><option value="PROGRAMMING_EXERCISE">Programming exercises</option><option value="OTHER">Other</option></select></label>
    </form>
    {(coursesQuery.isError || resourcesQuery.isError) && <div className="catalog-message catalog-error" role="alert">{coursesQuery.error?.message ?? resourcesQuery.error?.message}<button onClick={() => { void coursesQuery.refetch(); void resourcesQuery.refetch(); }}>Try again</button></div>}
    <section className="discovery-results" aria-labelledby="courses-heading"><div className="discovery-section-heading"><div><p className="eyebrow">ACADEMIC CATALOGUE</p><h2 id="courses-heading">Courses</h2></div>{coursesQuery.data && <span>{coursesQuery.data.meta?.total ?? courses.length} results · page {page} of {Math.max(1, coursesQuery.data.meta?.totalPages ?? 1)}</span>}</div>
      {coursesQuery.isPending ? <p className="discovery-state" role="status">Loading courses…</p> : courses.length ? <div className="discovery-course-grid">{courses.map((course) => <CourseCard key={course.id} course={course} />)}</div> : <p className="discovery-state">{q ? 'No courses matched this search.' : 'No courses are available yet.'}</p>}
      {coursesQuery.data && (page > 1 || page < (coursesQuery.data.meta?.totalPages ?? 1)) && <div className="discovery-pagination"><button disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous courses</button><button disabled={page >= (coursesQuery.data.meta?.totalPages ?? 1)} onClick={() => changePage(page + 1)}>Next courses</button></div>}
    </section>
    <section className="discovery-results" aria-labelledby="resources-heading"><div className="discovery-section-heading"><div><p className="eyebrow">APPROVED MATERIALS</p><h2 id="resources-heading">Resources</h2></div>{resourcesQuery.data && <span>{resourcesQuery.data.meta?.total ?? resources.length} results · page {page} of {Math.max(1, resourcesQuery.data.meta?.totalPages ?? 1)}</span>}</div>
      {resourcesQuery.isPending ? <p className="discovery-state" role="status">Loading approved resources…</p> : resources.length ? <div className="discovery-resource-list">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</div> : <p className="discovery-state">{q ? 'No approved resources matched this search.' : 'No approved resources are available yet.'}</p>}
      {resourcesQuery.data && (page > 1 || page < (resourcesQuery.data.meta?.totalPages ?? 1)) && <div className="discovery-pagination"><button disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous resources</button><button disabled={page >= (resourcesQuery.data.meta?.totalPages ?? 1)} onClick={() => changePage(page + 1)}>Next resources</button></div>}
    </section>
  </main></div>;
}

function CourseCard({ course }: { course: Course }) {
  return <article className="discovery-course-card"><p className="card-kicker">{course.code}{course.isGeneralEngineering ? ' · GENERAL ENGINEERING' : ''}</p><h3><Link to={`/courses/${course.id}`}>{course.title}</Link></h3><p>{course.programme.department.name} · {course.programme.department.faculty.university.name}</p>{course.creditUnits != null && <span>{course.creditUnits} credit units</span>}</article>;
}

function ResourceCard({ resource }: { resource: Resource }) {
  return <article className="discovery-resource-card"><div><p className="card-kicker">{formatResourceType(resource.type)}</p><h3><Link to={`/resources/${resource.id}`}>{resource.title}</Link></h3><p><Link to={`/courses/${resource.course.id}`}>{resource.course.code} · {resource.course.title}</Link></p><span className="resource-uploader-tag">@{resource.uploader?.profile?.username ?? 'username unavailable'}</span>{resource.description && <p className="resource-description">{resource.description}</p>}</div><span className="resource-public-badge">Approved</span></article>;
}

export function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const [resourceType, setResourceType] = useState('');
  const courseQuery = useQuery({ queryKey: ['course', courseId], queryFn: async () => (await api<Course>(`/courses/${courseId}`)).data, enabled: Boolean(courseId) });
  const resourcesQuery = useQuery({
    queryKey: ['course-resources', courseId, resourceType], queryFn: async () => {
      const search = new URLSearchParams({ courseId, page: '1', pageSize: '100' });
      if (resourceType) search.set('type', resourceType);
      return (await api<Resource[]>(`/resources?${search.toString()}`)).data;
    }, enabled: Boolean(courseId)
  });
  const course = courseQuery.data;
  return <div className="site-shell"><PublicHeader /><main className="discovery-page detail-page"><Link className="text-link" to="/explore">← Explore</Link>
    {courseQuery.isPending && <p className="discovery-state" role="status">Loading course…</p>}
    {courseQuery.isError && <div className="catalog-message catalog-error" role="alert">{courseQuery.error.message}</div>}
    {course && <><p className="eyebrow">{course.programme.department.faculty.university.name} · {course.programme.department.name}{course.isGeneralEngineering ? ' · GENERAL ENGINEERING' : ''}</p><h1>{course.title}</h1><p className="detail-course-code">{course.code}{course.creditUnits != null ? ` · ${course.creditUnits} credit units` : ''}</p>{course.description && <p className="detail-description">{course.description}</p>}
      <div className="detail-context"><span>{course.programme.name}</span>{course.offerings.map((offering) => <span key={`${offering.academicSession.label}-${offering.semester.code}-${offering.semester.programmeLevel.code}`}>{offering.semester.programmeLevel.label ?? `${offering.semester.programmeLevel.code} Level`} · {offering.semester.label} · {offering.academicSession.label}</span>)}</div>
      <section className="discovery-results"><div className="discovery-section-heading"><div><p className="eyebrow">COURSE MATERIALS</p><h2>Resources</h2></div><label className="detail-resource-filter">Filter by type <select value={resourceType} onChange={(event) => setResourceType(event.target.value)}><option value="">All types</option><option value="LECTURE_NOTE">Lecture notes</option><option value="TEXTBOOK">Textbooks</option><option value="PAST_QUESTION">Past questions</option><option value="SOLUTION">Solutions</option><option value="LAB_MANUAL">Lab manuals</option><option value="PROGRAMMING_EXERCISE">Programming exercises</option><option value="OTHER">Other</option></select></label></div>
        {resourcesQuery.isPending && <p className="discovery-state" role="status">Loading resources…</p>}{resourcesQuery.isError && <p className="catalog-message catalog-error" role="alert">{resourcesQuery.error.message}</p>}
        {resourcesQuery.data?.length ? <div className="discovery-resource-list">{resourcesQuery.data.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</div> : resourcesQuery.isSuccess ? <p className="discovery-state">There are no approved resources for this course yet.</p> : null}
      </section></>}
  </main></div>;
}

export function ResourceDetailPage() {
  const { resourceId = '' } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('WRONG_CONTENT');
  const [reportExplanation, setReportExplanation] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [reportError, setReportError] = useState('');
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState('LECTURE_NOTE');
  const [editSource, setEditSource] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editCourseId, setEditCourseId] = useState('');
  const [editAcademicSessionId, setEditAcademicSessionId] = useState('');
  const [editSemesterId, setEditSemesterId] = useState('');
  const [governanceMessage, setGovernanceMessage] = useState('');
  const [governanceError, setGovernanceError] = useState('');
  const canGovern = user?.roleAssignments.some((grant) => grant.role === 'SUPER_ADMIN' || grant.role === 'MODERATOR') ?? false;
  const superAdmin = user?.roleAssignments.some((grant) => grant.role === 'SUPER_ADMIN') ?? false;
  const resourceQuery = useQuery({ queryKey: ['resource', resourceId], queryFn: async () => (await api<Resource>(`/resources/${resourceId}`)).data, enabled: Boolean(resourceId) });
  const resource = resourceQuery.data;
  const coursesQuery = useQuery({ queryKey: ['courses', 'resource-detail-edit', resource?.course.programme.department.faculty.university.slug], queryFn: () => fetchCourses(resource!.course.programme.department.faculty.university.slug), enabled: governanceOpen && Boolean(resource), staleTime: 5 * 60_000 });
  const editCourses = coursesQuery.data ?? [];
  const selectedEditCourse = editCourses.find((course) => course.id === editCourseId);
  const editAcademicSessions = [...new Map((selectedEditCourse?.offerings ?? []).map(({ academicSession }) => [academicSession.id, academicSession])).values()];
  const editSemesters = [...new Map((selectedEditCourse?.offerings ?? []).filter((offering) => !editAcademicSessionId || offering.academicSession.id === editAcademicSessionId).map(({ semester }) => [semester.id, semester])).values()];
  async function governanceRequest(path: string, method: string, body: Record<string, unknown>) {
    await apiMutation(`/resources/${resourceId}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, ...(method === 'PATCH' || method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }, queryClient, [['resource', resourceId], ['discovery', 'resources'], ['course-resources'], ['landing-resources']]);
  }
  async function saveResourceEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setGovernanceError(''); setGovernanceMessage('');
    try {
      await governanceRequest('', 'PATCH', { courseId: editCourseId, academicSessionId: editAcademicSessionId || null, semesterId: editSemesterId || null, title: editTitle.trim(), description: editDescription.trim() || null, type: editType, sourceAttribution: editSource.trim() || null, tags: editTags.split(',').map((tag) => tag.trim()).filter(Boolean) });
      setGovernanceOpen(false); setGovernanceMessage('Resource details updated.');
    } catch (error) { setGovernanceError(error instanceof Error ? error.message : 'Could not update this resource.'); }
  }
  function openResourceEditor() {
    if (!resource) return;
    setEditTitle(resource.title);
    setEditDescription(resource.description ?? '');
    setEditType(resource.type);
    setEditSource(resource.sourceAttribution ?? '');
    setEditTags((resource.tags ?? []).join(', '));
    setEditCourseId(resource.course.id);
    setEditAcademicSessionId(resource.academicSession?.id ?? '');
    setEditSemesterId(resource.semester?.id ?? '');
    setGovernanceOpen((value) => !value);
    setGovernanceError('');
  }
  async function quarantineResource() {
    const reason = window.prompt('Reason for quarantining this resource:');
    if (!reason?.trim()) return;
    setGovernanceError(''); setGovernanceMessage('');
    try {
      await governanceRequest('/quarantine', 'POST', { reason: reason.trim() });
      setGovernanceMessage('Resource quarantined and hidden from public discovery.');
    } catch (error) { setGovernanceError(error instanceof Error ? error.message : 'Could not quarantine this resource.'); }
  }
  async function replaceResourceFile(file: File | undefined) {
    if (!file || !resource || !window.confirm(`Replace the file for “${resource.title}”? The resource will return to pending review.`)) return;
    setGovernanceError(''); setGovernanceMessage('');
    try {
      const form = new FormData(); form.set('file', file);
      await apiMutation(`/resources/${resourceId}/file`, { method: 'POST', body: form }, queryClient, [['resource', resourceId], ['discovery', 'resources'], ['course-resources']]);
      setGovernanceMessage('File replaced. The resource returned to pending review.');
    } catch (error) { setGovernanceError(error instanceof Error ? error.message : 'Could not replace the resource file.'); }
  }
  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setReportError(''); setReportMessage('');
    try {
      await apiMutation(`/resources/${resourceId}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: reportCategory, explanation: reportExplanation.trim() }) }, queryClient, [['governance-inbox'], ['pending-review-count']]);
      setReportMessage('Report sent to the moderation team.'); setReportExplanation(''); setReportOpen(false);
    } catch (error) { setReportError(error instanceof Error ? error.message : 'Could not submit this report.'); }
  }
  return <div className="site-shell"><PublicHeader /><main className="discovery-page detail-page"><Link className="text-link" to="/explore">← Explore</Link>
    {resourceQuery.isPending && <p className="discovery-state" role="status">Loading resource…</p>}
    {resourceQuery.isError && <div className="catalog-message catalog-error" role="alert">{resourceQuery.error.message}</div>}
    {resource && <><p className="eyebrow">{formatResourceType(resource.type)} · {resource.status} RESOURCE</p><h1>{resource.title}</h1><p className="detail-course-code"><Link to={`/courses/${resource.course.id}`}>{resource.course.code} · {resource.course.title}</Link></p><section className="resource-description-panel" aria-label="About this resource"><h2>About this resource</h2><p>{resource.description?.trim() || 'No description has been provided for this resource.'}</p></section>
      <dl className="resource-metadata"><div><dt>Academic session</dt><dd>{resource.academicSession?.label ?? 'Not specified'}</dd></div><div><dt>Level and semester</dt><dd>{resource.semester ? `${resource.semester.programmeLevel.label ?? `${resource.semester.programmeLevel.code} Level`} · ${resource.semester.label}` : 'Not specified'}</dd></div><div><dt>Shared by</dt><dd>{resource.uploader?.displayName ?? 'EngHub community'}<br /><span className="resource-uploader-tag">@{resource.uploader?.profile?.username ?? 'username unavailable'}</span></dd></div></dl>
      <div className="resource-actions"><a className="button button-purple" href={`/api/v1/resources/${resource.id}/file/download`}>Download file</a>{resource.file && <span>{resource.file.originalFilename} · {Math.max(1, Math.round(resource.file.byteSize / 1024))} KB</span>}</div>
      {canGovern && <section className="resource-governance-tools" aria-label="Resource moderation tools"><div className="resource-governance-heading"><div><p className="card-kicker">MODERATION TOOLS</p><strong>Manage this resource</strong></div><div className="resource-governance-actions">{!resource.quarantinedAt && resource.status !== 'REMOVED' && <button className="button button-outline" type="button" onClick={() => void quarantineResource()}>Quarantine resource</button>}<button className="button button-outline" type="button" onClick={openResourceEditor}>{governanceOpen ? 'Close editor' : 'Edit details'}</button></div></div>{resource.quarantinedAt && <p className="field-hint">This resource is quarantined and hidden from public discovery.</p>}{governanceMessage && <p className="submission-success" role="status">{governanceMessage}</p>}{governanceError && <p className="auth-error" role="alert">{governanceError}</p>}{superAdmin && resource.file && <label className="file-replacement-control">Replace file…<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" onChange={(event) => { void replaceResourceFile(event.target.files?.[0]); event.target.value = ''; }} /></label>}{governanceOpen && <form className="governance-edit-form" onSubmit={(event) => void saveResourceEdits(event)}>
        <label>Course<select value={editCourseId} onChange={(event) => { setEditCourseId(event.target.value); setEditAcademicSessionId(''); setEditSemesterId(''); }} disabled={coursesQuery.isPending || !editCourses.length} required>{coursesQuery.isPending && <option value={editCourseId}>Loading courses…</option>}{editCourses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title} — {course.programme.department.name}</option>)}</select></label>
        {coursesQuery.isError && <p className="auth-error" role="alert">{coursesQuery.error.message}</p>}
        <label>Academic session <span className="optional-label">Optional</span><select value={editAcademicSessionId} onChange={(event) => { setEditAcademicSessionId(event.target.value); if (editSemesterId && event.target.value && !selectedEditCourse?.offerings.some((offering) => offering.academicSession.id === event.target.value && offering.semester.id === editSemesterId)) setEditSemesterId(''); }} disabled={!selectedEditCourse?.offerings.length}><option value="">Not specified</option>{editAcademicSessions.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}</select></label>
        <label>Level and semester <span className="optional-label">Optional</span><select value={editSemesterId} onChange={(event) => { setEditSemesterId(event.target.value); if (editAcademicSessionId && event.target.value && !selectedEditCourse?.offerings.some((offering) => offering.academicSession.id === editAcademicSessionId && offering.semester.id === event.target.value)) setEditAcademicSessionId(''); }} disabled={!selectedEditCourse?.offerings.length}><option value="">Not specified</option>{editSemesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.programmeLevel.label ?? `${semester.programmeLevel.code} Level`} · {semester.label}</option>)}</select></label>
        <label>Resource title<input value={editTitle} maxLength={250} required onChange={(event) => setEditTitle(event.target.value)} /></label>
        <label>Material type<select value={editType} onChange={(event) => setEditType(event.target.value)}>{editableResourceTypes.map((type) => <option key={type} value={type}>{formatResourceType(type)}</option>)}</select></label>
        <label>Description <span className="optional-label">Optional</span><textarea value={editDescription} maxLength={10_000} rows={4} onChange={(event) => setEditDescription(event.target.value)} /></label>
        <label>Author or source attribution <span className="optional-label">Optional</span><input value={editSource} maxLength={500} onChange={(event) => setEditSource(event.target.value)} /></label>
        <label>Tags and keywords <span className="optional-label">Optional</span><input value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="comma separated" /></label>
        <div><span className="field-label">File</span><p>{resource.file?.originalFilename ?? 'No file attached'}</p><span className="field-hint">Moderators can edit resource details but cannot replace its file.</span></div>
        <button className="button button-purple" type="submit">Save resource</button>
      </form>}</section>}
      {user && resource.status === 'APPROVED' && <section className="resource-report"><button type="button" className="text-link" onClick={() => setReportOpen((value) => !value)}>{reportOpen ? 'Close report form' : 'Report a problem with this resource'}</button>{reportMessage && <p role="status">{reportMessage}</p>}{reportOpen && <form className="governance-edit-form" onSubmit={(event) => void submitReport(event)}><label>Issue type<select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}><option value="BROKEN_FILE">File is broken or unreadable</option><option value="WRONG_CONTENT">Wrong course or content</option><option value="COPYRIGHT">Copyright concern</option><option value="PRIVACY">Privacy concern</option><option value="INAPPROPRIATE">Inappropriate content</option><option value="OTHER">Other</option></select></label><label>Details<textarea required minLength={1} maxLength={2000} rows={3} value={reportExplanation} onChange={(event) => setReportExplanation(event.target.value)} /></label>{reportError && <p className="auth-error" role="alert">{reportError}</p>}<button className="button button-purple" type="submit">Send report</button></form>}</section>}
      {resource.file?.mediaType === 'application/pdf' && <section className="resource-preview" aria-label="Document preview"><PdfFirstPagePreview title={resource.title} src={`/api/v1/resources/${resource.id}/file`} /></section>}
      {resource.file?.mediaType === 'text/plain' && <section className="resource-preview"><iframe title={`Preview of ${resource.title}`} src={`/api/v1/resources/${resource.id}/file`} /></section>}
    </>}
  </main></div>;
}

export function UniversitiesPage() {
  const query = useQuery({ queryKey: ['universities'], queryFn: async () => (await api<University[]>('/universities')).data });
  return <div className="site-shell"><PublicHeader /><main className="discovery-page"><div className="discovery-heading"><p className="eyebrow">ACADEMIC COMMUNITIES</p><h1>Universities</h1><p>Explore institutions and their academic catalogues.</p></div>
    {query.isPending && <p className="discovery-state" role="status">Loading universities…</p>}{query.isError && <div className="catalog-message catalog-error" role="alert">{query.error.message}<button onClick={() => void query.refetch()}>Try again</button></div>}
    {query.data?.length ? <div className="discovery-course-grid">{query.data.map((university) => <article className="discovery-course-card" key={university.id}><p className="card-kicker">{university.countryCode}</p><h2><Link to={`/universities/${university.slug}`}>{university.name}</Link></h2><p>{university._count?.faculties ?? 0} faculties</p></article>)}</div> : query.isSuccess ? <p className="discovery-state">No universities are available yet.</p> : null}
  </main></div>;
}

export function UniversityDetailPage() {
  const { slug = '' } = useParams();
  const query = useQuery({ queryKey: ['university-detail', slug], queryFn: async () => (await api<University>(`/universities/${slug}`)).data, enabled: Boolean(slug) });
  const university = query.data;
  const navigate = useNavigate();
  return <div className="site-shell"><PublicHeader /><main className="discovery-page"><Link className="text-link" to="/universities">← Universities</Link>
    {query.isPending && <p className="discovery-state" role="status">Loading university…</p>}{query.isError && <div className="catalog-message catalog-error" role="alert">{query.error.message}</div>}
    {university && <><div className="discovery-heading"><p className="eyebrow">{university.countryCode}</p><h1>{university.name}</h1><p>Explore departments and courses in this institution.</p></div><div className="university-department-list">{university.faculties?.flatMap((faculty) => (faculty.departments ?? []).map((department) => <article key={department.id}><p className="card-kicker">{faculty.name}</p><h2>{department.name}</h2><button className="text-link" onClick={() => navigate(`/universities/${university.slug}/faculties/${faculty.slug}/departments/${department.slug}`)}>Explore department →</button></article>))}</div></>}
  </main></div>;
}
