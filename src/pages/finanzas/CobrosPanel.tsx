import { useMemo, useState } from 'react';
import { HandCoins } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { ConfirmarAnulacionModal } from '../../components/finanzas/ConfirmarAnulacionModal';
import { EstadoBadge, EstadoDocumentoBadge } from '../../components/finanzas/EstadoBadge';
import { RangoFechas } from '../../components/finanzas/RangoFechas';
import { COLORS } from '../../constants/colors';
import { useFinanzasCatalogos } from '../../hooks/useFinanzasCatalogos';
import { useCobros } from '../../hooks/useCobros';
import { usePeriodosCerrados } from '../../hooks/usePeriodosCerrados';
import { cobroService } from '../../services/cobroService';
import { bucketVencimiento, diasVencido } from '../../utils/aging';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import { filtrarPorCliente, rangoMesActual } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import type { CobroListado, FacturaPendiente } from '../../types/finanzas';
import CobroFormModal from './CobroFormModal';

/** Due date of an invoice; the issue day when it has none (same as fn_rep_cxc). */
const vencimientoDe = (f: FacturaPendiente): string => f.fecha_vencimiento ?? f.fecha_emision;

// Accounts receivable: credit invoices with a balance ("Por cobrar") with the
// "Registrar cobro" action, and the collections already registered, which can
// be annulled. Both sections reload after any change.
export default function CobrosPanel() {
  const catalogos = useFinanzasCatalogos();
  const { periodos, periodoCerradoDe } = usePeriodosCerrados();
  const hoy = fechaNegocioHoy();

  const [filtroCliente, setFiltroCliente] = useState('');
  const [rango, setRango] = useState(() => rangoMesActual(hoy));
  const {
    pendientes, cargandoPend, errorPend, cobros, cargandoCobros, errorCobros, recargar,
  } = useCobros(rango);

  const [cobrando, setCobrando] = useState<FacturaPendiente | null>(null);
  const [aAnular, setAAnular] = useState<CobroListado | null>(null);
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);

  const confirmarAnulacion = async () => {
    if (!aAnular) return;
    setAnulando(true);
    setErrorAnulacion(null);
    try {
      await cobroService.anularCobro(aAnular.id);
      setAAnular(null);
      recargar();
    } catch (err: unknown) {
      setErrorAnulacion(mensajeDeError(err, 'No se pudo anular el cobro.'));
    } finally {
      setAnulando(false);
    }
  };

  const visibles = useMemo(() => filtrarPorCliente(pendientes, filtroCliente), [pendientes, filtroCliente]);
  const totalSaldos = visibles.reduce((s, f) => s + Number(f.saldo_pendiente), 0);
  const totalCobrado = cobros
    .filter((c) => c.estado === 'REGISTRADO')
    .reduce((s, c) => s + Number(c.monto), 0);

  const columnasPendientes: Column<FacturaPendiente>[] = [
    {
      header: 'Cliente',
      render: (f) => (
        <div>
          <div>{f.cliente?.razon_social ?? 'Sin cliente'}</div>
          {f.cliente?.documento && <div className="fin-muted">{f.cliente.documento}</div>}
        </div>
      ),
    },
    { header: 'Factura', render: (f) => `Nº ${f.nro_secuencial}` },
    { header: 'Emisión', render: (f) => f.fecha_emision },
    {
      header: 'Vencimiento',
      render: (f) => {
        const venc = vencimientoDe(f);
        const dias = diasVencido(venc, hoy);
        return (
          <div>
            <div>{venc}</div>
            {dias > 0 ? (
              <EstadoBadge etiqueta={`Vencida hace ${dias} d (${bucketVencimiento(dias)})`} color={COLORS.error} />
            ) : (
              <EstadoBadge etiqueta="Vigente" color={COLORS.success} />
            )}
          </div>
        );
      },
    },
    { header: 'Total', align: 'right', render: (f) => <span className="fin-monto">{formatGs(f.total_general)}</span> },
    { header: 'Saldo', align: 'right', render: (f) => <span className="fin-monto">{formatGs(f.saldo_pendiente)}</span> },
    {
      header: 'Acciones',
      align: 'center',
      render: (f) => (
        <button className="btn-primary-sm" onClick={() => setCobrando(f)} disabled={catalogos.loading}>
          <HandCoins size={15} /> Registrar cobro
        </button>
      ),
    },
  ];

  const columnasCobros: Column<CobroListado>[] = [
    { header: 'Fecha', render: (c) => c.fecha },
    {
      header: 'Factura',
      render: (c) => (
        <div>
          <div>{c.factura?.cliente?.razon_social ?? 'Sin cliente'}</div>
          <div className="fin-muted">{c.factura ? `Factura Nº ${c.factura.nro_secuencial}` : `Factura #${c.fk_factura}`}</div>
        </div>
      ),
    },
    { header: 'Fondo', render: (c) => c.fondo?.nombre ?? '-' },
    { header: 'Monto', align: 'right', render: (c) => <span className="fin-monto">{formatGs(c.monto)}</span> },
    { header: 'Observación', render: (c) => c.observacion ?? '-' },
    { header: 'Estado', render: (c) => <EstadoDocumentoBadge estado={c.estado} /> },
    {
      header: 'Acciones',
      align: 'center',
      render: (c) =>
        c.estado === 'REGISTRADO' ? (
          <button
            className="btn-ghost"
            onClick={() => {
              setErrorAnulacion(null);
              setAAnular(c);
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
      <h3 className="fin-seccion-titulo">Por cobrar</h3>
      <div className="fin-toolbar">
        <div className="fin-total">Total por cobrar: {formatGs(totalSaldos)}</div>
        <input
          className="input-field fin-filtro-texto"
          type="search"
          placeholder="Filtrar por cliente o documento"
          aria-label="Filtrar por cliente"
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
        />
      </div>

      {(errorPend || catalogos.error) && (
        <div className="fin-error-box" role="alert">{errorPend ?? catalogos.error}</div>
      )}

      {cargandoPend ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        <DataTable
          data={visibles}
          columns={columnasPendientes}
          emptyMessage="No hay facturas a crédito con saldo pendiente."
          keyExtractor={(f) => f.id_factura}
        />
      )}

      <h3 className="fin-seccion-titulo">Cobros registrados</h3>
      <div className="fin-toolbar">
        <div className="fin-total">Total cobrado: {formatGs(totalCobrado)}</div>
      </div>
      <div className="fin-filtros">
        <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
      </div>

      {errorCobros && <div className="fin-error-box" role="alert">{errorCobros}</div>}

      {cargandoCobros ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        <DataTable
          data={cobros}
          columns={columnasCobros}
          emptyMessage="No hay cobros en el período elegido."
          keyExtractor={(c) => c.id}
        />
      )}

      {cobrando && (
        <CobroFormModal
          factura={cobrando}
          fondos={catalogos.fondos}
          periodos={periodos}
          periodoCerradoDe={periodoCerradoDe}
          onClose={() => setCobrando(null)}
          onSaved={() => {
            setCobrando(null);
            recargar();
          }}
        />
      )}

      <ConfirmarAnulacionModal
        isOpen={!!aAnular}
        titulo="Anular cobro"
        error={errorAnulacion}
        saving={anulando}
        onConfirm={confirmarAnulacion}
        onClose={() => setAAnular(null)}
      >
        {aAnular && (
          <p style={{ margin: 0 }}>
            ¿Anular el cobro del <strong>{aAnular.fecha}</strong> por <strong>{formatGs(aAnular.monto)}</strong>? El
            saldo de la factura vuelve a subir y se revierte su asiento contable.
          </p>
        )}
      </ConfirmarAnulacionModal>
    </div>
  );
}
