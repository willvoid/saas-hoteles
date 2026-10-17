import type { SerieMensualItem } from '../../services/superadminFinanzasService';
import { COLORS } from '../../constants/colors';
import { formatGs } from '../../utils/currency';
import { buildMonthlyBars } from '../../utils/monthlyBars';

const VIEW_WIDTH = 700;
const VIEW_HEIGHT = 260;
const MARGIN_X = 16;
const PLOT_TOP = 20;
const PLOT_BOTTOM = 210;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const BAR_WIDTH = 22;
const BAR_GAP = 4;

interface MonthlyBarChartProps {
  serie: SerieMensualItem[];
}

/** Monthly ingresos vs egresos. Hand-drawn SVG scaled by CSS (no chart lib). */
export function MonthlyBarChart({ serie }: MonthlyBarChartProps) {
  const { groups } = buildMonthlyBars(serie, PLOT_HEIGHT);

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Ingresos vs egresos por mes</h3>
        <span className="chart-subtitle">
          <span style={{ color: COLORS.success }}>■</span> Ingresos{' '}
          <span style={{ color: COLORS.error }}>■</span> Egresos
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="chart-empty">Sin movimientos en el período.</p>
      ) : (
        <svg
          className="chart-svg"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          role="img"
          aria-label={`Ingresos y egresos por mes. ${groups
            .map((g) => `${g.label}: ingresos ${formatGs(g.ingresos)}, egresos ${formatGs(g.egresos)}`)
            .join('. ')}`}
        >
          <line x1={MARGIN_X} y1={PLOT_BOTTOM} x2={VIEW_WIDTH - MARGIN_X} y2={PLOT_BOTTOM} className="chart-grid-line" />
          {groups.map((g, i) => {
            const slot = (VIEW_WIDTH - MARGIN_X * 2) / groups.length;
            const center = MARGIN_X + slot * i + slot / 2;
            return (
              <g key={g.mes}>
                {g.ingresosHeight > 0 && (
                  <rect
                    x={center - BAR_GAP / 2 - BAR_WIDTH}
                    y={PLOT_BOTTOM - g.ingresosHeight}
                    width={BAR_WIDTH}
                    height={g.ingresosHeight}
                    rx={4}
                    style={{ fill: COLORS.success }}
                  >
                    <title>{`${g.label} ingresos: ${formatGs(g.ingresos)}`}</title>
                  </rect>
                )}
                {g.egresosHeight > 0 && (
                  <rect
                    x={center + BAR_GAP / 2}
                    y={PLOT_BOTTOM - g.egresosHeight}
                    width={BAR_WIDTH}
                    height={g.egresosHeight}
                    rx={4}
                    style={{ fill: COLORS.error }}
                  >
                    <title>{`${g.label} egresos: ${formatGs(g.egresos)}`}</title>
                  </rect>
                )}
                <text x={center} y={PLOT_BOTTOM + 24} className="chart-axis-label" textAnchor="middle">
                  {g.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
