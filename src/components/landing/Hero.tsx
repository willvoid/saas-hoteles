import { Link } from 'react-router-dom';
import { REGISTER_PATH, TRIAL_DAYS } from './content';

export default function Hero() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <p className="home-eyebrow">Software de gestión para hoteles</p>
      <h1 id="home-hero-title" className="home-hero-title">
        Administrá tu hotel desde un solo lugar
      </h1>
      <p className="home-hero-lead">
        Reservas, habitaciones, caja y equipo en un sistema simple. Empezá hoy con {TRIAL_DAYS} días de prueba
        gratis, sin tarjeta.
      </p>
      <div className="home-hero-actions">
        <Link to={REGISTER_PATH} className="home-btn home-btn-primary home-btn-lg">
          Probar gratis {TRIAL_DAYS} días
        </Link>
        <a href="#planes" className="home-btn home-btn-ghost home-btn-lg">
          Ver planes
        </a>
      </div>
    </section>
  );
}
