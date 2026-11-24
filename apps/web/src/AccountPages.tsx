import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import type { AuthUser } from './auth';
import { ResourceSubmission } from './ResourceSubmission';

interface Envelope<T> {
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  error?: { message?: string };
}

interface ResourceItem {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
  createdAt: string;
  course: { id: string; code: string; title: string };
  academicSession: { label: string } | null;
  semester: { label: string; programmeLevel: { code: string; label: string | null } } | null;
  file: { originalFilename: string; mediaType: string; byteSize: number } | null;
  uploader: { profile: { username: string | null } | null } | null;
}

interface AccountDetails {
  profile: {
    username: string | null;
    avatarUrl: string | null;
    bio: string | null;
    githubUrl: string | null;
    linkedInUrl: string | null;
  } | null;
  academicProfile: {
    university: { name: string } | null;
    faculty: { name: string } | null;
    department: { name: string } | null;
    programme: { name: string } | null;
    currentLevel: { code: string; label: string | null } | null;
    currentSemester: { label: string } | null;
  } | null;
  preferences: {
    resourceKinds: string[];
    learningInterests: string[];
    learningGoals: string[];
  } | null;
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrator',
  UNIVERSITY_ADMIN: 'University Administrator',
  MODERATOR: 'Moderator',
  CONTRIBUTOR: 'Contributor',
  STUDENT: 'Student',
};

const statusLabels: Record<string, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REMOVED: 'Removed',
};

const preferenceLabels: Record<string, string> = {
  LECTURE_NOTE: 'Lecture notes',
  TEXTBOOK: 'Textbooks',
  PAST_QUESTION: 'Past questions',
  SLIDES: 'Slides',
  WORKED_SOLUTION: 'Worked solutions',
  LAB_MANUAL: 'Lab manuals',
  PROGRAMMING_EXERCISE: 'Programming exercises',
  PROJECT: 'Projects',
  PROGRAMMING: 'Programming',
  AI: 'Artificial intelligence',
  ELECTRONICS: 'Electronics',
  TELECOMMUNICATIONS: 'Telecommunications',
  ROBOTICS: 'Robotics',
  MATHEMATICS: 'Mathematics',
  EXAM_PREPARATION: 'Exam preparation',
  CONCEPT_MASTERY: 'Concept mastery',
  PROJECT_BUILDING: 'Project building',
  RESEARCH: 'Research',
};

async function readApi<T>(path: string): Promise<Envelope<T>> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as Envelope<unknown> | null;
    throw new Error(body?.error?.message ?? 'Could not load this account information.');
  }
  return response.json() as Promise<Envelope<T>>;
}

async function loadAccountDetails(): Promise<AccountDetails> {
  const [profileResult, academicResult, preferencesResult] = await Promise.all([
    readApi<{ profile: AccountDetails['profile'] }>('/auth/me/profile'),
    readApi<{ academicProfile: AccountDetails['academicProfile'] }>('/auth/me/academic-profile'),
    readApi<{ preferences: AccountDetails['preferences'] }>('/auth/me/preferences'),
  ]);
  return {
    profile: profileResult.data.profile,
    academicProfile: academicResult.data.academicProfile,
    preferences: preferencesResult.data.preferences,
  };
}

function formatLabel(value: string) {
  return preferenceLabels[value] ?? value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ResourceStatus({ status }: { status: ResourceItem['status'] }) {
  return <span className={`admin-status admin-status-${status.toLowerCase()}`}>{statusLabels[status]}</span>;
}

function UploadedResourceCard({ resource }: { resource: ResourceItem }) {
  const context = [
    resource.semester?.programmeLevel.label ?? (resource.semester ? `${resource.semester.programmeLevel.code} Level` : null),
    resource.semester?.label,
    resource.academicSession?.label,
  ].filter(Boolean).join(' · ');
  return <article className="account-resource-card">
    <div className="account-resource-copy">
      <p className="card-kicker">{resource.type.replaceAll('_', ' ')}{context ? ` · ${context}` : ''}</p>
      <h3><Link to={`/resources/${resource.id}`}>{resource.title}</Link></h3>
      <p className="account-resource-course"><Link to={`/courses/${resource.course.id}`}>{resource.course.code} · {resource.course.title}</Link></p>
      <span className="resource-uploader-tag">@{resource.uploader?.profile?.username ?? 'username unavailable'}</span>
      <p className="account-resource-file">{resource.file?.originalFilename ?? 'File unavailable'} · Submitted {new Date(resource.createdAt).toLocaleDateString()}</p>
    </div>
    <ResourceStatus status={resource.status} />
  </article>;
}

function TagList({ values }: { values: string[] }) {
  return values.length ? <ul className="account-detail-tags">{values.map((value) => <li key={value}>{formatLabel(value)}</li>)}</ul> : <p className="account-empty-detail">Not set yet</p>;
}

export function AccountDashboard({ user }: { user: AuthUser }) {
  const [status, setStatus] = useState<'ALL' | ResourceItem['status']>('ALL');
  const [page, setPage] = useState(1);
  const resourcesQuery = useQuery({
    queryKey: ['my-resources', user.id, status, page],
    queryFn: () => readApi<ResourceItem[]>(`/resources?mine=true${status === 'ALL' ? '' : `&status=${status}`}&page=${page}&pageSize=10`),
  });
  const detailsQuery = useQuery({ queryKey: ['my-account-details', user.id], queryFn: loadAccountDetails, staleTime: 60_000 });
  const resources = resourcesQuery.data?.data ?? [];
  const details = detailsQuery.data;
  const roles = user.roleAssignments.map((assignment) => roleLabels[assignment.role] ?? assignment.role);
  const canSubmit = user.roleAssignments.some((assignment) => ['STUDENT', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(assignment.role));
  const filters: Array<'ALL' | ResourceItem['status']> = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'REMOVED'];

  return <div className="site-shell">
    <PublicHeader />
    <main className="account-page account-dashboard">
      <div className="account-dashboard-heading"><div><p className="eyebrow">YOUR ENGHUB ACCOUNT</p><h1>My account</h1><p>Manage your details and keep track of your contributions.</p></div>{canSubmit && <Link className="button button-purple" to="/app/resources/new">Upload a resource <span aria-hidden="true">＋</span></Link>}</div>

      <section className="account-overview" aria-labelledby="account-details-title">
        <div className="account-identity">
          {details?.profile?.avatarUrl ? <img className="account-avatar" src={details.profile.avatarUrl} alt="" /> : <span className="account-avatar account-avatar-fallback" aria-hidden="true">{user.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>}
          <div><h2 id="account-details-title">{user.displayName}</h2><p>{user.email}</p>{details?.profile?.username && <span className="account-username">@{details.profile.username}</span>}</div>
          <Link className="button button-outline" to="/onboarding">Edit details</Link>
        </div>
        <div className="account-roles"><h3>Account access</h3>{roles.length ? <ul>{roles.map((role, index) => <li key={`${role}-${index}`}>{role}</li>)}</ul> : <p className="account-empty-detail">No roles have been assigned.</p>}</div>
      </section>

      <section className="account-details-grid" aria-label="Account details">
        <article className="account-detail-card"><div className="account-section-heading"><div><p className="card-kicker">PERSONAL</p><h2>Profile details</h2></div><Link className="text-link" to="/onboarding">Edit <span aria-hidden="true">→</span></Link></div>
          {detailsQuery.isPending && <p className="account-empty-detail" role="status">Loading your profile…</p>}
          {detailsQuery.isError && <div className="account-detail-error" role="alert"><p>{detailsQuery.error.message}</p><button type="button" onClick={() => void detailsQuery.refetch()}>Try again</button></div>}
          {details && <dl className="account-detail-list"><div><dt>Username</dt><dd>{details.profile?.username ? `@${details.profile.username}` : 'Not set'}</dd></div><div><dt>Bio</dt><dd>{details.profile?.bio || 'Not set'}</dd></div><div><dt>GitHub</dt><dd>{details.profile?.githubUrl ? <a href={details.profile.githubUrl} target="_blank" rel="noreferrer">View profile</a> : 'Not set'}</dd></div><div><dt>LinkedIn</dt><dd>{details.profile?.linkedInUrl ? <a href={details.profile.linkedInUrl} target="_blank" rel="noreferrer">View profile</a> : 'Not set'}</dd></div></dl>}
        </article>

        <article className="account-detail-card"><div className="account-section-heading"><div><p className="card-kicker">ACADEMICS</p><h2>Academic details</h2></div><Link className="text-link" to="/onboarding">Edit <span aria-hidden="true">→</span></Link></div>
          {detailsQuery.isPending && <p className="account-empty-detail" role="status">Loading your academic details…</p>}
          {details && <dl className="account-detail-list"><div><dt>University</dt><dd>{details.academicProfile?.university?.name ?? 'Not set'}</dd></div><div><dt>Faculty</dt><dd>{details.academicProfile?.faculty?.name ?? 'Not set'}</dd></div><div><dt>Department</dt><dd>{details.academicProfile?.department?.name ?? 'Not set'}</dd></div><div><dt>Programme</dt><dd>{details.academicProfile?.programme?.name ?? 'Not set'}</dd></div><div><dt>Current level</dt><dd>{details.academicProfile?.currentLevel?.label ?? details.academicProfile?.currentLevel?.code ?? 'Not set'}</dd></div><div><dt>Semester</dt><dd>{details.academicProfile?.currentSemester?.label ?? 'Not set'}</dd></div></dl>}
        </article>

        <article className="account-detail-card account-preferences-card"><div className="account-section-heading"><div><p className="card-kicker">PERSONALIZATION</p><h2>Learning preferences</h2></div><Link className="text-link" to="/onboarding">Edit <span aria-hidden="true">→</span></Link></div>
          {detailsQuery.isPending && <p className="account-empty-detail" role="status">Loading preferences…</p>}
          {details && <div className="account-preference-groups"><div><h3>Resource types</h3><TagList values={details.preferences?.resourceKinds ?? []} /></div><div><h3>Interests</h3><TagList values={details.preferences?.learningInterests ?? []} /></div><div><h3>Goals</h3><TagList values={details.preferences?.learningGoals ?? []} /></div></div>}
        </article>
      </section>

      <section className="account-submissions" aria-labelledby="my-materials-title">
        <div className="account-section-heading account-submissions-heading"><div><p className="card-kicker">YOUR CONTRIBUTIONS</p><h2 id="my-materials-title">Uploaded materials</h2><p>Track review progress for materials you have submitted.</p></div>{canSubmit && <Link className="button button-purple" to="/app/resources/new">Upload a resource <span aria-hidden="true">＋</span></Link>}</div>
        <div className="account-status-filters" aria-label="Filter submissions by status">{filters.map((filter) => <button key={filter} className={status === filter ? 'is-active' : ''} type="button" aria-pressed={status === filter} onClick={() => { setStatus(filter); setPage(1); }}>{filter === 'ALL' ? 'All' : statusLabels[filter]}</button>)}</div>
        {resourcesQuery.isPending && <p className="discovery-state" role="status">Loading your uploaded materials…</p>}
        {resourcesQuery.isError && <div className="catalog-message catalog-error" role="alert"><span>{resourcesQuery.error.message}</span><button type="button" onClick={() => void resourcesQuery.refetch()}>Try again</button></div>}
        {resourcesQuery.isSuccess && resources.length === 0 && <div className="account-empty-state"><span aria-hidden="true">▤</span><div><h3>{status === 'ALL' ? 'No materials submitted yet' : `No ${statusLabels[status].toLowerCase()} materials`}</h3><p>{status === 'ALL' ? 'Your uploads and their review statuses will appear here.' : 'Try another status filter to view other submissions.'}</p></div>{status === 'ALL' && canSubmit && <Link className="text-link" to="/app/resources/new">Upload your first resource <span aria-hidden="true">→</span></Link>}</div>}
        <div className="account-resource-list">{resources.map((resource) => <UploadedResourceCard key={resource.id} resource={resource} />)}</div>
        {resourcesQuery.data?.meta && resourcesQuery.data.meta.totalPages > 1 && <div className="admin-paging"><span>{resourcesQuery.data.meta.total} materials · page {page} of {resourcesQuery.data.meta.totalPages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button type="button" disabled={page >= resourcesQuery.data.meta.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>}
      </section>
    </main>
  </div>;
}

export function ResourceSubmissionWorkspace() {
  const navigate = useNavigate();
  return <div className="site-shell"><PublicHeader /><main className="account-page account-upload-page"><div className="account-dashboard-heading"><div><p className="eyebrow">CONTRIBUTE TO ENGHUB</p><h1>Upload a resource</h1><p>Choose the course this material supports. Your submission will be reviewed before publication.</p></div><Link className="button button-outline" to="/account">Back to my account</Link></div><section className="account-detail-card"><ResourceSubmission /></section><button className="account-back-button" type="button" onClick={() => navigate('/account')}>Cancel and return to account</button></main></div>;
}
