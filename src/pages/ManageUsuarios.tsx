import { useEffect, useState } from 'react';
import { UsuarioService } from '../services/usuarioService';
import UsuarioForm from './UsuarioForm';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { Modal } from '../components/Modal';
import { normalizeRole, canManageUser } from '../utils/permissions';
import '../index.css';

interface ManageUsuariosProps {
  onBack: () => void;
  currentUser: any;
}

const isInactivo = (u: any) => (u.estado || 'Activo').trim().toLowerCase() === 'inactivo';

/** Cargo de una fila del listado (viene del join `cargo:fk_cargo ( cargo )`). */
const rolDe = (u: any) => normalizeRole(u?.cargo?.cargo);

export default function ManageUsuarios({ onBack, currentUser }: ManageUsuariosProps) {
  // Rol de quien está administrando: un gerente no ve ni toca cuentas ADMIN.
  const role = normalizeRole(currentUser?.cargo);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [usuarioToEdit, setUsuarioToEdit] = useState<any | null>(null);

  // Usuario pendiente de confirmación de cambio de estado
  const [confirmTarget, setConfirmTarget] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isFormOpen) {
      fetchUsuarios();
    }
  }, [isFormOpen]);

  const fetchUsuarios = async () => {
    try {
      setLoading(true);
      const data = await UsuarioService.getUsuarios();
      setUsuarios(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewUsuario = () => {
    setUsuarioToEdit(null);
    setIsFormOpen(true);
  };

  const handleEditUsuario = (usuario: any) => {
    if (!canManageUser(role, rolDe(usuario))) {
      setError('No tenés permiso para editar una cuenta de administrador.');
      return;
    }
    setUsuarioToEdit(usuario);
    setIsFormOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setUsuarioToEdit(null);
  };

  const handleFormSaved = () => {
    setIsFormOpen(false);
    setUsuarioToEdit(null);
  };

  const executeToggleEstado = async () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    if (!canManageUser(role, rolDe(target))) {
      setConfirmTarget(null);
      setError('No tenés permiso para cambiar el estado de una cuenta de administrador.');
      return;
    }
    const nuevoEstado = isInactivo(target) ? 'Activo' : 'Inactivo';
    setSaving(true);
    setError(null);
    try {
      await UsuarioService.setEstado(target.id_usuario, nuevoEstado as 'Activo' | 'Inactivo');
      setConfirmTarget(null);
      setSuccess(
        nuevoEstado === 'Inactivo'
          ? `El usuario "${target.nombre}" fue desactivado. Ya no podrá iniciar sesión.`
          : `El usuario "${target.nombre}" fue reactivado correctamente.`
      );
      setTimeout(() => setSuccess(null), 4000);
      await fetchUsuarios();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar el estado del usuario.');
    } finally {
      setSaving(false);
    }
  };

  if (isFormOpen) {
    return (
      <UsuarioForm
        onCancel={handleFormCancel}
        onSaved={handleFormSaved}
        usuarioToEdit={usuarioToEdit}
        currentUser={currentUser}
      />
    );
  }

  const columns: Column<any>[] = [
    {
      header: 'Nombre',
      render: (u: any) => (
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{u.nombre}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>@{u.usuario}</div>
        </div>
      )
    },
    {
      header: 'Documento',
      render: (u: any) => (
        <div>
          <div>{u.documento}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {u.tipo_documento?.descripcion_tipodoc || '-'}
          </div>
        </div>
      )
    },
    {
      header: 'Correo',
      render: (u: any) => (
        <span style={{ display: 'inline-block', maxWidth: '170px', wordBreak: 'break-all', whiteSpace: 'normal', lineHeight: 1.3 }}>
          {u.correo || '-'}
        </span>
      )
    },
    {
      header: 'Teléfono',
      render: (u: any) => (
        <span style={{ display: 'inline-block', maxWidth: '110px', whiteSpace: 'normal', lineHeight: 1.3 }}>
          {u.telefono || '-'}
        </span>
      )
    },
    {
      header: 'Cargo',
      render: (u: any) => (
        <span style={{
          color: '#a78bfa',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          {u.cargo?.cargo || '-'}
        </span>
      )
    },
    {
      header: 'Estado',
      render: (u: any) => {
        const inactivo = isInactivo(u);
        return (
          <span style={{
            color: inactivo ? '#ef4444' : '#10b981',
            backgroundColor: inactivo ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
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
      header: 'Acciones',
      align: 'center',
      render: (u: any) => {
        const inactivo = isInactivo(u);
        const esUsuarioActual = currentUser && u.id_usuario === currentUser.id_usuario;
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
            <button
              onClick={() => handleEditUsuario(u)}
              className="login-btn"
              style={{
                width: 'auto',
                padding: '5px 9px',
                fontSize: '12px',
                whiteSpace: 'nowrap',
                background: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.4)'
              }}
            >
              Editar
            </button>
            {!esUsuarioActual && (
              <button
                onClick={() => setConfirmTarget(u)}
                className="login-btn"
                style={{
                  width: 'auto',
                  padding: '6px 10px',
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                  background: inactivo ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: inactivo ? '#34d399' : '#f87171',
                  border: inactivo ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)'
                }}
              >
                {inactivo ? 'Reactivar' : 'Desactivar'}
              </button>
            )}
          </div>
        );
      }
    }
  ];

  const filteredUsuarios = usuarios.filter(u => {
    // Un gerente no ve las cuentas ADMIN en el listado.
    if (!canManageUser(role, rolDe(u))) return false;
    if (!showInactivos && isInactivo(u)) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return u.nombre?.toLowerCase().includes(term) ||
      u.usuario?.toLowerCase().includes(term) ||
      u.correo?.toLowerCase().includes(term) ||
      u.documento?.toLowerCase().includes(term);
  });

  const confirmInactivo = confirmTarget ? isInactivo(confirmTarget) : false;

  return (
    <ModuleLayout
      title="Gestión de Usuarios"
      description="Administra los usuarios del sistema, sus cargos y su estado laboral"
      actions={
        <>
          <button onClick={onBack} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
            Volver Al Inicio
          </button>
          <button onClick={handleNewUsuario} className="login-btn" style={{ width: 'auto', padding: '10px 20px' }}>
            + Nuevo Usuario
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
            placeholder="Buscar por nombre, usuario, correo o documento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showInactivos}
            onChange={(e) => setShowInactivos(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: '#8b5cf6', cursor: 'pointer' }}
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
          data={filteredUsuarios}
          columns={columns}
          emptyMessage="No hay usuarios registrados o ninguno coincide con la búsqueda."
          keyExtractor={(item) => item.id_usuario}
        />
      )}

      {/* Confirmación de desactivar / reactivar */}
      <Modal
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={confirmInactivo ? 'Reactivar Usuario' : 'Desactivar Usuario'}
      >
        {confirmTarget && (
          <div>
            <p style={{ color: 'var(--text-primary)', fontSize: '15px', marginTop: 0 }}>
              {confirmInactivo
                ? <>¿Deseas reactivar al usuario <strong>{confirmTarget.nombre}</strong> (@{confirmTarget.usuario})?</>
                : <>¿Deseas desactivar al usuario <strong>{confirmTarget.nombre}</strong> (@{confirmTarget.usuario})?</>}
            </p>
            <p style={{
              color: confirmInactivo ? '#34d399' : '#fca5a5',
              fontSize: '13px',
              background: confirmInactivo ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: confirmInactivo ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)',
              borderRadius: '10px',
              padding: '10px 14px'
            }}>
              {confirmInactivo
                ? 'El usuario volverá a poder iniciar sesión en el sistema.'
                : 'El usuario no se elimina de la base de datos: quedará marcado como que ya no trabaja aquí y no podrá iniciar sesión.'}
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
                  background: confirmInactivo ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                  color: confirmInactivo ? '#34d399' : '#f87171',
                  border: confirmInactivo ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)'
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
