import { useEffect, useState } from 'react';
import { Plus, ExternalLink, Search } from 'lucide-react';
import { facturaService } from '../services/facturaService';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { FilterChips, ChipOption } from '../components/FilterChips';
import { formatGs } from '../utils/currency';
import type { FacturaListItem } from '../types/factura';
import '../index.css';

interface ManageFacturasProps {
  onNewFactura: () => void;
  onViewFactura: (id: number) => void;
}

const ESTADO_COLOR: Record<string, string> = {
  EMITIDA: '#10b981',
  ANULADA: '#ef4444',
};

const chips: ChipOption<string>[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'EMITIDA', label: 'Emitidas' },
  { value: 'ANULADA', label: 'Anuladas' },
];

export default function ManageFacturas({ onNewFactura, onViewFactura }: ManageFacturasProps) {
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
      } catch (err: any) {
        setError(err.message || 'Error al cargar las facturas.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = facturas.filter((f) => {
    if (filtro !== 'todas' && f.estado !== filtro) return false;
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
    { header: 'Total', align: 'right', render: (f) => <span style={{ fontWeight: 600, color: '#34d399' }}>{formatGs(f.total_general)}</span> },
    {
      header: 'Estado',
      render: (f) => (
        <span className="status-badge" style={{ '--badge-color': ESTADO_COLOR[f.estado] || '#94a3b8' } as React.CSSProperties}>
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
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Buscar por Nº o cliente…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="search-input"
          />
        </div>
        <FilterChips options={chips} value={filtro} onChange={setFiltro} />
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
