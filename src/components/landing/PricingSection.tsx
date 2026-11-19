import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { annualSavings, planFeatures } from '../../utils/plans';
import type { PublicPlan } from '../../utils/plans';
import { formatGs } from '../../utils/currency';
import { buildWhatsAppUrl, pickHighlightedPlan } from '../../utils/landing';
import { REGISTER_PATH, TRIAL_DAYS } from './content';

const SALES_MESSAGE = 'Hola, quiero cotizar el plan Business para mi cadena de hoteles.';

interface PricingSectionProps {
  plans: PublicPlan[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

type Billing = 'monthly' | 'annual';

function PlanCard({ plan, billing, highlighted }: { plan: PublicPlan; billing: Billing; highlighted: boolean }) {
  const savings = annualSavings(plan);
  const bySales = plan.contacto_ventas;
  const showAnnual = billing === 'annual' && plan.precio_anual !== null && plan.precio_anual > 0;
  const price = showAnnual ? (plan.precio_anual as number) : plan.precio_mensual;
  const salesUrl = buildWhatsAppUrl(import.meta.env.VITE_WHATSAPP_NUMBER, SALES_MESSAGE);
  const extraHotel =
    !bySales && plan.precio_hotel_adicional !== null
      ? billing === 'annual' && plan.precio_hotel_adicional_anual !== null
        ? `Hotel adicional: ${formatGs(plan.precio_hotel_adicional_anual)} / año`
        : `Hotel adicional: ${formatGs(plan.precio_hotel_adicional)} / mes`
      : null;

  return (
    <li className={`home-plan${highlighted ? ' is-highlighted' : ''}`}>
      {highlighted && <span className="home-plan-flag">Más elegido</span>}
      <h3 className="home-plan-name">{plan.nombre}</h3>
      <p className="home-plan-price">
        {bySales && <span className="home-plan-period">Desde</span>}
        <span className="home-plan-amount">{formatGs(price)}</span>
        <span className="home-plan-period">{showAnnual ? '/ año' : '/ mes'}</span>
      </p>
      <p className="home-plan-badge-slot">
        {showAnnual && savings.monthsFree > 0 && (
          <span className="home-badge">
            {savings.monthsFree} {savings.monthsFree === 1 ? 'mes gratis' : 'meses gratis'} ({savings.percent}% menos)
          </span>
        )}
        {extraHotel && <span className="home-badge">{extraHotel}</span>}
      </p>
      <ul className="home-plan-features">
        {planFeatures(plan).map((feature) => (
          <li key={feature}>
            <Check size={16} aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {plan.modulos.length > 0 && (
        <>
          <p className="home-plan-modules-title">Qué incluye</p>
          <ul className="home-plan-features home-plan-modules">
            {plan.modulos.map((modulo) => (
              <li key={modulo}>
                <Check size={16} aria-hidden="true" />
                <span>{modulo}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {bySales && salesUrl ? (
        <a
          href={salesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`home-btn ${highlighted ? 'home-btn-primary' : 'home-btn-ghost'} home-plan-cta`}
        >
          Hablar con ventas
        </a>
      ) : (
        <Link
          to={REGISTER_PATH}
          className={`home-btn ${highlighted ? 'home-btn-primary' : 'home-btn-ghost'} home-plan-cta`}
        >
          Probar gratis
        </Link>
      )}
    </li>
  );
}

export default function PricingSection({ plans, loading, error, onRetry }: PricingSectionProps) {
  const [billing, setBilling] = useState<Billing>('monthly');
  const highlightedCode = pickHighlightedPlan(plans);
  const hasAnnual = plans.some((p) => p.precio_anual !== null);

  return (
    <section id="planes" className="home-section" aria-labelledby="home-plans-title">
      <h2 id="home-plans-title" className="home-section-title">
        Planes simples, en guaraníes y sin sorpresas
      </h2>
      <p className="home-section-lead">
        {TRIAL_DAYS} días de prueba gratis, sin tarjeta. Después elegís el plan que mejor se ajuste a tu hotel.
      </p>

      {hasAnnual && (
        <div className="home-toggle" role="group" aria-label="Frecuencia de pago">
          <button
            type="button"
            className={billing === 'monthly' ? 'is-active' : ''}
            aria-pressed={billing === 'monthly'}
            onClick={() => setBilling('monthly')}
          >
            Mensual
          </button>
          <button
            type="button"
            className={billing === 'annual' ? 'is-active' : ''}
            aria-pressed={billing === 'annual'}
            onClick={() => setBilling('annual')}
          >
            Anual
          </button>
        </div>
      )}
      {hasAnnual && <p className="home-note home-annual-note">Pagá anual y llevate 2 meses gratis.</p>}

      {loading && (
        <p className="home-state" role="status">
          Cargando planes...
        </p>
      )}

      {!loading && error && (
        <div className="home-state home-state-error" role="alert">
          <p>{error}</p>
          <button type="button" className="home-btn home-btn-ghost" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && plans.length === 0 && (
        <p className="home-state">Los planes estarán disponibles muy pronto. Probá el sistema gratis mientras tanto.</p>
      )}

      {!loading && !error && plans.length > 0 && (
        <ul className="home-plans">
          {plans.map((plan) => (
            <PlanCard key={plan.codigo} plan={plan} billing={billing} highlighted={plan.codigo === highlightedCode} />
          ))}
        </ul>
      )}

      <p className="home-note">{TRIAL_DAYS} días de prueba gratis, sin tarjeta.</p>
    </section>
  );
}
