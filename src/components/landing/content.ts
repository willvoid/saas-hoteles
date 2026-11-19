import { BarChart3, BedDouble, Building2, CalendarDays, Calculator, Receipt, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const TRIAL_DAYS = 30;
export const REGISTER_PATH = '/registro';

export const TRUST_ITEMS = ['Factura electrónica SIFEN', 'Soporte por WhatsApp', 'Sin contratos de permanencia'];

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const FEATURES: FeatureItem[] = [
  {
    icon: CalendarDays,
    title: 'Reservas y calendario',
    description: 'Cargá reservas, controlá la disponibilidad y seguí cada estadía desde un solo lugar.',
  },
  {
    icon: Receipt,
    title: 'Factura electrónica SIFEN',
    description:
      'Emití facturas electrónicas válidas ante la DNIT directo desde la cuenta del huésped. Sin copiar datos a otro sistema.',
  },
  {
    icon: Wallet,
    title: 'Caja y cobros',
    description: 'Registrá consumos y pagos en el folio de cada huésped y controlá la caja por turno.',
  },
  {
    icon: BedDouble,
    title: 'Habitaciones y limpieza',
    description: 'Administrá tipos de habitación, tarifas y el estado de limpieza de cada cuarto en tiempo real.',
  },
  {
    icon: Calculator,
    title: 'Contabilidad',
    description: 'Plan de cuentas, cierre mensual y reportes financieros, sin planillas sueltas.',
  },
  {
    icon: Building2,
    title: 'Multi-hotel y equipo',
    description: 'Gestioná varios hoteles con una misma cuenta e invitá a tu equipo con roles y permisos.',
  },
  {
    icon: BarChart3,
    title: 'Reportes',
    description: 'Mirá la ocupación y los resultados de tu hotel para decidir con datos.',
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    question: '¿Las facturas electrónicas son válidas ante la DNIT?',
    answer:
      'Sí. El sistema emite los documentos a través de SIFEN, el sistema oficial de facturación electrónica de Paraguay.',
  },
  {
    question: '¿Qué necesito para facturar electrónicamente?',
    answer:
      'Estar habilitado como emisor electrónico ante la DNIT y tener tu firma digital. Si todavía no lo tenés, te guiamos en el proceso.',
  },
  {
    question: '¿Hay contrato de permanencia?',
    answer: 'No. Pagás mes a mes y podés cancelar cuando quieras.',
  },
  {
    question: '¿Me ayudan a cargar mis habitaciones y tarifas?',
    answer: 'Sí. Te acompañamos en la configuración inicial para que empieces a operar desde el primer día.',
  },
  {
    question: '¿Qué incluye la prueba gratis?',
    answer: `Tenés ${TRIAL_DAYS} días para usar el sistema con tu propio hotel: reservas, habitaciones, caja y el resto de las funciones de gestión.`,
  },
  {
    question: '¿Necesito una tarjeta para empezar?',
    answer: 'No. Te registrás con tu correo y empezás a usar el sistema sin cargar ningún medio de pago.',
  },
  {
    question: `¿Qué pasa al terminar los ${TRIAL_DAYS} días?`,
    answer:
      'Contactanos para activar el plan que elijas. Mientras tanto, tu hotel queda en modo de solo lectura: podés consultar tu información, pero no cargar movimientos nuevos.',
  },
  {
    question: '¿Puedo cambiar de plan más adelante?',
    answer: 'Sí. Si tu hotel crece, escribinos y te ayudamos a pasar a un plan con más capacidad.',
  },
  {
    question: '¿Mis datos están seguros?',
    answer:
      'La información de cada hotel está aislada: solo las personas de tu equipo con acceso pueden verla. Cada usuario ingresa con su propia cuenta.',
  },
  {
    question: '¿Cómo contacto a soporte?',
    answer: 'Escribinos por WhatsApp desde esta página y te respondemos lo antes posible.',
  },
];
