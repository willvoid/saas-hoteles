import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { ConfirmarAnulacionModal } from '../../components/finanzas/ConfirmarAnulacionModal';
import { EstadoDocumentoBadge } from '../../components/finanzas/EstadoBadge';
import { RangoFechas } from '../../components/finanzas/RangoFechas';
import { useFinanzasCatalogos } from '../../hooks/useFinanzasCatalogos';
import { cobroService } from '../../services/cobroService';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import { rangoMesActual } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import type { PagoListado } from '../../types/finanzas';
import PagoFormModal from './PagoFormModal';
import { usePeriodosCerrados } from '../../hooks/usePeriodosCerrados';

// Payments against credit expenses (accounts payable): list by date range,
// "Registrar pago" form and annulment.
export default function PagosPanel() {
  const catalogos = useFinanzasCatalogos();
  const { periodos, periodoCerradoDe } = usePeriodosCerrados();

  const [rango, setRango] = useState(() => rangoMesActual(fechaNegocioHoy()));
  const [pagos, setPagos] = useState<PagoListado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const [creando, setCreando] = useState(false);
  const [aAnular, setAAnular] = useState<PagoListado | null>(null);
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);

  useEffect(() => {
    // An empty date means "no range yet": nothing to ask the database.
    if (!rango.desde || !rango.hasta) {
      setPagos([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    cobroService
      .getPagos(rango.desde, rango.hasta)
      .then((rows) => {
        if (cancelled) return;
        setPagos(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(mensajeDeError(err, 'No se pudieron cargar los pagos.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rango, recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const confirmarAnulacion = async () => {
    if (!aAnular) return;
    setAnulando(true);
    setErrorAnulacion(null);
    try {
      await cobroService.anularPago(aAnular.id);
      setAAnular(null);
      recargar();
    } catch (err: unknown) {
      setErrorAnulacion(mensajeDeError(err, 'No se pudo anular el pago.'));
    } finally {
      setAnulando(false);
    }
  };

  const total = pagos.filter((p) => p.estado === 'REGISTRADO').reduce((s, p) => s + Number(p.monto), 0);

  const columns: Column<PagoListado>[] = [
    { header: 'Fecha', render: (p) => p.fecha },
    {
      header: 'Gasto',
      render: (p) => (
        <div>
          <div>{p.gasto?.proveedor?.nombre ?? 'Sin proveedor'}</div>
          <div className="fin-muted">{p.gasto?.nro_comprobante ?? `Gasto #${p.fk_gasto}`}</div>
        </div>
      ),
    },
    { header: 'Fondo', render: (p) => p.fondo?.nombre ?? '-' },
    { header: 'Monto', align: 'right', render: (p) => <span className="fin-monto">{formatGs(p.monto)}</span> },
    { header: 'Observación', render: (p) => p.observacion ?? '-' },
    { header: 'Estado', render: (p) => <EstadoDocumentoBadge estado={p.estado} /> },
    {
      header: 'Acciones',
      align: 'center',
      render: (p) =>
        p.estado === 'REGISTRADO' ? (
          <button
            className="btn-ghost"
            onClick={() => {
              setErrorAnulacion(null);
              setAAnular(p);
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
    <div className="tab-content">
      <div className="fin-toolbar">
        <div className="fin-total">Total pagado: {formatGs(total)}</div>
        <button className="btn-primary-sm" onClick={() => setCreando(true)} disabled={catalogos.loading}>
          <Plus size={15} /> Registrar pago
        </button>
      </div>

      <div className="fin-filtros">
        <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
      </div>

      {(error || catalogos.error) && (
        <div className="fin-error-box" role="alert">{error ?? catalogos.error}</div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        <DataTable
          data={pagos}
          columns={columns}
          emptyMessage="No hay pagos en el período elegido."
          keyExtractor={(p) => p.id}
        />
      )}

      {creando && (
        <PagoFormModal
          fondos={catalogos.fondos}
          periodos={periodos}
          periodoCerradoDe={periodoCerradoDe}
          onClose={() => setCreando(false)}
          onSaved={() => {
            setCreando(false);
            recargar();
          }}
        />
      )}

      <ConfirmarAnulacionModal
        isOpen={!!aAnular}
        titulo="Anular pago"
        error={errorAnulacion}
        saving={anulando}
        onConfirm={confirmarAnulacion}
        onClose={() => setAAnular(null)}
      >
        {aAnular && (
          <p style={{ margin: 0 }}>
            ¿Anular el pago del <strong>{aAnular.fecha}</strong> por <strong>{formatGs(aAnular.monto)}</strong>? El
            saldo del gasto vuelve a subir y se revierte su asiento contable.
          </p>
        )}
      </ConfirmarAnulacionModal>
    </div>
  );
}
