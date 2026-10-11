// Presets de rango de fechas para el módulo de Reportes.
//
// Igual que dateRange.ts, todo se maneja como strings 'YYYY-MM-DD' en
// lugar de `Date` para no pelear con husos horarios. `today` se recibe
// como parámetro (en vez de llamar a `new Date()` adentro) para que estas
// funciones sean puras y testeables con una fecha fija.

export type RangePreset = 'hoy' | 'estaSemana' | 'esteMes' | 'mesAnterior' | 'personalizado';

export interface DateRange {
  desde: string;
  hasta: string;
}

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'estaSemana', label: 'Esta semana' },
  { id: 'esteMes', label: 'Este mes' },
  { id: 'mesAnterior', label: 'Mes anterior' },
  { id: 'personalizado', label: 'Personalizado' },
];

/** 'YYYY-MM-DD' de hoy, en hora local. */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toIso(y: number, m: number, d: number): string {
  const dt = new Date(y, m, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

/**
 * Resuelve un preset (todos menos 'personalizado', que depende de la
 * elección manual del usuario en la UI) a un rango [desde, hasta] inclusive,
 * tomando `today` como el día de referencia.
 */
export function resolveRange(preset: Exclude<RangePreset, 'personalizado'>, today: string): DateRange {
  const { y, m, d } = parseIso(today);

  switch (preset) {
    case 'hoy':
      return { desde: today, hasta: today };

    case 'estaSemana': {
      // Lunes como inicio de semana. getDay(): 0=domingo..6=sábado.
      const dow = new Date(y, m, d).getDay();
      const diffToMonday = dow === 0 ? 6 : dow - 1;
      const monday = toIso(y, m, d - diffToMonday);
      return { desde: monday, hasta: today };
    }

    case 'esteMes': {
      const firstOfMonth = toIso(y, m, 1);
      return { desde: firstOfMonth, hasta: today };
    }

    case 'mesAnterior': {
      const firstOfPrevMonth = toIso(y, m - 1, 1);
      const lastOfPrevMonth = toIso(y, m, 0); // día 0 del mes actual = último día del anterior
      return { desde: firstOfPrevMonth, hasta: lastOfPrevMonth };
    }
  }
}
