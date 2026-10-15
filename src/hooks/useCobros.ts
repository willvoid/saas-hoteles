import { useCallback, useEffect, useState } from 'react';
import { cobroService } from '../services/cobroService';
import { mensajeDeError } from '../utils/facturaCredito';
import type { CobroListado, FacturaPendiente } from '../types/finanzas';

interface Rango {
  desde: string;
  hasta: string;
}

interface CobrosState {
  pendientes: FacturaPendiente[];
  cargandoPend: boolean;
  errorPend: string | null;
  cobros: CobroListado[];
  cargandoCobros: boolean;
  errorCobros: string | null;
  recargar: () => void;
}

/** Loads the pending credit invoices and the collections of a date range.
 *  Both lists reload together when `recargar` is called. */
export function useCobros(rango: Rango): CobrosState {
  const [pendientes, setPendientes] = useState<FacturaPendiente[]>([]);
  const [cargandoPend, setCargandoPend] = useState(true);
  const [errorPend, setErrorPend] = useState<string | null>(null);
  const [cobros, setCobros] = useState<CobroListado[]>([]);
  const [cargandoCobros, setCargandoCobros] = useState(true);
  const [errorCobros, setErrorCobros] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setCargandoPend(true);
    cobroService
      .getFacturasPendientes()
      .then((rows) => {
        if (cancelled) return;
        setPendientes(rows);
        setErrorPend(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorPend(mensajeDeError(err, 'No se pudieron cargar las facturas por cobrar.'));
      })
      .finally(() => {
        if (!cancelled) setCargandoPend(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recarga]);

  useEffect(() => {
    // An empty date means "no range yet": nothing to ask the database.
    if (!rango.desde || !rango.hasta) {
      setCobros([]);
      setCargandoCobros(false);
      return;
    }
    let cancelled = false;
    setCargandoCobros(true);
    cobroService
      .getCobros(rango.desde, rango.hasta)
      .then((rows) => {
        if (cancelled) return;
        setCobros(rows);
        setErrorCobros(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorCobros(mensajeDeError(err, 'No se pudieron cargar los cobros.'));
      })
      .finally(() => {
        if (!cancelled) setCargandoCobros(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rango, recarga]);

  return { pendientes, cargandoPend, errorPend, cobros, cargandoCobros, errorCobros, recargar };
}
