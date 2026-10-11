import { formatGs } from '../utils/currency';
import type { TicketData } from '../types/factura';

interface TicketImprimibleProps {
  data: TicketData;
}

/**
 * Ticket de uso interno, no una factura formal: sin IVA, sin timbrado, sin
 * CDC/QR. Se renderiza SIEMPRE en tema claro (papel blanco/texto negro), sin
 * depender de las variables de tema oscuro de la app, para que la vista
 * previa en pantalla sea igual a lo que se imprime.
 */
export default function TicketImprimible({ data }: TicketImprimibleProps) {
  const estab = data.establecimiento;
  const direccion = estab
    ? [estab.direccion, estab.numero_casa, estab.complemento_direccion_1].filter(Boolean).join(' ')
    : '';
  const nombreEmpresa = estab?.empresa?.nombre_fantasia || estab?.empresa?.razon_social;

  return (
    <div
      id="ticket-imprimible"
      style={{
        background: '#fff',
        color: '#000',
        width: '100%',
        maxWidth: 340,
        margin: '0 auto',
        padding: 16,
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        {estab?.denominacion && <div style={{ fontWeight: 700, fontSize: 14 }}>{estab.denominacion}</div>}
        {nombreEmpresa && <div>{nombreEmpresa}</div>}
        {direccion && <div>{direccion}</div>}
        {estab?.telefono && <div>Tel: {estab.telefono}</div>}
        {estab?.email && <div>{estab.email}</div>}
      </div>

      <div style={{ border: '1px solid #000', padding: 6, marginBottom: 10, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>
          Documento de uso interno
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div>Ticket Nº {data.nroSecuencial}</div>
        <div>Fecha: {new Date(data.fechaEmision).toLocaleString()}</div>
        <div>Cliente: {data.clienteNombre}</div>
        <div>Doc: {data.clienteDocumento || '—'}</div>
        <div>Pago: {data.modoPago || '—'}</div>
        {data.estado === 'ANULADA' && (
          <div style={{ fontWeight: 700, textAlign: 'center', marginTop: 6 }}>*** ANULADA ***</div>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

      {data.lineas.map((l) => (
        <div key={l.id_detalle} style={{ marginBottom: 6 }}>
          <div>{l.descripcion}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{l.cantidad} x {formatGs(l.monto)}</span>
            <span>{formatGs(l.subtotal)}</span>
          </div>
        </div>
      ))}

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
        <span>TOTAL</span>
        <span>{formatGs(data.totalGeneral)}</span>
      </div>
      {Number(data.vuelto) > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Efectivo</span>
            <span>{formatGs(data.efectivo)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Vuelto</span>
            <span>{formatGs(data.vuelto)}</span>
          </div>
        </>
      )}
    </div>
  );
}
