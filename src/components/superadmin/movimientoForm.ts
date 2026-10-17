import type {
  Categoria,
  Movimiento,
  MovimientoInput,
  MovimientoTipo,
} from '../../services/superadminFinanzasService';
import { formatGs } from '../../utils/currency';
import { parseMonto } from '../../utils/finanzasForm';

export interface MovimientoFormState {
  tipo: MovimientoTipo;
  categoria_id: string;
  monto: string;
  fecha: string;
  descripcion: string;
  referencia: string;
}

export const emptyMovimientoForm = (today: string): MovimientoFormState => ({
  tipo: 'egreso',
  categoria_id: '',
  monto: '',
  fecha: today,
  descripcion: '',
  referencia: '',
});

export function formFromMovimiento(m: Movimiento): MovimientoFormState {
  return {
    tipo: m.tipo,
    categoria_id: m.categoria_id ?? '',
    monto: String(m.monto),
    fecha: m.fecha,
    descripcion: m.descripcion ?? '',
    referencia: m.referencia ?? '',
  };
}

/** Active categories of a tipo; the category already on the row stays selectable. */
export function categoriasParaTipo(cats: Categoria[], tipo: MovimientoTipo, keepId?: string): Categoria[] {
  return cats.filter((c) => c.tipo === tipo && (c.activo || c.id === keepId));
}

export interface MovimientoValidation {
  errors: Record<string, string>;
  value: MovimientoInput | null;
}

export function validateMovimientoForm(f: MovimientoFormState): MovimientoValidation {
  const errors: Record<string, string> = {};
  const monto = parseMonto(f.monto);
  if (!f.categoria_id) errors.categoria_id = 'Elegí una categoría.';
  if (monto <= 0) errors.monto = 'Ingresá un monto mayor a cero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) errors.fecha = 'Ingresá una fecha válida.';
  if (Object.keys(errors).length > 0) return { errors, value: null };
  return {
    errors,
    value: {
      tipo: f.tipo,
      categoria_id: f.categoria_id,
      monto,
      fecha: f.fecha,
      descripcion: f.descripcion.trim() || null,
      referencia: f.referencia.trim() || null,
    },
  };
}

export const TIPO_LABEL: Record<MovimientoTipo, string> = { ingreso: 'Ingreso', egreso: 'Egreso' };

export function movimientoDescripcion(m: Movimiento): string {
  if (m.origen === 'suscripcion') {
    return `Suscripción ${m.plan ?? ''}${m.ciclo ? ` (${m.ciclo})` : ''} — ${m.tenant_nombre ?? ''}`.trim();
  }
  return m.descripcion ?? '';
}

/** PDF body rows: fecha, tipo, categoría, descripción, monto, origen. Voided rows are left out. */
export function movimientoPdfRows(movs: Movimiento[]): string[][] {
  return movs
    .filter((m) => !m.anulado)
    .map((m) => [
      m.fecha,
      TIPO_LABEL[m.tipo],
      m.origen === 'suscripcion' ? 'Suscripción' : (m.categoria_nombre ?? ''),
      movimientoDescripcion(m),
      formatGs(m.monto),
      m.origen === 'suscripcion' ? 'Suscripción' : 'Manual',
    ]);
}
