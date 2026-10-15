import { validarVencimiento } from './facturaCredito';
import { formatGs } from './currency';
import { esMesFuturo, estaCerrado, etiquetaPeriodo } from './periodoContable';
import type { CondicionGasto, GastoNuevo, Periodo, PeriodoCerrado, TipoFondo } from '../types/finanzas';

/** Spanish label of each fund type. */
export const ETIQUETA_TIPO_FONDO: Record<TipoFondo, string> = {
  caja_turno: 'Caja del turno',
  caja_chica: 'Caja chica',
  banco: 'Banco',
};

// Pure form rules of the finance panels (expenses, payments, transfers,
// opening balances, suppliers). The database enforces the real constraints and
// its messages are shown as they come; these helpers only give early feedback.

/** Field name to message; an absent key means the field is valid. */
export type ErroresForm = Record<string, string | undefined>;

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MENSAJE_PERIODO_CERRADO = 'El mes de esta fecha está cerrado. Pedí a un administrador que lo reabra.';

/** Amount typed as text (guaraníes, no decimals) to an integer; anything that
 *  is not a digit is dropped, so the result is never negative or NaN. */
export function parseMonto(texto: string): number {
  const digitos = texto.replace(/\D/g, '');
  return digitos ? Number(digitos) : 0;
}

/** First and last day of the month of a business date ('YYYY-MM-DD'). */
export function rangoMesActual(hoy: string): { desde: string; hasta: string } {
  const [anio, mes] = hoy.slice(0, 10).split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, '0');
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimoDia).padStart(2, '0')}` };
}

/** January 1st of the year of a business date. */
export function inicioDeAnio(hoy: string): string {
  return `${hoy.slice(0, 4)}-01-01`;
}

/** Date field check shared by every form: required, well formed, open month. */
function validarFecha(fecha: string, periodos: Periodo[]): string | undefined {
  if (!fecha || !FECHA_ISO.test(fecha)) return 'Ingresá una fecha válida.';
  if (estaCerrado(periodos, fecha)) return MENSAJE_PERIODO_CERRADO;
  return undefined;
}

/** Drops the keys without a message so `{}` means "valid". */
function soloConError(errores: ErroresForm): ErroresForm {
  return Object.fromEntries(Object.entries(errores).filter(([, msg]) => !!msg));
}

// ─── Gastos ──────────────────────────────────────────────────────────────────
export interface GastoFormValores {
  fecha: string;
  fk_categoria: number | '';
  fk_proveedor: number | '';
  nro_comprobante: string;
  gravado_10: string;
  gravado_5: string;
  exenta: string;
  condicion: CondicionGasto;
  fecha_vencimiento: string;
  fk_cuenta_fondo: number | '';
}

export function validarGastoForm(valores: GastoFormValores, periodos: Periodo[]): ErroresForm {
  const credito = valores.condicion === 'credito';
  const total =
    parseMonto(valores.gravado_10) + parseMonto(valores.gravado_5) + parseMonto(valores.exenta);
  return soloConError({
    fecha: validarFecha(valores.fecha, periodos),
    fk_categoria: valores.fk_categoria === '' ? 'Elegí una categoría.' : undefined,
    fk_proveedor:
      credito && valores.fk_proveedor === '' ? 'Un gasto a crédito requiere un proveedor.' : undefined,
    monto: total > 0 ? undefined : 'Ingresá al menos un monto mayor a cero.',
    fecha_vencimiento: credito
      ? (validarVencimiento(valores.fecha, valores.fecha_vencimiento) ?? undefined)
      : undefined,
    fk_cuenta_fondo:
      !credito && valores.fk_cuenta_fondo === '' ? 'Elegí el fondo con el que se paga.' : undefined,
  });
}

/** Payload for `gastoService.crearGasto`: cash carries the fund and no due
 *  date, credit the opposite. Blank optional text becomes null. */
export function armarGastoNuevo(valores: GastoFormValores): GastoNuevo {
  const credito = valores.condicion === 'credito';
  return {
    fecha: valores.fecha,
    fk_categoria: Number(valores.fk_categoria),
    fk_proveedor: valores.fk_proveedor === '' ? null : valores.fk_proveedor,
    nro_comprobante: valores.nro_comprobante.trim() || null,
    gravado_10: parseMonto(valores.gravado_10),
    gravado_5: parseMonto(valores.gravado_5),
    exenta: parseMonto(valores.exenta),
    condicion: valores.condicion,
    fecha_vencimiento: credito ? valores.fecha_vencimiento || null : null,
    fk_cuenta_fondo: credito || valores.fk_cuenta_fondo === '' ? null : valores.fk_cuenta_fondo,
  };
}

// ─── Pagos ───────────────────────────────────────────────────────────────────
export interface PagoFormValores {
  fk_gasto: number | '';
  fk_cuenta_fondo: number | '';
  monto: string;
  fecha: string;
}

/** `saldo` is the balance of the chosen expense (null while none is chosen). */
export function validarPagoForm(
  valores: PagoFormValores,
  saldo: number | null,
  periodos: Periodo[],
): ErroresForm {
  const monto = parseMonto(valores.monto);
  let errorMonto: string | undefined;
  if (monto <= 0) errorMonto = 'Ingresá un monto mayor a cero.';
  else if (saldo !== null && monto > saldo) {
    errorMonto = `El monto no puede superar el saldo (${formatGs(saldo)}).`;
  }
  return soloConError({
    fk_gasto: valores.fk_gasto === '' ? 'Elegí el gasto a pagar.' : undefined,
    fk_cuenta_fondo: valores.fk_cuenta_fondo === '' ? 'Elegí el fondo de pago.' : undefined,
    monto: errorMonto,
    fecha: validarFecha(valores.fecha, periodos),
  });
}

// ─── Transferencias y saldos iniciales ───────────────────────────────────────
export interface TransferenciaFormValores {
  origen: number | '';
  destino: number | '';
  monto: string;
  fecha: string;
}

export function validarTransferenciaForm(
  valores: TransferenciaFormValores,
  periodos: Periodo[],
): ErroresForm {
  let errorDestino: string | undefined;
  if (valores.destino === '') errorDestino = 'Elegí el fondo destino.';
  else if (valores.destino === valores.origen) errorDestino = 'El destino debe ser distinto del origen.';
  return soloConError({
    origen: valores.origen === '' ? 'Elegí el fondo origen.' : undefined,
    destino: errorDestino,
    monto: parseMonto(valores.monto) > 0 ? undefined : 'Ingresá un monto mayor a cero.',
    fecha: validarFecha(valores.fecha, periodos),
  });
}

export interface SaldoInicialFormValores {
  fondo: number | '';
  monto: string;
  fecha: string;
}

/** Zero is a valid opening balance, but the amount has to be typed. */
export function validarSaldoInicialForm(
  valores: SaldoInicialFormValores,
  periodos: Periodo[],
): ErroresForm {
  return soloConError({
    fondo: valores.fondo === '' ? 'Elegí un fondo.' : undefined,
    monto: valores.monto.trim() === '' ? 'Ingresá el monto (puede ser cero).' : undefined,
    fecha: validarFecha(valores.fecha, periodos),
  });
}

// ─── Proveedores ─────────────────────────────────────────────────────────────
export interface ProveedorFormValores {
  nombre: string;
  ruc: string;
  telefono: string;
  email: string;
}

export function validarProveedorForm(valores: ProveedorFormValores): ErroresForm {
  const email = valores.email.trim();
  return soloConError({
    nombre: valores.nombre.trim() ? undefined : 'El nombre es obligatorio.',
    email: email && !EMAIL.test(email) ? 'El email no es válido.' : undefined,
  });
}

// ─── Cobros ──────────────────────────────────────────────────────────────────
export interface CobroFormValores {
  fk_factura: number | '';
  fk_cuenta_fondo: number | '';
  monto: string;
  fecha: string;
}

/** `saldo` is the balance of the chosen invoice (null while none is chosen).
 *  The amount has to be between 1 and that balance. */
export function validarCobroForm(
  valores: CobroFormValores,
  saldo: number | null,
  periodos: Periodo[],
): ErroresForm {
  const monto = parseMonto(valores.monto);
  let errorMonto: string | undefined;
  if (monto <= 0) errorMonto = 'Ingresá un monto mayor a cero.';
  else if (saldo !== null && monto > saldo) {
    errorMonto = `El monto no puede superar el saldo (${formatGs(saldo)}).`;
  }
  return soloConError({
    fk_factura: valores.fk_factura === '' ? 'Elegí la factura a cobrar.' : undefined,
    fk_cuenta_fondo: valores.fk_cuenta_fondo === '' ? 'Elegí el fondo donde entra el cobro.' : undefined,
    monto: errorMonto,
    fecha: validarFecha(valores.fecha, periodos),
  });
}

/** Lowercase text without accents, for tolerant comparisons. */
function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Keeps the rows whose client name or document contains the text (case and
 *  accent insensitive). A blank text keeps every row, including those without
 *  client. */
export function filtrarPorCliente<T extends { cliente: { razon_social: string; documento: string } | null }>(
  filas: T[],
  texto: string,
): T[] {
  const buscado = normalizarTexto(texto);
  if (!buscado) return filas;
  return filas.filter((fila) => {
    if (!fila.cliente) return false;
    return (
      normalizarTexto(fila.cliente.razon_social).includes(buscado) ||
      normalizarTexto(fila.cliente.documento).includes(buscado)
    );
  });
}

// ─── Cierres ─────────────────────────────────────────────────────────────────
export interface MesCierre {
  anio: number;
  mes: number;
  etiqueta: string;
  cerrado: boolean;
  /** Timestamp of the closing; null while the month is open. */
  cerradoEn: string | null;
  /** User id that closed it; null while the month is open. */
  cerradoPor: number | null;
  /** The month starts after the current business month: it cannot be closed. */
  futuro: boolean;
}

/** View model of the twelve months of a year for the closing panel. */
export function mesesDelAnio(
  anio: number,
  periodos: Pick<PeriodoCerrado, 'anio' | 'mes' | 'cerrado_en' | 'cerrado_por'>[],
  now: Date = new Date(),
): MesCierre[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const cierre = periodos.find((p) => p.anio === anio && p.mes === mes);
    return {
      anio,
      mes,
      etiqueta: etiquetaPeriodo(anio, mes),
      cerrado: !!cierre,
      cerradoEn: cierre?.cerrado_en ?? null,
      cerradoPor: cierre?.cerrado_por ?? null,
      futuro: esMesFuturo(anio, mes, now),
    };
  });
}
