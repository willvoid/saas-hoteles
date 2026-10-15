import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { AvisoPeriodoCerrado } from '../../components/finanzas/AvisoPeriodoCerrado';
import { Campo, CampoMonto } from '../../components/finanzas/Campo';
import { ConfirmarAnulacionModal } from '../../components/finanzas/ConfirmarAnulacionModal';
import { EstadoDocumentoBadge } from '../../components/finanzas/EstadoBadge';
import { RangoFechas } from '../../components/finanzas/RangoFechas';
import { finanzasService } from '../../services/finanzasService';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import { parseMonto, rangoMesActual, validarTransferenciaForm } from '../../utils/finanzasForm';
import type { ErroresForm, TransferenciaFormValores } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import type { CuentaFondo, Periodo, TransferenciaFondos } from '../../types/finanzas';

interface TransferenciasSeccionProps {
  fondos: CuentaFondo[];
  periodos: Periodo[];
  periodoCerradoDe: (fecha: string) => string | null;
  /** Called after a transfer is created or annulled so balances reload. */
  onChanged: () => void;
}

const formVacio = (): TransferenciaFormValores => ({
  origen: '',
  destino: '',
  monto: '',
  fecha: fechaNegocioHoy(),
});

// Money moved from one fund to another. The database posts it as a debit to
// the destination fund and a credit to the origin one.
export default function TransferenciasSeccion({
  fondos,
  periodos,
  periodoCerradoDe,
  onChanged,
}: TransferenciasSeccionProps) {
  const [valores, setValores] = useState<TransferenciaFormValores>(formVacio);
  const [observacion, setObservacion] = useState('');
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorBase, setErrorBase] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [rango, setRango] = useState(() => rangoMesActual(fechaNegocioHoy()));
  const [transferencias, setTransferencias] = useState<TransferenciaFondos[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const [aAnular, setAAnular] = useState<TransferenciaFondos | null>(null);
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);

  const nombreFondo = useCallback(
    (id: number) => fondos.find((f) => f.id === id)?.nombre ?? `Fondo #${id}`,
    [fondos],
  );
  const fondosActivos = fondos.filter((f) => f.activo);
  const periodoCerrado = periodoCerradoDe(valores.fecha);

  useEffect(() => {
    if (!rango.desde || !rango.hasta) {
      setTransferencias([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    finanzasService
      .getTransferencias(rango.desde, rango.hasta)
      .then((rows) => {
        if (cancelled) return;
        setTransferencias(rows);
        setErrorLista(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorLista(mensajeDeError(err, 'No se pudieron cargar las transferencias.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rango, recarga]);

  const set = <K extends keyof TransferenciaFormValores>(campo: K, valor: TransferenciaFormValores[K]) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => ({ ...prev, [campo]: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validarTransferenciaForm(valores, periodos);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setSaving(true);
    setErrorBase(null);
    try {
      await finanzasService.crearTransferencia({
        fk_fondo_origen: Number(valores.origen),
        fk_fondo_destino: Number(valores.destino),
        monto: parseMonto(valores.monto),
        fecha: valores.fecha,
        observacion: observacion.trim() || null,
      });
      setValores(formVacio());
      setObservacion('');
      setRecarga((n) => n + 1);
      onChanged();
    } catch (err: unknown) {
      setErrorBase(mensajeDeError(err, 'No se pudo registrar la transferencia.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmarAnulacion = async () => {
    if (!aAnular) return;
    setAnulando(true);
    setErrorAnulacion(null);
    try {
      await finanzasService.anularTransferencia(aAnular.id);
      setAAnular(null);
      setRecarga((n) => n + 1);
      onChanged();
    } catch (err: unknown) {
      setErrorAnulacion(mensajeDeError(err, 'No se pudo anular la transferencia.'));
    } finally {
      setAnulando(false);
    }
  };

  const columns: Column<TransferenciaFondos>[] = [
    { header: 'Fecha', render: (t) => t.fecha },
    { header: 'Origen', render: (t) => nombreFondo(t.fk_fondo_origen) },
    { header: 'Destino', render: (t) => nombreFondo(t.fk_fondo_destino) },
    { header: 'Monto', align: 'right', render: (t) => <span className="fin-monto">{formatGs(t.monto)}</span> },
    { header: 'Observación', render: (t) => t.observacion ?? '-' },
    { header: 'Estado', render: (t) => <EstadoDocumentoBadge estado={t.estado} /> },
    {
      header: 'Acciones',
      align: 'center',
      render: (t) =>
        t.estado === 'REGISTRADO' ? (
          <button
            className="btn-ghost"
            onClick={() => {
              setErrorAnulacion(null);
              setAAnular(t);
            }}
          >
            Anular
          </button>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <section className="fin-panel">
      <h3 className="fin-section-title">Transferencias entre fondos</h3>

      <form onSubmit={handleSubmit} noValidate style={{ marginBottom: 24 }}>
        {errorBase && <div className="fin-error-box" role="alert">{errorBase}</div>}
        {periodoCerrado && <AvisoPeriodoCerrado periodo={periodoCerrado} />}
        <div className="form-grid">
          <Campo label="Fondo origen" htmlFor="transf-origen" error={errores.origen}>
            <select
              id="transf-origen"
              className={`input-field ${errores.origen ? 'input-error' : ''}`}
              value={valores.origen}
              onChange={(e) => set('origen', e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Elegí el origen</option>
              {fondosActivos.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Fondo destino" htmlFor="transf-destino" error={errores.destino}>
            <select
              id="transf-destino"
              className={`input-field ${errores.destino ? 'input-error' : ''}`}
              value={valores.destino}
              onChange={(e) => set('destino', e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Elegí el destino</option>
              {fondosActivos.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
            </select>
          </Campo>
          <CampoMonto
            id="transf-monto"
            label="Monto"
            value={valores.monto}
            onChange={(v) => set('monto', v)}
            error={errores.monto}
          />
          <Campo label="Fecha" htmlFor="transf-fecha" error={errores.fecha}>
            <input
              id="transf-fecha"
              type="date"
              className={`input-field ${errores.fecha ? 'input-error' : ''}`}
              value={valores.fecha}
              onChange={(e) => set('fecha', e.target.value)}
            />
          </Campo>
          <Campo label="Observación (opcional)" htmlFor="transf-obs" className="span-2">
            <input
              id="transf-obs"
              className="input-field"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </Campo>
        </div>
        <div className="fin-form-actions">
          <button type="submit" className="btn-primary-sm" disabled={saving || !!periodoCerrado}>
            {saving ? 'Guardando…' : 'Registrar transferencia'}
          </button>
        </div>
      </form>

      <div className="fin-filtros">
        <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
      </div>
      {errorLista && <div className="fin-error-box" role="alert">{errorLista}</div>}
      {loading ? (
        <div className="loader" />
      ) : (
        <DataTable
          data={transferencias}
          columns={columns}
          emptyMessage="No hay transferencias en el período elegido."
          keyExtractor={(t) => t.id}
        />
      )}

      <ConfirmarAnulacionModal
        isOpen={!!aAnular}
        titulo="Anular transferencia"
        error={errorAnulacion}
        saving={anulando}
        onConfirm={confirmarAnulacion}
        onClose={() => setAAnular(null)}
      >
        {aAnular && (
          <p style={{ margin: 0 }}>
            ¿Anular la transferencia del <strong>{aAnular.fecha}</strong> por <strong>{formatGs(aAnular.monto)}</strong>{' '}
            de <strong>{nombreFondo(aAnular.fk_fondo_origen)}</strong> a{' '}
            <strong>{nombreFondo(aAnular.fk_fondo_destino)}</strong>?
          </p>
        )}
      </ConfirmarAnulacionModal>
    </section>
  );
}
