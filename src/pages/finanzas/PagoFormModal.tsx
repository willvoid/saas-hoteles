import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { AvisoPeriodoCerrado } from '../../components/finanzas/AvisoPeriodoCerrado';
import { Campo, CampoMonto } from '../../components/finanzas/Campo';
import { cobroService } from '../../services/cobroService';
import { gastoService } from '../../services/gastoService';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import { parseMonto, validarPagoForm } from '../../utils/finanzasForm';
import type { ErroresForm, PagoFormValores } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import type { CuentaFondo, GastoListado, Periodo } from '../../types/finanzas';

interface PagoFormModalProps {
  fondos: CuentaFondo[];
  periodos: Periodo[];
  /** Label of the closed month of a date, or null when it is open. */
  periodoCerradoDe: (fecha: string) => string | null;
  onClose: () => void;
  onSaved: () => void;
}

// "Registrar pago" form: pays (part of) a credit expense from a fund. The
// amount defaults to the whole balance and cannot exceed it.
export default function PagoFormModal({
  fondos,
  periodos,
  periodoCerradoDe,
  onClose,
  onSaved,
}: PagoFormModalProps) {
  const [pendientes, setPendientes] = useState<GastoListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [valores, setValores] = useState<PagoFormValores>(() => ({
    fk_gasto: '',
    fk_cuenta_fondo: '',
    monto: '',
    fecha: fechaNegocioHoy(),
  }));
  const [observacion, setObservacion] = useState('');
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorBase, setErrorBase] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    gastoService
      .getGastos({ condicion: 'credito', estado: 'REGISTRADO' })
      .then((rows) => {
        if (!cancelled) setPendientes(rows.filter((g) => Number(g.saldo_pendiente) > 0));
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorBase(mensajeDeError(err, 'No se pudieron cargar los gastos a crédito.'));
      })
      .finally(() => {
        if (!cancelled) setCargando(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fondosActivos = fondos.filter((f) => f.activo);
  const gastoElegido = pendientes.find((g) => g.id === valores.fk_gasto) ?? null;
  const saldo = gastoElegido ? Number(gastoElegido.saldo_pendiente) : null;
  const periodoCerrado = periodoCerradoDe(valores.fecha);

  const set = <K extends keyof PagoFormValores>(campo: K, valor: PagoFormValores[K]) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => ({ ...prev, [campo]: undefined }));
  };

  const elegirGasto = (id: number | '') => {
    const gasto = pendientes.find((g) => g.id === id);
    setValores((prev) => ({
      ...prev,
      fk_gasto: id,
      monto: gasto ? String(Number(gasto.saldo_pendiente)) : '',
    }));
    setErrores((prev) => ({ ...prev, fk_gasto: undefined, monto: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validarPagoForm(valores, saldo, periodos);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setSaving(true);
    setErrorBase(null);
    try {
      await cobroService.crearPago({
        fk_gasto: Number(valores.fk_gasto),
        fk_cuenta_fondo: Number(valores.fk_cuenta_fondo),
        monto: parseMonto(valores.monto),
        fecha: valores.fecha,
        observacion: observacion.trim() || null,
      });
      onSaved();
    } catch (err: unknown) {
      setErrorBase(mensajeDeError(err, 'No se pudo registrar el pago.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Registrar pago" maxWidth={600}>
      <form onSubmit={handleSubmit} noValidate>
        {errorBase && <div className="fin-error-box" role="alert">{errorBase}</div>}
        {periodoCerrado && <AvisoPeriodoCerrado periodo={periodoCerrado} />}

        <Campo label="Gasto a pagar" htmlFor="pago-gasto" error={errores.fk_gasto}>
          <select
            id="pago-gasto"
            className={`input-field ${errores.fk_gasto ? 'input-error' : ''}`}
            value={valores.fk_gasto}
            disabled={cargando}
            onChange={(e) => elegirGasto(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">
              {cargando ? 'Cargando…' : pendientes.length === 0 ? 'No hay gastos a crédito con saldo' : 'Elegí un gasto'}
            </option>
            {pendientes.map((g) => (
              <option key={g.id} value={g.id}>
                {`${g.proveedor?.nombre ?? 'Sin proveedor'} · ${g.nro_comprobante ?? `Gasto #${g.id}`} · saldo ${formatGs(g.saldo_pendiente)}`}
              </option>
            ))}
          </select>
        </Campo>

        <div className="form-grid">
          <Campo label="Fondo de pago" htmlFor="pago-fondo" error={errores.fk_cuenta_fondo}>
            <select
              id="pago-fondo"
              className={`input-field ${errores.fk_cuenta_fondo ? 'input-error' : ''}`}
              value={valores.fk_cuenta_fondo}
              onChange={(e) => set('fk_cuenta_fondo', e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Elegí un fondo</option>
              {fondosActivos.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Fecha" htmlFor="pago-fecha" error={errores.fecha}>
            <input
              id="pago-fecha"
              type="date"
              className={`input-field ${errores.fecha ? 'input-error' : ''}`}
              value={valores.fecha}
              onChange={(e) => set('fecha', e.target.value)}
            />
          </Campo>
          <CampoMonto
            id="pago-monto"
            label={saldo !== null ? `Monto (máx. ${formatGs(saldo)})` : 'Monto'}
            value={valores.monto}
            onChange={(v) => set('monto', v)}
            error={errores.monto}
          />
        </div>

        <Campo label="Observación (opcional)" htmlFor="pago-obs">
          <input
            id="pago-obs"
            className="input-field"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
        </Campo>

        <div className="fin-form-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary-sm" disabled={saving || cargando || !!periodoCerrado}>
            {saving ? 'Guardando…' : 'Registrar pago'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
