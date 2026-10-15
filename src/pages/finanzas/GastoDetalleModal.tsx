import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '../../components/Modal';
import { EstadoDocumentoBadge } from '../../components/finanzas/EstadoBadge';
import { cobroService } from '../../services/cobroService';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import type { GastoListado, PagoListado } from '../../types/finanzas';

interface GastoDetalleModalProps {
  gasto: GastoListado;
  onClose: () => void;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <div className="fin-muted" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{etiqueta}</div>
      <div style={{ color: 'var(--text-primary)' }}>{children}</div>
    </div>
  );
}

// Read-only detail of an expense; credit ones also list their payments.
export default function GastoDetalleModal({ gasto, onClose }: GastoDetalleModalProps) {
  const credito = gasto.condicion === 'credito';
  const [pagos, setPagos] = useState<PagoListado[]>([]);
  const [cargandoPagos, setCargandoPagos] = useState(credito);
  const [errorPagos, setErrorPagos] = useState<string | null>(null);

  useEffect(() => {
    if (!credito) return;
    let cancelled = false;
    cobroService
      .getPagosPorGasto(gasto.id)
      .then((rows) => {
        if (!cancelled) setPagos(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorPagos(mensajeDeError(err, 'No se pudieron cargar los pagos.'));
      })
      .finally(() => {
        if (!cancelled) setCargandoPagos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [credito, gasto.id]);

  return (
    <Modal isOpen onClose={onClose} title={`Gasto #${gasto.id}`} maxWidth={640}>
      <div className="form-grid" style={{ rowGap: 16, marginBottom: 20 }}>
        <Dato etiqueta="Fecha">{gasto.fecha}</Dato>
        <Dato etiqueta="Estado"><EstadoDocumentoBadge estado={gasto.estado} /></Dato>
        <Dato etiqueta="Categoría">{gasto.categoria?.nombre ?? '-'}</Dato>
        <Dato etiqueta="Proveedor">
          {gasto.proveedor ? `${gasto.proveedor.nombre}${gasto.proveedor.ruc ? ` (${gasto.proveedor.ruc})` : ''}` : '-'}
        </Dato>
        <Dato etiqueta="Nº de comprobante">{gasto.nro_comprobante ?? '-'}</Dato>
        <Dato etiqueta="Condición">{credito ? 'Crédito' : 'Contado'}</Dato>
        {credito ? (
          <>
            <Dato etiqueta="Vencimiento">{gasto.fecha_vencimiento ?? '-'}</Dato>
            <Dato etiqueta="Saldo pendiente">{formatGs(gasto.saldo_pendiente)}</Dato>
          </>
        ) : (
          <Dato etiqueta="Fondo de pago">{gasto.fondo?.nombre ?? '-'}</Dato>
        )}
        {gasto.observacion && <Dato etiqueta="Observación">{gasto.observacion}</Dato>}
      </div>

      <table className="fin-sub-table" style={{ marginBottom: 20 }}>
        <tbody>
          <tr><td>Gravado 10%</td><td className="fin-monto">{formatGs(gasto.gravado_10)}</td></tr>
          <tr><td>Gravado 5%</td><td className="fin-monto">{formatGs(gasto.gravado_5)}</td></tr>
          <tr><td>Exento</td><td className="fin-monto">{formatGs(gasto.exenta)}</td></tr>
          <tr><td>IVA 10%</td><td className="fin-monto">{formatGs(gasto.iva_10)}</td></tr>
          <tr><td>IVA 5%</td><td className="fin-monto">{formatGs(gasto.iva_5)}</td></tr>
          <tr><td><strong>Total</strong></td><td className="fin-monto"><strong>{formatGs(gasto.total)}</strong></td></tr>
        </tbody>
      </table>

      {credito && (
        <>
          <h4 className="fin-section-title">Pagos</h4>
          {errorPagos && <div className="fin-error-box" role="alert">{errorPagos}</div>}
          {cargandoPagos ? (
            <div className="loader" />
          ) : pagos.length === 0 ? (
            <p className="fin-hint">Todavía no hay pagos registrados para este gasto.</p>
          ) : (
            <table className="fin-sub-table">
              <thead>
                <tr><th>Fecha</th><th>Fondo</th><th>Estado</th><th style={{ textAlign: 'right' }}>Monto</th></tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.fecha}</td>
                    <td>{p.fondo?.nombre ?? '-'}</td>
                    <td><EstadoDocumentoBadge estado={p.estado} /></td>
                    <td className="fin-monto">{formatGs(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  );
}
