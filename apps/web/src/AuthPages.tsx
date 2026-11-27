import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { AccountDashboard, ResourceSubmissionWorkspace } from './AccountPages';
import { apiRequest } from './api';

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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
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
    if (isRegistering && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegistering) {
        const normalizedEmail = email.trim().toLowerCase();
        await signUp(displayName, normalizedEmail, password);
        navigate(`/verify-email?email=${encodeURIComponent(normalizedEmail)}`, { replace: true, state: { verificationEmailSent: true } });
        return;
      }
      await signIn(email, password);
      const profileResponse = await fetch('/api/v1/auth/me/profile', { credentials: 'include' });
      const profileResult = profileResponse.ok ? await profileResponse.json() as { data?: { profile?: { username?: string | null } | null } } : null;
      navigate(profileResult?.data?.profile?.username ? returnTo : '/onboarding', { replace: true });
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
        <label>Password<div className="password-control"><input id="signup-password" type={passwordVisible ? 'text' : 'password'} autoComplete={isRegistering ? 'new-password' : 'current-password'} name="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={isRegistering ? 12 : undefined} maxLength={72} required aria-describedby={isRegistering ? 'password-hint' : undefined} /><button className="password-visibility" type="button" aria-controls={isRegistering ? 'signup-password signup-password-confirm' : 'signup-password'} onClick={() => setPasswordVisible(!passwordVisible)}>{passwordVisible ? 'Hide' : 'Show'}</button></div></label>
        {isRegistering && <>
          <label>Confirm password<div className="password-control"><input id="signup-password-confirm" type={passwordVisible ? 'text' : 'password'} autoComplete="new-password" name="confirmPassword" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} maxLength={72} required /></div></label>
          <div id="password-hint" className="password-requirements" aria-live="polite">
            <p>Password requirements</p>
            <ul>
              <li className={password.length >= 12 ? 'is-met' : ''}>At least 12 characters</li>
              <li className={password.length > 0 && new TextEncoder().encode(password).length <= 72 ? 'is-met' : ''}>No more than 72 UTF-8 bytes</li>
              <li className={confirmPassword && password === confirmPassword ? 'is-met' : ''}>Passwords match</li>
            </ul>
            <p className="field-hint">New accounts start with Student access.</p>
          </div>
        </>}
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

export function ProtectedAccount() {
  const { user, isLoading, error, refresh } = useAuth();
  const location = useLocation();
  if (isLoading) return <AuthFrame eyebrow="YOUR ACCOUNT" title="Checking your session" description="One moment while we restore your account."><p className="auth-status" role="status">Loading…</p></AuthFrame>;
  if (error) return <AuthFrame eyebrow="YOUR ACCOUNT" title="We couldn’t check your session" description={error.message}><button className="button button-purple auth-submit" onClick={() => void refresh()}>Try again</button></AuthFrame>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <AccountDashboard user={user} />;
}

export function ProtectedResourceSubmissionPage() {
  const { user, isLoading, error, refresh } = useAuth();
  const location = useLocation();
  if (isLoading) return <main className="account-page"><p className="auth-status" role="status">Checking your account…</p></main>;
  if (error) return <main className="account-page"><p className="auth-error" role="alert">{error.message}</p><button onClick={() => void refresh()}>Try again</button></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  const canSubmit = user.roleAssignments.some((assignment) => ['STUDENT', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(assignment.role));
  if (!canSubmit) return <main className="not-found-page"><h1>Resource upload access required</h1><p>Your account needs Student, Contributor, or Super Administrator access to submit materials.</p><Link className="button button-purple" to="/account">Back to my account</Link></main>;
  return <ResourceSubmissionWorkspace />;
}

export function LoginPage() { return <AuthForm mode="login" />; }
export function RegisterPage() { return <AuthForm mode="register" />; }

export function VerifyEmailPage() {
  const { acceptVerifiedSession } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const token = query.get('token') ?? '';
  const emailWasSent = Boolean((location.state as { verificationEmailSent?: boolean } | null)?.verificationEmailSent);
  const [email, setEmail] = useState(query.get('email') ?? '');
  const [status, setStatus] = useState<'checking' | 'ready' | 'verified' | 'invalid'>('ready');
  const [message, setMessage] = useState('');
  const [resendSent, setResendSent] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const attemptedToken = useRef('');

  useEffect(() => {
    if (!token || attemptedToken.current === token) return;
    attemptedToken.current = token;
    setStatus('checking');
    void apiRequest<{ user: import('./auth').AuthUser }>('/auth/verify-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    }).then((result) => {
      acceptVerifiedSession(result.data.user);
      setStatus('verified');
      setMessage('Your email is verified. Let’s finish setting up your account.');
      navigate('/onboarding', { replace: true });
    }).catch((verificationError: unknown) => {
      setStatus('invalid');
      setMessage(verificationError instanceof Error ? verificationError.message : 'This verification link could not be used.');
    });
  }, [acceptVerifiedSession, navigate, token]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timeout = window.setTimeout(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsResending(true);
    try {
      await apiRequest('/auth/resend-verification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      setResendSent(true);
      setResendCooldown(60);
    } catch (resendError) {
      setMessage(resendError instanceof Error ? resendError.message : 'Could not request a verification link.');
    } finally {
      setIsResending(false);
    }
  }

  if (status === 'checking') return <AuthFrame eyebrow="VERIFY YOUR EMAIL" title="Checking your link" description="We’re confirming your email address."><p className="auth-status" role="status">Please wait…</p></AuthFrame>;
  if (status === 'verified' || new URLSearchParams(location.search).has('verified')) return <AuthFrame eyebrow="EMAIL VERIFIED" title="Email verified" description="Your email address has been verified. Continue to complete your account setup."><Link className="button button-purple auth-submit" to="/onboarding">Continue setup</Link></AuthFrame>;

  const verificationDescription = emailWasSent && email
    ? `We sent a verification link to ${email}. The link expires in 30 minutes. If it doesn't arrive, check spam or request another link.`
    : email
      ? `No email delivery was confirmed for ${email}. Enter the address below to request a verification link if the account still needs verification.`
      : 'Enter your signup email to request a verification link if the account needs verification.';

  return <AuthFrame eyebrow="VERIFY YOUR EMAIL" title={emailWasSent ? 'Check your inbox' : 'Verify your email'} description={verificationDescription}>
    {status === 'invalid' && <p className="auth-error" role="alert">{message}</p>}
    {resendSent && <div className="submission-success" role="status"><strong>Request received</strong><span>If this email needs verification, a fresh link will arrive shortly.</span></div>}
    <form className="auth-form" onSubmit={handleResend}>
      <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setResendSent(false); }} maxLength={254} required /></label>
      {message && status !== 'invalid' && <p className="auth-error" role="alert">{message}</p>}
      <button className="button button-purple auth-submit" type="submit" disabled={isResending || resendCooldown > 0}>{isResending ? 'Sending…' : resendCooldown > 0 ? `Request another link in ${resendCooldown}s` : 'Resend verification email'}</button>
    </form>
    <p className="auth-switch"><Link to="/login">Return to sign in</Link></p>
  </AuthFrame>;
}
