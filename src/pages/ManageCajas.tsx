import { useEffect, useState } from 'react';
import { cajaService, type LimiteCajas } from '../services/cajaService';
import { EstablecimientoService } from '../services/establecimientoService';
import CajaForm from './CajaForm';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { Modal } from '../components/Modal';
import '../index.css';
import { COLORS, tint } from '../constants/colors';
import type { Caja } from '../types/factura';

interface ManageCajasProps {
  onBack: () => void;
}

const isInactiva = (c: Caja) => c.estado === 'Inactivo';

export default function ManageCajas({ onBack }: ManageCajasProps) {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [limite, setLimite] = useState<LimiteCajas | null>(null);
  const [establecimientos, setEstablecimientos] = useState<{ id: number; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showInactivas, setShowInactivas] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [cajaToEdit, setCajaToEdit] = useState<Caja | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<Caja | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isFormOpen) {
      fetchData();
    }
  }, [isFormOpen]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cajasData, limiteData, estData] = await Promise.all([
        cajaService.getCajas(),
        cajaService.getLimiteCajas(),
        EstablecimientoService.getEstablecimientos(),
      ]);
      setCajas(cajasData);
      setLimite(limiteData);
      setEstablecimientos(
        estData.map((e: any) => ({ id: e.id_establecimiento, nombre: e.denominacion }))
      );
    } catch (err: any) {
      setError(err.message || 'Error al cargar las cajas.');
    } finally {
      setLoading(false);
    }
  };

  const limiteAlcanzado = !!limite && limite.max !== null && limite.total >= limite.max;

  const nombreEstablecimiento = (id: number | null) =>
    establecimientos.find(e => e.id === id)?.nombre ?? '-';

  const handleFormClose = () => {
    setIsFormOpen(false);
    setCajaToEdit(null);
  };

  const executeToggleEstado = async () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    const nuevoEstado = isInactiva(target) ? 'Activo' : 'Inactivo';
    setSaving(true);
    setError(null);
    try {
      await cajaService.setEstadoCaja(target.id_caja, nuevoEstado);
      setConfirmTarget(null);
      setSuccess(
        nuevoEstado === 'Inactivo'
          ? `La caja #${target.nro_caja} fue desactivada.`
          : `La caja #${target.nro_caja} fue reactivada correctamente.`
      );
      setTimeout(() => setSuccess(null), 4000);
      await fetchData();
    } catch (err: any) {
      setConfirmTarget(null);
      setError(err.message || 'Error al cambiar el estado de la caja.');
    } finally {
      setSaving(false);
    }
  };

  if (isFormOpen) {
    return (
      <CajaForm
        onCancel={handleFormClose}
        onSaved={handleFormClose}
        cajaToEdit={cajaToEdit}
        establecimientos={establecimientos}
      />
    );
  }

  const columns: Column<Caja>[] = [
    {
      header: 'Número',
      render: (c) => <span style={{ fontWeight: 'bold', fontSize: '15px' }}>Caja {c.nro_caja}</span>
    },
    {
      header: 'Descripción',
      render: (c) => <span>{c.descripcion_caja || '-'}</span>
    },
    ...(establecimientos.length > 1 ? [{
      header: 'Establecimiento',
      render: (c: Caja) => (
        <span style={{
          color: COLORS.purpleLight,
          backgroundColor: tint('purple', 0.1),
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          {nombreEstablecimiento(c.fk_establecimientos)}
        </span>
      )
    }] : []),
    {
      header: 'Estado',
      render: (c) => {
        const inactiva = isInactiva(c);
        return (
          <span style={{
            color: inactiva ? COLORS.error : COLORS.success,
            backgroundColor: inactiva ? tint('error', 0.1) : tint('success', 0.1),
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            {inactiva ? 'Inactiva' : 'Activa'}
          </span>
        );
      }
    },
    {
      header: 'Acciones',
      align: 'center',
      render: (c) => {
        const inactiva = isInactiva(c);
        return (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => { setCajaToEdit(c); setIsFormOpen(true); }}
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
                background: inactiva ? tint('success', 0.2) : tint('error', 0.2),
                color: inactiva ? COLORS.successLight : COLORS.errorLight,
                border: inactiva ? `1px solid ${tint('success', 0.4)}` : `1px solid ${tint('error', 0.4)}`
              }}
            >
              {inactiva ? 'Reactivar' : 'Desactivar'}
            </button>
          </div>
        );
      }
    }
  ];

  const filteredCajas = cajas.filter(c => showInactivas || !isInactiva(c));
  const confirmInactiva = confirmTarget ? isInactiva(confirmTarget) : false;

  return (
    <ModuleLayout
      title="Gestión de Cajas"
      description="Administra las cajas disponibles según el límite de tu plan"
      actions={
        <>
          <button onClick={onBack} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
            Volver Al Inicio
          </button>
          <button
            onClick={() => { setCajaToEdit(null); setIsFormOpen(true); }}
            className="login-btn"
            style={{ width: 'auto', padding: '10px 20px' }}
            disabled={limiteAlcanzado}
            title={limiteAlcanzado ? 'Alcanzaste el límite de cajas de tu plan. Cambia de plan para agregar más.' : undefined}
          >
            + Nueva Caja
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
        {limite && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 'bold' }}>
            {limite.total} de {limite.max === null ? 'ilimitadas' : limite.max} cajas
          </span>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showInactivas}
            onChange={(e) => setShowInactivas(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: COLORS.purple, cursor: 'pointer' }}
          />
          Mostrar inactivas
        </label>
      </div>

      {limiteAlcanzado && (
        <div className="status-message status-error" style={{ marginBottom: '20px' }}>
          Alcanzaste el límite de cajas de tu plan. Cambia de plan para agregar más.
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="loader"></div>
        </div>
      ) : (
        <DataTable
          data={filteredCajas}
          columns={columns}
          emptyMessage="No hay cajas registradas."
          keyExtractor={(item) => item.id_caja}
        />
      )}

      <Modal
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={confirmInactiva ? 'Reactivar Caja' : 'Desactivar Caja'}
      >
        {confirmTarget && (
          <div>
            <p style={{ color: 'var(--text-primary)', fontSize: '15px', marginTop: 0 }}>
              {confirmInactiva
                ? <>¿Deseas reactivar la caja <strong>#{confirmTarget.nro_caja}</strong>?</>
                : <>¿Deseas desactivar la caja <strong>#{confirmTarget.nro_caja}</strong>?</>}
            </p>
            <p style={{
              color: confirmInactiva ? COLORS.successLight : COLORS.errorLighter,
              fontSize: '13px',
              background: confirmInactiva ? tint('success', 0.08) : tint('error', 0.08),
              border: confirmInactiva ? `1px solid ${tint('success', 0.2)}` : `1px solid ${tint('error', 0.2)}`,
              borderRadius: '10px',
              padding: '10px 14px'
            }}>
              {confirmInactiva
                ? 'La caja volverá a estar disponible para abrir turnos.'
                : 'La caja no se elimina: quedará inactiva y seguirá contando para el límite de tu plan. No se puede desactivar con un turno abierto.'}
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
                  background: confirmInactiva ? tint('success', 0.25) : tint('error', 0.25),
                  color: confirmInactiva ? COLORS.successLight : COLORS.errorLight,
                  border: confirmInactiva ? `1px solid ${tint('success', 0.4)}` : `1px solid ${tint('error', 0.4)}`
                }}
                disabled={saving}
              >
                {saving ? 'Guardando...' : (confirmInactiva ? 'Sí, Reactivar' : 'Sí, Desactivar')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ModuleLayout>
  );
}
