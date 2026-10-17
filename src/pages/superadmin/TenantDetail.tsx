import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import { useTenantDetail } from '../../hooks/useTenantsAdmin';
import type { PlanCiclo, SetPlanInput } from '../../services/superadminService';
import { formatDateOnly, isManageable } from '../../utils/tenantFilters';
import { EstadoBadge } from './TenantsList';
import '../../index.css';

// Paid plans the operator can assign (the internal `plantilla` and the
// non-offered `trial` are intentionally absent).
const ASSIGNABLE_PLANS = ['basico', 'pro', 'business'];

const activeLabel = (value: boolean | string | null): string => {
  if (value === null) return '-';
  if (typeof value === 'boolean') return value ? 'Activo' : 'Inactivo';
  return value;
};

interface PlanDraft {
  plan: string;
  ciclo: PlanCiclo;
  monto: string;
  referencia: string;
}

const LABEL_STYLE: CSSProperties = { fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' };
const TH: CSSProperties = { textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '12px' };
const TD: CSSProperties = { padding: '8px 12px', borderTop: '1px solid var(--glass-border)' };

export default function TenantDetail() {
  const params = useParams();
  const parsed = /^\d+$/.test(params.tenantId ?? '') ? Number(params.tenantId) : null;
  const { detail, loading, error, busy, feedback, refetch, changeEstado, changePlan, clearFeedback } =
    useTenantDetail(parsed);

  const [confirmEstado, setConfirmEstado] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planConfirm, setPlanConfirm] = useState(false);
  const [draft, setDraft] = useState<PlanDraft>({ plan: 'pro', ciclo: 'mensual', monto: '', referencia: '' });
  const [draftError, setDraftError] = useState<string | null>(null);

  if (parsed === null) return <Navigate to="/superadmin" replace />;

  const tenant = detail?.tenant;
  const manageable = tenant ? isManageable(tenant) : false;
  const suspended = tenant?.estado === 'suspendido';

  const handleEstado = async () => {
    if (!tenant) return;
    // Reactivating a trial-plan hotel returns it to trial; any other goes to activo.
    const next = suspended ? (tenant.plan === 'trial' ? 'trial' : 'activo') : 'suspendido';
    await changeEstado(next);
    setConfirmEstado(false);
  };

  const buildPlanInput = (): SetPlanInput | null => {
    const montoText = draft.monto.trim();
    let monto: number | null = null;
    if (montoText) {
      monto = Number(montoText);
      if (!Number.isFinite(monto) || monto < 0) {
        setDraftError('El monto debe ser un número mayor o igual a 0.');
        return null;
      }
    }
    return { plan: draft.plan, ciclo: draft.ciclo, monto, referencia: draft.referencia.trim() || null };
  };

  const handlePlanSubmit = (e: FormEvent) => {
    e.preventDefault();
    setDraftError(null);
    if (!buildPlanInput()) return;
    setPlanOpen(false);
    setPlanConfirm(true);
  };

  const handlePlanConfirm = async () => {
    const input = buildPlanInput();
    if (!input) return;
    await changePlan(input);
    setPlanConfirm(false);
  };

  const openPlanDialog = () => {
    if (!tenant) return;
    setDraftError(null);
    setDraft((d) => ({ ...d, plan: ASSIGNABLE_PLANS.includes(tenant.plan) ? tenant.plan : 'pro' }));
    setPlanOpen(true);
  };

  const field = (label: string, value: string | null) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '160px' }}>
      <span style={LABEL_STYLE}>{label}</span>
      <span>{value ?? '-'}</span>
    </div>
  );

  return (
    <div className="hotel-select-page">
      <div className="hotel-select-inner">
        <Link to="/superadmin" className="link-btn" style={{ display: 'inline-block', marginBottom: '16px' }}>
          &larr; Volver al listado
        </Link>

        {loading && !detail && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <div className="loader" role="status" aria-label="Cargando hotel" />
          </div>
        )}

        {error && (
          <div className="status-message status-error" role="alert">
            {error}{' '}
            <button type="button" className="link-btn" onClick={refetch}>
              Reintentar
            </button>
          </div>
        )}

        <div aria-live="polite">
          {feedback && (
            <div
              className={`status-message ${feedback.ok ? 'status-success' : 'status-error'}`}
              style={{ marginBottom: '20px' }}
            >
              {feedback.message}{' '}
              <button type="button" className="link-btn" onClick={clearFeedback}>
                Cerrar
              </button>
            </div>
          )}
        </div>

        {detail && tenant && (
          <>
            <div className="hotel-select-header">
              <div>
                <h1 className="hotel-select-title">{tenant.nombre}</h1>
                <p className="hotel-select-subtitle">/h/{tenant.slug}</p>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!manageable || busy}
                  onClick={() => setConfirmEstado(true)}
                >
                  {suspended ? 'Reactivar hotel' : 'Suspender hotel'}
                </button>
                <button type="button" className="btn-primary-sm" disabled={!manageable || busy} onClick={openPlanDialog}>
                  Cambiar plan
                </button>
              </div>
            </div>

            {!manageable && (
              <div className="status-message status-error" role="status" style={{ marginBottom: '20px' }}>
                Este es el hotel plantilla interno: no se puede modificar desde el panel.
              </div>
            )}

            <section
              aria-label="Datos del hotel"
              style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '32px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={LABEL_STYLE}>Estado</span>
                <EstadoBadge estado={tenant.estado} />
              </div>
              {field('Plan', tenant.plan)}
              {field('Ciclo', tenant.ciclo_facturacion)}
              {field('Fin de prueba', formatDateOnly(tenant.trial_fin))}
              {field('Vigente hasta', formatDateOnly(tenant.vigente_hasta))}
              {field('Creado', formatDateOnly(tenant.created_at))}
            </section>

            <h2 style={{ fontSize: '18px', textAlign: 'left' }}>Usuarios ({detail.usuarios.length})</h2>
            <div style={{ overflowX: 'auto', marginBottom: '32px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
                <thead>
                  <tr>
                    <th style={TH}>Nombre</th>
                    <th style={TH}>Correo</th>
                    <th style={TH}>Cargo</th>
                    <th style={TH}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.usuarios.length === 0 ? (
                    <tr>
                      <td style={TD} colSpan={4}>Sin usuarios.</td>
                    </tr>
                  ) : (
                    detail.usuarios.map((u) => (
                      <tr key={u.id}>
                        <td style={TD}>{u.nombre}</td>
                        <td style={TD}>{u.correo ?? '-'}</td>
                        <td style={TD}>{u.cargo ?? '-'}</td>
                        <td style={TD}>{activeLabel(u.estado)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h2 style={{ fontSize: '18px', textAlign: 'left' }}>Establecimientos ({detail.establecimientos.length})</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
                <thead>
                  <tr>
                    <th style={TH}>Código</th>
                    <th style={TH}>Denominación</th>
                    <th style={TH}>Dirección</th>
                    <th style={TH}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.establecimientos.length === 0 ? (
                    <tr>
                      <td style={TD} colSpan={4}>Sin establecimientos.</td>
                    </tr>
                  ) : (
                    detail.establecimientos.map((e) => (
                      <tr key={e.id_establecimiento}>
                        <td style={TD}>{e.codigo_establecimiento ?? '-'}</td>
                        <td style={TD}>{e.denominacion ?? '-'}</td>
                        <td style={TD}>{e.direccion ?? '-'}</td>
                        <td style={TD}>{activeLabel(e.estado_establecimiento)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <ConfirmDialog
              isOpen={confirmEstado}
              title={suspended ? 'Reactivar hotel' : 'Suspender hotel'}
              message={
                suspended
                  ? `¿Reactivar "${tenant.nombre}"? Sus usuarios volverán a poder ingresar.`
                  : `¿Suspender "${tenant.nombre}"? Sus usuarios verán la pantalla de cuenta suspendida y no podrán operar.`
              }
              confirmLabel={suspended ? 'Reactivar' : 'Suspender'}
              variant={suspended ? 'default' : 'danger'}
              loading={busy}
              onConfirm={handleEstado}
              onCancel={() => setConfirmEstado(false)}
            />

            <Modal isOpen={planOpen} onClose={() => setPlanOpen(false)} title="Cambiar plan">
              <form onSubmit={handlePlanSubmit} noValidate>
                <div className="input-group">
                  <label htmlFor="sa-plan">Plan</label>
                  <select
                    id="sa-plan"
                    className="input-field"
                    value={draft.plan}
                    onChange={(e) => setDraft((d) => ({ ...d, plan: e.target.value }))}
                  >
                    {ASSIGNABLE_PLANS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label htmlFor="sa-ciclo">Ciclo de facturación</label>
                  <select
                    id="sa-ciclo"
                    className="input-field"
                    value={draft.ciclo}
                    onChange={(e) => setDraft((d) => ({ ...d, ciclo: e.target.value as PlanCiclo }))}
                  >
                    <option value="mensual">Mensual</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                <div className="input-group">
                  <label htmlFor="sa-monto">Monto cobrado (opcional)</label>
                  <input
                    id="sa-monto"
                    className="input-field"
                    inputMode="decimal"
                    value={draft.monto}
                    onChange={(e) => setDraft((d) => ({ ...d, monto: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="sa-ref">Referencia de pago (opcional)</label>
                  <input
                    id="sa-ref"
                    className="input-field"
                    maxLength={200}
                    value={draft.referencia}
                    onChange={(e) => setDraft((d) => ({ ...d, referencia: e.target.value }))}
                  />
                </div>
                {draftError && (
                  <div className="status-message status-error" role="alert">
                    {draftError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button type="button" className="btn-ghost" onClick={() => setPlanOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary-sm">
                    Continuar
                  </button>
                </div>
              </form>
            </Modal>

            <ConfirmDialog
              isOpen={planConfirm}
              title="Confirmar cambio de plan"
              message={`Se asignará el plan "${draft.plan}" (${draft.ciclo}) a "${tenant.nombre}" y se actualizará su vigencia.`}
              confirmLabel="Confirmar cambio"
              loading={busy}
              onConfirm={handlePlanConfirm}
              onCancel={() => {
                setPlanConfirm(false);
                setPlanOpen(true);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
