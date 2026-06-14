import { Link, NavLink } from 'react-router-dom';

function CarMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 11l1.5-4A2 2 0 0 1 8.4 5.7h7.2a2 2 0 0 1 1.9 1.3L19 11m-14 0h14m-14 0a2 2 0 0 0-2 2v3h2m14-5a2 2 0 0 1 2 2v3h-2M5 16h14M5 16v1.5M19 16v1.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="16" r="1.6" fill="currentColor" />
      <circle cx="16" cy="16" r="1.6" fill="currentColor" />
    </svg>
  );
}

export default function Navbar() {
  return (
    <header className="navbar">
      <Link to="/" className="brand">
        <span className="brand-mark">
          <CarMark />
        </span>
        <span>
          Smart Auto
          <small>Analyse de pièces · IA</small>
        </span>
      </Link>
      <nav className="nav-links">
        <NavLink to="/" end>
          Analyser
        </NavLink>
        <NavLink to="/catalogue">Catalogue</NavLink>
      </nav>
    </header>
  );
}
