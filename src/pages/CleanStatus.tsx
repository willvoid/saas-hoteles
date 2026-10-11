import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { 
  ArrowLeft,
  Sparkles,
  Clock, 
  Lock, 
  Unlock, 
  User, 
  X, 
  Layers, 
  FileText, 
  AlertTriangle,
  Edit2
} from 'lucide-react';
import { CleanStatusService, HabitacionConEstado, BloqueoHabitacionRow, EmpleadoRow } from '../services/cleanStatusService';
import { ModuleLayout } from '../components/ModuleLayout';
import { SearchBox } from '../components/SearchBox';
import { FilterChips } from '../components/FilterChips';
import { StatusTabs } from '../components/StatusTabs';
import { StatusBadge } from '../components/StatusBadge';
import { getStatusStyle } from '../components/roomStatus';

// Portal helper: renders children directly on document.body so position:fixed
// is always relative to the viewport, not any scrollable ancestor.
function ModalPortal({ children }: { children: React.ReactNode }) {
  return ReactDOM.createPortal(children, document.body);
}

// Validación de texto libre para el bloqueo de habitaciones, mismo criterio
// que el resto de los módulos: arranca con letra, sin dobles espacios, con
// tope de caracteres. Se usa tanto al crear como al editar un bloqueo.
const MAX_MOTIVO_BLOQUEO = 60;
const MAX_OBS_BLOQUEO = 200;
const EMPIEZA_CON_LETRA = /^[a-zA-ZáéíóúüÁÉÍÓÚÜñÑ]/;

function validarTextoBloqueo(value: string, maxLen: number, label: string): string {
  if (value.length > maxLen) return `${label} permite un máximo de ${maxLen} caracteres.`;
  if (value.length > 0 && !EMPIEZA_CON_LETRA.test(value)) return `${label} debe comenzar con una letra.`;
  if (/ {2}/.test(value)) return `${label} no puede tener dos espacios seguidos.`;
  return '';
}

interface CleanStatusProps {
  onBack: () => void;
  currentUser: {
    id?: number;
    id_usuario?: number;
    nombre: string;
    cargo: string;
    /** Nombre de usuario: se muestra junto al nombre del encargado. */
    usuario?: string;
  };
  // Si es false (ej. cargo Limpiador), no puede bloquear/desbloquear habitaciones
  canBlock?: boolean;
  /**
   * Si es false (cargo Limpiador), no elige a quién asignar la limpieza:
   * al poner una habitación "En Limpieza" queda él mismo como encargado.
   */
  canAssign?: boolean;
}

export default function CleanStatus({
  onBack,
  currentUser,
  canBlock = true,
  canAssign = true,
}: CleanStatusProps) {
  const currentUserId = currentUser?.id_usuario ?? currentUser?.id ?? null;
  const [rooms, setRooms] = useState<HabitacionConEstado[]>([]);
  const [employees, setEmployees] = useState<EmpleadoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Errores de validación del formulario de "Bloquear habitación": estado
  // aparte de `error` (el banner de la página) para que no se filtren fuera
  // del modal ni queden colgados en el panel al cerrarlo.
  const [blockFormError, setBlockFormError] = useState<string | null>(null);
  // Ídem para el modal de "Editar Bloqueo".
  const [editBlockFormError, setEditBlockFormError] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos'); // todos, limpia, sucia, en_limpieza, ocupada, bloqueada
  const [floorFilter, setFloorFilter] = useState<number | 'todos'>('todos');

  // Modals state
  const [selectedRoom, setSelectedRoom] = useState<HabitacionConEstado | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [viewingBlockageRoom, setViewingBlockageRoom] = useState<HabitacionConEstado | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<{ room: HabitacionConEstado; block: BloqueoHabitacionRow } | null>(null);

  // Editing blockage state
  const [isEditingBlock, setIsEditingBlock] = useState(false);
  const [editBlockReason, setEditBlockReason] = useState('');
  const [editBlockObs, setEditBlockObs] = useState('');
  const [editBlockStartDate, setEditBlockStartDate] = useState('');
  const [editBlockEndDate, setEditBlockEndDate] = useState('');

  // Modal Inputs
  const [newStatus, setNewStatus] = useState('Limpia');
  const [assignedEmployee, setAssignedEmployee] = useState<string>('');

  
  const [blockReason, setBlockReason] = useState('');
  const [blockObs, setBlockObs] = useState('');
  const [blockStartDate, setBlockStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [blockEndDate, setBlockEndDate] = useState('');

  // Load Initial Data. `silent` skips the full-grid spinner: used for
  // background refreshes triggered by realtime changes from another session,
  // where flashing a loader over rooms the user is already looking at would
  // just be disruptive.
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [roomsData, employeesData] = await Promise.all([
        CleanStatusService.getHabitacionesConEstado(),
        CleanStatusService.getEmpleados()
      ]);
      setRooms(roomsData);
      setEmployees(employeesData);
    } catch (err: unknown) {
      console.error('Error loading data in CleanStatus page:', err);
      if (!silent) setError('Ocurrió un error al cargar las habitaciones y empleados. Por favor, intente de nuevo.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reflect changes made from another session (another tab/user) without
  // requiring a manual page reload. Debounced because a single action like
  // bloquearHabitacion() writes to both estado_limpieza and
  // bloqueos_habitacion, which would otherwise trigger two reloads back to back.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadData(true), 400);
    };

    const unsubscribe = CleanStatusService.subscribeToChanges(scheduleReload);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [loadData]);

  // Helper to safely extract clean status
  const getRoomCleanStatus = (room: HabitacionConEstado): string => {
    const el = room.estado_limpieza;
    if (el) {
      if (Array.isArray(el)) {
        return el[0]?.estado || 'Limpia';
      }
      return el.estado || 'Limpia';
    }
    return 'Limpia';
  };

  // Helper to check if room is currently blocked
  const getRoomActiveBlock = (room: HabitacionConEstado): BloqueoHabitacionRow | null => {
    const blocks = room.bloqueos_habitacion;
    if (blocks && Array.isArray(blocks) && blocks.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      // Find a block that is currently active: start <= today AND (end is null OR end >= today)
      const active = blocks.find(b => {
        const start = b.fecha_inicio.split('T')[0];
        const end = b.fecha_fin ? b.fecha_fin.split('T')[0] : null;
        return start <= today && (!end || end >= today);
      });
      return active || null;
    }
    return null;
  };

  // Handle Changing Status
  const openStatusModal = (room: HabitacionConEstado) => {
    setSelectedRoom(room);
    const currentStatus = getRoomCleanStatus(room);
    setNewStatus(currentStatus);
    
    // Find current employee
    const el = room.estado_limpieza;
    const currentEmpId = el && !Array.isArray(el) ? el.fk_empleado : null;
    // El limpiador no elige encargado: siempre queda él, así que el campo
    // arranca (y se queda) con su propio usuario.
    setAssignedEmployee(
      canAssign ? (currentEmpId ? String(currentEmpId) : '') : currentUserId ? String(currentUserId) : '',
    );

    setShowStatusModal(true);
  };

  const handleSaveStatus = async () => {
    if (!selectedRoom) return;
    setLoading(true);
    try {
      // Con "En Limpieza" hay un encargado: el elegido en la lista, o el
      // propio limpiador cuando es él quien toma la habitación.
      const empId =
        newStatus !== 'En Limpieza'
          ? null
          : canAssign
            ? (assignedEmployee ? parseInt(assignedEmployee) : null)
            : currentUserId;

      await CleanStatusService.updateEstadoLimpieza(
        selectedRoom.id,
        newStatus,
        empId,
      );

      setSuccess(`Estado de la habitación #${selectedRoom.numero_habitacion} actualizado con éxito.`);
      setShowStatusModal(false);
      setSelectedRoom(null);
      await loadData();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      console.error('Error saving clean status:', err);
      setError('Error al actualizar el estado de limpieza.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Blocking Room. Los botones ya no se renderizan sin `canBlock`;
  // estas guardas cubren que igual se llegue a invocar el handler.
  const openBlockModal = (room: HabitacionConEstado) => {
    if (!canBlock) return;
    setSelectedRoom(room);
    setBlockReason('');
    setBlockObs('');
    setBlockStartDate(new Date().toISOString().split('T')[0]);
    setBlockEndDate('');
    setBlockFormError(null);
    setShowBlockModal(true);
  };

  const handleBlockReasonChange = (value: string) => {
    const err = validarTextoBloqueo(value, MAX_MOTIVO_BLOQUEO, 'El motivo de bloqueo');
    if (err) { setBlockFormError(err); return; }
    setBlockFormError(null);
    setBlockReason(value);
  };

  const handleBlockReasonBlur = () => {
    if (!blockReason.trim()) setBlockFormError('El motivo de bloqueo es obligatorio.');
  };

  const handleBlockObsChange = (value: string) => {
    const err = validarTextoBloqueo(value, MAX_OBS_BLOQUEO, 'Las observaciones adicionales');
    if (err) { setBlockFormError(err); return; }
    setBlockFormError(null);
    setBlockObs(value);
  };

  const handleSaveBlock = async () => {
    if (!selectedRoom || !canBlock) return;
    if (!blockReason.trim()) {
      setBlockFormError('El motivo de bloqueo es obligatorio.');
      return;
    }
    setLoading(true);
    try {
      await CleanStatusService.bloquearHabitacion(
        selectedRoom.id,
        blockReason.trim(),
        blockObs.trim() || null,
        blockStartDate,
        blockEndDate || null
      );

      setSuccess(`Habitación #${selectedRoom.numero_habitacion} bloqueada correctamente.`);
      setShowBlockModal(false);
      setSelectedRoom(null);
      await loadData();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      console.error('Error blocking room:', err);
      setBlockFormError('Error al registrar el bloqueo de la habitación.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Unblocking — shows custom confirm dialog
  const handleUnblock = (room: HabitacionConEstado, activeBlock: BloqueoHabitacionRow) => {
    if (!canBlock) return;
    setConfirmUnblock({ room, block: activeBlock });
  };

  const executeUnblock = async () => {
    if (!confirmUnblock || !canBlock) return;
    const { room, block } = confirmUnblock;
    setConfirmUnblock(null);
    setLoading(true);
    try {
      await CleanStatusService.desbloquearHabitacion(
        room.id,
        block.id_bloqueo,
        'Limpia'
      );
      setSuccess(`Habitación #${room.numero_habitacion} desbloqueada y puesta en estado Limpia.`);
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      console.error('Error unblocking room:', err);
      setError('Error al eliminar el bloqueo de la habitación.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditBlockReasonChange = (value: string) => {
    const err = validarTextoBloqueo(value, MAX_MOTIVO_BLOQUEO, 'El motivo del bloqueo');
    if (err) { setEditBlockFormError(err); return; }
    setEditBlockFormError(null);
    setEditBlockReason(value);
  };

  const handleEditBlockReasonBlur = () => {
    if (!editBlockReason.trim()) setEditBlockFormError('El motivo del bloqueo es obligatorio.');
  };

  const handleEditBlockObsChange = (value: string) => {
    const err = validarTextoBloqueo(value, MAX_OBS_BLOQUEO, 'Las observaciones adicionales');
    if (err) { setEditBlockFormError(err); return; }
    setEditBlockFormError(null);
    setEditBlockObs(value);
  };

  const handleUpdateBlock = async (id_bloqueo: number) => {
    if (!canBlock) return;
    if (!editBlockReason.trim()) {
      setEditBlockFormError('El motivo del bloqueo es obligatorio.');
      return;
    }
    setLoading(true);
    setEditBlockFormError(null);
    try {
      await CleanStatusService.updateBloqueoHabitacion(
        id_bloqueo,
        editBlockReason.trim(),
        editBlockObs.trim() || null,
        editBlockStartDate,
        editBlockEndDate || null
      );
      setSuccess('Bloqueo de la habitación actualizado correctamente.');
      setIsEditingBlock(false);
      setViewingBlockageRoom(null);
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      console.error('Error updating room blockage:', err);
      setEditBlockFormError('Error al actualizar el bloqueo de la habitación.');
    } finally {
      setLoading(false);
    }
  };

  // Dynamic room counts per status
  const getRoomCounts = () => {
    const counts = {
      todos: rooms.length,
      limpia: 0,
      sucia: 0,
      en_limpieza: 0,
      ocupada: 0,
      bloqueada: 0
    };

    rooms.forEach(room => {
      const activeBlock = getRoomActiveBlock(room);
      const rawClean = getRoomCleanStatus(room);
      
      if (activeBlock || rawClean === 'Bloqueada') {
        counts.bloqueada++;
      } else {
        const status = rawClean.toLowerCase().replace(' ', '_');
        if (status === 'limpia') counts.limpia++;
        else if (status === 'sucia') counts.sucia++;
        else if (status === 'en_limpieza') counts.en_limpieza++;
        else if (status === 'ocupada') counts.ocupada++;
      }
    });

    return counts;
  };

  const roomCounts = getRoomCounts();

  // Filter implementation
  const filteredRooms = rooms.filter(room => {
    // 1. Search filter
    const matchesSearch = room.numero_habitacion.toString().includes(searchTerm);

    // 2. Status filter
    const activeBlock = getRoomActiveBlock(room);
    const rawCleanStatus = getRoomCleanStatus(room);
    
    // Determine effective status
    let effectiveStatus = rawCleanStatus.toLowerCase().replace(' ', '_');
    if (activeBlock || rawCleanStatus === 'Bloqueada') {
      effectiveStatus = 'bloqueada';
    }

    const matchesStatus = statusFilter === 'todos' || effectiveStatus === statusFilter;

    // 3. Floor filter
    const matchesFloor = floorFilter === 'todos' || room.fk_piso === floorFilter;

    return matchesSearch && matchesStatus && matchesFloor;
  });

  // Extract floors for filtering
  const floorsList = [...new Set(rooms.map(r => r.fk_piso).filter(Boolean))].sort((a, b) => a - b);

  return (
    <ModuleLayout
      title="Estado y Limpieza"
      description="Monitorea el estado de limpieza, habitaciones ocupadas y administra bloqueos operativos."
      actions={
        <button className="btn-modal-cancel" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> Volver
        </button>
      }
    >

      {/* Alert Banners */}
      {error && (
        <div className="status-message status-error" style={{ margin: 0 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="status-message status-success" style={{ margin: 0 }}>
          {success}
        </div>
      )}

      {/* Filters Bar */}
      <div className="filters-bar">
        <SearchBox
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar habitación..."
        />

        <FilterChips
          options={[
            { value: 'todos' as number | 'todos', label: 'Todos los Pisos' },
            ...floorsList.map(floor => ({ value: floor as number | 'todos', label: `Piso ${floor}` }))
          ]}
          value={floorFilter}
          onChange={setFloorFilter}
          icon={<Layers size={16} />}
        />
      </div>

      {/* Status Filter Tabs */}
      <StatusTabs
        tabs={[
          { key: 'todos', label: 'Todas', count: roomCounts.todos },
          { key: 'limpia', label: 'Limpias', color: '#10b981', count: roomCounts.limpia },
          { key: 'sucia', label: 'Sucias', color: '#f97316', count: roomCounts.sucia },
          { key: 'en_limpieza', label: 'En Limpieza', color: '#3b82f6', count: roomCounts.en_limpieza },
          { key: 'ocupada', label: 'Ocupadas', color: '#8b5cf6', count: roomCounts.ocupada },
          { key: 'bloqueada', label: 'Bloqueadas', color: '#ef4444', count: roomCounts.bloqueada }
        ]}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {/* Rooms Grid */}
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
          <p style={{ fontSize: '14px', marginTop: '6px' }}>Prueba cambiando el buscador o filtros seleccionados.</p>
        </div>
      ) : (
        <div className="rooms-grid">
          {filteredRooms.map(room => {
            const activeBlock = getRoomActiveBlock(room);
            const rawClean = getRoomCleanStatus(room);
            
            // Determine effective state
            let effectiveStatus = rawClean;
            if (activeBlock || rawClean === 'Bloqueada') {
              effectiveStatus = 'Bloqueada';
            }

            const badgeStyle = getStatusStyle(effectiveStatus);
            const badgeBg = badgeStyle.bg;

            const elData = room.estado_limpieza;
            const hasEl = elData && !Array.isArray(elData);
            const employeeName = hasEl && elData.usuario?.nombre ? elData.usuario.nombre : null;
            const lastUpdated = hasEl && elData.ultima_actualizacion ? new Date(elData.ultima_actualizacion).toLocaleString() : 'No registrada';

            return (
              <div 
                key={room.id} 
                className="room-card"
                style={{
                  '--status-glow-color': badgeBg,
                  ...(effectiveStatus === 'Bloqueada' ? {
                    background: 'rgba(239, 68, 68, 0.04)',
                    borderColor: 'rgba(239, 68, 68, 0.2)'
                  } : {})
                } as React.CSSProperties}
              >
                {/* Glow element based on status */}
                <div className="room-card-glow" />

                <div className="room-card-header">
                  <div>
                    <span className="room-number-badge">Habitación #{room.numero_habitacion}</span>
                    <div className="room-type">{room.tipo_habitacion?.nombre || 'Sin Tipo'}</div>
                  </div>
                  <StatusBadge label={effectiveStatus} style={badgeStyle} />
                </div>

                <div className="room-card-body">
                  <div className="info-row">
                    <Layers size={14} />
                    <span>Piso: <span className="info-value">{room.fk_piso}</span></span>
                  </div>
                  
                  {effectiveStatus === 'En Limpieza' && employeeName && (
                    <div className="info-row" style={{ color: '#60a5fa' }}>
                      <User size={14} />
                      <span>Limpieza por: <span className="info-value" style={{ color: '#fff' }}>{employeeName}</span></span>
                    </div>
                  )}

                  <div className="info-row">
                    <Clock size={14} />
                    <span style={{ fontSize: '12px' }}>Act.: <span className="info-value">{lastUpdated}</span></span>
                  </div>

                  {/* Active blockage summary (compact indicator) */}
                  {activeBlock && (
                    <div className="info-row" style={{ color: '#fca5a5' }}>
                      <AlertTriangle size={14} />
                      <span>Bloqueo: <strong className="blockage-reason">{activeBlock.motivo}</strong></span>
                    </div>
                  )}
                </div>

                {/* Room Actions */}
                <div className="room-card-actions">
                  {effectiveStatus === 'Bloqueada' && activeBlock ? (
                    <button
                      className="btn-action red"
                      onClick={() => setViewingBlockageRoom(room)}
                    >
                      <AlertTriangle size={14} /> Ver Bloqueo
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn-action blue"
                        onClick={() => openStatusModal(room)}
                      >
                        <Sparkles size={14} /> Cambiar Estado
                      </button>
                      {canBlock && (
                        <button
                          className="btn-action red"
                          onClick={() => openBlockModal(room)}
                        >
                          <Lock size={14} /> Bloquear
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Change Status Modal */}
      {showStatusModal && selectedRoom && (
        <ModalPortal>
          <div className="modal-backdrop-glow">
          <div className="modal-box-glow">
            <div className="modal-header-row">
              <h3>Habitación #{selectedRoom.numero_habitacion} - Cambiar Estado</h3>
              <button className="modal-close-btn" onClick={() => { setShowStatusModal(false); setSelectedRoom(null); }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label htmlFor="new-status-select">Estado de la Habitación</label>
                <select
                  id="new-status-select"
                  className="input-field"
                  value={newStatus}
                  onChange={(e) => {
                    setNewStatus(e.target.value);
                    if (e.target.value !== 'En Limpieza') setAssignedEmployee('');
                  }}
                  style={{ appearance: 'none' }}
                >
                  <option value="Limpia">Limpia (Disponible)</option>
                  <option value="Sucia">Sucia (Requiere Limpieza)</option>
                  <option value="En Limpieza">En Limpieza (En Curso)</option>
                  <option value="Ocupada">Ocupada</option>
                </select>
              </div>

              {newStatus === 'En Limpieza' && (
                canAssign ? (
                  <div className="input-group" style={{ animation: 'fadeIn 0.2s ease' }}>
                    <label htmlFor="employee-select">Asignar Empleado de Limpieza</label>
                    <select
                      id="employee-select"
                      className="input-field"
                      value={assignedEmployee}
                      onChange={(e) => setAssignedEmployee(e.target.value)}
                      style={{ appearance: 'none' }}
                    >
                      <option value="">-- Seleccionar Empleado (Opcional) --</option>
                      {employees.map(emp => (
                        <option key={emp.id_usuario} value={emp.id_usuario} style={{ color: 'black' }}>
                          {emp.nombre} ({emp.usuario})
                        </option>
                      ))}
                    </select>
                    {employees.length === 0 && (
                      <span style={{ fontSize: '12px', color: '#fbbf24', marginTop: '4px', display: 'block' }}>
                        No hay usuarios con cargo de limpiador activos.
                      </span>
                    )}
                  </div>
                ) : (
                  // El limpiador no elige: queda él como encargado. El campo
                  // es de sólo lectura, sólo para que vea quién se registra.
                  <div className="input-group" style={{ animation: 'fadeIn 0.2s ease' }}>
                    <label htmlFor="employee-fixed">Empleado de Limpieza Encargado</label>
                    <input
                      id="employee-fixed"
                      className="input-field"
                      value={`${currentUser.nombre}${currentUser.usuario ? ` (${currentUser.usuario})` : ''}`}
                      readOnly
                      tabIndex={-1}
                      style={{ cursor: 'default' }}
                      title="Al poner la habitación en limpieza quedás registrado como el encargado."
                    />
                  </div>
                )
              )}
            </div>

            <div className="modal-actions-row">
              <button 
                className="btn-modal-cancel" 
                onClick={() => { setShowStatusModal(false); setSelectedRoom(null); }}
              >
                Cancelar
              </button>
              <button 
                className="btn-modal-submit" 
                onClick={handleSaveStatus}
                disabled={loading}
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Block Room Modal */}
      {showBlockModal && selectedRoom && (
        <ModalPortal>
          <div className="modal-backdrop-glow">
          <div className="modal-box-glow">
            <div className="modal-header-row">
              <h3>Habitación #{selectedRoom.numero_habitacion} - Bloquear</h3>
              <button className="modal-close-btn" onClick={() => { setShowBlockModal(false); setSelectedRoom(null); setBlockFormError(null); }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {blockFormError && <div className="status-message status-error" style={{ margin: 0 }}>{blockFormError}</div>}

              <div className="input-group">
                <label htmlFor="block-reason-input">Motivo de Bloqueo *</label>
                <input
                  id="block-reason-input"
                  type="text"
                  className="input-field"
                  placeholder="Ej. Mantenimiento de A/C, Pintura, Fuga de agua"
                  value={blockReason}
                  onChange={(e) => handleBlockReasonChange(e.target.value)}
                  onBlur={handleBlockReasonBlur}
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="block-obs-input">Observaciones Adicionales</label>
                <textarea
                  id="block-obs-input"
                  className="input-field"
                  placeholder="Detalles sobre el problema operativo..."
                  value={blockObs}
                  onChange={(e) => handleBlockObsChange(e.target.value)}
                  rows={3}
                  style={{ resize: 'none', fontFamily: 'inherit' }}
                />
              </div>

              <div className="form-grid">
                <div className="input-group">
                  <label htmlFor="block-start-input">Fecha Inicio</label>
                  <input
                    id="block-start-input"
                    type="date"
                    className="input-field"
                    value={blockStartDate}
                    onChange={(e) => setBlockStartDate(e.target.value)}
                    required
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="block-end-input">Fecha Fin (Opcional)</label>
                  <input
                    id="block-end-input"
                    type="date"
                    className="input-field"
                    value={blockEndDate}
                    onChange={(e) => setBlockEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="modal-actions-row">
              <button
                className="btn-modal-cancel"
                onClick={() => { setShowBlockModal(false); setSelectedRoom(null); setBlockFormError(null); }}
              >
                Cancelar
              </button>
              <button
                className="btn-modal-submit"
                onClick={handleSaveBlock}
                disabled={loading}
                style={{ backgroundColor: '#ef4444' }}
              >
                Registrar Bloqueo
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* View / Edit Blockage details modal */}
      {viewingBlockageRoom && (() => {
        const activeBlock = getRoomActiveBlock(viewingBlockageRoom);
        if (!activeBlock) return null;
        return (
          <ModalPortal>
            <div className="modal-backdrop-glow">
            <div className="modal-box-glow" style={{ borderLeft: `4px solid ${isEditingBlock ? '#f59e0b' : '#ef4444'}`, maxWidth: '520px', width: '95%' }}>
              <div className="modal-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isEditingBlock
                    ? <Edit2 size={22} style={{ color: '#fbbf24' }} />
                    : <AlertTriangle size={22} style={{ color: '#f87171' }} />}
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>
                      Habitación #{viewingBlockageRoom.numero_habitacion}
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {isEditingBlock ? 'Editando bloqueo' : 'Bloqueo activo'}
                    </p>
                  </div>
                </div>
                <button className="modal-close-btn" onClick={() => { setViewingBlockageRoom(null); setIsEditingBlock(false); setEditBlockFormError(null); }}>
                  <X size={20} />
                </button>
              </div>

              {editBlockFormError && <div className="status-message status-error" style={{ margin: '0 0 4px' }}>{editBlockFormError}</div>}

              {isEditingBlock ? (
                /* ── EDIT MODE ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '16px 0' }}>
                  <div className="input-group">
                    <label htmlFor="edit-block-reason">Motivo del Bloqueo *</label>
                    <input
                      id="edit-block-reason"
                      type="text"
                      className="input-field"
                      value={editBlockReason}
                      onChange={e => handleEditBlockReasonChange(e.target.value)}
                      onBlur={handleEditBlockReasonBlur}
                      placeholder="Ej: Mantenimiento, Pintura..."
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="edit-block-obs">Observaciones Adicionales</label>
                    <textarea
                      id="edit-block-obs"
                      className="input-field"
                      value={editBlockObs}
                      onChange={e => handleEditBlockObsChange(e.target.value)}
                      rows={2}
                      style={{ resize: 'none', fontFamily: 'inherit' }}
                      placeholder="Detalles adicionales (opcional)"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="input-group">
                      <label htmlFor="edit-block-start">Fecha Inicio</label>
                      <input
                        id="edit-block-start"
                        type="date"
                        className="input-field"
                        value={editBlockStartDate}
                        onChange={e => setEditBlockStartDate(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="edit-block-end">Fecha Fin (extender)</label>
                      <input
                        id="edit-block-end"
                        type="date"
                        className="input-field"
                        value={editBlockEndDate}
                        onChange={e => setEditBlockEndDate(e.target.value)}
                        min={editBlockStartDate}
                      />
                    </div>
                  </div>

                  <div style={{
                    padding: '10px 14px',
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: '10px',
                    fontSize: '13px',
                    color: '#fbbf24'
                  }}>
                    💡 Puedes extender la fecha de fin sin necesidad de desbloquear la habitación.
                  </div>
                </div>
              ) : (
                /* ── VIEW MODE ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', margin: '16px 0' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Motivo del Bloqueo</span>
                      <strong style={{ fontSize: '16px', color: '#fca5a5' }}>{activeBlock.motivo}</strong>
                    </div>

                    {activeBlock.observaciones && (
                      <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Observaciones</span>
                        <p style={{ margin: 0, fontSize: '14px', fontStyle: 'italic', color: 'var(--text-primary)' }}>
                          "{activeBlock.observaciones}"
                        </p>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '20px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Fecha de Inicio</span>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{new Date(activeBlock.fecha_inicio).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Fecha de Fin</span>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: activeBlock.fecha_fin ? 'var(--text-primary)' : '#94a3b8' }}>
                          {activeBlock.fecha_fin ? new Date(activeBlock.fecha_fin).toLocaleDateString() : 'Indefinida'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="modal-actions-row">
                {isEditingBlock ? (
                  <>
                    <button
                      className="btn-modal-cancel"
                      onClick={() => { setIsEditingBlock(false); setEditBlockFormError(null); }}
                      disabled={loading}
                    >
                      Cancelar
                    </button>
                    <button
                      className="btn-modal-submit"
                      onClick={() => handleUpdateBlock(activeBlock.id_bloqueo)}
                      disabled={loading || !editBlockReason.trim()}
                      style={{ backgroundColor: '#f59e0b', color: '#000' }}
                    >
                      {loading ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </>
                ) : canBlock ? (
                  <>
                    <button
                      className="btn-modal-cancel"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => {
                        setEditBlockReason(activeBlock.motivo);
                        setEditBlockObs(activeBlock.observaciones || '');
                        setEditBlockStartDate(activeBlock.fecha_inicio.split('T')[0]);
                        setEditBlockEndDate(activeBlock.fecha_fin ? activeBlock.fecha_fin.split('T')[0] : '');
                        setEditBlockFormError(null);
                        setIsEditingBlock(true);
                      }}
                    >
                      <Edit2 size={14} /> Editar Bloqueo
                    </button>
                    <button
                      className="btn-modal-submit"
                      onClick={() => {
                        const blockToUnblock = activeBlock;
                        const roomToUnblock = viewingBlockageRoom;
                        setViewingBlockageRoom(null);
                        setIsEditingBlock(false);
                        handleUnblock(roomToUnblock, blockToUnblock);
                      }}
                      style={{ backgroundColor: '#ef4444' }}
                    >
                      <Unlock size={14} style={{ marginRight: '4px' }} /> Desbloquear
                    </button>
                  </>
                ) : (
                  /* Sin permiso de bloqueo: solo lectura */
                  <button
                    className="btn-modal-cancel"
                    onClick={() => { setViewingBlockageRoom(null); setIsEditingBlock(false); }}
                  >
                    Cerrar
                  </button>
                )}
              </div>
            </div>
          </div>
          </ModalPortal>
        );
      })()}

      {/* Custom Confirm Unblock Dialog */}
      {confirmUnblock && (
        <ModalPortal>
          <div className="modal-backdrop-glow">
          <div className="modal-box-glow" style={{ maxWidth: '400px', textAlign: 'center' }}>
            {/* Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '2px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <Unlock size={28} style={{ color: '#f87171' }} />
            </div>

            <h3 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 700 }}>
              Desbloquear Habitación
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: '0 0 6px' }}>
              ¿Confirmas que deseas desbloquear la
            </p>
            <p style={{ margin: '0 0 24px' }}>
              <strong style={{ color: 'var(--text-primary)', fontSize: '16px' }}>
                Habitación #{confirmUnblock.room.numero_habitacion}
              </strong>
              {confirmUnblock.block.motivo && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'block', marginTop: '4px' }}>
                  Bloqueo: {confirmUnblock.block.motivo}
                </span>
              )}
            </p>

            <p style={{
              color: '#fca5a5',
              fontSize: '13px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '24px'
            }}>
              El estado de la habitación se restablecerá a <strong>Limpia</strong>.
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn-modal-cancel"
                style={{ flex: 1 }}
                onClick={() => setConfirmUnblock(null)}
              >
                Cancelar
              </button>
              <button
                className="btn-modal-submit"
                style={{ flex: 1, backgroundColor: '#ef4444' }}
                onClick={executeUnblock}
                disabled={loading}
              >
                Sí, Desbloquear
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </ModuleLayout>
  );
}
