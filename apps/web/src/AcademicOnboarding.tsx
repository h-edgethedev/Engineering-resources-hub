import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

interface University { id: string; name: string; slug: string; countryCode: string }
interface Faculty { id: string; name: string; slug: string }
interface Department { id: string; name: string; slug: string }
interface ProgrammeLevel { id: string; code: string; label: string | null; ordinal: number; semesters: Semester[] }
interface Semester { id: string; code: string; label: string; ordinal: number }
interface Programme { id: string; name: string; slug: string; levels: ProgrammeLevel[] }
interface DepartmentDetails { programmes: Programme[] }
interface AcademicProfile {
  universityId: string | null;
  facultyId: string | null;
  departmentId: string | null;
  programmeId: string | null;
  currentLevelId: string | null;
  currentSemesterId: string | null;
  university?: University | null;
}
interface ApiEnvelope<T> { data: T; error?: { message?: string } }
interface AcademicProfileInput extends Omit<AcademicProfile, 'university'> {}
interface CountryOption { code: string; label: string }
interface UserProfileFields { username: string | null; avatarUrl: string | null; bio: string | null; githubUrl: string | null; linkedInUrl: string | null }
interface UserPreferences { resourceKinds: string[]; learningInterests: string[]; learningGoals: string[] }

const emptyUserProfile: UserProfileFields = { username: null, avatarUrl: null, bio: null, githubUrl: null, linkedInUrl: null };
const emptyPreferences: UserPreferences = { resourceKinds: [], learningInterests: [], learningGoals: [] };
const preferenceOptions = {
  resourceKinds: [
    ['TEXTBOOK', 'Textbooks'], ['LECTURE_NOTE', 'Lecture notes'], ['PAST_QUESTION', 'Past questions'], ['SLIDES', 'Slides'],
    ['WORKED_SOLUTION', 'Worked solutions'], ['LAB_MANUAL', 'Lab manuals'], ['PROGRAMMING_EXERCISE', 'Programming exercises'], ['PROJECT', 'Projects'],
  ],
  learningInterests: [
    ['PROGRAMMING', 'Programming'], ['AI', 'Artificial intelligence'], ['ELECTRONICS', 'Electronics'],
    ['TELECOMMUNICATIONS', 'Telecommunications'], ['ROBOTICS', 'Robotics'], ['MATHEMATICS', 'Mathematics'],
  ],
  learningGoals: [
    ['EXAM_PREPARATION', 'Exam preparation'], ['CONCEPT_MASTERY', 'Concept mastery'],
    ['PROJECT_BUILDING', 'Project building'], ['RESEARCH', 'Research'],
  ],
} as const;

const emptyProfile: AcademicProfileInput = {
  universityId: null,
  facultyId: null,
  departmentId: null,
  programmeId: null,
  currentLevelId: null,
  currentSemesterId: null,
};

async function readApiData<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok) throw new Error(body?.error?.message ?? fallback);
  return body?.data as T;
}

async function fetchUniversities(): Promise<University[]> {
  const response = await fetch('/api/v1/universities');
  return readApiData(response, 'Could not load universities.');
}

async function fetchAcademicProfile(): Promise<AcademicProfile | null> {
  const response = await fetch('/api/v1/auth/me/academic-profile', { credentials: 'include' });
  const data = await readApiData<{ academicProfile: AcademicProfile | null }>(response, 'Could not load your academic profile.');
  return data.academicProfile;
}

async function fetchFaculties(universitySlug: string): Promise<Faculty[]> {
  const response = await fetch(`/api/v1/universities/${universitySlug}/faculties`);
  return readApiData(response, 'Could not load faculties.');
}

async function fetchDepartments(universitySlug: string, facultySlug: string): Promise<Department[]> {
  const response = await fetch(`/api/v1/universities/${universitySlug}/faculties/${facultySlug}/departments`);
  return readApiData(response, 'Could not load departments.');
}

async function fetchDepartmentDetails(universitySlug: string, facultySlug: string, departmentSlug: string): Promise<DepartmentDetails> {
  const response = await fetch(`/api/v1/universities/${universitySlug}/faculties/${facultySlug}/departments/${departmentSlug}`);
  return readApiData(response, 'Could not load programme options.');
}

async function saveAcademicProfile(profile: AcademicProfileInput) {
  await putAuth('/me/academic-profile', profile, 'Could not save your academic profile.');
}

async function putAuth(path: string, body: unknown, fallback: string) {
  const csrfResponse = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
  const csrf = await readApiData<{ csrfToken: string }>(csrfResponse, 'Could not prepare a secure profile update.');
  const response = await fetch(`/api/v1/auth${path}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.csrfToken },
    body: JSON.stringify(body),
  });
  await readApiData(response, fallback);
}

async function fetchUserProfile(): Promise<UserProfileFields | null> {
  const response = await fetch('/api/v1/auth/me/profile', { credentials: 'include' });
  const data = await readApiData<{ profile: UserProfileFields | null }>(response, 'Could not load your profile.');
  return data.profile;
}

async function fetchPreferences(): Promise<UserPreferences | null> {
  const response = await fetch('/api/v1/auth/me/preferences', { credentials: 'include' });
  const data = await readApiData<{ preferences: UserPreferences | null }>(response, 'Could not load your preferences.');
  return data.preferences;
}

function countryLabel(code: string, displayNames: Intl.DisplayNames | null) {
  return displayNames?.of(code) ?? code;
}

export function AcademicOnboarding() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AcademicProfileInput>(emptyProfile);
  const [userProfile, setUserProfile] = useState<UserProfileFields>(emptyUserProfile);
  const [preferences, setPreferences] = useState<UserPreferences>(emptyPreferences);
  const [countryCode, setCountryCode] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveSequence = useRef(0);

  const profileQuery = useQuery({ queryKey: ['academic-profile'], queryFn: fetchAcademicProfile, enabled: Boolean(user) });
  const userProfileQuery = useQuery({ queryKey: ['user-profile'], queryFn: fetchUserProfile, enabled: Boolean(user) });
  const preferencesQuery = useQuery({ queryKey: ['user-preferences'], queryFn: fetchPreferences, enabled: Boolean(user) });
  const universitiesQuery = useQuery({ queryKey: ['universities', 'onboarding'], queryFn: fetchUniversities, enabled: Boolean(user), staleTime: 5 * 60_000 });
  const universities = universitiesQuery.data ?? [];
  const selectedUniversity = universities.find((university) => university.id === profile.universityId);
  const facultiesQuery = useQuery({
    queryKey: ['onboarding-faculties', selectedUniversity?.slug],
    queryFn: () => fetchFaculties(selectedUniversity!.slug),
    enabled: Boolean(selectedUniversity),
  });
  const faculties = facultiesQuery.data ?? [];
  const selectedFaculty = faculties.find((faculty) => faculty.id === profile.facultyId);
  const departmentsQuery = useQuery({
    queryKey: ['onboarding-departments', selectedUniversity?.slug, selectedFaculty?.slug],
    queryFn: () => fetchDepartments(selectedUniversity!.slug, selectedFaculty!.slug),
    enabled: Boolean(selectedUniversity && selectedFaculty),
  });
  const departments = departmentsQuery.data ?? [];
  const selectedDepartment = departments.find((department) => department.id === profile.departmentId);
  const departmentDetailsQuery = useQuery({
    queryKey: ['onboarding-programmes', selectedUniversity?.slug, selectedFaculty?.slug, selectedDepartment?.slug],
    queryFn: () => fetchDepartmentDetails(selectedUniversity!.slug, selectedFaculty!.slug, selectedDepartment!.slug),
    enabled: Boolean(selectedUniversity && selectedFaculty && selectedDepartment),
  });
  const programmes = departmentDetailsQuery.data?.programmes ?? [];
  const selectedProgramme = programmes.find((programme) => programme.id === profile.programmeId);
  const levels = selectedProgramme?.levels ?? [];
  const selectedLevel = levels.find((level) => level.id === profile.currentLevelId);
  const semesters = selectedLevel?.semesters ?? [];
  const countries = [...new Set(universities.map((university) => university.countryCode))].sort();
  const displayNames = typeof Intl.DisplayNames === 'undefined' ? null : new Intl.DisplayNames(undefined, { type: 'region' });
  const countryOptions: CountryOption[] = countries.map((code) => ({ code, label: countryLabel(code, displayNames) }));
  const countryUniversities = universities.filter((university) => university.countryCode === countryCode);

  useEffect(() => {
    if (initialized || profileQuery.isPending || userProfileQuery.isPending || preferencesQuery.isPending
      || profileQuery.isError || userProfileQuery.isError || preferencesQuery.isError) return;
    const saved = profileQuery.data;
    if (saved) {
      setProfile({
        universityId: saved.universityId,
        facultyId: saved.facultyId,
        departmentId: saved.departmentId,
        programmeId: saved.programmeId,
        currentLevelId: saved.currentLevelId,
        currentSemesterId: saved.currentSemesterId,
      });
      setCountryCode(saved.university?.countryCode ?? '');
    }
    setUserProfile(userProfileQuery.data ?? emptyUserProfile);
    setPreferences(preferencesQuery.data ?? emptyPreferences);
    setInitialized(true);
  }, [initialized, preferencesQuery.data, preferencesQuery.isError, preferencesQuery.isPending, profileQuery.data, profileQuery.isError, profileQuery.isPending, userProfileQuery.data, userProfileQuery.isError, userProfileQuery.isPending]);

  function enqueueSave(save: () => Promise<void>, fallback: string): Promise<void> {
    setSaveError('');
    setSaveState('saving');
    const sequence = ++saveSequence.current;
    const task = saveQueue.current.catch(() => undefined).then(save);
    const trackedTask = task.then(() => {
      if (sequence === saveSequence.current) setSaveState('saved');
    }).catch((error: unknown) => {
      if (sequence === saveSequence.current) {
        setSaveState('error');
        setSaveError(error instanceof Error ? error.message : fallback);
      }
      throw error;
    });
    saveQueue.current = trackedTask;
    return trackedTask;
  }

  function persist(next: AcademicProfileInput) {
    setProfile(next);
    void enqueueSave(() => saveAcademicProfile(next), 'Could not save your academic profile.').catch(() => undefined);
  }

  function persistPreferences(next: UserPreferences) {
    void enqueueSave(async () => { await putAuth('/me/preferences', next, 'Could not save your preferences.'); }, 'Could not save your preferences.').catch(() => undefined);
  }

  function normalizedUserProfile(value: UserProfileFields): UserProfileFields {
    return Object.fromEntries(Object.entries(value).map(([key, fieldValue]) => [key, typeof fieldValue === 'string' && fieldValue.trim() === '' ? null : typeof fieldValue === 'string' ? fieldValue.trim() : fieldValue])) as UserProfileFields;
  }

  function updateUserProfile(field: keyof UserProfileFields, value: string) {
    setUserProfile((current) => ({ ...current, [field]: value || null }));
  }

  function chooseCountry(code: string) {
    setCountryCode(code);
    if (selectedUniversity && selectedUniversity.countryCode === code) return;
    persist(emptyProfile);
  }

  function chooseUniversity(id: string) {
    const university = universities.find((item) => item.id === id);
    setCountryCode(university?.countryCode ?? countryCode);
    persist({ ...emptyProfile, universityId: id || null });
  }

  function chooseFaculty(id: string) {
    persist({ ...profile, facultyId: id || null, departmentId: null, programmeId: null, currentLevelId: null, currentSemesterId: null });
  }

  function chooseDepartment(id: string) {
    persist({ ...profile, departmentId: id || null, programmeId: null, currentLevelId: null, currentSemesterId: null });
  }

  function chooseProgramme(id: string) {
    persist({ ...profile, programmeId: id || null, currentLevelId: null, currentSemesterId: null });
  }

  function chooseLevel(id: string) {
    persist({ ...profile, currentLevelId: id || null, currentSemesterId: null });
  }

  async function continuePreferences() {
    setSaveError('');
    setFinishing(true);
    try {
      await enqueueSave(async () => { await putAuth('/me/preferences', preferences, 'Could not save your preferences.'); }, 'Could not save your preferences.');
      setStep(4);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save your preferences.');
    } finally {
      setFinishing(false);
    }
  }

  async function finishUserProfile() {
    setSaveError('');
    const username = userProfile.username?.trim().toLowerCase() ?? '';
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setSaveError('Choose a username with 3–30 letters, numbers, or underscores.');
      setStep(4);
      return;
    }
    setFinishing(true);
    try {
      await enqueueSave(async () => { await putAuth('/me/profile', normalizedUserProfile({ ...userProfile, username }), 'Could not save your profile.'); }, 'Could not save your profile.');
      navigate('/account');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setFinishing(false);
    }
  }

  function togglePreference(group: keyof UserPreferences, value: string) {
    const selected = preferences[group];
    const next = { ...preferences, [group]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value] };
    setPreferences(next);
    persistPreferences(next);
  }

  if (isLoading) return <main className="auth-page"><section className="auth-card"><p className="auth-status" role="status">Loading your profile…</p></section></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: '/onboarding' }} />;
  if (profileQuery.isPending || userProfileQuery.isPending || preferencesQuery.isPending) return <main className="auth-page"><section className="auth-card"><p className="auth-status" role="status">Loading your profile…</p></section></main>;
  if (profileQuery.isError || userProfileQuery.isError || preferencesQuery.isError) return <main className="auth-page"><section className="auth-card"><p className="auth-error" role="alert">{profileQuery.error?.message ?? userProfileQuery.error?.message ?? preferencesQuery.error?.message}</p><button className="button button-purple auth-submit" type="button" onClick={() => { void profileQuery.refetch(); void userProfileQuery.refetch(); void preferencesQuery.refetch(); }}>Try again</button></section></main>;

  const progress = saveState === 'saving' ? 'Saving progress…' : saveState === 'saved' ? 'Progress saved' : saveState === 'error' ? 'Could not save' : 'Your choices are optional';

  return (
    <div className="site-shell">
      <header className="site-header"><div className="header-inner"><Link className="brand" to="/" aria-label="Engineering Resources Hub home"><img className="brand-logo" src="/engineering-resources-hub-logo.png" alt="Engineering Resources Hub" width="1200" height="380" /></Link></div></header>
      <main className="onboarding-page">
        <section className="onboarding-card" aria-labelledby="onboarding-title">
          <p className="eyebrow">PERSONALIZE YOUR EXPERIENCE</p>
          <h1 id="onboarding-title">Complete your EngHub profile</h1>
          <p className="auth-description">Set up your account after verifying your email. Academic details and learning preferences are optional; a username is required.</p>
          <ol className="onboarding-stepper" aria-label="Onboarding progress">
            <li aria-current={step === 1 ? 'step' : undefined} className={step === 1 ? 'is-current' : 'is-complete'}><span>1</span><div><strong>Your institution</strong><small>Optional</small></div></li>
            <li aria-current={step === 2 ? 'step' : undefined} className={step === 2 ? 'is-current' : step > 2 ? 'is-complete' : ''}><span>2</span><div><strong>Academic progress</strong><small>Optional</small></div></li>
            <li aria-current={step === 3 ? 'step' : undefined} className={step === 3 ? 'is-current' : step > 3 ? 'is-complete' : ''}><span>3</span><div><strong>Preferences</strong><small>Optional</small></div></li>
            <li aria-current={step === 4 ? 'step' : undefined} className={step === 4 ? 'is-current' : ''}><span>4</span><div><strong>Profile</strong><small>Optional</small></div></li>
          </ol>
          <p className={`onboarding-save onboarding-save-${saveState}`} role="status">{progress}</p>
          {saveError && <p className="auth-error" role="alert">{saveError}</p>}

          {!initialized || universitiesQuery.isPending ? <p className="auth-status" role="status">Loading academic options…</p> : universitiesQuery.isError ? <div className="catalog-message catalog-error" role="alert"><span>{universitiesQuery.error.message}</span><button type="button" onClick={() => void universitiesQuery.refetch()}>Try again</button></div> : step === 1 ? <>
            <div className="onboarding-fields">
              <label>Country <span className="optional-label">(optional)</span><select value={countryCode} onChange={(event) => chooseCountry(event.target.value)}><option value="">Select a country</option>{countryOptions.map((country) => <option key={country.code} value={country.code}>{country.label}</option>)}</select></label>
              <label>University <span className="optional-label">(optional)</span><select value={profile.universityId ?? ''} onChange={(event) => chooseUniversity(event.target.value)} disabled={!countryCode}><option value="">Select a university</option>{countryUniversities.map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}</select></label>
              <label>Faculty <span className="optional-label">(if applicable)</span><select value={profile.facultyId ?? ''} onChange={(event) => chooseFaculty(event.target.value)} disabled={!selectedUniversity || facultiesQuery.isPending}><option value="">Select a faculty</option>{faculties.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.name}</option>)}</select></label>
              {facultiesQuery.isError && <p className="auth-error" role="alert">{facultiesQuery.error.message}</p>}
              {selectedUniversity && facultiesQuery.data?.length === 0 && <p className="field-hint">This university has no faculty records yet. You can continue without them.</p>}
              <label>Department <span className="optional-label">(if applicable)</span><select value={profile.departmentId ?? ''} onChange={(event) => chooseDepartment(event.target.value)} disabled={!selectedFaculty || departmentsQuery.isPending}><option value="">Select a department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              {departmentsQuery.isError && <p className="auth-error" role="alert">{departmentsQuery.error.message}</p>}
              <label>Programme <span className="optional-label">(if applicable)</span><select value={profile.programmeId ?? ''} onChange={(event) => chooseProgramme(event.target.value)} disabled={!selectedDepartment || departmentDetailsQuery.isPending}><option value="">Select a programme</option>{programmes.map((programme) => <option key={programme.id} value={programme.id}>{programme.name}</option>)}</select></label>
              {departmentDetailsQuery.isError && <p className="auth-error" role="alert">{departmentDetailsQuery.error.message}</p>}
            </div>
            <div className="onboarding-actions"><button className="button button-outline" type="button" onClick={() => setStep(2)}>Skip this step</button><button className="button button-purple" type="button" onClick={() => setStep(2)}>Continue</button></div>
          </> : step === 2 ? <>
            {!selectedProgramme && <div className="onboarding-note"><p>Select a programme first to load its academic levels. If it isn’t available, you can skip this step and finish later.</p></div>}
            <div className="onboarding-fields">
              <label>Current level <span className="optional-label">(optional)</span><select value={profile.currentLevelId ?? ''} onChange={(event) => chooseLevel(event.target.value)} disabled={!selectedProgramme || !levels.length}><option value="">Select a level</option>{levels.map((level) => <option key={level.id} value={level.id}>{level.label ?? `${level.code} Level`}</option>)}</select></label>
              {selectedProgramme && levels.length === 0 && <p className="field-hint">No level options are available for this programme yet. You can finish without them.</p>}
              <label>Current semester <span className="optional-label">(optional)</span><select value={profile.currentSemesterId ?? ''} onChange={(event) => persist({ ...profile, currentSemesterId: event.target.value || null })} disabled={!selectedLevel || !semesters.length}><option value="">Select a semester</option>{semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.label}</option>)}</select></label>
            </div>
            <div className="onboarding-actions"><button className="button button-outline" type="button" onClick={() => setStep(1)}>Back</button><button className="button button-outline" type="button" onClick={() => setStep(3)}>Skip this step</button><button className="button button-purple" type="button" onClick={() => setStep(3)}>Continue</button></div>
          </> : step === 3 ? <>
            <p className="onboarding-step-intro">Choose topics and materials you care about. These choices are optional and can be changed later.</p>
            <div className="preference-groups">
              {(Object.keys(preferenceOptions) as Array<keyof UserPreferences>).map((group) => <fieldset className="preference-group" key={group}>
                <legend>{group === 'resourceKinds' ? 'Preferred resource types' : group === 'learningInterests' ? 'Learning interests' : 'Learning goals'}</legend>
                <div className="preference-options">{preferenceOptions[group].map(([value, label]) => <label className="preference-option" key={value}><input type="checkbox" checked={preferences[group].includes(value)} onChange={() => togglePreference(group, value)} /><span>{label}</span></label>)}</div>
              </fieldset>)}
            </div>
            <div className="onboarding-actions"><button className="button button-outline" type="button" onClick={() => setStep(2)}>Back</button><button className="button button-outline" type="button" onClick={() => void continuePreferences()} disabled={finishing}>{finishing ? 'Saving…' : 'Skip this step'}</button><button className="button button-purple" type="button" onClick={() => void continuePreferences()} disabled={finishing}>{finishing ? 'Saving…' : 'Continue'}</button></div>
          </> : <>
            <p className="onboarding-step-intro">Choose a username to finish creating your account. Social links and avatar are optional.</p>
            <div className="onboarding-fields">
              <label>Username <span className="required-label">(required)</span><input value={userProfile.username ?? ''} minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" autoComplete="username" required onChange={(event) => updateUserProfile('username', event.target.value)} placeholder="your_username" /><small>3–30 letters, numbers, or underscores</small></label>
              <label>Avatar image URL <span className="optional-label">(optional)</span><input type="url" value={userProfile.avatarUrl ?? ''} onChange={(event) => updateUserProfile('avatarUrl', event.target.value)} placeholder="https://…" /></label>
              <label className="onboarding-bio-field">Short bio <span className="optional-label">(optional)</span><textarea value={userProfile.bio ?? ''} maxLength={280} onChange={(event) => updateUserProfile('bio', event.target.value)} rows={4} placeholder="A little about what you’re learning" /><small>{(userProfile.bio ?? '').length}/280</small></label>
              <label>GitHub profile URL <span className="optional-label">(optional)</span><input type="url" value={userProfile.githubUrl ?? ''} onChange={(event) => updateUserProfile('githubUrl', event.target.value)} placeholder="https://github.com/username" /></label>
              <label>LinkedIn profile URL <span className="optional-label">(optional)</span><input type="url" value={userProfile.linkedInUrl ?? ''} onChange={(event) => updateUserProfile('linkedInUrl', event.target.value)} placeholder="https://www.linkedin.com/in/username" /></label>
            </div>
            <div className="onboarding-actions"><button className="button button-outline" type="button" onClick={() => setStep(3)}>Back</button><button className="button button-purple" type="button" onClick={() => void finishUserProfile()} disabled={finishing}>{finishing ? 'Saving…' : 'Save and finish'}</button></div>
          </>}
          <p className="onboarding-privacy">Your academic profile is optional. Public resource browsing does not require onboarding.</p>
        </section>
      </main>
      <footer className="account-footer">© {new Date().getFullYear()} EngHub · Open knowledge for engineering</footer>
    </div>
  );
}
