import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { AvisoPeriodoCerrado } from '../../components/finanzas/AvisoPeriodoCerrado';
import { Campo, CampoMonto } from '../../components/finanzas/Campo';
import { cobroService } from '../../services/cobroService';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import { parseMonto, validarCobroForm } from '../../utils/finanzasForm';
import type { CobroFormValores, ErroresForm } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import type { CuentaFondo, FacturaPendiente, Periodo } from '../../types/finanzas';

interface CobroFormModalProps {
  factura: FacturaPendiente;
  fondos: CuentaFondo[];
  periodos: Periodo[];
  /** Label of the closed month of a date, or null when it is open. */
  periodoCerradoDe: (fecha: string) => string | null;
  onClose: () => void;
  onSaved: () => void;
}

// "Registrar cobro" form: collects (part of) a credit invoice into a fund. The
// amount defaults to the whole balance and cannot exceed it.
export default function CobroFormModal({
  factura,
  fondos,
  periodos,
  periodoCerradoDe,
  onClose,
  onSaved,
}: CobroFormModalProps) {
  const saldo = Number(factura.saldo_pendiente);
  const [valores, setValores] = useState<CobroFormValores>(() => ({
    fk_factura: factura.id_factura,
    fk_cuenta_fondo: '',
    monto: String(saldo),
    fecha: fechaNegocioHoy(),
  }));
  const [observacion, setObservacion] = useState('');
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorBase, setErrorBase] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fondosActivos = fondos.filter((f) => f.activo);
  const periodoCerrado = periodoCerradoDe(valores.fecha);

  const set = <K extends keyof CobroFormValores>(campo: K, valor: CobroFormValores[K]) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => ({ ...prev, [campo]: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validarCobroForm(valores, saldo, periodos);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setSaving(true);
    setErrorBase(null);
    try {
      await cobroService.crearCobro({
        fk_factura: factura.id_factura,
        fk_cuenta_fondo: Number(valores.fk_cuenta_fondo),
        monto: parseMonto(valores.monto),
        fecha: valores.fecha,
        observacion: observacion.trim() || null,
      });
      onSaved();
    } catch (err: unknown) {
      // The database message (overpay, closed month...) is shown verbatim.
      setErrorBase(mensajeDeError(err, 'No se pudo registrar el cobro.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Registrar cobro" maxWidth={600}>
      <form onSubmit={handleSubmit} noValidate>
        {errorBase && <div className="fin-error-box" role="alert">{errorBase}</div>}
        {periodoCerrado && <AvisoPeriodoCerrado periodo={periodoCerrado} />}

        <div className="fin-preview">
          <div>
            <strong>{factura.cliente?.razon_social ?? 'Sin cliente'}</strong>
          </div>
          <div className="fin-muted">
            Factura Nº {factura.nro_secuencial} · total {formatGs(factura.total_general)} · saldo{' '}
            {formatGs(saldo)}
          </div>
        </div>

        <div className="form-grid">
          <Campo label="Fondo de cobro" htmlFor="cobro-fondo" error={errores.fk_cuenta_fondo}>
            <select
              id="cobro-fondo"
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
          <Campo label="Fecha" htmlFor="cobro-fecha" error={errores.fecha}>
            <input
              id="cobro-fecha"
              type="date"
              className={`input-field ${errores.fecha ? 'input-error' : ''}`}
              value={valores.fecha}
              onChange={(e) => set('fecha', e.target.value)}
            />
          </Campo>
          <CampoMonto
            id="cobro-monto"
            label={`Monto (máx. ${formatGs(saldo)})`}
            value={valores.monto}
            onChange={(v) => set('monto', v)}
            error={errores.monto}
          />
        </div>

        <Campo label="Observación (opcional)" htmlFor="cobro-obs">
          <input
            id="cobro-obs"
            className="input-field"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
        </Campo>

        <div className="fin-form-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary-sm" disabled={saving || !!periodoCerrado}>
            {saving ? 'Guardando…' : 'Registrar cobro'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
