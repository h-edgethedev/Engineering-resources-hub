import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from './auth';

interface PendingReviewResponse {
  data: unknown[];
  meta?: { total: number };
}

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();
  const isSuperAdmin = user?.roleAssignments.some((assignment) => assignment.role === 'SUPER_ADMIN') ?? false;
  const isUniversityAdmin = user?.roleAssignments.some((assignment) => assignment.role === 'UNIVERSITY_ADMIN') ?? false;
  const isModerator = user?.roleAssignments.some((assignment) => assignment.role === 'MODERATOR') ?? false;
  const canReviewResources = isSuperAdmin || isModerator;
  const pendingReviewsQuery = useQuery({
    queryKey: ['pending-review-count', user?.id],
    enabled: canReviewResources,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch('/api/v1/resources?status=PENDING&reviewQueue=true&page=1&pageSize=1', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load the review count.');
      return response.json() as Promise<PendingReviewResponse>;
    },
  });
  const pendingCount = canReviewResources ? pendingReviewsQuery.data?.meta?.total ?? 0 : 0;
  const reviewLink = isModerator && !isSuperAdmin ? '/app/moderation/queue' : '/app/admin/resources';
  const countLabel = pendingCount > 99 ? '99+' : String(pendingCount);
  const closeMenu = () => setMenuOpen(false);
  return (
    <>
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
            {(isSuperAdmin || isUniversityAdmin) && <Link className="review-nav-link" to="/app/admin/resources" onClick={closeMenu}>Resource review{pendingCount > 0 && <span className="review-nav-count" aria-label={`${pendingCount} pending`}>{countLabel}</span>}</Link>}
            {(isModerator || isSuperAdmin) && <Link to="/app/governance/resources" onClick={closeMenu}>Resource governance</Link>}
            {isSuperAdmin && <Link to="/app/admin/users" onClick={closeMenu}>Users & roles</Link>}
            {(isModerator || isSuperAdmin) && <Link className="review-nav-link" to="/app/moderation/queue" onClick={closeMenu}>Review queue{pendingCount > 0 && <span className="review-nav-count" aria-label={`${pendingCount} pending`}>{countLabel}</span>}</Link>}
            {user ? <Link to="/account" onClick={closeMenu}>My account</Link> : <Link to="/login" onClick={closeMenu}>Log in</Link>}
            <Link className="button button-small button-purple" to={user ? '/account' : '/register'} onClick={closeMenu}>{user ? 'Contribute' : 'Sign up'}</Link>
          </nav>
        </div>
      </header>
      {pendingCount > 0 && <Link className="review-pulse-alert" to={reviewLink} aria-label={`${pendingCount} ${pendingCount === 1 ? 'resource needs' : 'resources need'} review. Open the review queue.`}>
        <span className="review-pulse-rings" aria-hidden="true"><span /><span /></span>
        <span className="review-pulse-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 13h3l2.2-6 4.1 12 2.2-6H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <span className="review-pulse-message"><strong>{pendingCount} {pendingCount === 1 ? 'resource' : 'resources'}</strong><small>waiting for review</small></span>
      </Link>}
    </>
  );
}
