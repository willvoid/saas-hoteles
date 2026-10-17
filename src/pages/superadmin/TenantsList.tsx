import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Plus } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { SearchBox } from '../../components/SearchBox';
import { StatusBadge } from '../../components/StatusBadge';
import { useTenantsList } from '../../hooks/useTenantsAdmin';
import type { TenantEstado, TenantSummary } from '../../services/superadminService';
import {
  DEFAULT_TENANT_FILTERS,
  filterTenants,
  formatDateOnly,
  isManageable,
  planOptions,
} from '../../utils/tenantFilters';
import type { TenantFilters } from '../../utils/tenantFilters';
import { COLORS, tint } from '../../constants/colors';
import '../../index.css';

export const ESTADO_STYLE: Record<TenantEstado, { label: string; color: string; bg: string }> = {
  trial: { label: 'Prueba', color: COLORS.warning, bg: tint('warning', 0.15) },
  activo: { label: 'Activo', color: COLORS.success, bg: tint('success', 0.15) },
  suspendido: { label: 'Suspendido', color: COLORS.error, bg: tint('error', 0.15) },
};

export function EstadoBadge({ estado }: { estado: TenantEstado }) {
  const s = ESTADO_STYLE[estado];
  return <StatusBadge label={s.label} style={{ color: s.color, bg: s.bg }} size="sm" />;
}

interface TenantsListProps {
  onLogout: () => void;
}

export default function TenantsList({ onLogout }: TenantsListProps) {
  const navigate = useNavigate();
  const { tenants, loading, error, refetch } = useTenantsList();
  const [filters, setFilters] = useState<TenantFilters>(DEFAULT_TENANT_FILTERS);

  const visible = useMemo(() => filterTenants(tenants, filters), [tenants, filters]);
  const plans = useMemo(() => planOptions(tenants), [tenants]);

  const columns: Column<TenantSummary>[] = [
    {
      header: 'Hotel',
      render: (t) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>
            {isManageable(t) ? (
              <Link to={`/superadmin/${t.id}`} style={{ color: 'inherit' }}>
                {t.nombre}
              </Link>
            ) : (
              t.nombre
            )}
          </div>
          {!isManageable(t) && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Plantilla interna (no gestionable)</div>
          )}
        </div>
      ),
    },
    { header: 'Slug', accessor: 'slug' },
    { header: 'Estado', render: (t) => <EstadoBadge estado={t.estado} /> },
    { header: 'Plan', accessor: 'plan' },
    { header: 'Vigente hasta', render: (t) => formatDateOnly(t.vigente_hasta) },
    { header: 'Usuarios', accessor: 'usuarios', align: 'right', render: (t) => t.usuarios },
    { header: 'Establecimientos', align: 'right', render: (t) => t.establecimientos },
    { header: 'Habitaciones', align: 'right', render: (t) => t.habitaciones },
  ];

  return (
    <div className="hotel-select-page">
      <div className="hotel-select-inner">
        <div className="hotel-select-header">
          <div>
            <h1 className="hotel-select-title">Administración de hoteles</h1>
            <p className="hotel-select-subtitle">Panel de la plataforma: gestioná hoteles, planes y estados.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary-sm" onClick={() => navigate('/superadmin/nuevo')}>
              <Plus size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
              Nuevo hotel
            </button>
            <Link to="/hoteles" className="btn-ghost">
              Mis hoteles
            </Link>
            <button type="button" className="btn-ghost" onClick={onLogout}>
              <LogOut size={16} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
              Cerrar sesión
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
          <SearchBox
            value={filters.search}
            onChange={(search) => setFilters((f) => ({ ...f, search }))}
            placeholder="Buscar por nombre o slug..."
          />
          <select
            aria-label="Filtrar por estado"
            className="input-field"
            style={{ width: 'auto' }}
            value={filters.estado}
            onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value as TenantFilters['estado'] }))}
          >
            <option value="todos">Todos los estados</option>
            <option value="trial">Prueba</option>
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido</option>
          </select>
          <select
            aria-label="Filtrar por plan"
            className="input-field"
            style={{ width: 'auto' }}
            value={filters.plan}
            onChange={(e) => setFilters((f) => ({ ...f, plan: e.target.value }))}
          >
            <option value="todos">Todos los planes</option>
            {plans.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="status-message status-error" role="alert" style={{ marginBottom: '20px' }}>
            {error}{' '}
            <button type="button" className="link-btn" onClick={refetch}>
              Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <div className="loader" role="status" aria-label="Cargando hoteles" />
          </div>
        ) : (
          <DataTable
            data={visible}
            columns={columns}
            keyExtractor={(t) => t.id}
            emptyMessage="No hay hoteles que coincidan con los filtros."
          />
        )}
      </div>
    </div>
  );
}
