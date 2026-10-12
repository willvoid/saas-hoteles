import { useEffect, useState } from 'react';
import { PisoService } from '../services/pisoService';
import PisoForm from './PisoForm';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { Modal } from '../components/Modal';
import '../index.css';
import { COLORS, tint } from '../constants/colors';

interface ManagePisosProps {
  onBack: () => void;
}

const isInactivo = (p: any) => (p.estado || 'Activo').trim().toLowerCase() === 'inactivo';

export default function ManagePisos({ onBack }: ManagePisosProps) {
  const [pisos, setPisos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pisoToEdit, setPisoToEdit] = useState<any | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isFormOpen) {
      fetchPisos();
    }
  }, [isFormOpen]);

  const fetchPisos = async () => {
    try {
      setLoading(true);
      const data = await PisoService.getPisos();
      setPisos(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los pisos.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewPiso = () => {
    setPisoToEdit(null);
    setIsFormOpen(true);
  };

  const handleEditPiso = (piso: any) => {
    setPisoToEdit(piso);
    setIsFormOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setPisoToEdit(null);
  };

  const handleFormSaved = () => {
    setIsFormOpen(false);
    setPisoToEdit(null);
  };

  const executeToggleEstado = async () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    const nuevoEstado = isInactivo(target) ? 'Activo' : 'Inactivo';
    setSaving(true);
    setError(null);
    try {
      await PisoService.setEstado(target.id, nuevoEstado as 'Activo' | 'Inactivo');
      setConfirmTarget(null);
      setSuccess(
        nuevoEstado === 'Inactivo'
          ? `El piso #${target.numero} fue desactivado.`
          : `El piso #${target.numero} fue reactivado correctamente.`
      );
      setTimeout(() => setSuccess(null), 4000);
      await fetchPisos();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar el estado del piso.');
    } finally {
      setSaving(false);
    }
  };

  if (isFormOpen) {
    return (
      <PisoForm
        onCancel={handleFormCancel}
        onSaved={handleFormSaved}
        pisoToEdit={pisoToEdit}
      />
    );
  }

  const columns: Column<any>[] = [
    {
      header: 'Número',
      render: (p: any) => <span style={{ fontWeight: 'bold', fontSize: '15px' }}>Piso {p.numero}</span>
    },
    {
      header: 'Edificio',
      render: (p: any) => (
        <span style={{
          color: COLORS.purpleLight,
          backgroundColor: tint('purple', 0.1),
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          {p.edificio?.nombre || '-'}
        </span>
      )
    },
    {
      header: 'Estado',
      render: (p: any) => {
        const inactivo = isInactivo(p);
        return (
          <span style={{
            color: inactivo ? COLORS.error : COLORS.success,
            backgroundColor: inactivo ? tint('error', 0.1) : tint('success', 0.1),
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            {inactivo ? 'Inactivo' : 'Activo'}
          </span>
        );
      }
    },
    {
      header: 'Fecha de Creación',
      render: (p: any) => (
        <span>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}</span>
      )
    },
    {
      header: 'Acciones',
      align: 'center',
      render: (p: any) => {
        const inactivo = isInactivo(p);
        return (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => handleEditPiso(p)}
              className="login-btn"
              style={{
                width: 'auto',
                padding: '6px 12px',
                fontSize: '13px',
                background: tint('primary', 0.2),
                color: COLORS.primaryLight,
                border: `1px solid ${tint('primary', 0.4)}`
              }}
            >
              Editar
            </button>
            <button
              onClick={() => setConfirmTarget(p)}
              className="login-btn"
              style={{
                width: 'auto',
                padding: '6px 12px',
                fontSize: '13px',
                background: inactivo ? tint('success', 0.2) : tint('error', 0.2),
                color: inactivo ? COLORS.successLight : COLORS.errorLight,
                border: inactivo ? `1px solid ${tint('success', 0.4)}` : `1px solid ${tint('error', 0.4)}`
              }}
            >
              {inactivo ? 'Reactivar' : 'Desactivar'}
            </button>
          </div>
        );
      }
    }
  ];

  const filteredPisos = pisos.filter(p => {
    if (!showInactivos && isInactivo(p)) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return String(p.numero).includes(term) ||
      p.edificio?.nombre?.toLowerCase().includes(term);
  });

  const confirmInactivo = confirmTarget ? isInactivo(confirmTarget) : false;

  return (
    <ModuleLayout
      title="Gestión de Pisos"
      description="Administra los pisos asociados a cada edificio"
      actions={
        <>
          <button onClick={onBack} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
            Volver Al Inicio
          </button>
          <button onClick={handleNewPiso} className="login-btn" style={{ width: 'auto', padding: '10px 20px' }}>
            + Nuevo Piso
          </button>
        </>
      }
    >
      {error && (
        <div className="status-message status-error" style={{ marginBottom: '20px' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="status-message status-success" style={{ marginBottom: '20px' }}>
          {success}
        </div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="input-group" style={{ marginBottom: 0, flex: 1, maxWidth: '400px' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Buscar por número o edificio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showInactivos}
            onChange={(e) => setShowInactivos(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: COLORS.purple, cursor: 'pointer' }}
          />
          Mostrar inactivos
        </label>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="loader"></div>
        </div>
      ) : (
        <DataTable
          data={filteredPisos}
          columns={columns}
          emptyMessage="No hay pisos registrados o ninguno coincide con la búsqueda."
          keyExtractor={(item) => item.id}
        />
      )}

      <Modal
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={confirmInactivo ? 'Reactivar Piso' : 'Desactivar Piso'}
      >
        {confirmTarget && (
          <div>
            <p style={{ color: 'var(--text-primary)', fontSize: '15px', marginTop: 0 }}>
              {confirmInactivo
                ? <>¿Deseas reactivar el piso <strong>#{confirmTarget.numero}</strong>?</>
                : <>¿Deseas desactivar el piso <strong>#{confirmTarget.numero}</strong>?</>}
            </p>
            <p style={{
              color: confirmInactivo ? COLORS.successLight : COLORS.errorLighter,
              fontSize: '13px',
              background: confirmInactivo ? tint('success', 0.08) : tint('error', 0.08),
              border: confirmInactivo ? `1px solid ${tint('success', 0.2)}` : `1px solid ${tint('error', 0.2)}`,
              borderRadius: '10px',
              padding: '10px 14px'
            }}>
              {confirmInactivo
                ? 'El piso volverá a estar disponible en el sistema.'
                : 'El piso no se elimina de la base de datos: quedará marcado como inactivo.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => setConfirmTarget(null)}
                className="login-btn"
                style={{ width: 'auto', padding: '10px 20px', background: 'transparent', border: '1px solid var(--glass-border)' }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={executeToggleEstado}
                className="login-btn"
                style={{
                  width: 'auto',
                  padding: '10px 20px',
                  background: confirmInactivo ? tint('success', 0.25) : tint('error', 0.25),
                  color: confirmInactivo ? COLORS.successLight : COLORS.errorLight,
                  border: confirmInactivo ? `1px solid ${tint('success', 0.4)}` : `1px solid ${tint('error', 0.4)}`
                }}
                disabled={saving}
              >
                {saving ? 'Guardando...' : (confirmInactivo ? 'Sí, Reactivar' : 'Sí, Desactivar')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ModuleLayout>
  );
}
