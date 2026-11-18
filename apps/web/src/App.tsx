export default function App() {
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Engineering Resources Hub home">
          <span className="brand-mark" aria-hidden="true">ER</span>
          <span>Engineering Resources Hub</span>
        </a>
        <span className="campus-label">University of Lagos</span>
      </header>

      <section className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">FACULTY OF ENGINEERING · UNILAG</p>
        <h1 id="welcome-title">A better way to find your course materials.</h1>
        <p className="intro">
          A shared home for engineering notes, past questions and learning resources.
          We are starting with Computer Engineering and Electrical and Electronics Engineering.
        </p>
        <div className="status-card">
          <span className="status-dot" aria-hidden="true" />
          <p><strong>Foundation in progress</strong><br />The resource catalogue will appear here as the platform is built.</p>
        </div>
      </section>

      <footer>Built for students, shaped by the engineering community.</footer>
    </main>
  );
}
