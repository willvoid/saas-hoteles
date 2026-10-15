import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { AvisoPeriodoCerrado } from '../../components/finanzas/AvisoPeriodoCerrado';
import { Campo, CampoMonto } from '../../components/finanzas/Campo';
import { gastoService } from '../../services/gastoService';
import { calcularTotalesGasto } from '../../utils/gastoTotals';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import { armarGastoNuevo, parseMonto, validarGastoForm } from '../../utils/finanzasForm';
import type { ErroresForm, GastoFormValores } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import type {
  CategoriaFinanzas,
  CondicionGasto,
  CuentaFondo,
  Periodo,
  Proveedor,
} from '../../types/finanzas';

interface GastoFormModalProps {
  categorias: CategoriaFinanzas[];
  proveedores: Proveedor[];
  fondos: CuentaFondo[];
  periodos: Periodo[];
  /** Label of the closed month of a date, or null when it is open. */
  periodoCerradoDe: (fecha: string) => string | null;
  onClose: () => void;
  onSaved: () => void;
}

// "Nuevo gasto" form. Amounts INCLUDE VAT; the preview mirrors the database
// trigger, which recomputes the real totals on insert.
export default function GastoFormModal({
  categorias,
  proveedores,
  fondos,
  periodos,
  periodoCerradoDe,
  onClose,
  onSaved,
}: GastoFormModalProps) {
  const [valores, setValores] = useState<GastoFormValores>(() => ({
    fecha: fechaNegocioHoy(),
    fk_categoria: '',
    fk_proveedor: '',
    nro_comprobante: '',
    gravado_10: '',
    gravado_5: '',
    exenta: '',
    condicion: 'contado',
    fecha_vencimiento: '',
    fk_cuenta_fondo: '',
  }));
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorBase, setErrorBase] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categoriasEgreso = categorias.filter((c) => c.activo && c.tipo === 'egreso');
  const proveedoresActivos = proveedores.filter((p) => p.activo);
  const fondosActivos = fondos.filter((f) => f.activo);
  const credito = valores.condicion === 'credito';
  const periodoCerrado = periodoCerradoDe(valores.fecha);

  const totales = calcularTotalesGasto({
    gravado_10: parseMonto(valores.gravado_10),
    gravado_5: parseMonto(valores.gravado_5),
    exenta: parseMonto(valores.exenta),
  });

  const set = <K extends keyof GastoFormValores>(campo: K, valor: GastoFormValores[K]) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => ({ ...prev, [campo]: undefined }));
    if (campo === 'gravado_10' || campo === 'gravado_5' || campo === 'exenta') {
      setErrores((prev) => ({ ...prev, monto: undefined }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validarGastoForm(valores, periodos);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setSaving(true);
    setErrorBase(null);
    try {
      await gastoService.crearGasto(armarGastoNuevo(valores));
      onSaved();
    } catch (err: unknown) {
      setErrorBase(mensajeDeError(err, 'No se pudo registrar el gasto.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Nuevo gasto" maxWidth={680}>
      <form onSubmit={handleSubmit} noValidate>
        {errorBase && <div className="fin-error-box" role="alert">{errorBase}</div>}
        {periodoCerrado && <AvisoPeriodoCerrado periodo={periodoCerrado} />}

        <div className="form-grid">
          <Campo label="Fecha" htmlFor="gasto-fecha" error={errores.fecha}>
            <input
              id="gasto-fecha"
              type="date"
              className={`input-field ${errores.fecha ? 'input-error' : ''}`}
              value={valores.fecha}
              onChange={(e) => set('fecha', e.target.value)}
            />
          </Campo>
          <Campo label="Nº de comprobante (opcional)" htmlFor="gasto-nro">
            <input
              id="gasto-nro"
              className="input-field"
              value={valores.nro_comprobante}
              placeholder="001-001-0000123"
              onChange={(e) => set('nro_comprobante', e.target.value)}
            />
          </Campo>
          <Campo label="Categoría" htmlFor="gasto-categoria" error={errores.fk_categoria}>
            <select
              id="gasto-categoria"
              className={`input-field ${errores.fk_categoria ? 'input-error' : ''}`}
              value={valores.fk_categoria}
              onChange={(e) => set('fk_categoria', e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Elegí una categoría</option>
              {categoriasEgreso.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Campo>
          <Campo
            label={credito ? 'Proveedor' : 'Proveedor (opcional)'}
            htmlFor="gasto-proveedor"
            error={errores.fk_proveedor}
          >
            <select
              id="gasto-proveedor"
              className={`input-field ${errores.fk_proveedor ? 'input-error' : ''}`}
              value={valores.fk_proveedor}
              onChange={(e) => set('fk_proveedor', e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">{credito ? 'Elegí un proveedor' : 'Sin proveedor'}</option>
              {proveedoresActivos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </Campo>
        </div>

        <p className="fin-hint">Los montos incluyen el IVA.</p>
        <div className="form-grid">
          <CampoMonto
            id="gasto-g10"
            label="Gravado 10%"
            value={valores.gravado_10}
            onChange={(v) => set('gravado_10', v)}
            error={errores.monto}
          />
          <CampoMonto
            id="gasto-g5"
            label="Gravado 5%"
            value={valores.gravado_5}
            onChange={(v) => set('gravado_5', v)}
          />
          <CampoMonto
            id="gasto-exenta"
            label="Exento"
            value={valores.exenta}
            onChange={(v) => set('exenta', v)}
          />
        </div>

        <div className="fin-preview" aria-live="polite">
          <div><span>IVA 10%</span><strong>{formatGs(totales.iva_10)}</strong></div>
          <div><span>IVA 5%</span><strong>{formatGs(totales.iva_5)}</strong></div>
          <div><span>Total</span><strong>{formatGs(totales.total)}</strong></div>
        </div>

        <div className="form-grid">
          <Campo label="Condición" htmlFor="gasto-condicion">
            <select
              id="gasto-condicion"
              className="input-field"
              value={valores.condicion}
              onChange={(e) => set('condicion', e.target.value as CondicionGasto)}
            >
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
          </Campo>
          {credito ? (
            <Campo label="Vencimiento (opcional)" htmlFor="gasto-venc" error={errores.fecha_vencimiento}>
              <input
                id="gasto-venc"
                type="date"
                className={`input-field ${errores.fecha_vencimiento ? 'input-error' : ''}`}
                value={valores.fecha_vencimiento}
                min={valores.fecha || undefined}
                onChange={(e) => set('fecha_vencimiento', e.target.value)}
              />
            </Campo>
          ) : (
            <Campo label="Fondo de pago" htmlFor="gasto-fondo" error={errores.fk_cuenta_fondo}>
              <select
                id="gasto-fondo"
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
          )}
        </div>

        <div className="fin-form-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary-sm" disabled={saving || !!periodoCerrado}>
            {saving ? 'Guardando…' : 'Registrar gasto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
