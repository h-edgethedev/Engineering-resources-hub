import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';

interface Department {
  id: string;
  name: string;
  slug: string;
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

async function fetchUniversity(): Promise<University> {
  const response = await fetch('/api/v1/universities/university-of-lagos');
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'The university catalogue is not available yet.' : 'Could not load the academic catalogue.');
  }
  const result = (await response.json()) as ApiResponse<University>;
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

function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#home" aria-label="EngHub home">
          <span className="brand-mark" aria-hidden="true">E<span>+</span></span>
          <span className="brand-name">Eng<span>Hub</span></span>
        </a>
        <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="primary-nav" onClick={() => setMenuOpen(!menuOpen)}>
          <span className="sr-only">{menuOpen ? 'Close navigation' : 'Open navigation'}</span>
          <span /><span />
        </button>
        <nav id="primary-nav" className={`primary-nav${menuOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
          <a href="#courses" onClick={closeMenu}>Explore courses</a>
          <a href="#resources" onClick={closeMenu}>Resources</a>
          <a href="#universities" onClick={closeMenu}>Universities</a>
          <a href="#about" onClick={closeMenu}>About</a>
          <span className="nav-coming-soon" aria-disabled="true">Sign in <small>soon</small></span>
          <a className="button button-small button-purple" href="#contribute" onClick={closeMenu}>Get started <ArrowIcon /></a>
        </nav>
      </div>
    </header>
  );
}

function HeroSearch() {
  const [searchText, setSearchText] = useState('');
  const [message, setMessage] = useState('Search is being built. You can browse the verified departments below.');
  const suggestions = ['Computer Engineering', 'Electrical Engineering', 'Past questions'];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(searchText.trim() ? 'Search is not connected yet. Browse departments while we build it.' : 'Enter a course or resource to search when discovery is available.');
  }

  return (
    <div className="hero-search-wrap">
      <form className="hero-search" onSubmit={handleSubmit} role="search">
        <SearchIcon />
        <label className="sr-only" htmlFor="site-search">Search courses and learning materials</label>
        <input id="site-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search courses, course codes or learning materials..." />
        <button type="submit">Search <ArrowIcon /></button>
      </form>
      <p className="search-status" aria-live="polite">{message}</p>
      <div className="suggestions" aria-label="Suggested searches">
        <span>Try exploring</span>
        {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setSearchText(suggestion); setMessage('Search is not connected yet. Browse departments below.'); }}>{suggestion}</button>)}
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
      <a className="text-link" href="#courses">Explore department <ArrowIcon /></a>
    </article>
  );
}

function EmptyCatalogCard({ title, message, action, href }: { title: string; message: string; action: string; href: string }) {
  return <div className="empty-catalog"><div className="empty-icon" aria-hidden="true">＋</div><div><h3>{title}</h3><p>{message}</p></div><a className="text-link" href={href}>{action} <ArrowIcon /></a></div>;
}

function App() {
  const universityQuery = useQuery({ queryKey: ['university', 'university-of-lagos'], queryFn: fetchUniversity });
  const departments = universityQuery.data?.faculties.flatMap((faculty) => faculty.departments) ?? [];
  const facultyCount = universityQuery.data?.faculties.length ?? 0;

  return (
    <div className="site-shell">
      <SiteHeader />
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
            <EmptyCatalogCard title="Course catalogue is coming together" message="Course records will appear here after the academic data is reviewed and added." action="Browse departments" href="#disciplines" />
          </div>
        </section>

        <section className="section section-resources" id="resources" aria-labelledby="resources-title">
          <div className="section-inner">
            <div className="section-heading-row"><SectionHeading eyebrow="LEARN TOGETHER" title="Resources for the work ahead" description="Lecture notes, past questions, lab guides and more, organized around your courses." /><a className="text-link section-action" href="#contribute">How to contribute <ArrowIcon /></a></div>
            <EmptyCatalogCard title="No public resources yet" message="Approved resources will appear here as students contribute and moderators review them." action="Learn how it works" href="#about" />
          </div>
        </section>

        <section className="section section-universities" id="universities" aria-labelledby="universities-title">
          <div className="section-inner">
            <SectionHeading eyebrow="BUILT TO GROW" title="Starting at the University of Lagos" description="EngHub is designed to support engineering students across universities, one verified academic catalogue at a time." />
            {universityQuery.data && <article className="university-card"><div className="university-crest">UN<span>i</span></div><div className="university-details"><p className="card-kicker">CURRENTLY AVAILABLE</p><h3>{universityQuery.data.name}</h3><p>{universityQuery.data.countryCode === 'NG' ? 'Nigeria' : universityQuery.data.countryCode}</p><div className="university-tags"><span>{facultyCount} {facultyCount === 1 ? 'faculty' : 'faculties'}</span><span>{departments.length} departments</span></div></div><a className="button button-outline" href="#disciplines">Explore university <ArrowIcon /></a></article>}
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
          <span className="button button-light button-disabled" aria-disabled="true">Contributions opening soon</span>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-main"><a className="brand footer-brand" href="#home"><span className="brand-mark" aria-hidden="true">E<span>+</span></span><span className="brand-name">Eng<span>Hub</span></span></a><p>Engineering knowledge, shared openly.</p>
          <nav className="footer-links" aria-label="Footer navigation"><a href="#courses">Explore courses</a><a href="#resources">Resources</a><a href="#universities">Universities</a><a href="#about">About</a><span>Contact <small>soon</small></span></nav>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} EngHub. Open knowledge for engineering.</span><div><span>Privacy policy coming soon</span><span>Terms of service coming soon</span></div></div>
      </footer>
    </div>
  );
}

export default App;
