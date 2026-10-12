import { useEffect, useState } from 'react';
import { EdificioService } from '../services/edificioService';
import EdificioForm from './EdificioForm';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { Modal } from '../components/Modal';
import '../index.css';
import { COLORS, tint } from '../constants/colors';

interface ManageEdificiosProps {
  onBack: () => void;
}

const isInactivo = (e: any) => (e.estado || 'Activo').trim().toLowerCase() === 'inactivo';

export default function ManageEdificios({ onBack }: ManageEdificiosProps) {
  const [edificios, setEdificios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [edificioToEdit, setEdificioToEdit] = useState<any | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isFormOpen) {
      fetchEdificios();
    }
  }, [isFormOpen]);

  const fetchEdificios = async () => {
    try {
      setLoading(true);
      const data = await EdificioService.getEdificios();
      setEdificios(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los edificios.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewEdificio = () => {
    setEdificioToEdit(null);
    setIsFormOpen(true);
  };

  const handleEditEdificio = (edificio: any) => {
    setEdificioToEdit(edificio);
    setIsFormOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setEdificioToEdit(null);
  };

  const handleFormSaved = () => {
    setIsFormOpen(false);
    setEdificioToEdit(null);
  };

  const executeToggleEstado = async () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    const nuevoEstado = isInactivo(target) ? 'Activo' : 'Inactivo';
    setSaving(true);
    setError(null);
    try {
      await EdificioService.setEstado(target.id, nuevoEstado as 'Activo' | 'Inactivo');
      setConfirmTarget(null);
      setSuccess(
        nuevoEstado === 'Inactivo'
          ? `El edificio "${target.nombre}" fue desactivado.`
          : `El edificio "${target.nombre}" fue reactivado correctamente.`
      );
      setTimeout(() => setSuccess(null), 4000);
      await fetchEdificios();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar el estado del edificio.');
    } finally {
      setSaving(false);
    }
  };

  if (isFormOpen) {
    return (
      <EdificioForm
        onCancel={handleFormCancel}
        onSaved={handleFormSaved}
        edificioToEdit={edificioToEdit}
      />
    );
  }

  const columns: Column<any>[] = [
    {
      header: 'Nombre',
      render: (e: any) => <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{e.nombre}</span>
    },
    {
      header: 'Establecimiento',
      render: (e: any) => (
        <span style={{
          color: COLORS.purpleLight,
          backgroundColor: tint('purple', 0.1),
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          {e.establecimiento?.denominacion || '-'}
        </span>
      )
    },
    {
      header: 'Pisos',
      render: (e: any) => {
        const pisos = (e.pisos || []).slice().sort((a: any, b: any) => a.numero - b.numero);
        if (pisos.length === 0) {
          return <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Sin pisos</span>;
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '220px' }}>
            {pisos.map((piso: any) => {
              const pisoInactivo = (piso.estado || 'Activo').trim().toLowerCase() === 'inactivo';
              return (
                <span
                  key={piso.id}
                  title={pisoInactivo ? `Piso ${piso.numero} (inactivo)` : `Piso ${piso.numero}`}
                  style={{
                    color: pisoInactivo ? COLORS.textSecondary : COLORS.successLight,
                    backgroundColor: pisoInactivo ? tint('textSecondary', 0.1) : tint('success', 0.1),
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 'bold'
                  }}
                >
                  {piso.numero}
                </span>
              );
            })}
          </div>
        );
      }
    },
    {
      header: 'Estado',
      render: (e: any) => {
        const inactivo = isInactivo(e);
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
      render: (e: any) => (
        <span>{e.created_at ? new Date(e.created_at).toLocaleDateString() : '-'}</span>
      )
    },
    {
      header: 'Acciones',
      align: 'center',
      render: (e: any) => {
        const inactivo = isInactivo(e);
        return (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => handleEditEdificio(e)}
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
              onClick={() => setConfirmTarget(e)}
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

  const filteredEdificios = edificios.filter(e => {
    if (!showInactivos && isInactivo(e)) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return e.nombre?.toLowerCase().includes(term) ||
      e.establecimiento?.denominacion?.toLowerCase().includes(term);
  });

  const confirmInactivo = confirmTarget ? isInactivo(confirmTarget) : false;

  return (
    <ModuleLayout
      title="Gestión de Edificios"
      description="Administra los edificios asociados a cada establecimiento"
      actions={
        <>
          <button onClick={onBack} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
            Volver Al Inicio
          </button>
          <button onClick={handleNewEdificio} className="login-btn" style={{ width: 'auto', padding: '10px 20px' }}>
            + Nuevo Edificio
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
            placeholder="Buscar por nombre o establecimiento..."
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
          data={filteredEdificios}
          columns={columns}
          emptyMessage="No hay edificios registrados o ninguno coincide con la búsqueda."
          keyExtractor={(item) => item.id}
        />
      )}

      <Modal
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={confirmInactivo ? 'Reactivar Edificio' : 'Desactivar Edificio'}
      >
        {confirmTarget && (
          <div>
            <p style={{ color: 'var(--text-primary)', fontSize: '15px', marginTop: 0 }}>
              {confirmInactivo
                ? <>¿Deseas reactivar el edificio <strong>{confirmTarget.nombre}</strong>?</>
                : <>¿Deseas desactivar el edificio <strong>{confirmTarget.nombre}</strong>?</>}
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
                ? 'El edificio volverá a estar disponible en el sistema.'
                : 'El edificio no se elimina de la base de datos: quedará marcado como inactivo.'}
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
