import { useState } from 'react';
import { folioService, type Concepto } from '../services/folioService';
import { ReservationService } from '../services/reservationService';
import { formatGs } from '../utils/currency';
import { esHabitacionValida, type OpcionHabitacionCargo } from '../utils/cargosPorHabitacion';

const MAX_MOTIVO = 200;

export interface ResultadoCargoManual {
  /** Spanish confirmation for the screen. */
  mensaje: string;
  /** True when the charge was saved but the historial entry could not be written. */
  historialFallo: boolean;
}

/**
 * Logic of the "manual charge" dialog of a folio: free concept + quantity +
 * unit price + mandatory reason. Saves the charge and logs it in the stay's
 * historial (CARGO_MANUAL).
 */
export function useCargoManual(params: {
  folioId: number;
  fkReserva: number | null;
  idUsuario: number | null;
  conceptos: Concepto[];
  /** Habitaciones elegibles (ver `opcionesHabitacionCargo`); omitido o vacío = cargo general. */
  opcionesHabitacion?: OpcionHabitacionCargo[];
}) {
  const { folioId, fkReserva, idUsuario, conceptos, opcionesHabitacion = [] } = params;

  const [abierto, setAbierto] = useState(false);
  const [fkConcepto, setFkConcepto] = useState<string | number>('');
  const [habitacionElegida, setHabitacionElegida] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [precio, setPrecio] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Las habitaciones se recargan en vivo: si la elegida deja de estar
  // asignada mientras el diálogo está abierto, el cargo vuelve a ser general.
  const fkDetalleReserva = esHabitacionValida(habitacionElegida, opcionesHabitacion) ? habitacionElegida : null;
  const etiquetaHabitacion =
    opcionesHabitacion.find((o) => o.idDetalle === fkDetalleReserva && o.idDetalle !== null)?.etiqueta ?? null;

  const concepto = conceptos.find((c) => String(c.id_concepto) === String(fkConcepto)) ?? null;
  const cantidadNum = Number.parseInt(cantidad, 10);
  const precioNum = Number(precio);
  const cantidadValida = Number.isInteger(cantidadNum) && cantidadNum >= 1;
  const precioValido = precio !== '' && Number.isFinite(precioNum) && precioNum > 0;
  const total = cantidadValida && precioValido ? cantidadNum * precioNum : 0;
  const puedeGuardar =
    !guardando && concepto !== null && cantidadValida && precioValido && motivo.trim().length > 0;

  const abrir = () => {
    setFkConcepto('');
    setHabitacionElegida(null);
    setCantidad('1');
    setPrecio('');
    setMotivo('');
    setError(null);
    setAbierto(true);
  };

  const cerrar = () => {
    if (guardando) return;
    setAbierto(false);
    setError(null);
  };

  /** Picking a concept proposes its reference price; reception can overwrite it. */
  const elegirConcepto = (valor: string | number) => {
    setFkConcepto(valor);
    setError(null);
    const elegido = conceptos.find((c) => String(c.id_concepto) === String(valor));
    if (elegido && Number(elegido.arancel) > 0) setPrecio(String(Math.round(Number(elegido.arancel))));
  };

  const elegirHabitacion = (idDetalle: number | null) => {
    setHabitacionElegida(idDetalle);
    setError(null);
  };

  const cambiarCantidad = (texto: string) => setCantidad(texto.replace(/[^\d]/g, '').slice(0, 4));
  const cambiarPrecio = (texto: string) => setPrecio(texto.replace(/[^\d]/g, '').slice(0, 12));
  const cambiarMotivo = (texto: string) => setMotivo(texto.slice(0, MAX_MOTIVO));

  /** Saves the charge. Resolves with the result, or null if it failed (see `error`). */
  const guardar = async (): Promise<ResultadoCargoManual | null> => {
    if (!puedeGuardar || !concepto) return null;
    if (idUsuario == null) {
      setError('No se pudo identificar al usuario actual.');
      return null;
    }
    setGuardando(true);
    setError(null);
    try {
      await folioService.addCargoManual({
        fk_folio: folioId,
        fk_concepto: concepto.id_concepto,
        cantidad: cantidadNum,
        monto_unitario: precioNum,
        fk_usuario: idUsuario,
        fk_detalle_reserva: fkDetalleReserva,
      });
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo agregar el cargo.');
      setGuardando(false);
      return null;
    }

    // The charge is in. A failed audit entry must not look like a failed charge.
    let historialFallo = false;
    if (fkReserva != null) {
      try {
        await ReservationService.addHistorialEntry({
          fk_reserva: fkReserva,
          tipo_movimiento: 'CARGO_MANUAL',
          descripcion: `Cargo manual en folio #${folioId}: ${concepto.nombre} x${cantidadNum} = ${formatGs(total)}${etiquetaHabitacion ? ` (${etiquetaHabitacion})` : ''}. Motivo: ${motivo.trim()}`,
          fk_usuario: idUsuario,
        });
      } catch (err) {
        console.warn('No se pudo registrar el cargo manual en la bitácora:', err);
        historialFallo = true;
      }
    } else {
      historialFallo = true;
    }

    setGuardando(false);
    setAbierto(false);
    return {
      mensaje: `Cargo manual agregado: ${concepto.nombre} por ${formatGs(total)}.`,
      historialFallo,
    };
  };

  return {
    abierto,
    fkConcepto,
    fkDetalleReserva,
    cantidad,
    precio,
    motivo,
    total,
    guardando,
    error,
    puedeGuardar,
    maxMotivo: MAX_MOTIVO,
    abrir,
    cerrar,
    elegirConcepto,
    elegirHabitacion,
    cambiarCantidad,
    cambiarPrecio,
    cambiarMotivo,
    guardar,
  };
}
