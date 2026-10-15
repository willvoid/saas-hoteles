import { useEffect, useState } from 'react';
import { Plus, ExternalLink, Search } from 'lucide-react';
import { facturaService } from '../services/facturaService';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { FilterChips, ChipOption } from '../components/FilterChips';
import { formatGs } from '../utils/currency';
import { canAccessFinanzas, type Role } from '../utils/permissions';
import { esPendiente, etiquetaCondicion, mensajeDeError } from '../utils/facturaCredito';
import { CONDICION_VENTA_CREDITO, type FacturaListItem } from '../types/factura';
import type { TenantModulos } from '../services/tenantService';
import '../index.css';
import { COLORS } from '../constants/colors';

interface ManageFacturasProps {
  onNewFactura: () => void;
  onViewFactura: (id: number) => void;
  /** Only admin/gerente with the `contabilidad` module see the receivable filter and balances. */
  role: Role;
  modulos?: TenantModulos;
}

const ESTADO_COLOR: Record<string, string> = {
  EMITIDA: COLORS.success,
  ANULADA: COLORS.error,
};

const chips: ChipOption<string>[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'EMITIDA', label: 'Emitidas' },
  { value: 'ANULADA', label: 'Anuladas' },
];
const chipPendientes: ChipOption<string> = { value: 'pendientes', label: 'Pendientes de cobro' };

export default function ManageFacturas({ onNewFactura, onViewFactura, role, modulos }: ManageFacturasProps) {
  const verFinanzas = canAccessFinanzas(role, modulos ?? { contabilidad: false });
  const [facturas, setFacturas] = useState<FacturaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('todas');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await facturaService.getFacturas();
        setFacturas((data || []) as unknown as FacturaListItem[]);
      } catch (err: unknown) {
        setError(mensajeDeError(err, 'Error al cargar las facturas.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = facturas.filter((f) => {
    if (filtro === 'pendientes') {
      if (!esPendiente(f)) return false;
    } else if (filtro !== 'todas' && f.estado !== filtro) {
      return false;
    }
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    const cliente = f.cliente?.razon_social || '';
    return (
      f.id_factura?.toString().includes(s) ||
      f.nro_secuencial?.toString().includes(s) ||
      cliente.toLowerCase().includes(s)
    );
  });

  const columns: Column<FacturaListItem>[] = [
    { header: 'Nº', render: (f) => <span style={{ fontWeight: 600 }}>#{f.nro_secuencial}</span> },
    { header: 'Cliente', render: (f) => f.cliente?.razon_social || 'Consumidor final' },
    { header: 'Fecha', render: (f) => <span style={{ color: 'var(--text-secondary)' }}>{new Date(f.fecha_emision).toLocaleString()}</span> },
    {
      header: 'Condición',
      render: (f) => (
        <span
          className="status-badge"
          style={{ '--badge-color': f.condicion_venta === CONDICION_VENTA_CREDITO ? COLORS.warning : COLORS.textSecondary } as React.CSSProperties}
        >
          {etiquetaCondicion(f.condicion_venta)}
        </span>
      ),
    },
    { header: 'Total', align: 'right', render: (f) => <span style={{ fontWeight: 600, color: COLORS.successLight }}>{formatGs(f.total_general)}</span> },
    ...(verFinanzas
      ? [{
          header: 'Saldo',
          align: 'right' as const,
          render: (f: FacturaListItem) =>
            f.condicion_venta === CONDICION_VENTA_CREDITO && f.estado === 'EMITIDA'
              ? formatGs(Number(f.saldo_pendiente ?? 0))
              : '—',
        }]
      : []),
    {
      header: 'Estado',
      render: (f) => (
        <span className="status-badge" style={{ '--badge-color': ESTADO_COLOR[f.estado] || COLORS.textSecondary } as React.CSSProperties}>
          {f.estado}
        </span>
      ),
    },
    {
      header: 'Acciones',
      align: 'center',
      render: (f) => (
        <button onClick={() => onViewFactura(f.id_factura)} className="btn-action blue" title="Ver factura">
          <ExternalLink size={16} /> Ver
        </button>
      ),
    },
  ];

  return (
    <ModuleLayout
      title="Facturación"
      description="Tickets internos emitidos."
      actions={
        <button className="btn-primary-sm" onClick={onNewFactura} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Nueva factura
        </button>
      }
    >
      <div className="filters-bar" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div className="search-box">
          <Search size={16} color={COLORS.textSecondary} />
          <input
            type="text"
            placeholder="Buscar por Nº o cliente…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="search-input"
          />
        </div>
        <FilterChips options={verFinanzas ? [...chips, chipPendientes] : chips} value={filtro} onChange={setFiltro} />
      </div>

      {error && <div className="status-message status-error" style={{ marginBottom: 20 }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          emptyMessage="No hay facturas para el filtro seleccionado."
          keyExtractor={(item) => item.id_factura}
        />
      )}
    </ModuleLayout>
  );
}
