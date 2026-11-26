import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { useAuth } from './auth';
import { fetchCourses } from './ResourceSubmission';

interface Envelope<T> { data: T; meta?: { page: number; pageSize: number; total: number; totalPages: number }; error?: { message?: string }; }
interface GovernanceResource {
  id: string; title: string; description: string | null; type: string; status: string; sourceAttribution: string | null; tags: string[];
  createdAt: string; uploadedById: string | null; trashedAt: string | null; trashExpiresAt: string | null; trashReason: string | null;
  trashMethod: string | null; trashedById: string | null; quarantinedAt: string | null; quarantineReason: string | null;
  course: { id: string; code: string; title: string; programme: { department: { faculty: { university: { slug: string } } } } };
  academicSession: { id: string; label: string } | null;
  semester: { id: string; code: string; label: string; programmeLevel: { code: string; label: string | null } } | null;
  file: { originalFilename: string; mediaType: string; byteSize: number } | null;
  uploader: { id: string; displayName: string; profile: { username: string | null } | null } | null;
}
interface DeletionRequest {
  id: string; resourceId: string | null; resourceIdSnapshot: string; requestedById: string; requestedByRole: string;
  category: string; explanation: string; status: string; decidedById: string | null; decidedAt: string | null; decisionNote: string | null; createdAt: string;
  resource: GovernanceResource | null;
}
interface ResourceReport { id: string; resourceIdSnapshot: string; reporterId: string; reporterRole: string; category: string; explanation: string; status: string; createdAt: string; resource: GovernanceResource | null; }
interface History { events: Array<{ id: string; action: string; actorId: string | null; actorName: string; actorRole: string | null; fieldName: string | null; previousValue: unknown; newValue: unknown; reason: string | null; createdAt: string }>; moderationActions: Array<{ id: string; action: string; actorId: string; actorName: string; reason: string | null; createdAt: string }>; deletionRequests: Array<{ id: string; status: string; category: string; explanation: string; requestedById: string; requestedByName: string; decidedByName: string; createdAt: string }>; reports: Array<{ id: string; status: string; category: string; explanation: string; reporterId: string; reporterName: string; reviewedByName: string; createdAt: string }> }

const resourceTypes = ['LECTURE_NOTE', 'TEXTBOOK', 'PAST_QUESTION', 'SOLUTION', 'LAB_MANUAL', 'PROGRAMMING_EXERCISE', 'OTHER'];
const categories = ['DUPLICATE', 'INCORRECT_CLASSIFICATION', 'WRONG_COURSE', 'OUTDATED_MISLEADING', 'CORRUPTED_FILE', 'COPYRIGHT', 'PRIVACY', 'INAPPROPRIATE', 'OTHER'];
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

async function api<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as Envelope<unknown> | null;
    throw new Error(body?.error?.message ?? 'The request could not be completed.');
  }
  return response.status === 204 ? { data: undefined as T } : response.json() as Promise<Envelope<T>>;
}
async function csrfHeaders() {
  const response = await api<{ csrfToken: string }>('/auth/csrf');
  return { 'Content-Type': 'application/json', 'X-CSRF-Token': response.data.csrfToken };
}
function useGovernanceRefresh() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['governance'] }),
      queryClient.invalidateQueries({ queryKey: ['operations-resources'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-review-count'] }),
      queryClient.invalidateQueries({ queryKey: ['landing-resources'] }),
      queryClient.invalidateQueries({ queryKey: ['discovery', 'resources'] }),
      queryClient.invalidateQueries({ queryKey: ['course-resources'] }),
      queryClient.invalidateQueries({ queryKey: ['resource'] }),
    ]);
  };
}

export function ResourceGovernancePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab = requestedTab === 'requests' || requestedTab === 'reports' || requestedTab === 'trash' || requestedTab === 'quarantined' ? requestedTab : 'published';
  const superAdmin = Boolean(user?.roleAssignments.some((grant) => grant.role === 'SUPER_ADMIN'));
  const [tab, setTab] = useState<'published' | 'requests' | 'reports' | 'trash' | 'quarantined'>(initialTab);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);
  const searchParam = search ? `&q=${encodeURIComponent(search)}` : '';
  const base = '/resources';
  const refresh = useGovernanceRefresh();
  const publishedQuery = useQuery({ queryKey: ['governance', 'published', page, search], enabled: tab === 'published', queryFn: () => api<GovernanceResource[]>(`${base}?status=APPROVED&page=${page}&pageSize=20${searchParam}`) });
  const requestsQuery = useQuery({ queryKey: ['governance', 'requests', page, search], enabled: tab === 'requests', queryFn: () => api<DeletionRequest[]>(`${base}/governance/deletion-requests?status=PENDING&page=${page}&pageSize=20${searchParam}`) });
  const reportsQuery = useQuery({ queryKey: ['governance', 'reports', page, search], enabled: tab === 'reports', queryFn: () => api<ResourceReport[]>(`${base}/governance/reports?status=OPEN&page=${page}&pageSize=20${searchParam}`) });
  const trashQuery = useQuery({ queryKey: ['governance', 'trash', page, search], enabled: tab === 'trash', queryFn: () => api<GovernanceResource[]>(`${base}/governance/trash?page=${page}&pageSize=20${searchParam}`) });
  const quarantinedQuery = useQuery({ queryKey: ['governance', 'quarantined', page, search], enabled: tab === 'quarantined', queryFn: () => api<GovernanceResource[]>(`${base}/governance/quarantined?page=${page}&pageSize=20${searchParam}`) });
  const activeQuery = tab === 'published' ? publishedQuery : tab === 'requests' ? requestsQuery : tab === 'reports' ? reportsQuery : tab === 'trash' ? trashQuery : quarantinedQuery;

  async function decideRequest(requestId: string, action: 'APPROVE' | 'REJECT') {
    const note = window.prompt(action === 'APPROVE' ? 'Optional administrative note:' : 'Reason for rejecting this request:');
    if (action === 'REJECT' && !note?.trim()) return;
    setMessage('');
    try {
      await api(`/resources/governance/deletion-requests/${requestId}/decision`, { method: 'POST', headers: await csrfHeaders(), body: JSON.stringify({ action, ...(note?.trim() ? { note: note.trim() } : {}) }) });
      await refresh(); setMessage(action === 'APPROVE' ? 'Request approved. The resource is now in Trash.' : 'Deletion request rejected.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not decide this request.'); }
  }
  async function resolveReport(reportId: string, action: 'RESOLVED' | 'DISMISSED') {
    const note = window.prompt(action === 'RESOLVED' ? 'What action resolved this report?' : 'Why is this report being dismissed?');
    if (!note?.trim()) return;
    setMessage('');
    try { await api(`/resources/governance/reports/${reportId}/decision`, { method: 'POST', headers: await csrfHeaders(), body: JSON.stringify({ action, note: note.trim() }) }); await refresh(); setMessage(`Report ${action.toLowerCase()}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not resolve this report.'); }
  }
  async function restore(resourceId: string) {
    setMessage('');
    try { await api(`${base}/${resourceId}/restore`, { method: 'POST', headers: await csrfHeaders() }); await refresh(); setMessage('Resource restored.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not restore this resource.'); }
  }
  async function clearQuarantine(resourceId: string) {
    const reason = window.prompt('Explain why the safety quarantine can be cleared:');
    if (!reason?.trim()) return;
    setMessage('');
    try { await api(`${base}/${resourceId}/quarantine/clear`, { method: 'POST', headers: await csrfHeaders(), body: JSON.stringify({ reason: reason.trim() }) }); await refresh(); setMessage('Quarantine cleared.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not clear quarantine.'); }
  }
  async function purge(resource: GovernanceResource) {
    if (!window.confirm(`Permanently delete “${resource.title}”? This cannot be undone.`)) return;
    const confirmation = window.prompt('Type PERMANENTLY_DELETE to confirm:');
    if (confirmation !== 'PERMANENTLY_DELETE') return;
    const reason = window.prompt('Required reason for permanent deletion:');
    if (!reason?.trim()) return;
    setMessage('');
    try { await api(`${base}/${resource.id}/purge`, { method: 'POST', headers: await csrfHeaders(), body: JSON.stringify({ confirmation, reason: reason.trim() }) }); await refresh(); setMessage('Permanent deletion was queued. Storage failures remain queued for retry.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not permanently delete this resource.'); }
  }

  return <div className="site-shell"><PublicHeader /><main className="admin-page">
    <div className="operations-heading"><div><p className="eyebrow">RESOURCE GOVERNANCE</p><h1>Resource management</h1><p>Manage published materials, deletion requests, safety holds, and recovery.</p></div><Link className="text-link" to="/account">My account</Link></div>
    <nav className="governance-tabs" aria-label="Resource management views">
      {([['published', 'Published resources'], ['requests', 'Deletion requests'], ['reports', 'Reports'], ['trash', 'Trash'], ['quarantined', 'Quarantined']] as const).map(([value, text]) => <button type="button" key={value} className={tab === value ? 'is-active' : ''} onClick={() => { setTab(value); setPage(1); }}>{text}</button>)}
    </nav>
    <form className="governance-search" role="search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
      <label><span className="sr-only">Search governance items</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={`Search ${tab === 'published' ? 'published resources' : tab === 'requests' ? 'deletion requests' : tab === 'reports' ? 'reports' : tab === 'trash' ? 'Trash resources' : 'quarantined resources'}…`} />{searchInput && <button type="button" className="governance-search-clear" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} aria-label="Clear search">×</button>}</label>
    </form>
    {message && <p className="admin-feedback" role="status">{message}</p>}
    {activeQuery.isPending && <p className="discovery-state" role="status">Loading {tab}…</p>}
    {activeQuery.isError && <div className="catalog-message catalog-error" role="alert">{activeQuery.error.message}<button onClick={() => void activeQuery.refetch()}>Try again</button></div>}
    {tab === 'published' && publishedQuery.data?.data.map((resource) => <GovernanceResourceCard key={resource.id} resource={resource} superAdmin={superAdmin} onRefresh={refresh} onMessage={setMessage} />)}
    {tab === 'requests' && requestsQuery.data?.data.map((request) => <article className="admin-resource-card governance-request" key={request.id}>
      <div className="admin-resource-main"><div className="admin-resource-copy"><p className="card-kicker">{label(request.category)} · REQUESTED {new Date(request.createdAt).toLocaleString()}</p><h2>{request.resource?.title ?? 'Resource no longer available'}</h2>{request.resource && <p><Link to={`/resources/${request.resource.id}`}>{request.resource.course.code} · {request.resource.course.title}</Link></p>}<p className="admin-resource-meta">Requested by {request.requestedByRole} · {request.requestedById}</p><p>{request.explanation}</p>{request.resource && <HistoryPanel resourceId={request.resource.id} />}</div></div>
      {superAdmin && <div className="moderation-actions"><button className="button button-purple" type="button" onClick={() => void decideRequest(request.id, 'APPROVE')}>Approve · move to Trash</button><button className="button button-outline" type="button" onClick={() => void decideRequest(request.id, 'REJECT')}>Reject request</button></div>}
    </article>)}
    {tab === 'reports' && reportsQuery.data?.data.map((report) => <article className="admin-resource-card governance-request" key={report.id}><div className="admin-resource-copy"><p className="card-kicker">{label(report.category)} · REPORTED {new Date(report.createdAt).toLocaleString()}</p><h2>{report.resource?.title ?? 'Resource no longer available'}</h2>{report.resource && <p><Link to={`/resources/${report.resource.id}`}>{report.resource.course.code} · {report.resource.course.title}</Link></p>}<p className="admin-resource-meta">Reported by {report.reporterRole} · {report.reporterId}</p><p>{report.explanation}</p></div><div className="moderation-actions"><button className="button button-purple" type="button" disabled={report.reporterId === user?.id} onClick={() => void resolveReport(report.id, 'RESOLVED')}>Resolve report</button><button className="button button-outline" type="button" disabled={report.reporterId === user?.id} onClick={() => void resolveReport(report.id, 'DISMISSED')}>Dismiss report</button></div></article>)}
    {tab === 'trash' && trashQuery.data?.data.map((resource) => <article className="admin-resource-card" key={resource.id}><GovernanceSummary resource={resource} /><p className="admin-resource-meta">Moved by {resource.trashedById ?? 'Unknown'} · {resource.trashMethod === 'APPROVED_REQUEST' ? 'approved deletion request' : 'direct Super Admin action'}</p><p>Reason: {resource.trashReason ?? 'Not recorded'}</p><p>Recovery expires: {resource.trashExpiresAt ? new Date(resource.trashExpiresAt).toLocaleString() : 'Expiry unavailable'}</p><div className="moderation-actions"><button className="button button-purple" type="button" onClick={() => void restore(resource.id)}>Restore resource</button>{superAdmin && <button className="button button-outline" type="button" onClick={() => void purge(resource)}>Permanently delete…</button>}<HistoryPanel resourceId={resource.id} /></div></article>)}
    {tab === 'quarantined' && quarantinedQuery.data?.data.map((resource) => <GovernanceResourceCard key={resource.id} resource={resource} superAdmin={superAdmin} onRefresh={refresh} onMessage={setMessage} quarantined onClearQuarantine={clearQuarantine} />)}
    {activeQuery.isSuccess && activeQuery.data.data.length === 0 && <p className="discovery-state">No {tab === 'published' ? 'published resources' : tab === 'requests' ? 'pending deletion requests' : tab === 'reports' ? 'open reports' : tab} found.</p>}
    {activeQuery.data?.meta && activeQuery.data.meta.totalPages > 1 && <div className="admin-paging"><span>{activeQuery.data.meta.total} items · page {page} of {activeQuery.data.meta.totalPages}</span><div><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button disabled={page >= activeQuery.data!.meta!.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
  </main></div>;
}

function GovernanceSummary({ resource }: { resource: GovernanceResource }) {
  return <div className="admin-resource-main"><div className="admin-resource-copy"><p className="card-kicker">{resource.status} · {label(resource.type)}</p><h2>{resource.title}</h2><p>{resource.course.code} · {resource.course.title}</p><p className="admin-resource-meta">Submitted by {resource.uploader?.displayName ?? 'Unknown contributor'}{resource.uploader?.profile?.username ? ` · @${resource.uploader.profile.username}` : ''}</p><Link className="governance-resource-detail-link" to={`/resources/${resource.id}`}>Open resource details</Link></div><span className={`admin-status admin-status-${resource.status.toLowerCase()}`}>{resource.status}</span></div>;
}

function GovernanceResourceCard({ resource, superAdmin, onRefresh, onMessage, quarantined = false, onClearQuarantine }: { resource: GovernanceResource; superAdmin: boolean; onRefresh: () => Promise<void>; onMessage: (value: string) => void; quarantined?: boolean; onClearQuarantine?: (resourceId: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [category, setCategory] = useState('DUPLICATE');
  const [explanation, setExplanation] = useState('');
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description ?? '');
  const [type, setType] = useState(resource.type);
  const [source, setSource] = useState(resource.sourceAttribution ?? '');
  const [tags, setTags] = useState(resource.tags.join(', '));
  const [courseId, setCourseId] = useState(resource.course.id);
  const [academicSessionId, setAcademicSessionId] = useState(resource.academicSession?.id ?? '');
  const [semesterId, setSemesterId] = useState(resource.semester?.id ?? '');
  const coursesQuery = useQuery({ queryKey: ['courses', 'resource-governance-edit', resource.course.programme.department.faculty.university.slug], queryFn: () => fetchCourses(resource.course.programme.department.faculty.university.slug), enabled: editing, staleTime: 5 * 60_000 });
  const selectedCourse = coursesQuery.data?.find((course) => course.id === courseId);
  const academicSessions = [...new Map((selectedCourse?.offerings ?? []).map(({ academicSession }) => [academicSession.id, academicSession])).values()];
  const semesterOptions = (selectedCourse?.offerings ?? []).filter((offering) => !academicSessionId || offering.academicSession.id === academicSessionId).map(({ semester }) => semester);

  async function saveMetadata(event: FormEvent) {
    event.preventDefault();
    onMessage('');
    try {
      await api(`/resources/${resource.id}`, { method: 'PATCH', headers: await csrfHeaders(), body: JSON.stringify({ courseId, academicSessionId: academicSessionId || null, semesterId: semesterId || null, title: title.trim(), description: description.trim() || null, type, sourceAttribution: source.trim() || null, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) }) });
      await onRefresh(); setEditing(false); onMessage('Resource metadata updated and recorded in history.');
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Could not save metadata.'); }
  }
  async function submitDeletion(event: FormEvent) {
    event.preventDefault(); onMessage('');
    try {
      await api(`/resources/${resource.id}/deletion-requests`, { method: 'POST', headers: await csrfHeaders(), body: JSON.stringify({ category, explanation: explanation.trim() }) });
      await onRefresh(); setRequesting(false); setExplanation(''); onMessage('Deletion request submitted for Super Admin review.');
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Could not submit deletion request.'); }
  }
  async function moveToTrash() {
    if (!window.confirm(`Move “${resource.title}” to Trash? It will remain recoverable for 30 days.`)) return;
    const reason = window.prompt('Reason for moving this resource to Trash:'); if (!reason?.trim()) return;
    try { await api(`/resources/${resource.id}`, { method: 'DELETE', headers: await csrfHeaders(), body: JSON.stringify({ reason: reason.trim() }) }); await onRefresh(); onMessage('Resource moved to Trash. Its file is retained during the recovery window.'); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Could not move resource to Trash.'); }
  }
  async function replaceFile(file: File | undefined) {
    if (!file) return;
    if (!window.confirm(`Replace the file for “${resource.title}”? The resource will return to pending review.`)) return;
    try {
      const csrf = await api<{ csrfToken: string }>('/auth/csrf');
      const form = new FormData(); form.set('file', file);
      const response = await fetch(`/api/v1/resources/${resource.id}/file`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf.data.csrfToken }, body: form });
      if (!response.ok) { const result = await response.json().catch(() => null) as Envelope<unknown> | null; throw new Error(result?.error?.message ?? 'Could not replace the resource file.'); }
      await onRefresh(); onMessage('File replaced. The resource returned to pending review.');
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Could not replace the resource file.'); }
  }
  async function quarantine() {
    const reason = window.prompt('Urgent safety reason for hiding this resource:'); if (!reason?.trim()) return;
    try { await api(`/resources/${resource.id}/quarantine`, { method: 'POST', headers: await csrfHeaders(), body: JSON.stringify({ reason: reason.trim() }) }); await onRefresh(); onMessage('Resource quarantined and flagged for Super Admin review.'); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Could not quarantine the resource.'); }
  }
  return <article className="admin-resource-card"><GovernanceSummary resource={resource} />
    {quarantined && <><p>Quarantined {resource.quarantinedAt ? new Date(resource.quarantinedAt).toLocaleString() : ''}</p><p>Reason: {resource.quarantineReason}</p></>}
    {resource.description && <p>{resource.description}</p>}{resource.sourceAttribution && <p>Source: {resource.sourceAttribution}</p>}{resource.tags.length > 0 && <p>Tags: {resource.tags.join(', ')}</p>}
    <div className="moderation-actions">{(!quarantined || superAdmin) && <button type="button" className="button button-outline" onClick={() => setEditing((value) => !value)}>Edit metadata</button>}{!quarantined && <><button type="button" className="button button-outline" onClick={() => setRequesting((value) => !value)}>Request deletion</button><button type="button" className="button button-outline" onClick={() => void quarantine()}>Emergency quarantine…</button></>}{quarantined && superAdmin && <button className="button button-purple" type="button" onClick={() => void onClearQuarantine?.(resource.id)}>Clear quarantine…</button>}{superAdmin && <><button type="button" className="button button-outline" onClick={() => void moveToTrash()}>Move to Trash…</button>{!quarantined && <label className="file-replacement-control">Replace file…<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" onChange={(event) => { void replaceFile(event.target.files?.[0]); event.target.value = ''; }} /></label>}</>}<HistoryPanel resourceId={resource.id} /></div>
    {editing && <form className="governance-edit-form" onSubmit={(event) => void saveMetadata(event)}>
      <label>Course<select value={courseId} onChange={(event) => { setCourseId(event.target.value); setAcademicSessionId(''); setSemesterId(''); }} disabled={coursesQuery.isPending || !coursesQuery.data?.length} required>{coursesQuery.isPending && <option value={courseId}>Loading courses…</option>}{(coursesQuery.data ?? []).map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title} — {course.programme.department.name}</option>)}</select></label>
      {coursesQuery.isError && <p className="auth-error" role="alert">{coursesQuery.error.message}</p>}
      <label>Academic session <span className="optional-label">Optional</span><select value={academicSessionId} onChange={(event) => { setAcademicSessionId(event.target.value); if (semesterId && event.target.value && !selectedCourse?.offerings.some((offering) => offering.academicSession.id === event.target.value && offering.semester.id === semesterId)) setSemesterId(''); }} disabled={!selectedCourse?.offerings.length}><option value="">Not specified</option>{academicSessions.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}</select></label>
      <label>Level and semester <span className="optional-label">Optional</span><select value={semesterId} onChange={(event) => { setSemesterId(event.target.value); if (academicSessionId && event.target.value && !selectedCourse?.offerings.some((offering) => offering.academicSession.id === academicSessionId && offering.semester.id === event.target.value)) setAcademicSessionId(''); }} disabled={!selectedCourse?.offerings.length}><option value="">Not specified</option>{[...new Map(semesterOptions.map((semester) => [semester.id, semester])).values()].map((semester) => <option key={semester.id} value={semester.id}>{semester.programmeLevel.label ?? `${semester.programmeLevel.code} Level`} · {semester.label}</option>)}</select></label>
      <label>Resource title<input value={title} maxLength={250} required onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Material type<select value={type} onChange={(event) => setType(event.target.value)}>{resourceTypes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      <label>Description <span className="optional-label">Optional</span><textarea value={description} maxLength={10_000} rows={4} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Author or source attribution <span className="optional-label">Optional</span><input value={source} maxLength={500} onChange={(event) => setSource(event.target.value)} /></label>
      <label>Tags and keywords <span className="optional-label">Optional</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="comma separated" /></label>
      <div><span className="field-label">File</span><p>{resource.file?.originalFilename ?? 'No file attached'}</p><span className="field-hint">Moderators can edit resource details but cannot replace its file.</span></div>
      <button className="button button-purple" type="submit">Save resource</button>
    </form>}
    {requesting && <form className="governance-edit-form" onSubmit={(event) => void submitDeletion(event)}><label>Reason category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label>Explanation<textarea value={explanation} maxLength={2000} minLength={1} required rows={3} onChange={(event) => setExplanation(event.target.value)} /></label><button className="button button-purple" type="submit">Submit deletion request</button></form>}
    {superAdmin && <p className="field-hint">Super Admin actions and decisions are recorded in the governance history.</p>}
  </article>;
}

function HistoryPanel({ resourceId }: { resourceId: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['governance', 'history', resourceId], enabled: open, queryFn: async () => (await api<History>(`/resources/${resourceId}/history`)).data });
  return <div className="governance-history"><button type="button" className="text-link" onClick={() => setOpen((value) => !value)}>{open ? 'Hide history' : 'View history'}</button>{open && (query.isPending ? <p>Loading history…</p> : query.isError ? <p className="auth-error">{query.error.message}</p> : <ol>{query.data?.events.map((event) => <li key={event.id}><strong>{label(event.action)}</strong> · {event.actorName} · {event.actorRole ?? 'System'} · {new Date(event.createdAt).toLocaleString()}{event.fieldName && <div>{event.fieldName}: {JSON.stringify(event.previousValue)} → {JSON.stringify(event.newValue)}</div>}{event.reason && <div>{event.reason}</div>}</li>)}{query.data?.moderationActions.map((event) => <li key={event.id}><strong>{label(event.action)}</strong> · {event.actorName} · {new Date(event.createdAt).toLocaleString()}{event.reason && <div>{event.reason}</div>}</li>)}{query.data?.deletionRequests.map((request) => <li key={request.id}><strong>Deletion request {label(request.status)}</strong> · {label(request.category)} · Requested by {request.requestedByName}{request.decidedByName !== 'System' ? ` · decided by ${request.decidedByName}` : ''} · {request.explanation}</li>)}{query.data?.reports.map((report) => <li key={report.id}><strong>Report {label(report.status)}</strong> · {label(report.category)} · Reported by {report.reporterName}{report.reviewedByName !== 'System' ? ` · reviewed by ${report.reviewedByName}` : ''} · {report.explanation}</li>)}</ol>)}</div>;
}
