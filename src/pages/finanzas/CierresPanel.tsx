import { useMemo, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { EstadoBadge } from '../../components/finanzas/EstadoBadge';
import { COLORS } from '../../constants/colors';
import { usePeriodosCerrados } from '../../hooks/usePeriodosCerrados';
import { periodoService } from '../../services/periodoService';
import { mensajeDeError } from '../../utils/facturaCredito';
import { mesesDelAnio } from '../../utils/finanzasForm';
import type { MesCierre } from '../../utils/finanzasForm';
import { fechaNegocioHoy, periodoDe } from '../../utils/periodoContable';
import type { Role } from '../../utils/permissions';

const ANIOS_ATRAS = 5;

interface CierresPanelProps {
  role: Role;
}

interface AccionPendiente {
  mes: MesCierre;
  accion: 'cerrar' | 'reabrir';
}

/** Closing timestamp as a local date ("03/02/2026"); the raw text if unparsable. */
function fechaDeCierre(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : fecha.toLocaleDateString('es-PY');
}

// Month closing: twelve months of the chosen year with their state. Only the
// admin can close or reopen (the database enforces it); the gerente sees the
// panel read-only. A closed month blocks writes dated in it.
export default function CierresPanel({ role }: CierresPanelProps) {
  const { registros, loading, error, refetch } = usePeriodosCerrados();
  const anioActual = periodoDe(fechaNegocioHoy()).anio;
  const [anio, setAnio] = useState(anioActual);
  const [pendiente, setPendiente] = useState<AccionPendiente | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const puedeCerrar = role === 'admin';
  const meses = useMemo(() => mesesDelAnio(anio, registros), [anio, registros]);
  const anios = Array.from({ length: ANIOS_ATRAS + 1 }, (_, i) => anioActual - i);

  const abrirConfirmacion = (mes: MesCierre, accion: 'cerrar' | 'reabrir') => {
    setErrorAccion(null);
    setPendiente({ mes, accion });
  };

  const confirmar = async () => {
    if (!pendiente) return;
    setProcesando(true);
    setErrorAccion(null);
    try {
      if (pendiente.accion === 'cerrar') {
        await periodoService.cerrarMes(pendiente.mes.anio, pendiente.mes.mes);
      } else {
        await periodoService.reabrirMes(pendiente.mes.anio, pendiente.mes.mes);
      }
      setPendiente(null);
      refetch();
    } catch (err: unknown) {
      // The database message (not admin, already closed...) is shown verbatim.
      setErrorAccion(
        mensajeDeError(err, pendiente.accion === 'cerrar' ? 'No se pudo cerrar el mes.' : 'No se pudo reabrir el mes.'),
      );
    } finally {
      setProcesando(false);
    }
  };

  const cerrando = pendiente?.accion === 'cerrar';

  return (
    <div className="tab-content">
      <div className="fin-toolbar">
        <div className="fin-filtros" style={{ margin: 0 }}>
          <label htmlFor="cierres-anio" className="fin-muted">Año</label>
          <select
            id="cierres-anio"
            className="input-field"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
          >
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {!puedeCerrar && (
        <div className="fin-aviso" role="note">
          Solo un administrador puede cerrar o reabrir meses. Podés consultar el estado de cada mes.
        </div>
      )}

      {error && <div className="fin-error-box" role="alert">{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        <div className="fin-meses-grid">
          {meses.map((m) => (
            <div key={m.mes} className="fin-mes-card">
              <div className="fin-mes-titulo">{m.etiqueta}</div>
              <EstadoBadge
                etiqueta={m.cerrado ? 'Cerrado' : 'Abierto'}
                color={m.cerrado ? COLORS.error : COLORS.success}
              />
              <div className="fin-muted">
                {m.cerrado && m.cerradoEn ? `Cerrado el ${fechaDeCierre(m.cerradoEn)}` : m.futuro ? 'Aún no disponible' : ' '}
              </div>
              {puedeCerrar && (
                <button
                  className={m.cerrado ? 'btn-ghost' : 'btn-primary-sm'}
                  disabled={!m.cerrado && m.futuro}
                  onClick={() => abrirConfirmacion(m, m.cerrado ? 'reabrir' : 'cerrar')}
                >
                  {m.cerrado ? <LockOpen size={15} /> : <Lock size={15} />} {m.cerrado ? 'Reabrir' : 'Cerrar mes'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!pendiente}
        onClose={() => setPendiente(null)}
        title={cerrando ? 'Cerrar mes' : 'Reabrir mes'}
      >
        {pendiente && (
          <div style={{ color: 'var(--text-primary)', fontSize: 15 }}>
            {cerrando ? (
              <p style={{ margin: 0 }}>
                ¿Cerrar <strong>{pendiente.mes.etiqueta}</strong>? Mientras esté cerrado no se podrán crear, editar
                ni anular facturas, gastos, cobros, pagos, transferencias ni saldos iniciales con fecha de ese mes.
                Podés reabrirlo después.
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                ¿Reabrir <strong>{pendiente.mes.etiqueta}</strong>? Volverá a permitir crear, editar y anular
                facturas, gastos, cobros, pagos, transferencias y saldos iniciales con fecha de ese mes.
              </p>
            )}
          </div>
        )}
        {errorAccion && (
          <div className="fin-error-box" role="alert" style={{ marginTop: 16 }}>
            {errorAccion}
          </div>
        )}
        <div className="fin-form-actions" style={{ marginTop: 20 }}>
          <button type="button" className="btn-ghost" onClick={() => setPendiente(null)} disabled={procesando}>
            Cancelar
          </button>
          <button type="button" className="btn-primary-sm" onClick={confirmar} disabled={procesando}>
            {procesando ? 'Procesando…' : cerrando ? 'Sí, cerrar mes' : 'Sí, reabrir mes'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
