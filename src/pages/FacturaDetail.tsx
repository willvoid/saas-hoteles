import { useEffect, useState } from 'react';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { Modal } from '../components/Modal';
import TicketImprimible from '../components/TicketImprimible';
import { facturaService } from '../services/facturaService';
import { cobroService } from '../services/cobroService';
import { getTransitionCopy, canTransition } from '../utils/facturaEstado';
import { formatGs } from '../utils/currency';
import { canAccessFinanzas, type Role } from '../utils/permissions';
import { etiquetaCondicion, mensajeDeError } from '../utils/facturaCredito';
import { CONDICION_VENTA_CREDITO, type MotivoItem, type TicketData } from '../types/factura';
import type { CobroListado } from '../types/finanzas';
import type { TenantModulos } from '../services/tenantService';
import '../index.css';
import { COLORS, tint } from '../constants/colors';

interface FacturaDetailProps {
  facturaId: number;
  onBack: () => void;
  /** Receptionists see the sale condition but never balances or cobros. */
  role: Role;
  modulos?: TenantModulos;
}

const panelStyle: React.CSSProperties = {
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: 16,
  padding: 24,
};

const ESTADO_COLOR: Record<string, string> = {
  EMITIDA: COLORS.success,
  ANULADA: COLORS.error,
};

// The embedded detalle_factura rows are not described by the generated types.
interface LineaDetalle {
  id_detalle: number;
  descripcion: string | null;
  cantidad: number;
  monto: number;
  subtotal: number;
  iva_aplicado: number;
  estado: string;
  concepto?: { nombre: string } | null;
}

type FacturaConDetalle = Awaited<ReturnType<typeof facturaService.getFacturaById>>;

export default function FacturaDetail({ facturaId, onBack, role, modulos }: FacturaDetailProps) {
  const verFinanzas = canAccessFinanzas(role, modulos ?? { contabilidad: false });
  const [factura, setFactura] = useState<FacturaConDetalle | null>(null);
  const [cobros, setCobros] = useState<CobroListado[]>([]);
  const [motivos, setMotivos] = useState<MotivoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [anularOpen, setAnularOpen] = useState(false);
  const [motivoSel, setMotivoSel] = useState<number | ''>('');
  const [anulando, setAnulando] = useState(false);
  // Shown inside the modal: the page banner sits behind it.
  const [anularError, setAnularError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [data, refs] = await Promise.all([
        facturaService.getFacturaById(facturaId),
        facturaService.getReferencias(),
      ]);
      setFactura(data);
      // Cobros are admin/gerente only (RLS also closes them to other roles).
      if (verFinanzas && data.condicion_venta === CONDICION_VENTA_CREDITO) {
        setCobros(await cobroService.getCobrosPorFactura(facturaId));
      } else {
        setCobros([]);
      }
      setMotivos(refs.motivos as unknown as MotivoItem[]);
      if (refs.motivos.length > 0) setMotivoSel((prev) => prev || refs.motivos[0].id_motivos);
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'Error al cargar la factura.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturaId]);

  const handleAnular = async () => {
    if (!motivoSel) {
      setError('Elegí un motivo de anulación.');
      return;
    }
    setAnularError(null);
    try {
      setAnulando(true);
      await facturaService.anularFactura(facturaId, Number(motivoSel));
      setAnularOpen(false);
      await load();
    } catch (err: unknown) {
      // Includes the database message when the invoice still has active cobros.
      setAnularError(mensajeDeError(err, 'No se pudo anular la factura.'));
    } finally {
      setAnulando(false);
    }
  };

  const backAction = (
    <button className="btn-ghost" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <ArrowLeft size={16} /> Volver
    </button>
  );

  if (loading) {
    return (
      <ModuleLayout title="Factura" description="Cargando…" actions={backAction}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      </ModuleLayout>
    );
  }

  if (!factura) {
    return (
      <ModuleLayout title="Factura" description="" actions={backAction}>
        <div className="status-message status-error">{error || 'Factura no encontrada.'}</div>
      </ModuleLayout>
    );
  }

  const esCredito = factura.condicion_venta === CONDICION_VENTA_CREDITO;
  const puedeAnular = canTransition(factura.estado, 'ANULADA');
  const copy = getTransitionCopy('ANULADA');
  const detalle = ((factura.detalle_factura ?? []) as LineaDetalle[]).filter((d) => d.estado !== 'INACTIVO');

  const ticketData: TicketData = {
    establecimiento: factura.establecimiento,
    nroSecuencial: factura.nro_secuencial,
    fechaEmision: factura.fecha_emision,
    clienteNombre: factura.cliente?.razon_social || 'Consumidor final',
    clienteDocumento: factura.cliente?.documento,
    // The ticket prints this under "Pago:"; a credit sale has no payment method.
    modoPago: esCredito ? 'Crédito' : factura.modo_pago?.descripcion,
    estado: factura.estado,
    lineas: detalle.map((d) => ({
      id_detalle: d.id_detalle,
      descripcion: d.descripcion || d.concepto?.nombre || 'Consumo',
      cantidad: Number(d.cantidad),
      monto: Number(d.monto),
      subtotal: Number(d.subtotal),
    })),
    totalGeneral: Number(factura.total_general),
    efectivo: Number(factura.efectivo),
    vuelto: Number(factura.vuelto),
  };

  const anularAction = (
    <>
      {backAction}
      <button
        className="btn-ghost"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        onClick={() => setPrintOpen(true)}
      >
        <Printer size={16} /> Imprimir
      </button>
      {puedeAnular && (
        <button
          className="btn-ghost"
          style={{ color: COLORS.error, borderColor: tint('error', 0.4), display: 'inline-flex', alignItems: 'center', gap: 8 }}
          onClick={() => { setAnularError(null); setAnularOpen(true); }}
        >
          <Ban size={16} /> Anular
        </button>
      )}
    </>
  );

  return (
    <ModuleLayout
      title={`Factura Nº ${factura.nro_secuencial}`}
      description="Ticket interno"
      actions={anularAction}
    >
      {error && <div className="status-message status-error" style={{ marginBottom: 20 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {factura.cliente?.razon_social || 'Consumidor final'}
            </span>
            <span className="status-badge" style={{ '--badge-color': ESTADO_COLOR[factura.estado] || COLORS.textSecondary } as React.CSSProperties}>
              {factura.estado}
            </span>
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0, fontSize: 14 }}>
            <dt style={{ color: 'var(--text-secondary)' }}>Documento</dt>
            <dd style={{ margin: 0 }}>{factura.cliente?.documento || '—'}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Fecha</dt>
            <dd style={{ margin: 0 }}>{new Date(factura.fecha_emision).toLocaleString()}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Condición de venta</dt>
            <dd style={{ margin: 0 }}>{etiquetaCondicion(factura.condicion_venta)}</dd>
            {!esCredito && (
              <>
                <dt style={{ color: 'var(--text-secondary)' }}>Modo de pago</dt>
                <dd style={{ margin: 0 }}>{factura.modo_pago?.descripcion || '—'}</dd>
              </>
            )}
            {esCredito && verFinanzas && (
              <>
                <dt style={{ color: 'var(--text-secondary)' }}>Vencimiento</dt>
                <dd style={{ margin: 0 }}>
                  {factura.fecha_vencimiento
                    ? new Date(`${factura.fecha_vencimiento}T00:00:00`).toLocaleDateString()
                    : '—'}
                </dd>
                <dt style={{ color: 'var(--text-secondary)' }}>Saldo pendiente</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{formatGs(Number(factura.saldo_pendiente ?? 0))}</dd>
              </>
            )}
            {factura.fk_folio && (
              <>
                <dt style={{ color: 'var(--text-secondary)' }}>Folio</dt>
                <dd style={{ margin: 0 }}>#{factura.fk_folio}</dd>
              </>
            )}
            {factura.estado === 'ANULADA' && (
              <>
                <dt style={{ color: 'var(--text-secondary)' }}>Motivo</dt>
                <dd style={{ margin: 0 }}>{factura.motivo?.descripcion || '—'}</dd>
              </>
            )}
          </dl>
        </div>

        <div style={panelStyle}>
          <h3 className="section-title" style={{ marginTop: 0 }}>Detalle</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 13 }}>
                  <th style={{ padding: '8px 8px' }}>Concepto</th>
                  <th style={{ padding: '8px 8px' }}>IVA</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right' }}>Cant.</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right' }}>P. Unit.</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {detalle.map((d) => (
                  <tr key={d.id_detalle} style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '8px 8px' }}>{d.descripcion || d.concepto?.nombre}</td>
                    <td style={{ padding: '8px 8px' }}>{Number(d.iva_aplicado) === 0 ? 'Exenta' : `${d.iva_aplicado}%`}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{Number(d.cantidad)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{formatGs(d.monto)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{formatGs(d.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {esCredito && verFinanzas && (
          <div style={panelStyle}>
            <h3 className="section-title" style={{ marginTop: 0 }}>Cobros</h3>
            {cobros.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Todavía no se registraron cobros.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 13 }}>
                      <th style={{ padding: '8px 8px' }}>Fecha</th>
                      <th style={{ padding: '8px 8px' }}>Fondo</th>
                      <th style={{ padding: '8px 8px' }}>Estado</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobros.map((c) => (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '8px 8px' }}>{new Date(`${c.fecha}T00:00:00`).toLocaleDateString()}</td>
                        <td style={{ padding: '8px 8px' }}>{c.fondo?.nombre || '—'}</td>
                        <td style={{ padding: '8px 8px' }}>{c.estado === 'ANULADO' ? 'Anulado' : 'Registrado'}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{formatGs(c.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ ...panelStyle, maxWidth: 360, alignSelf: 'flex-end', width: '100%' }}>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px', margin: 0 }}>
            <dt style={{ color: 'var(--text-secondary)' }}>Gravado 10%</dt>
            <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(factura.total_gravado_10)}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Gravado 5%</dt>
            <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(factura.total_gravado_5)}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Exenta</dt>
            <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(factura.total_exenta)}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>IVA</dt>
            <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(factura.total_iva)}</dd>
            {Number(factura.descuento_global) > 0 && (
              <>
                <dt style={{ color: 'var(--text-secondary)' }}>Descuento</dt>
                <dd style={{ margin: 0, textAlign: 'right' }}>- {formatGs(factura.descuento_global)}</dd>
              </>
            )}
            <dt style={{ fontWeight: 700, fontSize: 18, paddingTop: 8 }}>Total</dt>
            <dd style={{ margin: 0, textAlign: 'right', fontWeight: 700, fontSize: 18, paddingTop: 8, color: COLORS.successLight }}>
              {formatGs(factura.total_general)}
            </dd>
            {Number(factura.vuelto) > 0 && (
              <>
                <dt style={{ color: 'var(--text-secondary)' }}>Efectivo</dt>
                <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(factura.efectivo)}</dd>
                <dt style={{ color: 'var(--text-secondary)' }}>Vuelto</dt>
                <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(factura.vuelto)}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      <Modal
        isOpen={anularOpen}
        onClose={() => setAnularOpen(false)}
        title={copy.title}
        maxWidth={440}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setAnularOpen(false)} disabled={anulando}>Cancelar</button>
            <button
              className="btn-ghost"
              style={{ color: COLORS.error, borderColor: tint('error', 0.4) }}
              onClick={handleAnular}
              disabled={anulando}
            >
              {anulando ? 'Procesando…' : copy.confirmLabel}
            </button>
          </div>
        }
      >
        {anularError && <div className="status-message status-error" style={{ marginBottom: 16 }}>{anularError}</div>}
        <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{copy.message}</p>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="motivo">Motivo</label>
          <select
            id="motivo"
            className="input-field"
            value={motivoSel}
            onChange={(e) => setMotivoSel(e.target.value ? Number(e.target.value) : '')}
          >
            {motivos.length === 0 && <option value="">No hay motivos configurados</option>}
            {motivos.map((m) => (
              <option key={m.id_motivos} value={m.id_motivos}>{m.descripcion}</option>
            ))}
          </select>
        </div>
      </Modal>

      <Modal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Vista previa del ticket"
        maxWidth={420}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setPrintOpen(false)}>Cancelar</button>
            <button className="btn-primary-sm" onClick={() => window.print()}>Imprimir</button>
          </div>
        }
      >
        <TicketImprimible data={ticketData} />
      </Modal>
    </ModuleLayout>
  );
}
