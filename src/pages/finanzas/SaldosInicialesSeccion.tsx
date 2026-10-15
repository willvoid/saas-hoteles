import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { AvisoPeriodoCerrado } from '../../components/finanzas/AvisoPeriodoCerrado';
import { Campo, CampoMonto } from '../../components/finanzas/Campo';
import { ConfirmarAnulacionModal } from '../../components/finanzas/ConfirmarAnulacionModal';
import { EstadoDocumentoBadge } from '../../components/finanzas/EstadoBadge';
import { finanzasService } from '../../services/finanzasService';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import { parseMonto, validarSaldoInicialForm } from '../../utils/finanzasForm';
import type { ErroresForm, SaldoInicialFormValores } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import type { CuentaFondo, Periodo, SaldoInicialFondo } from '../../types/finanzas';

interface SaldosInicialesSeccionProps {
  fondos: CuentaFondo[];
  periodos: Periodo[];
  periodoCerradoDe: (fecha: string) => string | null;
  /** Called after an opening balance is created or annulled so balances reload. */
  onChanged: () => void;
}

const formVacio = (): SaldoInicialFormValores => ({ fondo: '', monto: '', fecha: fechaNegocioHoy() });

// Opening balance of a fund: the money it already held when the ledger started.
// A fund can have only one active opening balance; annul it to enter another.
export default function SaldosInicialesSeccion({
  fondos,
  periodos,
  periodoCerradoDe,
  onChanged,
}: SaldosInicialesSeccionProps) {
  const [valores, setValores] = useState<SaldoInicialFormValores>(formVacio);
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorBase, setErrorBase] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [saldos, setSaldos] = useState<SaldoInicialFondo[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const [aAnular, setAAnular] = useState<SaldoInicialFondo | null>(null);
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);

  const nombreFondo = useCallback(
    (id: number) => fondos.find((f) => f.id === id)?.nombre ?? `Fondo #${id}`,
    [fondos],
  );
  const fondosActivos = fondos.filter((f) => f.activo);
  const periodoCerrado = periodoCerradoDe(valores.fecha);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    finanzasService
      .getSaldosIniciales()
      .then((rows) => {
        if (cancelled) return;
        setSaldos(rows);
        setErrorLista(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorLista(mensajeDeError(err, 'No se pudieron cargar los saldos iniciales.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recarga]);

  const set = <K extends keyof SaldoInicialFormValores>(campo: K, valor: SaldoInicialFormValores[K]) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => ({ ...prev, [campo]: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validarSaldoInicialForm(valores, periodos);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setSaving(true);
    setErrorBase(null);
    try {
      await finanzasService.crearSaldoInicial({
        fk_cuenta_fondo: Number(valores.fondo),
        monto: parseMonto(valores.monto),
        fecha: valores.fecha,
      });
      setValores(formVacio());
      setRecarga((n) => n + 1);
      onChanged();
    } catch (err: unknown) {
      // Includes "already has an active opening balance" from the database.
      setErrorBase(mensajeDeError(err, 'No se pudo registrar el saldo inicial.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmarAnulacion = async () => {
    if (!aAnular) return;
    setAnulando(true);
    setErrorAnulacion(null);
    try {
      await finanzasService.anularSaldoInicial(aAnular.id);
      setAAnular(null);
      setRecarga((n) => n + 1);
      onChanged();
    } catch (err: unknown) {
      setErrorAnulacion(mensajeDeError(err, 'No se pudo anular el saldo inicial.'));
    } finally {
      setAnulando(false);
    }
  };

  const columns: Column<SaldoInicialFondo>[] = [
    { header: 'Fecha', render: (s) => s.fecha },
    { header: 'Fondo', render: (s) => nombreFondo(s.fk_cuenta_fondo) },
    { header: 'Monto', align: 'right', render: (s) => <span className="fin-monto">{formatGs(s.monto)}</span> },
    { header: 'Estado', render: (s) => <EstadoDocumentoBadge estado={s.estado} /> },
    {
      header: 'Acciones',
      align: 'center',
      render: (s) =>
        s.estado === 'REGISTRADO' ? (
          <button
            className="btn-ghost"
            onClick={() => {
              setErrorAnulacion(null);
              setAAnular(s);
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
      <h3 className="fin-section-title">Saldos iniciales</h3>
      <p className="fin-hint">
        Cargá lo que cada fondo ya tenía al empezar a usar Finanzas. Solo puede haber un saldo inicial
        activo por fondo.
      </p>

      <form onSubmit={handleSubmit} noValidate style={{ marginBottom: 24 }}>
        {errorBase && <div className="fin-error-box" role="alert">{errorBase}</div>}
        {periodoCerrado && <AvisoPeriodoCerrado periodo={periodoCerrado} />}
        <div className="form-grid">
          <Campo label="Fondo" htmlFor="saldo-fondo" error={errores.fondo}>
            <select
              id="saldo-fondo"
              className={`input-field ${errores.fondo ? 'input-error' : ''}`}
              value={valores.fondo}
              onChange={(e) => set('fondo', e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Elegí un fondo</option>
              {fondosActivos.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Fecha" htmlFor="saldo-fecha" error={errores.fecha}>
            <input
              id="saldo-fecha"
              type="date"
              className={`input-field ${errores.fecha ? 'input-error' : ''}`}
              value={valores.fecha}
              onChange={(e) => set('fecha', e.target.value)}
            />
          </Campo>
          <CampoMonto
            id="saldo-monto"
            label="Monto"
            value={valores.monto}
            onChange={(v) => set('monto', v)}
            error={errores.monto}
          />
        </div>
        <div className="fin-form-actions">
          <button type="submit" className="btn-primary-sm" disabled={saving || !!periodoCerrado}>
            {saving ? 'Guardando…' : 'Registrar saldo inicial'}
          </button>
        </div>
      </form>

      {errorLista && <div className="fin-error-box" role="alert">{errorLista}</div>}
      {loading ? (
        <div className="loader" />
      ) : (
        <DataTable
          data={saldos}
          columns={columns}
          emptyMessage="Todavía no hay saldos iniciales."
          keyExtractor={(s) => s.id}
        />
      )}

      <ConfirmarAnulacionModal
        isOpen={!!aAnular}
        titulo="Anular saldo inicial"
        error={errorAnulacion}
        saving={anulando}
        onConfirm={confirmarAnulacion}
        onClose={() => setAAnular(null)}
      >
        {aAnular && (
          <p style={{ margin: 0 }}>
            ¿Anular el saldo inicial de <strong>{nombreFondo(aAnular.fk_cuenta_fondo)}</strong> por{' '}
            <strong>{formatGs(aAnular.monto)}</strong>?
          </p>
        )}
      </ConfirmarAnulacionModal>
    </section>
  );
}
