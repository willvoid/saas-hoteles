import { useState } from 'react';
import ReporteAging from './ReporteAging';
import ReporteFlujoFondos from './ReporteFlujoFondos';
import ReporteLibroIva from './ReporteLibroIva';
import ReporteResultado from './ReporteResultado';

type ReporteId = 'resultado' | 'cxc' | 'cxp' | 'flujo' | 'iva';

const REPORTES: { key: ReporteId; label: string }[] = [
  { key: 'resultado', label: 'Ingresos vs egresos' },
  { key: 'cxc', label: 'Por cobrar' },
  { key: 'cxp', label: 'Por pagar' },
  { key: 'flujo', label: 'Flujo de fondos' },
  { key: 'iva', label: 'Libro IVA' },
];

// Report picker. Each report owns its inputs and loads its own data, and
// mounts only while selected, so switching reports always reloads fresh data.
export default function ReportesPanel() {
  const [reporte, setReporte] = useState<ReporteId>('resultado');

  return (
    <div className="tab-content">
      <div className="fin-reportes-selector" role="tablist" aria-label="Reportes">
        {REPORTES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={reporte === r.key}
            className={`tab-btn ${reporte === r.key ? 'active' : ''}`}
            onClick={() => setReporte(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {reporte === 'resultado' && <ReporteResultado />}
      {reporte === 'cxc' && <ReporteAging key="cxc" tipo="cxc" />}
      {reporte === 'cxp' && <ReporteAging key="cxp" tipo="cxp" />}
      {reporte === 'flujo' && <ReporteFlujoFondos />}
      {reporte === 'iva' && <ReporteLibroIva />}
    </div>
  );
}
