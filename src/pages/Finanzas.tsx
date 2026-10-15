import { useState } from 'react';
import { ModuleLayout } from '../components/ModuleLayout';
import CierresPanel from './finanzas/CierresPanel';
import CobrosPanel from './finanzas/CobrosPanel';
import FondosPanel from './finanzas/FondosPanel';
import GastosPanel from './finanzas/GastosPanel';
import PagosPanel from './finanzas/PagosPanel';
import ProveedoresPanel from './finanzas/ProveedoresPanel';
import ReportesPanel from './finanzas/ReportesPanel';
import ResumenPanel from './finanzas/ResumenPanel';
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

interface FinanzasProps {
  /** Role of the signed-in user; only the admin can close or reopen months. */
  role: Role;
}

// Shell for the finance module: one panel per sub-tab. Each panel mounts only while its tab is active, so it reloads fresh data.
// The classes below are the same ones StatusTabs uses, minus its mandatory
// "(count)" suffix, which makes no sense for static sections.
export default function Finanzas({ role }: FinanzasProps) {
  const [tab, setTab] = useState<FinanzasTabId>('resumen');

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
        {tab === 'resumen' && <ResumenPanel />}
        {tab === 'reportes' && <ReportesPanel />}
      </div>
    </ModuleLayout>
  );
}
