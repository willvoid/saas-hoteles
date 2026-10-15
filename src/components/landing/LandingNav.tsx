import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Hotel, Menu, X } from 'lucide-react';
import { REGISTER_PATH } from './content';

interface LandingNavProps {
  isSignedIn: boolean;
}

const LINKS = [
  { href: '#planes', label: 'Planes' },
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#faq', label: 'FAQ' },
];

export default function LandingNav({ isSignedIn }: LandingNavProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="home-nav">
      <div className="home-nav-inner">
        <Link to="/" className="home-brand" onClick={close}>
          <span className="home-brand-icon" aria-hidden="true">
            <Hotel size={20} />
          </span>
          <span>Gestión Hotelera</span>
        </Link>

        <button
          type="button"
          className="home-nav-toggle"
          aria-expanded={open}
          aria-controls="home-nav-menu"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>

        <nav
          id="home-nav-menu"
          className={`home-nav-menu${open ? ' is-open' : ''}`}
          aria-label="Principal"
        >
          <ul className="home-nav-links">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={close}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="home-nav-actions">
            {isSignedIn ? (
              <Link to="/hoteles" className="home-btn home-btn-primary" onClick={close}>
                Ir a mi hotel
              </Link>
            ) : (
              <>
                <Link to="/login" className="home-btn home-btn-ghost" onClick={close}>
                  Iniciar sesión
                </Link>
                <Link to={REGISTER_PATH} className="home-btn home-btn-primary" onClick={close}>
                  Probar gratis
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
