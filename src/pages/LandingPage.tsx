import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BedDouble, ShieldCheck, MapPin, LogIn } from 'lucide-react';
import { BookingProvider, useBooking } from '../context/BookingContext';
import BookingWizard from '../components/booking/BookingWizard';
import { LandingService } from '../services/landingService';
import type { LandingCatalogo } from '../types/booking';
import './LandingPage.css';
import heroBg from '../assets/suite_matrimonial.jpg';

function HeroSection() {
  const { currentStep } = useBooking();
  
  return (
    <div className={`hero-content ${currentStep > 1 ? 'wizard-active' : ''}`}>
      {currentStep === 1 && (
        <div className="hero-text">
          <span className="hero-badge">Tu escape perfecto</span>
          <h1 className="hero-title">Descubre el confort en el corazón de la ciudad</h1>
          <p className="hero-subtitle">
            Reserva ahora tu habitación y disfruta de una experiencia inolvidable. Instalaciones premium, servicio excepcional y la mejor ubicación.
          </p>
          
          <div className="hero-features">
            <div className="hero-feature">
              <div className="feature-icon"><BedDouble size={20} /></div>
              <span>Habitaciones de lujo</span>
            </div>
            <div className="hero-feature">
              <div className="feature-icon"><MapPin size={20} /></div>
              <span>Ubicación céntrica</span>
            </div>
            <div className="hero-feature">
              <div className="feature-icon"><ShieldCheck size={20} /></div>
              <span>Reserva segura</span>
            </div>
          </div>
        </div>
      )}

      <BookingWizard />
    </div>
  );
}

function LandingContent({ slug, catalogo }: { slug: string; catalogo: LandingCatalogo }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="landing-page">
      <div className="landing-bg-orb-1"></div>
      <div className="landing-bg-orb-2"></div>

      <nav className={`landing-navbar ${scrolled ? 'scrolled' : ''}`}>
        <Link to={`/h/${slug}`} className="landing-logo-container">
          <BedDouble size={28} />
          <span className="landing-brand">Reservas en línea</span>
        </Link>
        <div className="landing-nav-links">
          <a href="#reservar" className="landing-nav-link">Reservar</a>
          <Link to="/login" className="login-btn-nav" title="Portal Administrador" aria-label="Portal Administrador">
            <LogIn size={20} />
          </Link>
        </div>
      </nav>

      <main className="landing-hero" id="reservar">
        <img src={heroBg} alt="Habitación" className="hero-background-image" />
        
        <BookingProvider slug={slug} catalogo={catalogo}>
          <HeroSection />
        </BookingProvider>
      </main>
    </div>
  );
}

export default function LandingPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  // catalogo null: el hotel no existe o no está disponible
  const [resultado, setResultado] = useState<{ slug: string; catalogo: LandingCatalogo | null; error: boolean } | null>(null);

  useEffect(() => {
    let cancelado = false;
    LandingService.getCatalogo(slug)
      .then((catalogo) => {
        if (!cancelado) setResultado({ slug, catalogo, error: false });
      })
      .catch(() => {
        if (!cancelado) setResultado({ slug, catalogo: null, error: true });
      });
    return () => {
      cancelado = true;
    };
  }, [slug]);

  if (!resultado || resultado.slug !== slug) {
    return (
      <div className="auth-page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="loader"></div>
      </div>
    );
  }

  if (resultado.error) {
    return (
      <div className="auth-page-wrapper">
        <div className="login-container">
          <h2 className="login-title">No pudimos cargar el sitio</h2>
          <p className="login-subtitle">Intentá nuevamente en unos minutos.</p>
        </div>
      </div>
    );
  }

  if (resultado.catalogo === null) {
    return (
      <div className="auth-page-wrapper">
        <div className="login-container">
          <h2 className="login-title">Hotel no encontrado</h2>
          <p className="login-subtitle">
            El enlace es incorrecto o el hotel no está disponible para reservas en este momento.
          </p>
        </div>
      </div>
    );
  }

  return <LandingContent slug={slug} catalogo={resultado.catalogo} />;
}
