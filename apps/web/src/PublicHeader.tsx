import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth';

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();
  const closeMenu = () => setMenuOpen(false);
  return (
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
          {user ? <Link to="/account" onClick={closeMenu}>My account</Link> : <Link to="/login" onClick={closeMenu}>Log in</Link>}
          <Link className="button button-small button-purple" to={user ? '/account' : '/register'} onClick={closeMenu}>{user ? 'Contribute' : 'Sign up'}</Link>
        </nav>
      </div>
    </header>
  );
}
