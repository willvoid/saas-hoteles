import { useEffect, useState } from 'react';
import { ConceptoService } from '../services/conceptoService';
import ProductoForm from './ProductoForm';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { Modal } from '../components/Modal';
import { formatGs } from '../utils/currency';
import '../index.css';
import { COLORS, tint } from '../constants/colors';

interface ManageProductosProps {
  onBack: () => void;
  /** Abre directo en "Nuevo Producto" (llegada desde "Cargar Consumo" en Folios). */
  openNewOnMount?: boolean;
  /**
   * Sólo se dispara si el producto se creó (no al editar) mientras
   * `openNewOnMount` seguía activo: es la señal para que Dashboard vuelva al
   * folio de origen con este producto ya seleccionado en "Cargar Consumo".
   */
  onProductoCreado?: (concepto: any) => void;
  /**
   * Se dispara al cancelar el alta mientras `openNewOnMount` seguía activo: es
   * la señal para que Dashboard vuelva al folio de origen y reabra "Cargar
   * Consumo" (vacío, sin producto preseleccionado).
   */
  onCancelarCreacion?: () => void;
}

const isInactivo = (c: any) => (c.estado || 'ACTIVO').trim().toLowerCase() === 'inactivo';

export default function ManageProductos({ onBack, openNewOnMount = false, onProductoCreado, onCancelarCreacion }: ManageProductosProps) {
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [productoToEdit, setProductoToEdit] = useState<any | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isFormOpen) {
      fetchConceptos();
    }
  }, [isFormOpen]);

  // Sólo se evalúa al montar: Dashboard remonta este componente cada vez que
  // se entra a la pestaña, así que esto captura únicamente la llegada directa
  // desde "Cargar Consumo" (Folios), no cada clic posterior en el menú.
  useEffect(() => {
    if (openNewOnMount) {
      setProductoToEdit(null);
      setIsFormOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchConceptos = async () => {
    try {
      setLoading(true);
      const data = await ConceptoService.getConceptos();
      setConceptos(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los productos.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewProducto = () => {
    setProductoToEdit(null);
    setIsFormOpen(true);
  };

  const handleEditProducto = (producto: any) => {
    setProductoToEdit(producto);
    setIsFormOpen(true);
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setProductoToEdit(null);
    // Llegada rápida desde Folios: cancelar también vuelve al folio, en vez de
    // dejar al usuario mirando el catálogo que no vino a ver.
    if (openNewOnMount && onCancelarCreacion) {
      onCancelarCreacion();
    }
  };

  const handleFormSaved = (createdConcepto?: any) => {
    setIsFormOpen(false);
    setProductoToEdit(null);
    // Llegada rápida desde Folios: en vez de quedarse en el catálogo, se avisa
    // a Dashboard para volver al folio con este producto ya cargado.
    if (openNewOnMount && createdConcepto && onProductoCreado) {
      onProductoCreado(createdConcepto);
    }
  };

  const executeToggleEstado = async () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    const nuevoEstado = isInactivo(target) ? 'ACTIVO' : 'INACTIVO';
    setSaving(true);
    setError(null);
    try {
      await ConceptoService.setEstado(target.id_concepto, nuevoEstado as 'ACTIVO' | 'INACTIVO');
      setConfirmTarget(null);
      setSuccess(
        nuevoEstado === 'INACTIVO'
          ? `El producto "${target.nombre}" fue desactivado.`
          : `El producto "${target.nombre}" fue reactivado correctamente.`
      );
      setTimeout(() => setSuccess(null), 4000);
      await fetchConceptos();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar el estado del producto.');
    } finally {
      setSaving(false);
    }
  };

  if (isFormOpen) {
    return (
      <ProductoForm
        onCancel={handleFormCancel}
        onSaved={handleFormSaved}
        productoToEdit={productoToEdit}
      />
    );
  }

  const columns: Column<any>[] = [
    {
      header: 'Nombre',
      render: (c: any) => (
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{c.nombre}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.descripcion || '-'}</div>
        </div>
      )
    },
    {
      header: 'Precio Unitario',
      render: (c: any) => <span style={{ fontWeight: 'bold' }}>{formatGs(c.arancel)}</span>
    },
    {
      header: 'IVA',
      render: (c: any) => <span>{c.iva ? `${c.iva.descripcion} (${c.iva.valor}%)` : '-'}</span>
    },
    {
      header: 'Unidad',
      render: (c: any) => <span>{c.unidad?.descripcion || '-'}</span>
    },
    {
      header: 'Estado',
      render: (c: any) => {
        const inactivo = isInactivo(c);
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
      header: 'Acciones',
      align: 'center',
      render: (c: any) => {
        const inactivo = isInactivo(c);
        return (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => handleEditProducto(c)}
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
              onClick={() => setConfirmTarget(c)}
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

  const filteredConceptos = conceptos.filter(c => {
    if (!showInactivos && isInactivo(c)) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return c.nombre?.toLowerCase().includes(term) ||
      c.descripcion?.toLowerCase().includes(term);
  });

  const confirmInactivo = confirmTarget ? isInactivo(confirmTarget) : false;

  return (
    <ModuleLayout
      title="Productos y Servicios"
      description="Administra el catálogo de productos y servicios, con su IVA y unidad de medida"
      actions={
        <>
          <button onClick={onBack} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
            Volver Al Inicio
          </button>
          <button onClick={handleNewProducto} className="login-btn" style={{ width: 'auto', padding: '10px 20px' }}>
            + Nuevo Producto
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
            placeholder="Buscar por nombre o descripción..."
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
          data={filteredConceptos}
          columns={columns}
          emptyMessage="No hay productos registrados o ninguno coincide con la búsqueda."
          keyExtractor={(item) => item.id_concepto}
        />
      )}

      <Modal
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={confirmInactivo ? 'Reactivar Producto' : 'Desactivar Producto'}
      >
        {confirmTarget && (
          <div>
            <p style={{ color: 'var(--text-primary)', fontSize: '15px', marginTop: 0 }}>
              {confirmInactivo
                ? <>¿Deseas reactivar el producto <strong>{confirmTarget.nombre}</strong>?</>
                : <>¿Deseas desactivar el producto <strong>{confirmTarget.nombre}</strong>?</>}
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
                ? 'El producto volverá a estar disponible para cargar en los folios.'
                : 'El producto no se elimina de la base de datos: quedará inactivo y no podrá cargarse en nuevos consumos.'}
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
