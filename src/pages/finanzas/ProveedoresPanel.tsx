import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { Campo } from '../../components/finanzas/Campo';
import { ActivoBadge } from '../../components/finanzas/EstadoBadge';
import { finanzasService } from '../../services/finanzasService';
import { mensajeDeError } from '../../utils/facturaCredito';
import { validarProveedorForm } from '../../utils/finanzasForm';
import type { ErroresForm, ProveedorFormValores } from '../../utils/finanzasForm';
import type { Proveedor, ProveedorInput } from '../../types/finanzas';

const VACIO: ProveedorFormValores = { nombre: '', ruc: '', telefono: '', email: '' };

/** Blank optional text is stored as null so the RUC uniqueness only applies to
 *  suppliers that really have one. */
function aInput(valores: ProveedorFormValores): ProveedorInput {
  return {
    nombre: valores.nombre.trim(),
    ruc: valores.ruc.trim() || null,
    telefono: valores.telefono.trim() || null,
    email: valores.email.trim() || null,
  };
}

interface ProveedorFormModalProps {
  /** null = new supplier. */
  proveedor: Proveedor | null;
  onClose: () => void;
  onSaved: () => void;
}

function ProveedorFormModal({ proveedor, onClose, onSaved }: ProveedorFormModalProps) {
  const [valores, setValores] = useState<ProveedorFormValores>(
    proveedor
      ? {
          nombre: proveedor.nombre,
          ruc: proveedor.ruc ?? '',
          telefono: proveedor.telefono ?? '',
          email: proveedor.email ?? '',
        }
      : VACIO,
  );
  const [errores, setErrores] = useState<ErroresForm>({});
  const [errorBase, setErrorBase] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (campo: keyof ProveedorFormValores, valor: string) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => ({ ...prev, [campo]: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validarProveedorForm(valores);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setSaving(true);
    setErrorBase(null);
    try {
      if (proveedor) await finanzasService.actualizarProveedor(proveedor.id, aInput(valores));
      else await finanzasService.crearProveedor(aInput(valores));
      onSaved();
    } catch (err: unknown) {
      // Includes the duplicate RUC message of the database.
      setErrorBase(mensajeDeError(err, 'No se pudo guardar el proveedor.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}>
      <form onSubmit={handleSubmit} noValidate>
        {errorBase && <div className="fin-error-box" role="alert">{errorBase}</div>}
        <Campo label="Nombre" htmlFor="prov-nombre" error={errores.nombre}>
          <input
            id="prov-nombre"
            className={`input-field ${errores.nombre ? 'input-error' : ''}`}
            value={valores.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            autoFocus
          />
        </Campo>
        <Campo label="RUC (opcional)" htmlFor="prov-ruc" error={errores.ruc}>
          <input
            id="prov-ruc"
            className="input-field"
            value={valores.ruc}
            placeholder="80012345-6"
            onChange={(e) => set('ruc', e.target.value)}
          />
        </Campo>
        <Campo label="Teléfono (opcional)" htmlFor="prov-tel">
          <input
            id="prov-tel"
            className="input-field"
            value={valores.telefono}
            onChange={(e) => set('telefono', e.target.value)}
          />
        </Campo>
        <Campo label="Email (opcional)" htmlFor="prov-email" error={errores.email}>
          <input
            id="prov-email"
            type="email"
            className={`input-field ${errores.email ? 'input-error' : ''}`}
            value={valores.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Campo>
        <div className="fin-form-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary-sm" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Supplier catalog. Suppliers are never deleted: they are deactivated, which
// hides them from new expenses but keeps the history readable.
export default function ProveedoresPanel() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarInactivos, setMostrarInactivos] = useState(true);
  // undefined = form closed, null = new supplier, otherwise the one being edited.
  const [editando, setEditando] = useState<Proveedor | null | undefined>(undefined);
  const [cambiandoId, setCambiandoId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setProveedores(await finanzasService.getProveedores());
      setError(null);
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'No se pudieron cargar los proveedores.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const toggleActivo = async (p: Proveedor) => {
    setCambiandoId(p.id);
    setError(null);
    try {
      await finanzasService.setProveedorActivo(p.id, !p.activo);
      await cargar();
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado del proveedor.'));
    } finally {
      setCambiandoId(null);
    }
  };

  const visibles = mostrarInactivos ? proveedores : proveedores.filter((p) => p.activo);

  const columns: Column<Proveedor>[] = [
    { header: 'Nombre', render: (p) => <strong>{p.nombre}</strong> },
    { header: 'RUC', render: (p) => p.ruc ?? '-' },
    { header: 'Teléfono', render: (p) => p.telefono ?? '-' },
    { header: 'Email', render: (p) => p.email ?? '-' },
    { header: 'Estado', render: (p) => <ActivoBadge activo={p.activo} /> },
    {
      header: 'Acciones',
      align: 'center',
      render: (p) => (
        <div className="fin-actions" style={{ justifyContent: 'center' }}>
          <button className="btn-ghost" onClick={() => setEditando(p)}>Editar</button>
          <button className="btn-ghost" onClick={() => toggleActivo(p)} disabled={cambiandoId === p.id}>
            {p.activo ? 'Desactivar' : 'Reactivar'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="tab-content">
      <div className="fin-toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={mostrarInactivos}
            onChange={(e) => setMostrarInactivos(e.target.checked)}
          />
          Mostrar inactivos
        </label>
        <button className="btn-primary-sm" onClick={() => setEditando(null)}>
          <Plus size={15} /> Nuevo proveedor
        </button>
      </div>

      {error && <div className="fin-error-box" role="alert">{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        <DataTable
          data={visibles}
          columns={columns}
          emptyMessage="Todavía no hay proveedores registrados."
          keyExtractor={(p) => p.id}
        />
      )}

      {editando !== undefined && (
        <ProveedorFormModal
          // Remount per supplier so the form starts from its values.
          key={editando?.id ?? 'nuevo'}
          proveedor={editando}
          onClose={() => setEditando(undefined)}
          onSaved={() => {
            setEditando(undefined);
            void cargar();
          }}
        />
      )}
    </div>
  );
}
