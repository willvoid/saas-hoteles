import { useEffect, useState } from 'react';
import { ReservationService } from '../services/reservationService';
import { DataTable, Column } from '../components/DataTable';
import ReservationForm from './ReservationForm';
import { Search, Filter, Eye, Edit3, Lock } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { ClienteRecurrenteBadge } from '../components/ClienteRecurrenteBadge';
import { isClienteRecurrente, getReservationCount } from '../utils/clienteRecurrencia';
import { RESERVA_ESTADOS } from '../types/reservation';
import { esReservaCerrada } from '../utils/reservaEstado';
import { formatGs } from '../utils/currency';
import '../index.css';

interface ManageReservationsProps {
  onBack: () => void;
  onNewReservation: () => void;
  onViewDetail: (id: number) => void;
  currentUser: any;
}

export default function ManageReservations({ onBack, onNewReservation, onViewDetail, currentUser }: ManageReservationsProps) {
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [reservationToEdit, setReservationToEdit] = useState<any | null>(null);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterEstado, setFilterEstado] = useState('');

  useEffect(() => {
    if (!isEditFormOpen) fetchReservations();
  }, [isEditFormOpen]);

  const fetchReservations = async () => {
    try {
      setLoading(true);
      const data = await ReservationService.getReservations();
      setReservations(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar las reservas.');
    } finally { setLoading(false); }
  };

  const getStatusColor = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'confirmada': case 'check-in': return '#10b981';
      case 'pendiente': return '#f59e0b';
      case 'cancelada': return '#ef4444';
      case 'check-out': return '#6366f1';
      default: return '#94a3b8';
    }
  };

  const filteredReservations = reservations.filter(res => {
    const matchEstado = !filterEstado || res.estado === filterEstado;
    const matchSearch = !searchText || 
      (res.codigo_reserva || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (res.clientes?.razon_social || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (res.clientes?.documento || '').toLowerCase().includes(searchText.toLowerCase());
    return matchEstado && matchSearch;
  });

  const columns: Column<any>[] = [
    { header: 'Código', render: (res) => <span style={{ fontWeight: 600 }}>{res.codigo_reserva || '-'}</span> },
    { 
      header: 'Cliente', 
      render: (res) => {
        const cliente = res.clientes;
        const nombre = cliente?.razon_social || `ID: ${res.fk_cliente}`;
        const countFromList = reservations.filter(r => r.fk_cliente === res.fk_cliente).length;
        const count = Math.max(getReservationCount(cliente), countFromList);
        const isRec = count >= 2 || isClienteRecurrente(cliente);

        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>{nombre}</span>
            {res.fk_cliente && (
              <ClienteRecurrenteBadge isRecurrente={isRec} count={count} showCount size="sm" />
            )}
          </div>
        );
      }
    },
    { header: 'Entrada', render: (res) => <span style={{ color: 'var(--text-secondary)' }}>{res.fecha_entrada ? new Date(res.fecha_entrada + 'T12:00:00').toLocaleDateString() : '-'}</span> },
    { header: 'Salida', render: (res) => <span style={{ color: 'var(--text-secondary)' }}>{res.fecha_salida ? new Date(res.fecha_salida + 'T12:00:00').toLocaleDateString() : '-'}</span> },
    { header: 'Estado', render: (res) => (
      <span className="status-badge" style={{ '--badge-color': getStatusColor(res.estado) } as React.CSSProperties}>
        {res.estado || 'N/A'}
      </span>
    )},
    { header: 'Origen', render: (res) => <span style={{ color: 'var(--text-secondary)' }}>{res.origen || '-'}</span> },
    { header: 'Total Est.', render: (res) => <span style={{ fontWeight: 600 }}>{res.total_estimado ? formatGs(res.total_estimado) : '-'}</span> },
    { header: 'Acciones', align: 'center', render: (res) => (
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button onClick={() => onViewDetail(res.id_reserva)} className="btn-action blue" title="Ver Detalle"><Eye size={15} /></button>
        {/* Tras el Check-out la reserva es sólo de consulta: se muestra el
            candado en vez del lápiz para que quede claro por qué no se edita. */}
        {esReservaCerrada(res.estado) ? (
          <button
            className="btn-action"
            disabled
            title="La reserva ya hizo Check-out: sólo se puede visualizar"
            style={{ opacity: 0.45, cursor: 'not-allowed' }}
          >
            <Lock size={15} />
          </button>
        ) : (
          <button onClick={() => { setReservationToEdit(res); setIsEditFormOpen(true); }} className="btn-action amber" title="Editar"><Edit3 size={15} /></button>
        )}
      </div>
    )}
  ];

  if (isEditFormOpen) {
    return <ReservationForm onCancel={() => setIsEditFormOpen(false)} onCreated={() => setIsEditFormOpen(false)} currentUser={currentUser} reservationToEdit={reservationToEdit} />;
  }

  const estados = RESERVA_ESTADOS;

  return (
    <ModuleLayout
      title="Gestión de Reservas"
      description="Administra las reservas del hotel"
      actions={
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onBack} className="btn-ghost">Volver</button>
          <button onClick={onNewReservation} className="btn-primary-sm" style={{ padding: '10px 20px' }}>+ Nueva Reserva</button>
        </div>
      }
    >
      {/* Filters */}
      <div className="filters-bar">
        <div className="search-box">
          <Search size={16} color="#94a3b8" />
          <input type="text" placeholder="Buscar por código, cliente..." value={searchText} onChange={e => setSearchText(e.target.value)} className="search-input" />
        </div>
        <div className="filter-chips">
          <Filter size={16} color="#94a3b8" />
          <button className={`chip ${!filterEstado ? 'active' : ''}`} onClick={() => setFilterEstado('')}>Todos</button>
          {estados.map(e => (
            <button key={e} className={`chip ${filterEstado === e ? 'active' : ''}`} onClick={() => setFilterEstado(filterEstado === e ? '' : e)}
              style={filterEstado === e ? { '--chip-color': getStatusColor(e) } as React.CSSProperties : {}}>
              {e}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="status-message status-error" style={{ marginBottom: '20px' }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><div className="loader"></div></div>
      ) : (
        <DataTable data={filteredReservations} columns={columns} emptyMessage="No hay reservas registradas." keyExtractor={(item) => item.id_reserva} />
      )}
    </ModuleLayout>
  );
}
