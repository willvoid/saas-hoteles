import { useEffect, useState } from 'react';
import { ClientService } from '../services/clientService';
import CreateClient from './CreateClient';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { ClienteRecurrenteBadge } from '../components/ClienteRecurrenteBadge';
import { isClienteRecurrente, getReservationCount } from '../utils/clienteRecurrencia';
import '../index.css';
import { COLORS, tint } from '../constants/colors';

interface ManageClientsProps {
  onBack: () => void;
  /** Abre directo en "Registrar Cliente" (llegada desde Nueva Reserva). */
  openNewOnMount?: boolean;
  /**
   * Sólo se dispara si el cliente se creó (no al editar) mientras
   * `openNewOnMount` seguía activo: es la señal para que Dashboard vuelva a
   * Nueva Reserva con este cliente ya seleccionado.
   */
  onClienteCreado?: (cliente: any) => void;
  /**
   * Ídem al cancelar el alta: vuelve a Nueva Reserva sin cliente nuevo, en
   * vez de dejar al usuario en el listado que no vino a ver.
   */
  onCancelarCreacion?: () => void;
}

export default function ManageClients({
  onBack,
  openNewOnMount = false,
  onClienteCreado,
  onCancelarCreacion,
}: ManageClientsProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // States para el flujo C/U
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<any | null>(null);

  useEffect(() => {
    if (!isFormOpen) {
      fetchClients();
    }
  }, [isFormOpen]);

  // Sólo se evalúa al montar: Dashboard remonta este componente cada vez que
  // se entra a la pestaña, así que esto captura únicamente la llegada directa
  // desde Nueva Reserva, no cada clic posterior en el menú.
  useEffect(() => {
    if (openNewOnMount) {
      setClientToEdit(null);
      setIsFormOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const data = await ClientService.getClients();
      setClients(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los clientes.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewClient = () => {
    setClientToEdit(null);
    setIsFormOpen(true);
  };

  const handleEditClient = (client: any) => {
    setClientToEdit(client);
    setIsFormOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setClientToEdit(null);
    if (openNewOnMount && onCancelarCreacion) {
      onCancelarCreacion();
    }
  };

  const handleFormSaved = (createdClient?: any) => {
    setIsFormOpen(false);
    setClientToEdit(null);
    if (openNewOnMount && createdClient && onClienteCreado) {
      onClienteCreado(createdClient);
    }
  };

  if (isFormOpen) {
    return (
      <CreateClient 
        onCancel={handleFormCancel} 
        onCreated={handleFormSaved} 
        clientToEdit={clientToEdit} 
      />
    );
  }

  const columns: Column<any>[] = [
    {
      header: 'Documento',
      render: (client: any) => (
        <div style={{ fontWeight: '500' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block' }}>
            {client.tipo_documento?.descripcion_tipodoc || `Tipo ID: ${client.fk_tipo_documento}`}
          </span>
          {client.documento || '-'}
        </div>
      )
    },
    {
      header: 'Razón Social / Cliente',
      render: (client: any) => {
        const isRec = isClienteRecurrente(client);
        const count = getReservationCount(client);
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '500' }}>{client.razon_social || '-'}</span>
            <ClienteRecurrenteBadge isRecurrente={isRec} count={count} showCount size="sm" />
          </div>
        );
      }
    },
    {
      header: 'Teléfono',
      render: (client: any) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {client.celular || client.telefono || '-'}
        </span>
      )
    },
    {
      header: 'Correo',
      render: (client: any) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {client.email || '-'}
        </span>
      )
    },
    {
      header: 'Estado',
      render: (client: any) => (
        <span style={{ 
          padding: '4px 10px', 
          borderRadius: '20px', 
          fontSize: '12px', 
          fontWeight: '600',
          backgroundColor: client.estado_cliente === 'Activo' ? tint('success', 0.2) : tint('error', 0.2),
          color: client.estado_cliente === 'Activo' ? COLORS.success : COLORS.error,
          border: `1px solid ${client.estado_cliente === 'Activo' ? tint('success', 0.4) : tint('error', 0.4)}`
        }}>
          {client.estado_cliente || 'Desconocido'}
        </span>
      )
    },
    {
      header: 'Acciones',
      align: 'center',
      render: (client: any) => (
        <button 
          onClick={() => handleEditClient(client)}
          className="login-btn"
          style={{ 
            width: 'auto', 
            padding: '6px 16px', 
            fontSize: '13px', 
            background: tint('primary', 0.2), 
            color: COLORS.primaryLight,
            border: `1px solid ${tint('primary', 0.4)}`
          }}
        >
          Editar
        </button>
      )
    }
  ];

  return (
    <ModuleLayout
      title="Directorio de Clientes"
      description="Visualiza y edita los perfiles de los clientes"
      actions={
        <>
          <button onClick={onBack} className="login-btn" style={{ flex: 1, minWidth: '120px', padding: '10px 15px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
            Volver Al Inicio
          </button>
          <button onClick={handleNewClient} className="login-btn" style={{ flex: 1, minWidth: '140px', padding: '10px 15px' }}>
            + Nuevo Cliente
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
          placeholder="Buscar clientes por Razón Social, Documento o Celular..." 
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
          data={clients.filter(client => {
            if (!searchTerm) return true;
            const lowerSearch = searchTerm.toLowerCase();
            const matchRazon = client.razon_social?.toLowerCase().includes(lowerSearch);
            const matchDoc = client.documento?.toLowerCase().includes(lowerSearch);
            const matchCelular = client.celular?.toLowerCase().includes(lowerSearch);
            const isRec = isClienteRecurrente(client);
            const recurrenteLabel = isRec ? 'recurrente' : 'no recurrente';
            const matchRecurrente = recurrenteLabel.includes(lowerSearch);
            return matchRazon || matchDoc || matchCelular || matchRecurrente;
          })} 
          columns={columns} 
          emptyMessage="No hay clientes registrados en el sistema o ningún cliente coincide con la búsqueda."
          keyExtractor={(item) => item.id_cliente}
        />
      )}
    </ModuleLayout>
  );
}
