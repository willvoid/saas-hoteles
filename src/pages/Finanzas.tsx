import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import CierresPanel from './finanzas/CierresPanel';
import CobrosPanel from './finanzas/CobrosPanel';
import FondosPanel from './finanzas/FondosPanel';
import GastosPanel from './finanzas/GastosPanel';
import PagosPanel from './finanzas/PagosPanel';
import ProveedoresPanel from './finanzas/ProveedoresPanel';
import type { Role } from '../utils/permissions';

type FinanzasTabId =
  | 'resumen'
  | 'gastos'
  | 'cobros'
  | 'pagos'
  | 'proveedores'
  | 'fondos'
  | 'reportes'
  | 'cierres';

const SUB_TABS: { key: FinanzasTabId; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'cobros', label: 'Cobros' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'proveedores', label: 'Proveedores' },
  { key: 'fondos', label: 'Fondos' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'cierres', label: 'Cierres' },
];

const panelStyle: CSSProperties = {
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: 16,
  padding: 24,
  color: 'var(--text-secondary)',
};

// Sub-tabs whose panel is not built yet (summary, reports).
const PLACEHOLDER_TABS: FinanzasTabId[] = ['resumen', 'reportes'];

interface FinanzasProps {
  /** Role of the signed-in user; only the admin can close or reopen months. */
  role: Role;
}

// Shell for the finance module. Expenses, payments, suppliers and funds have
// their panel; the other sub-tabs stay placeholders until their page lands.
// Each panel mounts only while its tab is active, so it reloads fresh data.
// The classes below are the same ones StatusTabs uses, minus its mandatory
// "(count)" suffix, which makes no sense for static sections.
export default function Finanzas({ role }: FinanzasProps) {
  const [tab, setTab] = useState<FinanzasTabId>('resumen');
  const current = SUB_TABS.find(t => t.key === tab) ?? SUB_TABS[0];

  return (
    <ModuleLayout
      title="Finanzas"
      description="Ingresos, gastos, cuentas por cobrar y pagar, fondos y cierres mensuales."
    >
      <div className="tabs-bar">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        {tab === 'gastos' && <GastosPanel />}
        {tab === 'cobros' && <CobrosPanel />}
        {tab === 'pagos' && <PagosPanel />}
        {tab === 'cierres' && <CierresPanel role={role} />}
        {tab === 'proveedores' && <ProveedoresPanel />}
        {tab === 'fondos' && <FondosPanel />}
        {PLACEHOLDER_TABS.includes(tab) && (
          <div style={panelStyle}>{current.label}: en construcción.</div>
        )}
      </div>
    </ModuleLayout>
  );
}
