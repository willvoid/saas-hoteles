import { useEffect, useState } from 'react';
import { TarifaService } from '../services/tarifaService';
import TarifaForm from './TarifaForm';
import type { TarifaBorrador } from './TarifaForm';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import '../index.css';

interface ManageTarifasProps {
  onBack: () => void;
  /**
   * Lleva al alta de un tipo de habitación desde el formulario. Recibe el
   * borrador y la tarifa en edición (null si es un alta) para poder reabrir
   * el formulario tal cual al volver.
   */
  onCrearTipo?: (borrador: TarifaBorrador, tarifaEnEdicion: any | null) => void;
  /** Reapertura del formulario al volver de Tipos, con lo que ya estaba cargado. */
  reabrirFormulario?: { borrador: TarifaBorrador; tarifaEnEdicion: any | null } | null;
  /** Avisa que ya se aplicó `reabrirFormulario`, para que no se reutilice. */
  onReabrirFormularioConsumido?: () => void;
}

export default function ManageTarifas({
  onBack,
  onCrearTipo,
  reabrirFormulario,
  onReabrirFormularioConsumido,
}: ManageTarifasProps) {
  const [tarifas, setTarifas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(!!reabrirFormulario);
  const [tarifaToEdit, setTarifaToEdit] = useState<any | null>(
    reabrirFormulario?.tarifaEnEdicion ?? null
  );
  // Borrador a restaurar en el formulario; se usa una sola vez, al reabrirlo
  // tras crear (o cancelar) un tipo de habitación.
  const [borradorPendiente, setBorradorPendiente] = useState<TarifaBorrador | null>(
    reabrirFormulario?.borrador ?? null
  );

  useEffect(() => {
    if (!isFormOpen) {
      fetchTarifas();
    }
  }, [isFormOpen]);

  // El estado inicial ya consumió `reabrirFormulario`; se avisa para que
  // Dashboard lo descarte y no vuelva a abrir el formulario más adelante.
  useEffect(() => {
    if (reabrirFormulario) onReabrirFormularioConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTarifas = async () => {
    try {
      setLoading(true);
      const data = await TarifaService.getTarifas();
      setTarifas(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar las tarifas.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewTarifa = () => {
    setTarifaToEdit(null);
    setBorradorPendiente(null);
    setIsFormOpen(true);
  };

  const handleEditTarifa = (tarifa: any) => {
    setTarifaToEdit(tarifa);
    setBorradorPendiente(null);
    setIsFormOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setTarifaToEdit(null);
    setBorradorPendiente(null);
  };

  const handleFormSaved = () => {
    setIsFormOpen(false);
    setTarifaToEdit(null);
    setBorradorPendiente(null);
  };

  if (isFormOpen) {
    return (
      <TarifaForm
        onCancel={handleFormCancel}
        onSaved={handleFormSaved}
        tarifaToEdit={tarifaToEdit}
        onCrearTipo={onCrearTipo ? (borrador) => onCrearTipo(borrador, tarifaToEdit) : undefined}
        borradorInicial={borradorPendiente}
        onBorradorInicialConsumido={() => setBorradorPendiente(null)}
      />
    );
  }

  const columns: Column<any>[] = [
    {
      header: 'Nombre',
      render: (tar: any) => (
        <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
          {tar.nombre}
        </div>
      )
    },
    {
      header: 'Tipo de Habitación',
      render: (tar: any) => (
        <span>{tar.tipo_habitacion?.nombre || '-'}</span>
      )
    },
    {
      header: 'Precio Base',
      render: (tar: any) => (
        <span style={{ color: '#10b981', fontWeight: 'bold' }}>
          Gs. {tar.precio_base.toLocaleString()}
        </span>
      )
    },
    {
      header: 'Estado',
      render: (tar: any) => (
        <span style={{ 
          color: tar.estado === 'Activa' ? '#10b981' : '#ef4444', 
          backgroundColor: tar.estado === 'Activa' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          {tar.estado}
        </span>
      )
    },
    {
      header: 'Fecha Inicio',
      render: (tar: any) => (
        <span>{new Date(tar.fecha_inicio).toLocaleDateString()}</span>
      )
    },
    {
      header: 'Fecha Fin',
      render: (tar: any) => (
        <span>{tar.fecha_fin ? new Date(tar.fecha_fin).toLocaleDateString() : '-'}</span>
      )
    },
    {
      header: 'Acciones',
      align: 'center',
      render: (tar: any) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button 
            onClick={() => handleEditTarifa(tar)}
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

  const filteredTarifas = tarifas.filter(tar => {
    if (!searchTerm) return true;
    return tar.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <ModuleLayout
      title="Gestión de Tarifas"
      description="Administra los precios base para los tipos de habitación"
      actions={
        <>
          <button onClick={onBack} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
            Volver Al Inicio
          </button>
          <button onClick={handleNewTarifa} className="login-btn" style={{ width: 'auto', padding: '10px 20px' }}>
            + Nueva Tarifa
          </button>
        </>
      }
    >
      {error && (
        <div className="status-message status-error" style={{ marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
        <div className="input-group" style={{ marginBottom: 0, flex: 1, maxWidth: '400px' }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Buscar tarifa por nombre..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="loader"></div>
        </div>
      ) : (
        <DataTable 
          data={filteredTarifas} 
          columns={columns} 
          emptyMessage="No hay tarifas registradas o ninguna coincide con la búsqueda."
          keyExtractor={(item) => item.id}
        />
      )}
    </ModuleLayout>
  );
}
