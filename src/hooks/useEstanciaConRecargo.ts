import { useCallback, useState } from 'react';
import { horarioService, type ResultadoEstancia } from '../services/horarioService';
import { useRecargoSugerido } from './useRecargoSugerido';
import { requiereMotivo, type TipoRecargo } from '../utils/recargoHorario';

/** Estado of the reservation that triggers each kind of surcharge. */
export type EstadoConRecargo = 'Check-in' | 'Check-out';

const TIPO_POR_ESTADO: Record<EstadoConRecargo, TipoRecargo> = {
  'Check-in': 'EARLY_CHECKIN',
  'Check-out': 'LATE_CHECKOUT',
};

export const esEstadoConRecargo = (estado: string): estado is EstadoConRecargo =>
  estado === 'Check-in' || estado === 'Check-out';

/** Parses the amount field ("75000", "75.000") into whole Gs; null if empty/invalid. */
const parsearMonto = (texto: string): number | null => {
  const limpio = texto.replace(/[^\d]/g, '');
  if (!limpio) return null;
  return Number(limpio);
};

/**
 * Logic of the check-in / check-out confirmation dialog: loads the suggested
 * surcharge, holds the edit state (amount, exoneration, reason) and runs the
 * atomic RPC. The component only renders what this hook returns.
 */
export function useEstanciaConRecargo(idReserva: number) {
  const [destino, setDestino] = useState<EstadoConRecargo | null>(null);
  const [montoTexto, setMontoTexto] = useState<string | null>(null);
  const [exonerar, setExonerarState] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const tipo = destino ? TIPO_POR_ESTADO[destino] : null;
  const { sugerido, loading: calculando, error: errorCalculo } = useRecargoSugerido(
    idReserva,
    tipo,
    destino !== null,
  );

  const montoSugerido = sugerido?.montoSugerido ?? 0;
  const hayRecargo = montoSugerido > 0;

  // Untouched field = the suggestion; an emptied field counts as 0.
  const montoEditado = montoTexto !== null;
  const montoFinal = exonerar ? 0 : montoEditado ? (parsearMonto(montoTexto) ?? 0) : montoSugerido;
  const motivoRequerido = hayRecargo && requiereMotivo({ exonerar, montoFinal, montoSugerido });
  const motivoCompleto = motivo.trim().length > 0;
  const puedeConfirmar =
    !enviando && !calculando && sugerido !== null && (!motivoRequerido || motivoCompleto);

  const abrir = useCallback((estado: EstadoConRecargo) => {
    setDestino(estado);
    setMontoTexto(null);
    setExonerarState(false);
    setMotivo('');
    setErrorEnvio(null);
  }, []);

  const cerrar = useCallback(() => {
    setDestino(null);
    setErrorEnvio(null);
  }, []);

  const setMonto = (texto: string) => {
    const soloDigitos = texto.replace(/[^\d]/g, '');
    // Back to the suggested value once it matches again: no reason needed then.
    setMontoTexto(soloDigitos === String(montoSugerido) ? null : soloDigitos);
  };

  const setExonerar = (valor: boolean) => {
    setExonerarState(valor);
    if (valor) setMontoTexto(null);
  };

  /** Runs the RPC. Resolves with its result, or null when it failed (see `errorEnvio`). */
  const confirmar = async (): Promise<ResultadoEstancia | null> => {
    if (!destino || !puedeConfirmar) return null;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      // The amount is only sent when reception changed it: accepting the
      // suggestion sends null so the database applies its own current figure
      // (the hour may have moved while the dialog was open).
      const decision = {
        exonerar: hayRecargo && exonerar,
        monto: hayRecargo && !exonerar && montoEditado ? montoFinal : null,
        motivo: motivoRequerido ? motivo.trim() : null,
      };
      const resultado =
        destino === 'Check-out'
          ? await horarioService.checkoutConRecargo(idReserva, decision)
          : await horarioService.checkinConRecargo(idReserva, decision);
      setDestino(null);
      return resultado;
    } catch (err: unknown) {
      setErrorEnvio(err instanceof Error && err.message ? err.message : 'No se pudo completar la operación.');
      return null;
    } finally {
      setEnviando(false);
    }
  };

  return {
    destino,
    sugerido,
    calculando,
    errorCalculo,
    hayRecargo,
    montoSugerido,
    montoFinal,
    montoTexto: montoTexto ?? String(montoSugerido),
    exonerar,
    motivo,
    motivoRequerido,
    puedeConfirmar,
    enviando,
    errorEnvio,
    abrir,
    cerrar,
    setMonto,
    setExonerar,
    setMotivo,
    confirmar,
  };
}
