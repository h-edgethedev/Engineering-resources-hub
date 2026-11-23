import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { LoginPage, ProtectedAccount, RegisterPage, VerifyEmailPage } from './AuthPages';
import { AcademicOnboarding } from './AcademicOnboarding';
import { PublicHeader } from './PublicHeader';
import { CourseDetailPage, ExplorePage, ResourceDetailPage, UniversitiesPage, UniversityDetailPage } from './DiscoveryPages';
import { useAuth } from './auth';

interface Department {
  id: string;
  name: string;
  slug: string;
  facultySlug?: string;
  universitySlug?: string;
}

interface Faculty {
  id: string;
  name: string;
  slug: string;
  departments: Department[];
}

interface University {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  faculties: Faculty[];
}

interface ApiResponse<T> {
  data: T;
}

interface LandingCourse { id: string; code: string; title: string; programme: { department: { name: string } }; }
interface LandingResource { id: string; title: string; type: string; course: { id: string; code: string; title: string }; }

interface DepartmentDetails extends Department {
  faculty: { name: string; slug: string };
  generalCourses: Array<{ id: string; code: string; title: string; creditUnits: number | null }>;
  programmes: Array<{
    id: string;
    name: string;
    slug: string;
    award: string | null;
    durationYears: number | null;
    levels: Array<{
      id: string;
      code: string;
      label: string | null;
      ordinal: number;
      semesters: Array<{ id: string; code: string; label: string; ordinal: number }>;
    }>;
    courses: Array<{
      id: string;
      code: string;
      title: string;
      creditUnits: number | null;
      offerings: Array<{
        academicSession: { label: string };
        semester: { label: string; programmeLevel: { code: string; label: string | null } };
      }>;
    }>;
  }>;
}

async function fetchUniversity(): Promise<University> {
  const response = await fetch('/api/v1/universities/university-of-lagos');
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'The university catalogue is not available yet.' : 'Could not load the academic catalogue.');
  }
  const result = (await response.json()) as ApiResponse<University>;
  return result.data;
}

async function fetchDepartment(universitySlug: string, facultySlug: string, departmentSlug: string): Promise<DepartmentDetails> {
  const response = await fetch(`/api/v1/universities/${universitySlug}/faculties/${facultySlug}/departments/${departmentSlug}`);
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'This department could not be found.' : 'Could not load department details.');
  }
  const result = (await response.json()) as ApiResponse<DepartmentDetails>;
  return result.data;
}

async function fetchLandingList<T>(path: string): Promise<T[]> {
  const response = await fetch(`/api/v1${path}`);
  if (!response.ok) throw new Error('Could not load this catalogue section.');
  const result = await response.json() as ApiResponse<T[]>;
  return result.data;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.3 4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <div className="section-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p>{description}</p>}</div>;
}

function HeroSearch() {
  const [searchText, setSearchText] = useState('');
  const navigate = useNavigate();
  const suggestions = ['Computer Engineering', 'Electrical and Electronics Engineering', 'Past questions'];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(searchText.trim() ? `/search?q=${encodeURIComponent(searchText.trim())}` : '/explore');
  }

  return (
    <div className="hero-search-wrap">
      <form className="hero-search" onSubmit={handleSubmit} role="search">
        <SearchIcon />
        <label className="sr-only" htmlFor="site-search">Search courses and learning materials</label>
        <input id="site-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search courses, course codes or learning materials..." />
        <button type="submit">Search <ArrowIcon /></button>
      </form>
      <p className="search-status">Search approved resources and the course catalogue.</p>
      <div className="suggestions" aria-label="Suggested searches">
        <span>Try exploring</span>
        {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(suggestion)}`)}>{suggestion}</button>)}
      </div>
    </div>
  );
}

function Hero({ departmentCount }: { departmentCount: number }) {
  return (
    <section className="hero" id="home" aria-labelledby="hero-title">
      <div className="hero-grid" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
      <div className="hero-content">
        <div className="hero-badge"><span className="live-dot" /> Academic resources, connected</div>
        <h1 id="hero-title">Engineering knowledge,<br /><span>all in one hub.</span></h1>
        <p className="hero-copy">Discover engineering courses and the learning materials that bring them to life. Starting with the University of Lagos.</p>
        <HeroSearch />
        <div className="hero-proof"><span className="proof-mark">✳</span><span>{departmentCount ? `${departmentCount} departments listed at UNILAG` : 'UNILAG academic catalogue'}</span><span className="proof-divider" /><span>Growing with the community</span></div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="node node-center"><span className="node-symbol">∑</span><b>Engineering</b><small>knowledge</small></div>
        <div className="node node-computer"><span className="node-symbol">⌘</span><b>Computer</b><small>systems</small></div>
        <div className="node node-electrical"><span className="node-symbol">ϟ</span><b>Electrical</b><small>circuits</small></div>
        <div className="node node-resources"><span className="node-symbol">▤</span><b>Resources</b><small>shared learning</small></div>
        <span className="spark spark-a">✳</span><span className="spark spark-b">✳</span><span className="spark spark-c">✳</span>
      </div>
      <a className="scroll-cue" href="#disciplines"><span /> Explore the hub</a>
    </section>
  );
}

function DepartmentCard({ department, index }: { department: Department; index: number }) {
  const initials = department.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const descriptions: Record<string, string> = {
    'computer-engineering': 'Computing systems, digital design and intelligent technology.',
    'electrical-and-electronics-engineering': 'Electrical systems, electronics and communications.',
  };
  return (
    <article className={`discipline-card discipline-tone-${index % 4}`}>
      <div className="discipline-top"><span className="discipline-icon">{initials}</span><span className="card-arrow"><ArrowIcon /></span></div>
      <div><p className="card-kicker">UNIVERSITY OF LAGOS</p><h3>{department.name}</h3><p className="discipline-description">{descriptions[department.slug] ?? 'Explore courses and academic resources for this department.'}</p></div>
      <Link className="text-link" to={`/universities/${department.universitySlug}/faculties/${department.facultySlug}/departments/${department.slug}`}>Explore department <ArrowIcon /></Link>
    </article>
  );
}

function EmptyCatalogCard({ title, message, action, href }: { title: string; message: string; action: string; href: string }) {
  return <div className="empty-catalog"><div className="empty-icon" aria-hidden="true">＋</div><div><h3>{title}</h3><p>{message}</p></div><a className="text-link" href={href}>{action} <ArrowIcon /></a></div>;
}

function LandingPage() {
  const { user } = useAuth();
  const universityQuery = useQuery({ queryKey: ['university', 'university-of-lagos'], queryFn: fetchUniversity });
  const coursesQuery = useQuery({ queryKey: ['landing-courses'], queryFn: () => fetchLandingList<LandingCourse>('/courses?page=1&pageSize=4') });
  const resourcesQuery = useQuery({ queryKey: ['landing-resources'], queryFn: () => fetchLandingList<LandingResource>('/resources?page=1&pageSize=3') });
  const departments = universityQuery.data?.faculties.flatMap((faculty) => faculty.departments.map((department) => ({ ...department, facultySlug: faculty.slug, universitySlug: universityQuery.data?.slug }))) ?? [];
  const facultyCount = universityQuery.data?.faculties.length ?? 0;

  return (
    <div className="site-shell">
      <PublicHeader />
      <main>
        <Hero departmentCount={departments.length} />

        <section className="section section-disciplines" id="disciplines" aria-labelledby="disciplines-title">
          <div className="section-inner">
            <SectionHeading eyebrow="FIND YOUR FIELD" title="Explore engineering disciplines" description="Start with an academic department and find your way to the courses that matter." />
            {universityQuery.isPending && <div className="catalog-message" role="status">Loading verified departments…</div>}
            {universityQuery.isError && <div className="catalog-message catalog-error" role="alert"><span>Departments could not be loaded.</span><button onClick={() => void universityQuery.refetch()}>Try again</button></div>}
            {universityQuery.data && departments.length === 0 && <div className="catalog-message">No departments have been added yet.</div>}
            <div className="discipline-grid">
              {departments.map((department, index) => <DepartmentCard key={department.id} department={department} index={index} />)}
            </div>
          </div>
        </section>

        <section className="section section-courses" id="courses" aria-labelledby="courses-title">
          <div className="section-inner">
            <SectionHeading eyebrow="COURSE DISCOVERY" title="Find your next course" description="Browse by department, then explore course details and related learning materials." />
            {coursesQuery.isPending && <div className="catalog-message" role="status">Loading courses…</div>}
            {coursesQuery.isError && <div className="catalog-message catalog-error" role="alert">Courses are temporarily unavailable. <button onClick={() => void coursesQuery.refetch()}>Try again</button></div>}
            {coursesQuery.data?.length ? <><div className="landing-preview-grid">{coursesQuery.data.map((course) => <article className="landing-preview-card" key={course.id}><p className="card-kicker">{course.code}</p><h3><Link to={`/courses/${course.id}`}>{course.title}</Link></h3><p>{course.programme.department.name}</p></article>)}</div><Link className="text-link section-action" to="/explore">Explore all courses <ArrowIcon /></Link></> : coursesQuery.isSuccess && <EmptyCatalogCard title="No courses are available yet" message="Verified course records will appear here when they are available." action="Browse departments" href="#disciplines" />}
          </div>
        </section>

        <section className="section section-resources" id="resources" aria-labelledby="resources-title">
          <div className="section-inner">
            <div className="section-heading-row"><SectionHeading eyebrow="LEARN TOGETHER" title="Resources for the work ahead" description="Lecture notes, past questions, lab guides and more, organized around your courses." /><Link className="text-link section-action" to="/explore">Browse all resources <ArrowIcon /></Link></div>
            {resourcesQuery.isPending && <div className="catalog-message" role="status">Loading approved resources…</div>}
            {resourcesQuery.isError && <div className="catalog-message catalog-error" role="alert">Resources are temporarily unavailable. <button onClick={() => void resourcesQuery.refetch()}>Try again</button></div>}
            {resourcesQuery.data?.length ? <div className="landing-resource-preview">{resourcesQuery.data.map((resource) => <article className="landing-preview-card" key={resource.id}><p className="card-kicker">{resource.type.replaceAll('_', ' ')}</p><h3><Link to={`/resources/${resource.id}`}>{resource.title}</Link></h3><p><Link to={`/courses/${resource.course.id}`}>{resource.course.code} · {resource.course.title}</Link></p></article>)}</div> : resourcesQuery.isSuccess && <EmptyCatalogCard title="No approved resources yet" message="Approved course materials will appear here after they pass review." action="Learn how it works" href="#about" />}
          </div>
        </section>

        <section className="section section-universities" id="universities" aria-labelledby="universities-title">
          <div className="section-inner">
            <SectionHeading eyebrow="BUILT TO GROW" title="Starting at the University of Lagos" description="EngHub is designed to support engineering students across universities, one verified academic catalogue at a time." />
            {universityQuery.data && <article className="university-card"><img className="university-crest" src="/unilag_logo.png" alt="University of Lagos logo" width="72" height="72" /><div className="university-details"><p className="card-kicker">CURRENTLY AVAILABLE</p><h3>{universityQuery.data.name}</h3><p>{universityQuery.data.countryCode === 'NG' ? 'Nigeria' : universityQuery.data.countryCode}</p><div className="university-tags"><span>{facultyCount} {facultyCount === 1 ? 'faculty' : 'faculties'}</span><span>{departments.length} departments</span></div></div><a className="button button-outline" href="#disciplines">Explore university <ArrowIcon /></a></article>}
            {universityQuery.isError && <div className="catalog-message">University information is temporarily unavailable.</div>}
          </div>
        </section>

        <section className="section section-how" id="about" aria-labelledby="about-title">
          <div className="section-inner">
            <SectionHeading eyebrow="HOW ENGHUB WORKS" title="A clearer path through engineering school" description="From finding a course to learning from the work of your peers." />
            <div className="steps-grid">
              <article className="step-card"><span className="step-number">01</span><span className="step-icon">⌕</span><h3>Discover courses</h3><p>Browse your university and department to find the courses you are taking.</p></article>
              <article className="step-card"><span className="step-number">02</span><span className="step-icon">▤</span><h3>Explore resources</h3><p>Find notes, past questions and practical materials connected to each course.</p></article>
              <article className="step-card"><span className="step-number">03</span><span className="step-icon">↗</span><h3>Learn and contribute</h3><p>Share useful academic resources and help strengthen the student community.</p></article>
            </div>
          </div>
        </section>

        <section className="contribute-section" id="contribute" aria-labelledby="contribute-title">
          <div className="contribute-pattern" aria-hidden="true">✳</div>
          <div className="contribute-copy"><p className="eyebrow">BUILT BY THE COMMUNITY</p><h2 id="contribute-title">Your notes could help someone crack the next problem.</h2><p>Community contributions will help make great learning materials easier to find. Every submission will be reviewed before it becomes public.</p></div>
          <Link className="button button-light" to={user ? '/account' : '/register'}>{user ? 'Go to your account' : 'Create an account'} <ArrowIcon /></Link>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-main"><Link className="brand footer-brand" to="/"><img className="brand-logo" src="/engineering-resources-hub-logo.png" alt="Engineering Resources Hub" width="1200" height="380" /></Link><p>Engineering knowledge, shared openly.</p>
          <nav className="footer-links" aria-label="Footer navigation"><a href="#courses">Explore courses</a><a href="#resources">Resources</a><a href="#universities">Universities</a><a href="#about">About</a><span>Contact <small>soon</small></span></nav>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} EngHub. Open knowledge for engineering.</span><div><span>Privacy policy coming soon</span><span>Terms of service coming soon</span></div></div>
      </footer>
    </div>
  );
}

function DepartmentPage() {
  const { universitySlug = '', facultySlug = '', departmentSlug = '' } = useParams();
  const departmentQuery = useQuery({
    queryKey: ['department', universitySlug, facultySlug, departmentSlug],
    queryFn: () => fetchDepartment(universitySlug, facultySlug, departmentSlug),
    enabled: Boolean(universitySlug && facultySlug && departmentSlug),
  });
  const department = departmentQuery.data;

  return (
    <div className="site-shell">
      <PublicHeader />
      <main className="department-page">
        <div className="department-page-inner">
          <a className="text-link back-link" href="/#disciplines">← All departments</a>
          {departmentQuery.isPending && <div className="catalog-message" role="status">Loading department details…</div>}
          {departmentQuery.isError && <div className="catalog-message catalog-error" role="alert"><span>{departmentQuery.error.message}</span><button onClick={() => void departmentQuery.refetch()}>Try again</button></div>}
          {department && <>
            <p className="eyebrow">UNIVERSITY OF LAGOS · {department.faculty.name.toUpperCase()}</p>
            <h1 className="department-title">{department.name}</h1>
            <p className="department-intro">Browse the programmes and courses in this department. Course information is shown here after it has been validated and added.</p>
            {department.programmes.length === 0 ? (
              <div className="empty-catalog department-empty"><div className="empty-icon" aria-hidden="true">＋</div><div><h2>Programme details are being prepared</h2><p>Verified programme and course information will appear here when it is ready.</p></div></div>
            ) : department.programmes.map((programme) => (
              <section className="programme-card" key={programme.id}>
                <div className="programme-heading"><div><p className="card-kicker">ACADEMIC PROGRAMME</p><h2>{programme.name}</h2></div><span>{programme.award ?? 'Programme'}{programme.durationYears ? ` · ${programme.durationYears} years` : ''}</span></div>
                {programme.courses.length ? <div className="course-list">{programme.courses.map((course) => <article className="course-row" key={course.id}><div><Link className="course-detail-link" to={`/courses/${course.id}`}><strong>{course.code}</strong><span>{course.title}</span></Link>{course.offerings.map((offering) => <small className="course-context" key={`${offering.academicSession.label}-${offering.semester.label}`}>{offering.semester.programmeLevel.label ?? `${offering.semester.programmeLevel.code} Level`} · {offering.semester.label} · {offering.academicSession.label}</small>)}</div>{course.creditUnits !== null && <small className="course-credits">{course.creditUnits} units</small>}</article>)}</div> : <p className="programme-empty">Course records will appear after they have been validated.</p>}
                {programme.levels.length > 0 && <div className="level-list"><h3>Programme structure</h3>{programme.levels.map((level) => <div className="level-row" key={level.id}><strong>{level.label ?? level.code} Level</strong><span>{level.semesters.length ? level.semesters.map((semester) => semester.label).join(' · ') : 'Semester details pending'}</span></div>)}</div>}
              </section>
            ))}
            {department.generalCourses.length > 0 && <section className="programme-card general-courses-card"><div className="programme-heading"><div><p className="card-kicker">SHARED ACROSS DEPARTMENTS</p><h2>General Engineering courses</h2></div></div><p className="programme-empty">These GET courses are available to students across departments at this university.</p><div className="course-list">{department.generalCourses.map((course) => <article className="course-row" key={course.id}><div><Link className="course-detail-link" to={`/courses/${course.id}`}><strong>{course.code}</strong><span>{course.title}</span></Link></div>{course.creditUnits !== null && <small className="course-credits">{course.creditUnits} units</small>}</article>)}</div></section>}
          </>}
        </div>
      </main>
      <footer className="site-footer"><div className="footer-main"><Link className="brand footer-brand" to="/"><img className="brand-logo" src="/engineering-resources-hub-logo.png" alt="Engineering Resources Hub" width="1200" height="380" /></Link><p>Engineering knowledge, shared openly.</p></div><div className="footer-bottom"><span>© {new Date().getFullYear()} EngHub. Open knowledge for engineering.</span></div></footer>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/search" element={<ExplorePage />} />
      <Route path="/universities" element={<UniversitiesPage />} />
      <Route path="/universities/:slug" element={<UniversityDetailPage />} />
      <Route path="/courses/:courseId" element={<CourseDetailPage />} />
      <Route path="/resources/:resourceId" element={<ResourceDetailPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/onboarding" element={<AcademicOnboarding />} />
      <Route path="/account" element={<ProtectedAccount />} />
      <Route path="/universities/:universitySlug/faculties/:facultySlug/departments/:departmentSlug" element={<DepartmentPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<main className="not-found-page"><h1>Page not found</h1><p>The address may be incorrect or the page may have moved.</p><Link className="button button-purple" to="/">Return home</Link></main>} />
    </Routes>
  );
}

export default App;
