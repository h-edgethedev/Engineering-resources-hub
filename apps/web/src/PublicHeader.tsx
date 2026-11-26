import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from './auth';

interface NotificationItem { id: string; kind: 'RESOURCE_REVIEW' | 'DELETION_REQUEST' | 'RESOURCE_REPORT'; title: string; detail: string; createdAt: string; href: string; }
interface GovernanceInbox { unreadCount: number; unreadCounts: { resources: number; deletionRequests: number; reports: number }; counts: { resources: number; deletionRequests: number; reports: number }; items: NotificationItem[]; }
interface ApiEnvelope<T> { data: T; }
const notificationType = (kind: NotificationItem['kind']) => kind === 'RESOURCE_REVIEW' ? 'Resource review' : kind === 'DELETION_REQUEST' ? 'Deletion request' : 'Reported resource';

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [moderatorGrantNotice, setModeratorGrantNotice] = useState<{ id: string; universityId: string | null } | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.roleAssignments.some((assignment) => assignment.role === 'SUPER_ADMIN') ?? false;
  const isUniversityAdmin = user?.roleAssignments.some((assignment) => assignment.role === 'UNIVERSITY_ADMIN') ?? false;
  const isModerator = user?.roleAssignments.some((assignment) => assignment.role === 'MODERATOR') ?? false;
  const canReviewResources = isSuperAdmin || isModerator;
  useEffect(() => {
    if (!user) { setModeratorGrantNotice(null); return; }
    const recentModeratorGrants = user.roleAssignments
      .filter((assignment) => assignment.role === 'MODERATOR' && Date.now() - new Date(assignment.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const unseenGrant = recentModeratorGrants.find((assignment) => localStorage.getItem(`enghub-moderator-grant-seen:${user.id}:${assignment.id}`) !== 'true');
    setModeratorGrantNotice(unseenGrant ? { id: unseenGrant.id, universityId: unseenGrant.universityId } : null);
  }, [user]);
  const inboxQuery = useQuery({
    queryKey: ['governance-inbox', user?.id],
    enabled: canReviewResources,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch('/api/v1/resources/governance/inbox', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load governance notifications.');
      return (await response.json() as ApiEnvelope<GovernanceInbox>).data;
    },
  });
  const unreadCount = inboxQuery.data?.unreadCount ?? 0;
  const countLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const closeMenu = () => setMenuOpen(false);

  async function revealInbox() {
    if (inboxOpen) return;
    setInboxOpen(true);
    try {
      const csrfResponse = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
      if (!csrfResponse.ok) return;
      const csrf = (await csrfResponse.json() as ApiEnvelope<{ csrfToken: string }>).data.csrfToken;
      const response = await fetch('/api/v1/resources/governance/inbox/seen', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: '{}' });
      if (response.ok) await queryClient.invalidateQueries({ queryKey: ['governance-inbox', user?.id] });
    } catch { /* Keep the inbox open; the next poll will refresh its state. */ }
  }

  function dismissModeratorGrantNotice() {
    if (user && moderatorGrantNotice) localStorage.setItem(`enghub-moderator-grant-seen:${user.id}:${moderatorGrantNotice.id}`, 'true');
    setModeratorGrantNotice(null);
  }

  return (
    <>
      {moderatorGrantNotice && <aside className="moderator-grant-celebration" role="status" aria-live="polite"><span className="moderator-grant-confetti" aria-hidden="true">✦</span><span className="moderator-grant-emoji" aria-hidden="true">🎉</span><div><strong>You have been granted Moderator Access</strong><span>You can now help review resources{moderatorGrantNotice.universityId ? ' for your assigned university' : ''}.</span></div><button type="button" onClick={dismissModeratorGrantNotice} aria-label="Dismiss Moderator Access notification">×</button></aside>}
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="Engineering Resources Hub home">
            <img className="brand-logo" src="/engineering-resources-hub-logo.png" alt="Engineering Resources Hub" width="1200" height="380" />
          </Link>
          <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="public-primary-nav" onClick={() => setMenuOpen(!menuOpen)}>
            <span className="sr-only">{menuOpen ? 'Close navigation' : 'Open navigation'}</span><span /><span />
          </button>
          <nav id="public-primary-nav" className={`primary-nav public-discovery-nav${menuOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
            <Link to="/explore" onClick={closeMenu}>Explore</Link>
            <Link to="/universities" onClick={closeMenu}>Universities</Link>
            <Link to="/#about" onClick={closeMenu}>About</Link>
            {(isSuperAdmin || isUniversityAdmin) && <Link className="review-nav-link" to="/app/admin/resources" onClick={closeMenu}>Resource review</Link>}
            {(isModerator || isSuperAdmin) && <Link to="/app/governance/resources" onClick={closeMenu}>Resource governance</Link>}
            {isSuperAdmin && <Link to="/app/admin/users" onClick={closeMenu}>Users & roles</Link>}
            {(isModerator || isSuperAdmin) && <Link className="review-nav-link" to="/app/moderation/queue" onClick={closeMenu}>Review queue</Link>}
            {user ? <Link to="/account" onClick={closeMenu}>My account</Link> : <Link to="/login" onClick={closeMenu}>Log in</Link>}
            <Link className="button button-small button-purple" to={user ? '/account' : '/register'} onClick={closeMenu}>{user ? 'Contribute' : 'Sign up'}</Link>
          </nav>
        </div>
      </header>
      {canReviewResources && <div className="review-inbox" onMouseEnter={() => void revealInbox()} onMouseLeave={() => setInboxOpen(false)} onFocusCapture={() => void revealInbox()} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInboxOpen(false); }}>
        <button className="review-inbox-trigger" type="button" aria-label={unreadCount ? `${unreadCount} unchecked governance notifications` : 'Governance notifications'} aria-expanded={inboxOpen}>
          <span className="review-pulse-rings" aria-hidden="true"><span /><span /></span>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M4 13h3l2.2-6 4.1 12 2.2-6H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {unreadCount > 0 && <span className="review-inbox-count">{countLabel}</span>}
        </button>
        {inboxOpen && <section className="review-inbox-panel" aria-label="Governance notifications">
          <header><div><strong>Activity feed</strong><small>Pending governance work</small></div><span className="review-inbox-live"><i /> Live</span></header>
          <div className="review-inbox-summary"><span>{inboxQuery.data?.counts.resources ?? 0} resource reviews</span><span>{inboxQuery.data?.counts.deletionRequests ?? 0} deletion requests</span><span>{inboxQuery.data?.counts.reports ?? 0} reports</span></div>
          {inboxQuery.isPending ? <p className="review-inbox-empty">Loading notifications…</p> : inboxQuery.isError ? <p className="review-inbox-empty">Could not load notifications. They will retry automatically.</p> : inboxQuery.data?.items.length ? <ul>{inboxQuery.data.items.map((item) => <li key={`${item.kind}-${item.id}`}><Link to={item.href} onClick={() => setInboxOpen(false)}><small>{notificationType(item.kind)} · {new Date(item.createdAt).toLocaleString()}</small><strong>{item.title}</strong><span>{item.detail}</span></Link></li>)}</ul> : <p className="review-inbox-empty">You’re all caught up. No pending reviews, deletion requests, or reports.</p>}
        </section>}
      </div>}
    </>
  );
}
