import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { ResourceSubmission } from './ResourceSubmission';

function AuthFrame({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="brand auth-brand" to="/" aria-label="Engineering Resources Hub home">
          <img className="brand-logo" src="/engineering-resources-hub-logo.png" alt="Engineering Resources Hub" width="1200" height="380" />
        </Link>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
      <p className="auth-back"><Link to="/">← Back to Engineering Resources Hub</Link></p>
    </main>
  );
}

function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { user, isLoading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegistering = mode === 'register';
  const destination = (location.state as { from?: string } | null)?.from;
  const returnTo = destination?.startsWith('/') && !destination.startsWith('//') ? destination : '/account';

  if (isLoading) return <AuthFrame eyebrow="YOUR LEARNING COMMUNITY" title="Checking your session" description="One moment while we restore your account."><p className="auth-status" role="status">Loading…</p></AuthFrame>;
  if (user) return <Navigate to={returnTo} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (new TextEncoder().encode(password).length > 72) {
      setError('Your password must be no more than 72 UTF-8 bytes.');
      return;
    }
    if (isRegistering && password.length < 12) {
      setError('Choose a password with at least 12 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegistering) {
        await signUp(displayName, email, password);
        navigate(`/verify-email?email=${encodeURIComponent(email)}`, { replace: true });
        return;
      }
      await signIn(email, password);
      navigate(returnTo, { replace: true });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Could not sign you in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthFrame
      eyebrow={isRegistering ? 'JOIN THE COMMUNITY' : 'WELCOME BACK'}
      title={isRegistering ? 'Create your account' : 'Sign in to EngHub'}
      description={isRegistering ? 'Create a student account to share academic resources and support your classmates.' : 'Sign in to manage your account and continue contributing to your courses.'}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {isRegistering && <label>Full name<input autoComplete="name" name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} required /></label>}
        <label>Email address<input type="email" autoComplete="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>
        <label>Password<input type="password" autoComplete={isRegistering ? 'new-password' : 'current-password'} name="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={isRegistering ? 12 : undefined} maxLength={72} required aria-describedby={isRegistering ? 'password-hint' : undefined} /></label>
        {isRegistering && <p id="password-hint" className="field-hint">Use at least 12 characters. New accounts start with Student access.</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!isRegistering && error.toLowerCase().includes('verify your email') && <p className="auth-switch"><Link to={`/verify-email?email=${encodeURIComponent(email)}`}>Resend a verification link</Link></p>}
        {isRegistering && error.toLowerCase().includes('verification email') && <p className="auth-switch"><Link to={`/verify-email?email=${encodeURIComponent(email)}`}>Request a verification link</Link></p>}
        <button className="button button-purple auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : isRegistering ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="auth-switch">{isRegistering ? 'Already have an account?' : 'New to EngHub?'} <Link to={isRegistering ? '/login' : '/register'}>{isRegistering ? 'Sign in' : 'Create an account'}</Link></p>
      <p className="auth-note">Every new account can submit resources after verifying its email. Submissions are reviewed before becoming public.</p>
    </AuthFrame>
  );
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrator',
  UNIVERSITY_ADMIN: 'University Administrator',
  MODERATOR: 'Moderator',
  CONTRIBUTOR: 'Contributor',
  STUDENT: 'Student',
};

export function ProtectedAccount() {
  const { user, isLoading, error, refresh, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (isLoading) return <AuthFrame eyebrow="YOUR ACCOUNT" title="Checking your session" description="One moment while we restore your account."><p className="auth-status" role="status">Loading…</p></AuthFrame>;
  if (error) return <AuthFrame eyebrow="YOUR ACCOUNT" title="We couldn’t check your session" description={error.message}><button className="button button-purple auth-submit" onClick={() => void refresh()}>Try again</button></AuthFrame>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;

  async function handleSignOut() {
    setMessage('');
    setIsSigningOut(true);
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (signOutError) {
      setMessage(signOutError instanceof Error ? signOutError.message : 'Could not sign out. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  const roles = user.roleAssignments.map((assignment) => roleLabels[assignment.role] ?? assignment.role);
  const canSubmitResources = user.roleAssignments.some((assignment) => ['STUDENT', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(assignment.role));

  return (
    <div className="site-shell">
      <header className="site-header"><div className="header-inner"><Link className="brand" to="/" aria-label="Engineering Resources Hub home"><img className="brand-logo" src="/engineering-resources-hub-logo.png" alt="Engineering Resources Hub" width="1200" height="380" /></Link><Link className="text-link" to="/">Back to explore</Link></div></header>
      <main className="account-page">
        <section className="account-card" aria-labelledby="account-title">
          <p className="eyebrow">YOUR ENGHUB ACCOUNT</p>
          <h1 id="account-title">Hello, {user.displayName}</h1>
          <p className="account-email">{user.email}</p>
          <div className="account-roles"><h2>Access</h2>{roles.length ? <ul>{roles.map((role, index) => <li key={`${role}-${index}`}>{role}</li>)}</ul> : <p>No roles have been assigned.</p>}</div>
          {!canSubmitResources && <div className="account-next"><span className="account-next-icon" aria-hidden="true">▤</span><div><h2>Resource contributions</h2><p>This account does not have a Student or Contributor grant for resource submission.</p></div></div>}
          {canSubmitResources && <ResourceSubmission />}
          {message && <p className="auth-error" role="alert">{message}</p>}
          <button className="button button-outline" type="button" onClick={() => void handleSignOut()} disabled={isSigningOut}>{isSigningOut ? 'Signing out…' : 'Sign out'}</button>
        </section>
      </main>
      <footer className="account-footer">© {new Date().getFullYear()} EngHub · Open knowledge for engineering</footer>
    </div>
  );
}

export function LoginPage() { return <AuthForm mode="login" />; }
export function RegisterPage() { return <AuthForm mode="register" />; }

export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const token = query.get('token') ?? '';
  const [email, setEmail] = useState(query.get('email') ?? '');
  const [status, setStatus] = useState<'checking' | 'ready' | 'verified' | 'invalid'>('ready');
  const [message, setMessage] = useState('');
  const [resendSent, setResendSent] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const attemptedToken = useRef('');

  useEffect(() => {
    if (!token || attemptedToken.current === token) return;
    attemptedToken.current = token;
    setStatus('checking');
    void fetch('/api/v1/auth/verify-email', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(await responseErrorMessage(response, 'This verification link could not be used.'));
      setStatus('verified');
      setMessage('Your email is verified. You can now sign in.');
      navigate('/verify-email?verified=1', { replace: true });
    }).catch((verificationError: unknown) => {
      setStatus('invalid');
      setMessage(verificationError instanceof Error ? verificationError.message : 'This verification link could not be used.');
      navigate('/verify-email', { replace: true });
    });
  }, [navigate, token]);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsResending(true);
    try {
      const response = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error(await responseErrorMessage(response, 'Could not request a verification link.'));
      setResendSent(true);
    } catch (resendError) {
      setMessage(resendError instanceof Error ? resendError.message : 'Could not request a verification link.');
    } finally {
      setIsResending(false);
    }
  }

  if (status === 'checking') return <AuthFrame eyebrow="VERIFY YOUR EMAIL" title="Checking your link" description="We’re confirming your email address."><p className="auth-status" role="status">Please wait…</p></AuthFrame>;
  if (status === 'verified' || new URLSearchParams(location.search).has('verified')) return <AuthFrame eyebrow="EMAIL VERIFIED" title="You’re ready to sign in" description="Your email address has been verified. Sign in to access your account."><Link className="button button-purple auth-submit" to="/login">Go to sign in</Link></AuthFrame>;

  return <AuthFrame eyebrow="VERIFY YOUR EMAIL" title="Check your inbox" description={email ? `We sent a verification link to ${email}. The link expires in 30 minutes.` : 'Enter your signup email and we’ll send a new verification link if it needs verification.'}>
    {status === 'invalid' && <p className="auth-error" role="alert">{message}</p>}
    {resendSent ? <div className="submission-success" role="status"><strong>Request received</strong><span>If this email needs verification, a fresh link will arrive shortly.</span></div> : <form className="auth-form" onSubmit={handleResend}>
      <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>
      {message && status !== 'invalid' && <p className="auth-error" role="alert">{message}</p>}
      <button className="button button-purple auth-submit" type="submit" disabled={isResending}>{isResending ? 'Sending…' : 'Resend verification email'}</button>
    </form>}
    <p className="auth-switch"><Link to="/login">Return to sign in</Link></p>
  </AuthFrame>;
}

async function responseErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
