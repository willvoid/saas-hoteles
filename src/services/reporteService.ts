import { supabase } from './supabaseClient';
import { CONDICION_VENTA_CONTADO } from '../types/factura';

export interface IngresoPorMetodo {
  metodo: string;
  total: number;
  cantidad: number;
}

export interface ReporteIngresos {
  total: number;
  cantidadFacturas: number;
  porMetodo: IngresoPorMetodo[];
}

export interface TurnoReporte {
  id_turno: number;
  usuario: string;
  caja: string;
  apertura: string;
  /** null si el turno sigue abierto. */
  cierre: string | null;
  monto_inicial: number;
  /** null si el turno sigue abierto: la columna es NOT NULL y guarda un 0
   *  placeholder hasta el arqueo, que no es un monto real de cierre. */
  monto_final: number | null;
  /** Total facturado durante el turno, excluyendo anuladas. */
  facturado: number;
  cantidadFacturas: number;
}

const SIN_ESPECIFICAR = 'Sin especificar';

interface FacturaIngresoRow {
  total_general: number | string | null;
  fk_modo_pago: number | null;
  modo_pago: { descripcion: string } | null;
}

interface FacturaTurnoRow {
  fk_turno: number | null;
  total_general: number | string | null;
}

interface TurnoRow {
  id_turno: number;
  apertura: string;
  cierre: string | null;
  monto_inicial: number | string;
  monto_final: number | string;
  usuario: { nombre: string } | { nombre: string }[] | null;
  caja: CajaEmbed | CajaEmbed[] | null;
}

interface CajaEmbed {
  nro_caja: number | null;
  descripcion_caja: string | null;
}

/** PostgREST devuelve el embed como objeto o como array de un elemento según
 *  la cardinalidad que infiera. Misma varianza que maneja el resto del
 *  proyecto (ver reservaBlockingState.ts, cleanStatusService.ts). */
function unwrapEmbed<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** 'YYYY-MM-DD' + 1 día, para poder usar un filtro medio-abierto ([desde, hasta]). */
function addOneDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// `fecha_emision` se guarda como instante UTC. `desde`/`hasta` llegan como
// 'YYYY-MM-DD' en hora local del navegador (Paraguay), así que un string
// pelado tipo '2026-07-29' Postgres lo interpreta como medianoche UTC, no
// medianoche Paraguay (UTC-4) — corriendo el rango varias horas. Por eso acá
// se arma la medianoche LOCAL con `Date` y se convierte a ISO/UTC recién al
// final, dejando que `toISOString()` aplique el offset correcto.
function localMidnightToUtcIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

export const reporteService = {
  // Ingresos emitidos entre [desde, hasta] (ambos inclusive), excluyendo
  // facturas anuladas y las de crédito (no son efectivo cobrado), totalizados y agrupados por método de pago.
  //
  // `fecha_emision` puede ser `date` o `timestamp` según la columna real;
  // por eso el filtro es .gte(desde) + .lt(díaSiguienteDeHasta) en vez de
  // .lte(hasta) — así cubre igual un timestamp del final del día `hasta`.
  async getIngresos(desde: string, hasta: string): Promise<ReporteIngresos> {
    const { data, error } = await supabase
      .from('facturas')
      .select('total_general, fk_modo_pago, modo_pago:modo_pago(descripcion)')
      .neq('estado', 'ANULADA')
      // Credit invoices are not cash received; collections are reported by
      // the finance module.
      .eq('condicion_venta', CONDICION_VENTA_CONTADO)
      .gte('fecha_emision', localMidnightToUtcIso(desde))
      .lt('fecha_emision', localMidnightToUtcIso(addOneDay(hasta)));

    if (error) throw error;

    const facturas = (data ?? []) as unknown as FacturaIngresoRow[];
    const porMetodoMap = new Map<string, { total: number; cantidad: number }>();
    let total = 0;

    for (const f of facturas) {
      const monto = Number(f.total_general) || 0;
      const metodo = f.modo_pago?.descripcion || SIN_ESPECIFICAR;

      total += monto;
      const acc = porMetodoMap.get(metodo) ?? { total: 0, cantidad: 0 };
      acc.total += monto;
      acc.cantidad += 1;
      porMetodoMap.set(metodo, acc);
    }

    const porMetodo = Array.from(porMetodoMap.entries())
      .map(([metodo, { total, cantidad }]) => ({ metodo, total, cantidad }))
      .sort((a, b) => b.total - a.total);

    return { total, cantidadFacturas: facturas.length, porMetodo };
  },

  // Turnos de caja abiertos dentro de [desde, hasta], con quién los abrió, en
  // qué caja, los montos declarados y cuánto se facturó durante cada uno.
  //
  // Hasta ahora estos datos no se podían ver en ninguna pantalla: una vez
  // cerrado el turno, la fila quedaba en la tabla pero invisible desde la UI
  // (`cajaService` sólo expone `getTurnoActivo`, el turno abierto de UN
  // usuario). Es el único registro de quién manejó cada caja y con cuánto.
  //
  // El rango filtra por `apertura` — mismo criterio de zona horaria que
  // `getIngresos`: la columna es `timestamp with time zone`, así que un
  // 'YYYY-MM-DD' pelado correría el rango varias horas.
  async getTurnos(desde: string, hasta: string): Promise<TurnoReporte[]> {
    const { data, error } = await supabase
      .from('apertura_cierre_caja')
      // `usuario!apertura_cierre_caja_fk_usuario_fkey` desambigua el embed:
      // desde que existe `fk_usuario_cierre` (también FK a `usuario`),
      // PostgREST tiene dos caminos posibles hacia `usuario` y rechaza
      // adivinar. Este apunta puntualmente a quién ABRIÓ el turno.
      .select('id_turno, apertura, cierre, monto_inicial, monto_final, usuario!apertura_cierre_caja_fk_usuario_fkey(nombre), caja(nro_caja, descripcion_caja)')
      .gte('apertura', localMidnightToUtcIso(desde))
      .lt('apertura', localMidnightToUtcIso(addOneDay(hasta)))
      .order('apertura', { ascending: false });

    if (error) throw error;

    const turnos = (data ?? []) as unknown as TurnoRow[];
    if (turnos.length === 0) return [];

    // Lo facturado por turno se resuelve en una sola query para todos los
    // turnos del rango y se agrupa en memoria, en vez de una consulta por fila.
    const { data: facturas, error: facturasError } = await supabase
      .from('facturas')
      .select('fk_turno, total_general')
      .neq('estado', 'ANULADA')
      .eq('condicion_venta', CONDICION_VENTA_CONTADO)
      .in('fk_turno', turnos.map((t) => t.id_turno));

    if (facturasError) throw facturasError;

    const porTurno = new Map<number, { total: number; cantidad: number }>();
    for (const f of (facturas ?? []) as FacturaTurnoRow[]) {
      if (f.fk_turno == null) continue;
      const acc = porTurno.get(f.fk_turno) ?? { total: 0, cantidad: 0 };
      acc.total += Number(f.total_general) || 0;
      acc.cantidad += 1;
      porTurno.set(f.fk_turno, acc);
    }

    return turnos.map((t) => {
      const usuario = unwrapEmbed(t.usuario);
      const caja = unwrapEmbed(t.caja);
      const facturado = porTurno.get(t.id_turno) ?? { total: 0, cantidad: 0 };
      const abierto = t.cierre == null;

      return {
        id_turno: t.id_turno,
        usuario: usuario?.nombre ?? SIN_ESPECIFICAR,
        caja: caja?.descripcion_caja || `Caja #${caja?.nro_caja ?? '?'}`,
        apertura: t.apertura,
        cierre: t.cierre,
        monto_inicial: Number(t.monto_inicial) || 0,
        // Un turno abierto tiene 0 como placeholder (la columna es NOT NULL),
        // que no es un cierre real: se expone como null para que la UI lo
        // muestre vacío en vez de "Gs. 0" y parezca una caja vaciada.
        monto_final: abierto ? null : Number(t.monto_final) || 0,
        facturado: facturado.total,
        cantidadFacturas: facturado.cantidad,
      };
    });
  },
};
