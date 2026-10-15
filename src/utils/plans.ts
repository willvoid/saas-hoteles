// Pure helpers for the public plans shown on the landing. Money formatting is
// shared: use `formatGs` from ./currency.

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

export function planFeatures(plan: PublicPlan): string[] {
  return [
    limitLabel(plan.max_habitaciones, 'habitación', 'habitaciones'),
    limitLabel(plan.max_usuarios, 'usuario', 'usuarios'),
    `${limitLabel(plan.max_hoteles, 'hotel', 'hoteles')} por cuenta`,
    plan.mod_contabilidad ? 'Módulo de contabilidad incluido' : 'Sin módulo de contabilidad',
  ];
}
