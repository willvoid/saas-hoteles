import { useCallback, useEffect, useState } from 'react';
import { facturaService } from '../../services/facturaService';
import { finanzasService } from '../../services/finanzasService';
import { mensajeDeError } from '../../utils/facturaCredito';
import type { CuentaFondo, MedioPagoFondo } from '../../types/finanzas';
import type { ModoPagoItem } from '../../types/factura';

interface MediosPagoSeccionProps {
  fondos: CuentaFondo[];
}

/** Value of the "default" option: no mapping row, the shift cash fund is used. */
const POR_DEFECTO = '';

// Which fund receives the money of each payment method. A method without a
// mapping lands in the cash fund of the shift that issued the invoice.
export default function MediosPagoSeccion({ fondos }: MediosPagoSeccionProps) {
  const [modos, setModos] = useState<ModoPagoItem[]>([]);
  const [mapeos, setMapeos] = useState<MedioPagoFondo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [refs, mapeosFondo] = await Promise.all([
        facturaService.getReferencias(),
        finanzasService.getMediosPagoFondo(),
      ]);
      setModos(
        refs.modosPago.map((m) => ({ id_modo_pago: m.id_modo_pago, descripcion: m.descripcion })),
      );
      setMapeos(mapeosFondo);
      setError(null);
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'No se pudieron cargar los medios de pago.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = async (modo: ModoPagoItem, valor: string) => {
    const actual = mapeos.find((m) => m.fk_modo_pago === modo.id_modo_pago);
    setGuardandoId(modo.id_modo_pago);
    setError(null);
    try {
      if (valor === POR_DEFECTO) {
        if (actual) await finanzasService.eliminarMedioPagoFondo(actual.id);
      } else {
        await finanzasService.guardarMedioPagoFondo({
          fk_modo_pago: modo.id_modo_pago,
          fk_fondo: Number(valor),
        });
      }
      await cargar();
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'No se pudo guardar el fondo del medio de pago.'));
    } finally {
      setGuardandoId(null);
    }
  };

  // Active petty cash / bank funds can be chosen, plus the one already mapped
  // (even if deactivated or a shift fund) so the select still shows the stored value.
  const opciones = (actual: MedioPagoFondo | undefined): CuentaFondo[] =>
    fondos.filter(
      (f) => f.id === actual?.fk_fondo || (f.tipo !== 'caja_turno' && f.activo),
    );

  return (
    <section className="fin-panel">
      <h3 className="fin-section-title">Medios de pago y fondos</h3>
      <p className="fin-hint">
        Elegí en qué fondo se acredita cada medio de pago. Sin elección, el dinero entra a la caja del
        turno.
      </p>
      {error && <div className="fin-error-box" role="alert">{error}</div>}
      {loading ? (
        <div className="loader" />
      ) : modos.length === 0 ? (
        <p className="fin-hint">No hay medios de pago configurados.</p>
      ) : (
        <table className="fin-sub-table">
          <thead>
            <tr><th>Medio de pago</th><th>Fondo</th></tr>
          </thead>
          <tbody>
            {modos.map((modo) => {
              const actual = mapeos.find((m) => m.fk_modo_pago === modo.id_modo_pago);
              return (
                <tr key={modo.id_modo_pago}>
                  <td>{modo.descripcion}</td>
                  <td>
                    <select
                      className="input-field"
                      aria-label={`Fondo para ${modo.descripcion}`}
                      style={{ padding: '8px 12px', maxWidth: 280 }}
                      value={actual ? String(actual.fk_fondo) : POR_DEFECTO}
                      disabled={guardandoId === modo.id_modo_pago}
                      onChange={(e) => cambiar(modo, e.target.value)}
                    >
                      <option value={POR_DEFECTO}>Caja del turno (predeterminado)</option>
                      {opciones(actual).map((f) => (
                        <option key={f.id} value={f.id}>{f.nombre}{f.activo ? '' : ' (inactivo)'}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
