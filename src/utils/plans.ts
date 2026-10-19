// Pure helpers for the public plans shown on the landing. Money formatting is
// shared: use `formatGs` from ./currency.
import { formatGs } from './currency';

// Row of the public RPC fn_planes_publicos(). A null limit means unlimited.
export interface PublicPlan {
  codigo: string;
  nombre: string;
  precio_mensual: number;
  precio_anual: number | null;
  moneda: string;
  max_habitaciones: number | null;
  max_usuarios: number | null;
  max_hoteles: number | null;
  mod_contabilidad: boolean;
  precio_hotel_adicional: number | null;
  precio_hotel_adicional_anual: number | null;
  // true: the plan is sold by the sales team and the price is a "from" price.
  contacto_ventas: boolean;
  // Texts of what the plan includes, authored in the planes table.
  modulos: string[];
}

export interface AnnualSavings {
  monthsFree: number;
  percent: number;
}

// Savings of paying the year upfront vs 12 monthly payments.
export function annualSavings(plan: Pick<PublicPlan, 'precio_mensual' | 'precio_anual'>): AnnualSavings {
  const { precio_mensual: monthly, precio_anual: annual } = plan;
  if (annual === null || !(monthly > 0)) return { monthsFree: 0, percent: 0 };
  const diff = monthly * 12 - annual;
  if (diff <= 0) return { monthsFree: 0, percent: 0 };
  return {
    monthsFree: Math.floor(diff / monthly),
    percent: Math.round((diff / (monthly * 12)) * 100),
  };
}

// 20 -> "20 habitaciones"; null -> "Habitaciones ilimitadas".
export function limitLabel(value: number | null, singular: string, plural: string): string {
  if (value === null) {
    const feminine = /(a|ión|ad)$/i.test(singular);
    const capitalized = plural.charAt(0).toUpperCase() + plural.slice(1);
    return `${capitalized} ${feminine ? 'ilimitadas' : 'ilimitados'}`;
  }
  return `${value} ${value === 1 ? singular : plural}`;
}

// Hotels line: unlimited-by-contract, one included plus a per-hotel price, or a plain count.
export function hotelsLabel(
  plan: Pick<PublicPlan, 'max_hoteles' | 'contacto_ventas' | 'precio_hotel_adicional'>,
): string {
  if (plan.max_hoteles === null || plan.contacto_ventas) return 'Hoteles según contrato';
  if (plan.precio_hotel_adicional !== null) {
    return `${limitLabel(plan.max_hoteles, 'hotel', 'hoteles')} incluido · +${formatGs(plan.precio_hotel_adicional)}/mes por hotel adicional`;
  }
  return `${limitLabel(plan.max_hoteles, 'hotel', 'hoteles')} por cuenta`;
}

// Capacity summary shown first on each card; what the plan includes is in `plan.modulos`.
export function planFeatures(plan: PublicPlan): string[] {
  return [
    limitLabel(plan.max_habitaciones, 'habitación', 'habitaciones'),
    limitLabel(plan.max_usuarios, 'usuario', 'usuarios'),
    hotelsLabel(plan),
    plan.mod_contabilidad ? 'Módulo de contabilidad incluido' : 'Sin módulo de contabilidad',
  ];
}
