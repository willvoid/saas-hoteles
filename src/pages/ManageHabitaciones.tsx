import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Layers,
  BedDouble,
  Sparkles,
  ImagePlus
} from 'lucide-react';
import { HabitacionService } from '../services/habitacionService';
import { CleanStatusService } from '../services/cleanStatusService';
import { RoomOccupancyService } from '../services/roomOccupancyService';
import HabitacionForm from './HabitacionForm';
import type { HabitacionBorrador } from './HabitacionForm';
import { ModuleLayout } from '../components/ModuleLayout';
import { SearchBox } from '../components/SearchBox';
import { FilterChips, ChipOption } from '../components/FilterChips';
import { StatusTabs } from '../components/StatusTabs';
import { RoomCard } from '../components/RoomCard';
import {
  getCleanStatus,
  CLEAN_STATUS_STYLES,
  OCUPADO_STYLE,
  DESOCUPADO_STYLE
} from '../components/roomStatus';
import '../index.css';

interface HabitacionRow {
  id: number;
  numero_habitacion: number;
  descripcion: string | null;
  fk_piso: number;
  fk_tipo_habitacion: number;
  tipo_habitacion?: { nombre?: string; capacidad?: number } | null;
  pisos?: { numero?: number } | null;
  imagenes_habitacion?: { id: number; ruta_storage: string; es_principal: boolean }[];
  estadoLimpieza: string;
  ocupado: boolean;
}

type OccFilter = 'todos' | 'ocupadas' | 'desocupadas';

interface ManageHabitacionesProps {
  onBack: () => void;
  /**
   * Lleva al alta de un tipo de habitación desde el formulario. Recibe el
   * borrador y la habitación en edición (null si es un alta) para poder
   * reabrir el formulario tal cual al volver.
   */
  onCrearTipo?: (borrador: HabitacionBorrador, habitacionEnEdicion: any | null) => void;
  /** Reapertura del formulario al volver de Tipos, con lo que ya estaba cargado. */
  reabrirFormulario?: { borrador: HabitacionBorrador; habitacionEnEdicion: any | null } | null;
  /** Avisa que ya se aplicó `reabrirFormulario`, para que no se reutilice. */
  onReabrirFormularioConsumido?: () => void;
}

export default function ManageHabitaciones({
  onBack,
  onCrearTipo,
  reabrirFormulario,
  onReabrirFormularioConsumido,
}: ManageHabitacionesProps) {
  const [habitaciones, setHabitaciones] = useState<HabitacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [floorFilter, setFloorFilter] = useState<number | 'todos'>('todos');
  const [occFilter, setOccFilter] = useState<OccFilter>('todos');
  const [cleanFilter, setCleanFilter] = useState('todos');

  const [isFormOpen, setIsFormOpen] = useState(!!reabrirFormulario);
  const [habitacionToEdit, setHabitacionToEdit] = useState<any | null>(
    reabrirFormulario?.habitacionEnEdicion ?? null
  );
  // Borrador a restaurar en el formulario; se usa una sola vez, al reabrirlo
  // tras crear (o cancelar) un tipo de habitación.
  const [borradorPendiente, setBorradorPendiente] = useState<HabitacionBorrador | null>(
    reabrirFormulario?.borrador ?? null
  );

  useEffect(() => {
    if (!isFormOpen) {
      fetchHabitaciones();
    }
  }, [isFormOpen]);

  // El estado inicial ya consumió `reabrirFormulario`; se avisa para que
  // Dashboard lo descarte y no vuelva a abrir el formulario más adelante.
  useEffect(() => {
    if (reabrirFormulario) onReabrirFormularioConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHabitaciones = async () => {
    try {
      setLoading(true);
      setError(null);
      const [habs, estadosMap, ocupadas] = await Promise.all([
        HabitacionService.getHabitaciones(),
        CleanStatusService.getEstadosLimpieza(),
        RoomOccupancyService.getHabitacionesOcupadas()
      ]);

      setHabitaciones(habs.map((h: any) => ({
        ...h,
        estadoLimpieza: getCleanStatus(estadosMap.get(h.id)),
        ocupado: ocupadas.has(h.id)
      })));
    } catch (err: any) {
      console.error('Error al cargar las habitaciones:', err);
      setError(err.message || 'Error al cargar las habitaciones.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewHabitacion = () => {
    setHabitacionToEdit(null);
    setBorradorPendiente(null);
    setIsFormOpen(true);
  };

  const handleEditHabitacion = (habitacion: any) => {
    setHabitacionToEdit(habitacion);
    setBorradorPendiente(null);
    setIsFormOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setHabitacionToEdit(null);
    setBorradorPendiente(null);
  };

  const handleFormSaved = () => {
    setIsFormOpen(false);
    setHabitacionToEdit(null);
    setBorradorPendiente(null);
  };

  // Se filtra por fk_piso (el id) pero se muestra pisos.numero, que es el número real del piso.
  const floorOptions = useMemo<ChipOption<number | 'todos'>[]>(() => {
    const porId = new Map<number, number>();
    habitaciones.forEach(h => {
      if (h.fk_piso != null) porId.set(h.fk_piso, h.pisos?.numero ?? h.fk_piso);
    });
    const chips = [...porId.entries()]
      .map(([id, numero]) => ({ value: id as number | 'todos', label: `Piso ${numero}` }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    return [{ value: 'todos', label: 'Todos los Pisos' }, ...chips];
  }, [habitaciones]);

  const matchesSearch = (h: HabitacionRow) => h.numero_habitacion?.toString().includes(searchTerm);
  const matchesFloor = (h: HabitacionRow) => floorFilter === 'todos' || h.fk_piso === floorFilter;
  const matchesOcc = (h: HabitacionRow) =>
    occFilter === 'todos' || (occFilter === 'ocupadas' ? h.ocupado : !h.ocupado);
  const matchesClean = (h: HabitacionRow) =>
    cleanFilter === 'todos' || h.estadoLimpieza.toLowerCase().replace(' ', '_') === cleanFilter;

  // Cada faceta se cuenta sobre las habitaciones que pasan los *otros* filtros activos,
  // para que los contadores nunca contradigan lo que se ve en la grilla.
  const { filteredRooms, occOptions, cleanTabs } = useMemo(() => {
    const base = habitaciones.filter(h => matchesSearch(h) && matchesFloor(h));

    const paraOcc = base.filter(matchesClean);
    const occOptions: ChipOption<OccFilter>[] = [
      { value: 'todos', label: `Todas (${paraOcc.length})` },
      { value: 'ocupadas', label: `Ocupadas (${paraOcc.filter(h => h.ocupado).length})` },
      { value: 'desocupadas', label: `Desocupadas (${paraOcc.filter(h => !h.ocupado).length})` }
    ];

    const paraClean = base.filter(matchesOcc);
    const contar = (estado: string) => paraClean.filter(h => h.estadoLimpieza === estado).length;
    const cleanTabs = [
      { key: 'todos', label: 'Todas', count: paraClean.length },
      { key: 'limpia', label: 'Limpias', color: CLEAN_STATUS_STYLES['Limpia'].color, count: contar('Limpia') },
      { key: 'sucia', label: 'Sucias', color: CLEAN_STATUS_STYLES['Sucia'].color, count: contar('Sucia') },
      { key: 'en_limpieza', label: 'En Limpieza', color: CLEAN_STATUS_STYLES['En Limpieza'].color, count: contar('En Limpieza') },
      { key: 'bloqueada', label: 'Bloqueadas', color: CLEAN_STATUS_STYLES['Bloqueada'].color, count: contar('Bloqueada') }
    ];

    return {
      filteredRooms: base.filter(h => matchesOcc(h) && matchesClean(h)),
      occOptions,
      cleanTabs
    };
  }, [habitaciones, searchTerm, floorFilter, occFilter, cleanFilter]);

  if (isFormOpen) {
    return (
      <HabitacionForm
        onCancel={handleFormCancel}
        onSaved={handleFormSaved}
        habitacionToEdit={habitacionToEdit}
        onCrearTipo={onCrearTipo ? (borrador) => onCrearTipo(borrador, habitacionToEdit) : undefined}
        borradorInicial={borradorPendiente}
        onBorradorInicialConsumido={() => setBorradorPendiente(null)}
      />
    );
  }

  return (
    <ModuleLayout
      title="Gestión de Habitaciones"
      description="Administra el inventario de habitaciones, su ocupación actual y su estado de limpieza."
      actions={
        <>
          <button onClick={onBack} className="btn-modal-cancel" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowLeft size={16} /> Volver
          </button>
          <button onClick={handleNewHabitacion} className="login-btn" style={{ width: 'auto', padding: '10px 20px' }}>
            + Nueva Habitación
          </button>
        </>
      }
    >
      {error && (
        <div className="status-message status-error" style={{ margin: 0 }}>
          {error}
        </div>
      )}

      <div className="filters-bar">
        <SearchBox
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar habitación..."
        />

        <FilterChips
          options={floorOptions}
          value={floorFilter}
          onChange={setFloorFilter}
          icon={<Layers size={16} />}
        />

        <FilterChips
          options={occOptions}
          value={occFilter}
          onChange={setOccFilter}
          icon={<BedDouble size={16} />}
        />
      </div>

      <StatusTabs tabs={cleanTabs} value={cleanFilter} onChange={setCleanFilter} />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: '16px' }}>
          <div className="loader" style={{ width: '40px', height: '40px', borderWidth: '3px' }}></div>
          <span style={{ color: 'var(--text-secondary)' }}>Cargando habitaciones...</span>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div style={{
          background: 'rgba(0, 0, 0, 0.15)',
          border: '1px dashed var(--glass-border)',
          borderRadius: '20px',
          padding: '80px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <Sparkles size={40} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h3>No se encontraron habitaciones</h3>
          <p style={{ fontSize: '14px', marginTop: '6px' }}>Prueba cambiando el buscador o los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="rooms-grid">
          {filteredRooms.map(hab => (
            <RoomCard
              key={hab.id}
              room={hab}
              occupancyLabel={hab.ocupado ? 'OCUPADO' : 'DESOCUPADO'}
              occupancyStyle={hab.ocupado ? OCUPADO_STYLE : DESOCUPADO_STYLE}
              actions={
                <button className="btn-action blue" onClick={() => handleEditHabitacion(hab)}>
                  <ImagePlus size={14} /> Detalles e Imágenes
                </button>
              }
            />
          ))}
        </div>
      )}
    </ModuleLayout>
  );
}
