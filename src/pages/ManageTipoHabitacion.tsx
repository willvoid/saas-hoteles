import { useEffect, useState } from 'react';
import { HabitacionService } from '../services/habitacionService';
import TipoHabitacionForm from './TipoHabitacionForm';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { Image as ImageIcon } from 'lucide-react';
import '../index.css';

interface ManageTipoHabitacionProps {
  onBack: () => void;
  /** Abre directo en "Nuevo Tipo" (llegada desde el formulario de Habitación). */
  openNewOnMount?: boolean;
  /**
   * Sólo se dispara si el tipo se creó (no al editar) mientras
   * `openNewOnMount` seguía activo: es la señal para que Dashboard vuelva al
   * formulario de habitación con este tipo ya seleccionado.
   */
  onTipoCreado?: (tipo: any) => void;
  /** Ídem al cancelar el alta: vuelve al formulario de habitación sin tipo nuevo. */
  onCancelarCreacion?: () => void;
}

export default function ManageTipoHabitacion({
  onBack,
  openNewOnMount = false,
  onTipoCreado,
  onCancelarCreacion,
}: ManageTipoHabitacionProps) {
  const [tipos, setTipos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [tipoToEdit, setTipoToEdit] = useState<any | null>(null);

  useEffect(() => {
    if (!isFormOpen) {
      fetchTipos();
    }
  }, [isFormOpen]);

  // Sólo se evalúa al montar: Dashboard remonta este componente cada vez que
  // se entra a la pestaña, así que esto captura únicamente la llegada directa
  // desde el formulario de Habitación, no cada clic posterior en el menú.
  useEffect(() => {
    if (openNewOnMount) {
      setTipoToEdit(null);
      setIsFormOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTipos = async () => {
    try {
      setLoading(true);
      const data = await HabitacionService.getTiposHabitacion();
      // En el dashboard service tenemos un método que solo trae id, nombre, capacidad.
      // Necesitamos asegurar que traemos la descripción. Haremos una pequeña modificación o usamos el supabase client aquí, pero es mejor usar el servicio.
      // Espera, modifiquemos HabitacionService.getTiposHabitacion() para traer la descripción también.
      setTipos(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los tipos de habitaciones.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewTipo = () => {
    setTipoToEdit(null);
    setIsFormOpen(true);
  };

  const handleEditTipo = (tipo: any) => {
    setTipoToEdit(tipo);
    setIsFormOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setTipoToEdit(null);
    if (openNewOnMount && onCancelarCreacion) {
      onCancelarCreacion();
    }
  };

  const handleFormSaved = (createdTipo?: any) => {
    setIsFormOpen(false);
    setTipoToEdit(null);
    if (openNewOnMount && createdTipo && onTipoCreado) {
      onTipoCreado(createdTipo);
    }
  };

  if (isFormOpen) {
    return (
      <TipoHabitacionForm 
        onCancel={handleFormCancel} 
        onSaved={handleFormSaved} 
        tipoToEdit={tipoToEdit} 
      />
    );
  }

  const columns: Column<any>[] = [
    {
      header: 'Nombre',
      render: (tipo: any) => {
        const principal = tipo.imagenes_tipo_habitacion?.find((img: any) => img.es_principal)
          || tipo.imagenes_tipo_habitacion?.[0];

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {principal ? (
              <img
                src={principal.ruta_storage}
                alt={`Tipo ${tipo.nombre}`}
                className="room-card-thumb"
              />
            ) : (
              <div className="room-card-thumb-empty">
                <ImageIcon size={18} />
              </div>
            )}
            <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#60a5fa' }}>
              {tipo.nombre}
            </div>
          </div>
        );
      }
    },
    {
      header: 'Capacidad',
      render: (tipo: any) => (
        <span>{tipo.capacidad} Personas</span>
      )
    },
    {
      header: 'Descripción',
      render: (tipo: any) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {tipo.descripcion ? (tipo.descripcion.length > 80 ? tipo.descripcion.substring(0, 80) + '...' : tipo.descripcion) : '-'}
        </span>
      )
    },
    {
      header: 'Acciones',
      align: 'center',
      render: (tipo: any) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button 
            onClick={() => handleEditTipo(tipo)}
            className="login-btn"
            style={{ 
              width: 'auto', 
              padding: '6px 12px', 
              fontSize: '13px', 
              background: 'rgba(59, 130, 246, 0.2)', 
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.4)'
            }}
          >
            Editar
          </button>
        </div>
      )
    }
  ];

  const filteredTipos = tipos.filter(tipo => {
    if (!searchTerm) return true;
    const lowerSearch = searchTerm.toLowerCase();
    return tipo.nombre?.toLowerCase().includes(lowerSearch);
  });

  return (
    <ModuleLayout
      title="Tipos de Habitaciones"
      description="Administra las categorías de habitaciones del hotel"
      actions={
        <>
          <button onClick={onBack} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
            Volver Al Inicio
          </button>
          <button onClick={handleNewTipo} className="login-btn" style={{ width: 'auto', padding: '10px 20px' }}>
            + Nuevo Tipo
          </button>
        </>
      }
    >
      {error && (
        <div className="status-message status-error" style={{ marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          className="input-field" 
          placeholder="Buscar por nombre..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: '400px' }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="loader"></div>
        </div>
      ) : (
        <DataTable 
          data={filteredTipos} 
          columns={columns} 
          emptyMessage="No hay tipos de habitaciones registrados o ninguno coincide con la búsqueda."
          keyExtractor={(item) => item.id}
        />
      )}
    </ModuleLayout>
  );
}
