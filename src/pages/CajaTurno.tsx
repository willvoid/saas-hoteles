import { useEffect, useState } from 'react';
import { Wallet, DoorOpen, DoorClosed, ShieldAlert } from 'lucide-react';
import { cajaService, CajaConEstado, TurnoAbierto } from '../services/cajaService';
import type { Turno } from '../types/factura';
import { ModuleLayout } from '../components/ModuleLayout';
import { formatGs } from '../utils/currency';
import { validarMontoTurno, validarTipeoMontoTurno } from '../utils/montoTurno';
import type { Role } from '../utils/permissions';
import '../index.css';

interface CajaTurnoProps {
  currentUser: { id?: number; id_usuario?: number };
  /** Determina si se muestra la sección para cerrar turnos de otros
   *  usuarios: sólo admin/gerente, no recepcionista ni limpiador. La policy
   *  RESTRICTIVE de la base (20260803000000) es la que de verdad lo exige;
   *  esto es sólo para no ofrecer una acción que va a rebotar. */
  role: Role;
  /** Se dispara al abrir un turno con éxito. Lo usa Dashboard para volver a
   *  Facturación cuando se llegó acá desde "Abrir turno en Caja". */
  onTurnoAbierto?: () => void;
}

const panelStyle: React.CSSProperties = {
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: 16,
  padding: 24,
  maxWidth: 480,
};

const puedeCerrarAjenos = (role: Role) => role === 'admin' || role === 'gerente';

export default function CajaTurno({ currentUser, role, onTurnoAbierto }: CajaTurnoProps) {
  const userId = currentUser?.id_usuario || currentUser?.id || 0;

  const [turno, setTurno] = useState<Turno | null>(null);
  const [cajas, setCajas] = useState<CajaConEstado[]>([]);
  const [turnosAbiertos, setTurnosAbiertos] = useState<TurnoAbierto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [fkCaja, setFkCaja] = useState<number | ''>('');
  const [montoInicial, setMontoInicial] = useState('');
  const [montoFinal, setMontoFinal] = useState('');

  // Un input de "monto final" por turno ajeno, más el id que se está
  // cerrando en este momento (deshabilita sólo esa fila, no toda la lista).
  const [montoFinalAjeno, setMontoFinalAjeno] = useState<Record<number, string>>({});
  const [cerrandoId, setCerrandoId] = useState<number | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  // Mismo criterio que el número de habitación en Gestión de habitaciones:
  // corta el tipeo ante cualquier valor inválido y muestra el error al toque.
  const handleMontoChange = (value: string, setter: (v: string) => void, nombreCampo: string) => {
    clearMessages();
    const mensaje = validarTipeoMontoTurno(value, nombreCampo);
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setter(value);
  };

  const load = async () => {
    try {
      setLoading(true);
      const [activo, listaCajas, listaTurnosAbiertos] = await Promise.all([
        cajaService.getTurnoActivo(userId),
        cajaService.getCajasConEstado(),
        // Sólo admin/gerente ven turnos ajenos: pedirla igual para los demás
        // roles filtraría en el cliente lo que la policy ya rechazaría en el
        // servidor, sin ganar nada — mejor no pagar la consulta.
        puedeCerrarAjenos(role) ? cajaService.getTurnosAbiertos(userId) : Promise.resolve([]),
      ]);
      setTurno(activo);
      setCajas(listaCajas);
      setTurnosAbiertos(listaTurnosAbiertos);
      // Preseleccionar la primera caja LIBRE, no la primera de la lista: si
      // "Caja #1" ya está en uso, no tiene sentido dejarla elegida por default.
      const libre = listaCajas.find((c) => !c.turnoAbierto);
      if (libre) setFkCaja((prev) => prev || libre.id_caja);
    } catch (err: any) {
      setError(err.message || 'Error al cargar la caja.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAbrir = async (e?: React.FormEvent) => {
    e?.preventDefault();
    clearMessages();
    if (!fkCaja) {
      setError('Elegí una caja.');
      return;
    }
    // El <select> ya deshabilita las cajas ocupadas (ver abajo), pero se
    // revalida acá por si `cajas` quedó desactualizado desde el último load().
    // abrirTurno también lo rechaza a nivel de base (índice único), así que
    // esto es sólo para dar el mensaje sin esperar el viaje al servidor.
    if (cajas.find((c) => c.id_caja === Number(fkCaja))?.turnoAbierto) {
      setError('Esa caja ya tiene un turno abierto. Elegí otra.');
      return;
    }
    const errorMonto = validarMontoTurno(montoInicial, 'monto inicial');
    if (errorMonto) {
      setError(errorMonto);
      return;
    }
    try {
      setSaving(true);
      await cajaService.abrirTurno({
        fk_caja: Number(fkCaja),
        fk_usuario: userId,
        monto_inicial: Number(montoInicial),
      });
      setMontoInicial('');
      setSuccess('Turno abierto.');
      await load();
      onTurnoAbierto?.();
    } catch (err: any) {
      setError(err.message || 'No se pudo abrir el turno.');
    } finally {
      setSaving(false);
    }
  };

  const handleCerrar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    clearMessages();
    if (!turno) return;
    const errorMonto = validarMontoTurno(montoFinal, 'monto final');
    if (errorMonto) {
      setError(errorMonto);
      return;
    }
    try {
      setSaving(true);
      await cajaService.cerrarTurno(turno.id_turno, Number(montoFinal), userId);
      setMontoFinal('');
      setSuccess('Turno cerrado.');
      await load();
    } catch (err: any) {
      setError(err.message || 'No se pudo cerrar el turno.');
    } finally {
      setSaving(false);
    }
  };

  // Cierre "administrativo": admin/gerente cerrando el turno de otro usuario
  // (se fue, renunció, se olvidó). fk_usuario_cierre queda distinto de
  // fk_usuario del turno, así que el reporte de turnos puede distinguirlo de
  // un cierre normal.
  const handleCerrarAjeno = async (t: TurnoAbierto) => {
    clearMessages();
    const valor = montoFinalAjeno[t.id_turno] ?? '';
    const errorMonto = validarMontoTurno(valor, 'monto final');
    if (errorMonto) {
      setError(errorMonto);
      return;
    }
    try {
      setCerrandoId(t.id_turno);
      await cajaService.cerrarTurno(t.id_turno, Number(valor), userId);
      setMontoFinalAjeno((prev) => {
        const { [t.id_turno]: _omitido, ...resto } = prev;
        return resto;
      });
      setSuccess(`Turno de ${t.usuario} cerrado.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'No se pudo cerrar el turno.');
    } finally {
      setCerrandoId(null);
    }
  };

  return (
    <ModuleLayout
      title="Caja · Turno"
      description="Abrí un turno para poder facturar y cerralo al finalizar."
    >
      {error && <div className="status-message status-error" style={{ marginBottom: 20 }}>{error}</div>}
      {success && <div className="status-message status-success" style={{ marginBottom: 20 }}>{success}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : turno ? (
        <form style={panelStyle} onSubmit={handleCerrar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Wallet size={22} color="#34d399" />
            <span style={{ fontSize: 18, fontWeight: 600 }}>Turno abierto</span>
            <span className="status-badge" style={{ '--badge-color': '#10b981' } as React.CSSProperties}>ACTIVO</span>
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', margin: 0 }}>
            <dt style={{ color: 'var(--text-secondary)' }}>Caja</dt>
            <dd style={{ margin: 0 }}>
              {(turno as any).caja?.descripcion_caja || `Caja #${(turno as any).caja?.nro_caja ?? turno.fk_caja}`}
            </dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Apertura</dt>
            <dd style={{ margin: 0 }}>{new Date(turno.apertura).toLocaleString()}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Monto inicial</dt>
            <dd style={{ margin: 0 }}>{formatGs(turno.monto_inicial)}</dd>
          </dl>

          <div className="input-group" style={{ marginTop: 24 }}>
            <label htmlFor="monto-final">Monto final (arqueo)</label>
            <input
              id="monto-final"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="input-field"
              value={montoFinal}
              onChange={(e) => handleMontoChange(e.target.value, setMontoFinal, 'monto final')}
              placeholder="0"
            />
          </div>
          <button
            type="submit"
            className="btn-primary-sm"
            style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}
            disabled={saving}
          >
            <DoorClosed size={16} /> Cerrar turno
          </button>
        </form>
      ) : (
        <form style={panelStyle} onSubmit={handleAbrir}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Wallet size={22} color="#94a3b8" />
            <span style={{ fontSize: 18, fontWeight: 600 }}>No tenés un turno abierto</span>
          </div>

          <div className="input-group">
            <label htmlFor="caja">Caja</label>
            <select
              id="caja"
              className="input-field"
              value={fkCaja}
              onChange={(e) => setFkCaja(e.target.value ? Number(e.target.value) : '')}
            >
              {cajas.length === 0 && <option value="">No hay cajas configuradas</option>}
              {cajas.map((c) => (
                <option key={c.id_caja} value={c.id_caja} disabled={c.turnoAbierto}>
                  {c.descripcion_caja || `Caja #${c.nro_caja}`}{c.turnoAbierto ? ' (en uso)' : ''}
                </option>
              ))}
            </select>
            {cajas.length > 0 && cajas.every((c) => c.turnoAbierto) && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
                Todas las cajas tienen un turno abierto en este momento.
              </p>
            )}
          </div>

          <div className="input-group">
            <label htmlFor="monto-inicial">Monto inicial</label>
            <input
              id="monto-inicial"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="input-field"
              value={montoInicial}
              onChange={(e) => handleMontoChange(e.target.value, setMontoInicial, 'monto inicial')}
              placeholder="0"
            />
          </div>

          <button
            type="submit"
            className="btn-primary-sm"
            style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}
            disabled={saving || cajas.length === 0 || cajas.every((c) => c.turnoAbierto)}
          >
            <DoorOpen size={16} /> Abrir turno
          </button>
        </form>
      )}

      {!loading && puedeCerrarAjenos(role) && turnosAbiertos.length > 0 && (
        <div style={{ ...panelStyle, maxWidth: 720, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <ShieldAlert size={20} color="#f59e0b" />
            <span style={{ fontSize: 16, fontWeight: 600 }}>Turnos abiertos de otros usuarios</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: -8, marginBottom: 16 }}>
            Cerralos sólo si la persona ya no va a hacer su propio arqueo (se fue, renunció, o se olvidó).
            El monto final que cargues acá queda registrado como cierre administrativo, no como el
            arqueo de quien abrió el turno.
          </p>
          {turnosAbiertos.map((t) => (
            <div
              key={t.id_turno}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 12,
                padding: '12px 0',
                borderTop: '1px solid var(--glass-border)',
              }}
            >
              <div style={{ flex: '1 1 220px' }}>
                <div style={{ fontWeight: 600 }}>{t.caja}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {t.usuario} · abierto {new Date(t.apertura).toLocaleString()} · inicial {formatGs(t.monto_inicial)}
                </div>
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label htmlFor={`monto-final-${t.id_turno}`}>Monto final</label>
                <input
                  id={`monto-final-${t.id_turno}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="input-field"
                  style={{ width: 140 }}
                  value={montoFinalAjeno[t.id_turno] ?? ''}
                  onChange={(e) => {
                    clearMessages();
                    const mensaje = validarTipeoMontoTurno(e.target.value, 'monto final');
                    if (mensaje) {
                      setError(mensaje);
                      return;
                    }
                    setMontoFinalAjeno((prev) => ({ ...prev, [t.id_turno]: e.target.value }));
                  }}
                  placeholder="0"
                />
              </div>
              <button
                type="button"
                className="btn-primary-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                disabled={cerrandoId === t.id_turno}
                onClick={() => handleCerrarAjeno(t)}
              >
                <DoorClosed size={16} /> Cerrar
              </button>
            </div>
          ))}
        </div>
      )}
    </ModuleLayout>
  );
}
