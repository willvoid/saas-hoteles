import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { REGISTER_PATH, TRIAL_DAYS, TRUST_ITEMS } from './content';

export default function Hero() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <p className="home-eyebrow">Software de gestión hotelera hecho en Paraguay</p>
      <h1 id="home-hero-title" className="home-hero-title">
        Administrá tu hotel y facturá electrónicamente desde un solo lugar
      </h1>
      <p className="home-hero-lead">
        Reservas, habitaciones, caja y factura electrónica SIFEN en un sistema simple, en guaraníes y con soporte
        local por WhatsApp. Probalo {TRIAL_DAYS} días gratis, sin tarjeta.
      </p>
      <div className="home-hero-actions">
        <Link to={REGISTER_PATH} className="home-btn home-btn-primary home-btn-lg">
          Probar gratis {TRIAL_DAYS} días
        </Link>
        <a href="#planes" className="home-btn home-btn-ghost home-btn-lg">
          Ver planes
        </a>
      </div>
      <ul className="home-trust">
        {TRUST_ITEMS.map((item) => (
          <li key={item}>
            <Check size={16} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
