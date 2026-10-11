import { useEffect, useState } from 'react';
import { folioService } from '../services/folioService';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { formatGs } from '../utils/currency';
import { Search, ExternalLink, Filter } from 'lucide-react';
import '../index.css';

interface ManageFoliosProps {
  onViewFolio: (id: number) => void;
}

export default function ManageFolios({ onViewFolio }: ManageFoliosProps) {
  const [folios, setFolios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterEstado, setFilterEstado] = useState('abierto');

  useEffect(() => {
    fetchFolios();
  }, []);

  const fetchFolios = async () => {
    try {
      setLoading(true);
      const data = await folioService.getFolios();
      setFolios(data || []);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los folios.');
    } finally {
      setLoading(false);
    }
  };

  const filteredFolios = folios.filter(f => {
    const matchEstado = !filterEstado || f.estado === filterEstado;
    if (!matchEstado) return false;

    if (!searchText) return true;
    const s = searchText.toLowerCase();
    const cliente = f.reserva?.clientes?.razon_social || f.reserva?.cliente?.razon_social || '';
    return (
      (f.id_folio?.toString().includes(s)) ||
      (f.reserva?.id_reserva?.toString().includes(s)) ||
      (cliente.toLowerCase().includes(s))
    );
  });

  const columns: Column<any>[] = [
    { header: 'ID Folio', render: (f) => <span style={{ fontWeight: 600 }}>#{f.id_folio}</span> },
    { header: 'Reserva', render: (f) => `Res. #${f.fk_reserva}` },
    { header: 'Cliente', render: (f) => f.reserva?.clientes?.razon_social || f.reserva?.cliente?.razon_social || 'Cliente Desconocido' },
    { header: 'Estado', render: (f) => (
      <span className="status-badge" style={{ '--badge-color': f.estado === 'abierto' ? '#10b981' : '#94a3b8' } as React.CSSProperties}>
        {f.estado.toUpperCase()}
      </span>
    )},
    { header: 'Total Acumulado', render: (f) => <span style={{ fontWeight: 600, color: '#f59e0b' }}>{formatGs(f.total_acumulado || 0)}</span> },
    { header: 'Apertura', render: (f) => <span style={{ color: 'var(--text-secondary)' }}>{new Date(f.created_at).toLocaleString()}</span> },
    { header: 'Acciones', align: 'center', render: (f) => (
      <button onClick={() => onViewFolio(f.id_folio)} className="btn-action blue with-label" title="Abrir Folio">
        <ExternalLink size={16} /> Ver Detalles
      </button>
    )}
  ];

  return (
    <ModuleLayout
      title="Folios · Cuentas Abiertas"
      description="Gestiona los consumos extras de los huéspedes alojados."
    >
      <div className="filters-bar">
        <div className="search-box">
          <Search size={16} color="#94a3b8" />
          <input 
            type="text" 
            placeholder="Buscar por ID de folio, reserva o cliente..." 
            value={searchText} 
            onChange={e => setSearchText(e.target.value)} 
            className="search-input" 
          />
        </div>
        <div className="filter-chips">
          <Filter size={16} color="#94a3b8" />
          <button className={`chip ${!filterEstado ? 'active' : ''}`} onClick={() => setFilterEstado('')}>
            Todos
          </button>
          <button 
            className={`chip ${filterEstado === 'abierto' ? 'active' : ''}`} 
            onClick={() => setFilterEstado('abierto')}
            style={filterEstado === 'abierto' ? { '--chip-color': '#10b981' } as React.CSSProperties : {}}
          >
            Abiertos
          </button>
          <button 
            className={`chip ${filterEstado === 'cerrado' ? 'active' : ''}`} 
            onClick={() => setFilterEstado('cerrado')}
            style={filterEstado === 'cerrado' ? { '--chip-color': '#94a3b8' } as React.CSSProperties : {}}
          >
            Cerrados
          </button>
        </div>
      </div>

      {error && <div className="status-message status-error" style={{ marginBottom: '20px' }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><div className="loader"></div></div>
      ) : (
        <DataTable 
          data={filteredFolios} 
          columns={columns} 
          emptyMessage={`No hay folios ${filterEstado === 'abierto' ? 'abiertos' : filterEstado === 'cerrado' ? 'cerrados' : ''} registrados.`} 
          keyExtractor={(item) => item.id_folio} 
        />
      )}
    </ModuleLayout>
  );
}
