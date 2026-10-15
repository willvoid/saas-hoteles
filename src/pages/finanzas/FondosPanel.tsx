import { useCallback, useEffect, useState } from 'react';
import { useFinanzasCatalogos } from '../../hooks/useFinanzasCatalogos';
import { reporteFinanzasService } from '../../services/reporteFinanzasService';
import { mensajeDeError } from '../../utils/facturaCredito';
import { inicioDeAnio } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import FondosListaSeccion from './FondosListaSeccion';
import MediosPagoSeccion from './MediosPagoSeccion';
import SaldosInicialesSeccion from './SaldosInicialesSeccion';
import TransferenciasSeccion from './TransferenciasSeccion';
import { usePeriodosCerrados } from '../../hooks/usePeriodosCerrados';

// Funds panel: the funds with their balance, which fund each payment method
// feeds, transfers between funds and opening balances. It owns the shared data
// (funds, balances, locked months) and reloads it whenever a section changes it.
export default function FondosPanel() {
  const catalogos = useFinanzasCatalogos();
  const { periodos, periodoCerradoDe } = usePeriodosCerrados();
  const [saldosPorFondo, setSaldosPorFondo] = useState<Map<number, number>>(new Map());
  const [errorSaldos, setErrorSaldos] = useState<string | null>(null);
  const [recargaSaldos, setRecargaSaldos] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const hoy = fechaNegocioHoy();
    reporteFinanzasService
      .getFlujoFondos(inicioDeAnio(hoy), hoy)
      .then((filas) => {
        if (cancelled) return;
        setSaldosPorFondo(new Map(filas.map((f) => [f.fk_fondo, f.saldo_final])));
        setErrorSaldos(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorSaldos(mensajeDeError(err, 'No se pudieron calcular los saldos.'));
      });
    return () => {
      cancelled = true;
    };
  }, [recargaSaldos]);

  const { refetch } = catalogos;
  const alCambiar = useCallback(() => {
    refetch();
    setRecargaSaldos((n) => n + 1);
  }, [refetch]);

  // Balances only reload; the funds themselves are unchanged by transfers.
  const alMoverDinero = useCallback(() => setRecargaSaldos((n) => n + 1), []);

  const error = catalogos.error ?? errorSaldos;
  const fondos = catalogos.fondos;

  return (
    <div className="tab-content">
      {error && <div className="fin-error-box" role="alert">{error}</div>}
      {catalogos.loading && fondos.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        <>
          <FondosListaSeccion fondos={fondos} saldos={saldosPorFondo} onChanged={alCambiar} />
          <MediosPagoSeccion fondos={fondos} />
          <TransferenciasSeccion
            fondos={fondos}
            periodos={periodos}
            periodoCerradoDe={periodoCerradoDe}
            onChanged={alMoverDinero}
          />
          <SaldosInicialesSeccion
            fondos={fondos}
            periodos={periodos}
            periodoCerradoDe={periodoCerradoDe}
            onChanged={alMoverDinero}
          />
        </>
      )}
    </div>
  );
}
