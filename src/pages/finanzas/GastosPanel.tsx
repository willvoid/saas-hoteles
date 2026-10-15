import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { Campo } from '../../components/finanzas/Campo';
import { ConfirmarAnulacionModal } from '../../components/finanzas/ConfirmarAnulacionModal';
import { EstadoBadge, EstadoDocumentoBadge } from '../../components/finanzas/EstadoBadge';
import { RangoFechas } from '../../components/finanzas/RangoFechas';
import { COLORS } from '../../constants/colors';
import { useFinanzasCatalogos } from '../../hooks/useFinanzasCatalogos';
import { gastoService } from '../../services/gastoService';
import type { FiltrosGasto } from '../../services/gastoService';
import { bucketVencimiento, diasVencido } from '../../utils/aging';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import { rangoMesActual } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import type { CondicionGasto, EstadoDocumento, GastoListado } from '../../types/finanzas';
import GastoDetalleModal from './GastoDetalleModal';
import GastoFormModal from './GastoFormModal';
import { usePeriodosCerrados } from '../../hooks/usePeriodosCerrados';

/** Open credit expenses only: annulled or fully paid ones are not "due". */
function diasDeMora(g: GastoListado, hoy: string): number {
  if (g.condicion !== 'credito' || g.estado !== 'REGISTRADO' || Number(g.saldo_pendiente) <= 0) return 0;
  return diasVencido(g.fecha_vencimiento ?? g.fecha, hoy);
}

// Expense list with filters, the "Nuevo gasto" form, detail and annulment.
export default function GastosPanel() {
  const hoy = fechaNegocioHoy();
  const catalogos = useFinanzasCatalogos();
  const { periodos, periodoCerradoDe } = usePeriodosCerrados();

  const [rango, setRango] = useState(() => rangoMesActual(hoy));
  const [estado, setEstado] = useState<EstadoDocumento | ''>('');
  const [condicion, setCondicion] = useState<CondicionGasto | ''>('');
  const [proveedor, setProveedor] = useState<number | ''>('');

  const [gastos, setGastos] = useState<GastoListado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const [creando, setCreando] = useState(false);
  const [detalle, setDetalle] = useState<GastoListado | null>(null);
  const [aAnular, setAAnular] = useState<GastoListado | null>(null);
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);

  const filtros = useMemo<FiltrosGasto>(
    () => ({
      desde: rango.desde || undefined,
      hasta: rango.hasta || undefined,
      estado: estado || undefined,
      condicion: condicion || undefined,
      fk_proveedor: proveedor === '' ? undefined : proveedor,
    }),
    [rango, estado, condicion, proveedor],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    gastoService
      .getGastos(filtros)
      .then((rows) => {
        if (cancelled) return;
        setGastos(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(mensajeDeError(err, 'No se pudieron cargar los gastos.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filtros, recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const confirmarAnulacion = async () => {
    if (!aAnular) return;
    setAnulando(true);
    setErrorAnulacion(null);
    try {
      await gastoService.anularGasto(aAnular.id);
      setAAnular(null);
      recargar();
    } catch (err: unknown) {
      // Shown verbatim: active payments, closed month...
      setErrorAnulacion(mensajeDeError(err, 'No se pudo anular el gasto.'));
    } finally {
      setAnulando(false);
    }
  };

  // Annulled expenses stay listed but do not count towards the total.
  const total = gastos.filter((g) => g.estado === 'REGISTRADO').reduce((s, g) => s + Number(g.total), 0);

  const columns: Column<GastoListado>[] = [
    {
      header: 'Fecha',
      render: (g) => (
        <div>
          <div>{g.fecha}</div>
          <div className="fin-muted">{g.nro_comprobante ?? 'Sin comprobante'}</div>
        </div>
      ),
    },
    { header: 'Categoría', render: (g) => g.categoria?.nombre ?? '-' },
    { header: 'Proveedor', render: (g) => g.proveedor?.nombre ?? '-' },
    {
      header: 'Condición',
      render: (g) => <EstadoBadge etiqueta={g.condicion === 'credito' ? 'Crédito' : 'Contado'} color={g.condicion === 'credito' ? COLORS.warning : COLORS.textSecondary} />,
    },
    {
      header: 'Vencimiento',
      render: (g) => {
        if (g.condicion !== 'credito') return '-';
        const mora = diasDeMora(g, hoy);
        const venc = g.fecha_vencimiento ?? g.fecha;
        return mora > 0 ? (
          <span className="fin-vencido">{venc} · vencido {mora} d ({bucketVencimiento(mora)})</span>
        ) : (
          venc
        );
      },
    },
    { header: 'Total', align: 'right', render: (g) => <span className="fin-monto">{formatGs(g.total)}</span> },
    {
      header: 'Saldo',
      align: 'right',
      render: (g) =>
        g.condicion === 'credito' && g.estado === 'REGISTRADO' ? (
          <span className={`fin-monto ${diasDeMora(g, hoy) > 0 ? 'fin-vencido' : ''}`}>{formatGs(g.saldo_pendiente)}</span>
        ) : (
          '-'
        ),
    },
    { header: 'Estado', render: (g) => <EstadoDocumentoBadge estado={g.estado} /> },
    {
      header: 'Acciones',
      align: 'center',
      render: (g) => (
        <div className="fin-actions" style={{ justifyContent: 'center' }}>
          <button className="btn-ghost" onClick={() => setDetalle(g)}>Ver</button>
          {g.estado === 'REGISTRADO' && (
            <button
              className="btn-ghost"
              onClick={() => {
                setErrorAnulacion(null);
                setAAnular(g);
              }}
            >
              Anular
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="tab-content">
      <div className="fin-toolbar">
        <div className="fin-total">Total registrado: {formatGs(total)}</div>
        <button
          className="btn-primary-sm"
          onClick={() => setCreando(true)}
          disabled={catalogos.loading}
        >
          <Plus size={15} /> Nuevo gasto
        </button>
      </div>

      <div className="fin-filtros">
        <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
        <Campo label="Estado" htmlFor="gasto-f-estado">
          <select
            id="gasto-f-estado"
            className="input-field"
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoDocumento | '')}
          >
            <option value="">Todos</option>
            <option value="REGISTRADO">Registrado</option>
            <option value="ANULADO">Anulado</option>
          </select>
        </Campo>
        <Campo label="Condición" htmlFor="gasto-f-condicion">
          <select
            id="gasto-f-condicion"
            className="input-field"
            value={condicion}
            onChange={(e) => setCondicion(e.target.value as CondicionGasto | '')}
          >
            <option value="">Todas</option>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </select>
        </Campo>
        <Campo label="Proveedor" htmlFor="gasto-f-proveedor">
          <select
            id="gasto-f-proveedor"
            className="input-field"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todos</option>
            {catalogos.proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </Campo>
      </div>

      {(error || catalogos.error) && (
        <div className="fin-error-box" role="alert">{error ?? catalogos.error}</div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        <DataTable
          data={gastos}
          columns={columns}
          emptyMessage="No hay gastos para los filtros elegidos."
          keyExtractor={(g) => g.id}
        />
      )}

      {creando && (
        <GastoFormModal
          categorias={catalogos.categorias}
          proveedores={catalogos.proveedores}
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

      {detalle && <GastoDetalleModal gasto={detalle} onClose={() => setDetalle(null)} />}

      <ConfirmarAnulacionModal
        isOpen={!!aAnular}
        titulo="Anular gasto"
        error={errorAnulacion}
        saving={anulando}
        onConfirm={confirmarAnulacion}
        onClose={() => setAAnular(null)}
      >
        {aAnular && (
          <p style={{ margin: 0 }}>
            ¿Anular el gasto del <strong>{aAnular.fecha}</strong> por <strong>{formatGs(aAnular.total)}</strong>
            {aAnular.proveedor ? <> de <strong>{aAnular.proveedor.nombre}</strong></> : null}? Se revierte su
            asiento contable y no se puede deshacer.
          </p>
        )}
      </ConfirmarAnulacionModal>
    </div>
  );
}
