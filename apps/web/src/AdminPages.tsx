import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { useAuth } from './auth';

interface Envelope<T> { data: T; meta?: { page: number; pageSize: number; total: number; totalPages: number }; error?: { message?: string }; }
interface University { id: string; name: string; slug: string; }
interface RoleAssignment { id: string; role: string; universityId: string | null; scopeKey: string; university: { name: string } | null; }
interface AdminUser { id: string; email: string; displayName: string; status: string; emailVerifiedAt: string | null; roleAssignments: RoleAssignment[]; }
interface AdminResource { id: string; title: string; description: string | null; type: string; status: string; createdAt: string; uploadedById: string | null; course: { id: string; code: string; title: string }; academicSession: { label: string } | null; semester: { label: string; programmeLevel: { code: string; label: string | null } } | null; file: { originalFilename: string; mediaType: string; byteSize: number } | null; uploader: { id: string; displayName: string; profile: { username: string | null } | null } | null; }

async function readApi<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as Envelope<unknown> | null;
    throw new Error(body?.error?.message ?? 'The request could not be completed.');
  }
  return response.status === 204 ? { data: undefined as T } : response.json() as Promise<Envelope<T>>;
}

async function csrfHeaders() {
  const response = await readApi<{ csrfToken: string }>('/auth/csrf');
  return { 'Content-Type': 'application/json', 'X-CSRF-Token': response.data.csrfToken };
}

function hasRole(user: ReturnType<typeof useAuth>['user'], role: string) {
  return Boolean(user?.roleAssignments.some((assignment) => assignment.role === role));
}

function WorkspaceNav({ active }: { active: 'resources' | 'users' | 'queue' }) {
  const { user } = useAuth();
  return <div className="operations-heading"><div><p className="eyebrow">ENGHUB OPERATIONS</p><nav className="operations-nav" aria-label="Operations navigation">
    {(hasRole(user, 'SUPER_ADMIN') || hasRole(user, 'UNIVERSITY_ADMIN')) && <Link className={active === 'resources' ? 'is-active' : ''} to="/app/admin/resources">Resource review</Link>}
    {hasRole(user, 'SUPER_ADMIN') && <Link className={active === 'users' ? 'is-active' : ''} to="/app/admin/users">Users & roles</Link>}
    {(hasRole(user, 'MODERATOR') || hasRole(user, 'SUPER_ADMIN')) && <Link className={active === 'queue' ? 'is-active' : ''} to="/app/moderation/queue">Review queue</Link>}
  </nav></div><Link className="text-link" to="/account">My account</Link></div>;
}

function RequireWorkspace({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, isLoading, error } = useAuth();
  const location = useLocation();
  if (isLoading) return <main className="admin-page"><p className="discovery-state" role="status">Checking access…</p></main>;
  if (error) return <main className="admin-page"><p className="catalog-message catalog-error" role="alert">{error.message}</p></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (!roles.some((role) => hasRole(user, role))) return <main className="not-found-page"><h1>Access restricted</h1><p>Your account does not have permission to open this workspace.</p><Link className="button button-purple" to="/">Return to EngHub</Link></main>;
  return <>{children}</>;
}

function ResourceQueue({ adminView }: { adminView: boolean }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();
  const resourcesQuery = useQuery({
    queryKey: ['operations-resources', user?.id, status, page],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => readApi<AdminResource[]>(`/resources?status=${status}&page=${page}&pageSize=20`),
  });
  async function decide(resourceId: string, action: 'APPROVED' | 'REJECTED', reason: string) {
    setMessage('');
    try {
      await readApi(`/resources/${resourceId}/moderation`, { method: 'POST', headers: await csrfHeaders(), body: JSON.stringify({ action, ...(reason.trim() ? { reason: reason.trim() } : {}) }) });
      await queryClient.invalidateQueries({ queryKey: ['operations-resources'] });
      await queryClient.invalidateQueries({ queryKey: ['pending-review-count'] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['landing-resources'] }),
        queryClient.invalidateQueries({ queryKey: ['discovery', 'resources'] }),
        queryClient.invalidateQueries({ queryKey: ['course-resources'] }),
        queryClient.invalidateQueries({ queryKey: ['resource'] }),
      ]);
      setMessage(action === 'APPROVED' ? 'Resource approved and now publicly available.' : 'Resource rejected. The decision and reason were recorded.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not record the moderation decision.'); }
  }
  const canDecide = hasRole(user, 'SUPER_ADMIN') || hasRole(user, 'MODERATOR');
  const resources = resourcesQuery.data?.data ?? [];
  return <div className="site-shell"><PublicHeader /><main className="admin-page"><WorkspaceNav active={adminView ? 'resources' : 'queue'} />
    <div className="admin-title"><div><h1>{adminView ? 'Resource review' : 'Moderation queue'}</h1><p>Review submitted materials before they become public. Decisions are recorded with your account.</p></div>
      <div className="admin-title-tools">{adminView && <label>Submission status <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="PENDING">Pending review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="REMOVED">Removed</option></select></label>}<button className="admin-refresh-button" type="button" onClick={() => void resourcesQuery.refetch()} disabled={resourcesQuery.isFetching}>{resourcesQuery.isFetching ? 'Checking…' : 'Refresh'}</button></div>
    </div>
    {message && <p className="admin-feedback" role="status">{message}</p>}
    {resourcesQuery.isPending && <p className="discovery-state" role="status">Loading submissions…</p>}
    {resourcesQuery.isError && <div className="catalog-message catalog-error" role="alert">{resourcesQuery.error.message}<button onClick={() => void resourcesQuery.refetch()}>Try again</button></div>}
    {resourcesQuery.isSuccess && resources.length === 0 && <p className="discovery-state">{status === 'PENDING' ? 'There are no resources waiting for review.' : `There are no ${status.toLowerCase()} resources in this view.`}</p>}
    <div className="admin-resource-list">{resources.map((resource) => <ResourceReviewCard key={resource.id} resource={resource} canDecide={canDecide && status === 'PENDING' && resource.uploadedById !== user?.id} onDecide={decide} />)}</div>
    {resourcesQuery.data?.meta && <div className="admin-paging"><span>{resourcesQuery.data.meta.total} resources · page {page} of {Math.max(1, resourcesQuery.data.meta.totalPages)}</span><div><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button disabled={page >= resourcesQuery.data.meta.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>}
  </main></div>;
}

function ResourceReviewCard({ resource, canDecide, onDecide }: { resource: AdminResource; canDecide: boolean; onDecide: (resourceId: string, action: 'APPROVED' | 'REJECTED', reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  return <article className="admin-resource-card"><div className="admin-resource-main"><div className="admin-resource-copy"><p className="card-kicker">{resource.status} · {resource.type.replaceAll('_', ' ')}</p><h2>{resource.title}</h2><p><Link to={`/courses/${resource.course.id}`}>{resource.course.code} · {resource.course.title}</Link></p><p className="admin-resource-meta">Submitted by {resource.uploader?.displayName ?? 'Unknown contributor'} · {new Date(resource.createdAt).toLocaleDateString()}</p><span className="resource-uploader-tag">@{resource.uploader?.profile?.username ?? 'username unavailable'}</span>{resource.description && <p className="admin-resource-description">{resource.description}</p>}
      <div className="admin-resource-links">{resource.file && <><a href={`/api/v1/resources/${resource.id}/file`} target="_blank" rel="noreferrer">Preview file</a><a href={`/api/v1/resources/${resource.id}/file/download`}>Download</a><span>{resource.file.originalFilename}</span></>}<Link to={`/resources/${resource.id}`}>Resource details</Link></div>
      </div><span className={`admin-status admin-status-${resource.status.toLowerCase()}`}>{resource.status}</span></div>
    {canDecide && <div className="moderation-actions"><label>Decision reason <span>(required for rejection)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={2} placeholder="Explain a rejection or revision concern." /></label><button className="button button-purple" onClick={() => void onDecide(resource.id, 'APPROVED', reason)}>Approve</button><button className="button button-outline" disabled={!reason.trim()} onClick={() => void onDecide(resource.id, 'REJECTED', reason)}>Reject with reason</button></div>}
  </article>;
}

export function AdminResourcesPage() { return <RequireWorkspace roles={['SUPER_ADMIN', 'UNIVERSITY_ADMIN']}><ResourceQueue adminView /></RequireWorkspace>; }
export function ModerationQueuePage() { return <RequireWorkspace roles={['SUPER_ADMIN', 'MODERATOR']}><ResourceQueue adminView={false} /></RequireWorkspace>; }

export function AdminUsersPage() {
  return <RequireWorkspace roles={['SUPER_ADMIN']}><AdminUsersContent /></RequireWorkspace>;
}

function AdminUsersContent() {
  const [search, setSearch] = useState('');
  const [queryText, setQueryText] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ['admin-users', queryText, page], queryFn: async () => readApi<AdminUser[]>(`/auth/admin/users?page=${page}&pageSize=20${queryText ? `&q=${encodeURIComponent(queryText)}` : ''}`) });
  const universitiesQuery = useQuery({ queryKey: ['admin-universities'], queryFn: async () => readApi<University[]>('/universities') });
  const users = usersQuery.data?.data ?? [];
  const universities = universitiesQuery.data?.data ?? [];
  const selected = users.find((user) => user.id === selectedUser);
  function searchUsers(event: FormEvent) { event.preventDefault(); setQueryText(search.trim()); setPage(1); }
  async function grantModerator() {
    if (!selected || !selected.emailVerifiedAt || !universityId) return;
    setMessage('');
    try {
      await readApi(`/auth/admin/users/${selected.id}/roles`, { method: 'POST', headers: await csrfHeaders(), body: JSON.stringify({ role: 'MODERATOR', universityId }) });
      setMessage(`Moderator access granted to ${selected.displayName} for the selected university.`);
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not grant moderator access.'); }
  }
  async function revoke(grantId: string) {
    setMessage('');
    try {
      await readApi(`/auth/admin/role-assignments/${grantId}`, { method: 'DELETE', headers: await csrfHeaders() });
      setMessage('Role assignment revoked.');
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not revoke this role.'); }
  }
  return <div className="site-shell"><PublicHeader /><main className="admin-page"><WorkspaceNav active="users" />
    <div className="admin-title"><div><h1>Users and roles</h1><p>Assign moderator access to an active, email-verified account and choose the university they will review.</p></div></div>
    {message && <p className="admin-feedback" role="status">{message}</p>}
    <form className="admin-search-form" onSubmit={searchUsers}><label>Find a user<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" /></label><button className="button button-purple" type="submit">Search</button></form>
    <section className="role-grant-panel"><h2>Grant moderator access</h2><div className="role-grant-fields"><label>User<select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}><option value="">Choose a user</option>{users.map((user) => <option key={user.id} value={user.id} disabled={!user.emailVerifiedAt || user.status !== 'ACTIVE'}>{user.displayName} · {user.email}{!user.emailVerifiedAt ? ' · email not verified' : user.status !== 'ACTIVE' ? ' · inactive' : ''}</option>)}</select></label><label>University<select value={universityId} onChange={(event) => setUniversityId(event.target.value)}><option value="">Choose a university</option>{universities.map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}</select></label><button className="button button-purple" type="button" disabled={!selected?.emailVerifiedAt || selected?.status !== 'ACTIVE' || !universityId || Boolean(selected?.roleAssignments.some((grant) => grant.role === 'MODERATOR' && grant.universityId === universityId))} onClick={() => void grantModerator()}>Grant moderator role</button></div><p className="field-hint">Moderators can review submissions from their assigned university. The API checks this scope for every moderation action.</p></section>
    {usersQuery.isPending && <p className="discovery-state" role="status">Loading users…</p>}{usersQuery.isError && <div className="catalog-message catalog-error" role="alert">{usersQuery.error.message}<button onClick={() => void usersQuery.refetch()}>Try again</button></div>}
    {usersQuery.isSuccess && users.length === 0 && <p className="discovery-state">No matching users.</p>}
    <section className="admin-users-list" aria-label="User accounts">{users.map((user) => <article className="admin-user-card" key={user.id}><div className="admin-user-heading"><div><h2>{user.displayName}</h2><p>{user.email}</p></div><span className={`admin-status admin-status-${user.status.toLowerCase()}`}>{user.status}</span></div><div className="admin-user-roles">{user.roleAssignments.map((grant) => <div className="admin-user-role" key={grant.id}><span>{grant.role.replaceAll('_', ' ')}{grant.university ? ` · ${grant.university.name}` : ''}</span>{grant.role !== 'STUDENT' && <button type="button" onClick={() => void revoke(grant.id)} aria-label={`Revoke ${grant.role} access for ${user.displayName}`}>Revoke</button>}</div>)}</div>{!user.emailVerifiedAt && <p className="admin-user-note">Email not verified; privileged roles cannot be assigned yet.</p>}</article>)}</section>
    {usersQuery.data?.meta && <div className="admin-paging"><span>{usersQuery.data.meta.total} users · page {page} of {Math.max(1, usersQuery.data.meta.totalPages)}</span><div><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button disabled={page >= usersQuery.data.meta.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>}
  </main></div>;
}
