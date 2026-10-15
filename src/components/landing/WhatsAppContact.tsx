import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { buildWhatsAppUrl } from '../../utils/landing';
import { REGISTER_PATH } from './content';

const WHATSAPP_MESSAGE = 'Hola, quiero más información sobre el sistema de gestión hotelera.';

export default function WhatsAppContact() {
  const whatsappUrl = buildWhatsAppUrl(import.meta.env.VITE_WHATSAPP_NUMBER, WHATSAPP_MESSAGE);

  return (
    <section className="home-section home-contact" aria-labelledby="home-contact-title">
      <h2 id="home-contact-title" className="home-section-title">
        ¿Tenés dudas? Hablemos
      </h2>
      <p className="home-section-lead">
        {whatsappUrl
          ? 'Escribinos y te ayudamos a elegir el plan ideal para tu hotel.'
          : 'Creá tu cuenta de prueba y empezá a explorar el sistema.'}
      </p>
      <div className="home-hero-actions">
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            className="home-btn home-btn-whatsapp home-btn-lg"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={18} aria-hidden="true" />
            Escribir por WhatsApp
          </a>
        )}
        <Link to={REGISTER_PATH} className="home-btn home-btn-primary home-btn-lg">
          Probar gratis
        </Link>
      </div>
    </section>
  );
}
