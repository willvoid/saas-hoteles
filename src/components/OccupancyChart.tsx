import React from 'react';
import type { OcupacionDia } from '../services/dashboardService';

interface OccupancyChartProps {
  data: OcupacionDia[] | null;
}

// Geometría del SVG. Se dibuja sobre un viewBox fijo y se escala por CSS, así
// el gráfico es responsive sin necesidad de medir el contenedor en JS.
const VIEW_WIDTH = 700;
const VIEW_HEIGHT = 260;
const MARGIN_LEFT = 44;
const MARGIN_RIGHT = 16;
const PLOT_TOP = 30;
const PLOT_BOTTOM = 200;

const PLOT_WIDTH = VIEW_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const BAR_WIDTH = 44;

const GRID_LINES = [0, 25, 50, 75, 100];

/** Altura en px de viewBox que le corresponde a un porcentaje. */
const scaleY = (pct: number) => (pct / 100) * PLOT_HEIGHT;

export default function OccupancyChart({ data }: OccupancyChartProps) {
  if (!data) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">Ocupación últimos 7 días</h3>
        <p className="chart-empty">Cargando…</p>
      </div>
    );
  }

  const slotWidth = PLOT_WIDTH / data.length;
  const promedio = Math.round(
    data.reduce((acc, d) => acc + d.ocupacionPct, 0) / data.length
  );

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title">Ocupación últimos 7 días</h3>
        <span className="chart-subtitle">Promedio {promedio}%</span>
      </div>

      <svg
        className="chart-svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={`Ocupación de los últimos 7 días. ${data
          .map(d => `${d.label}: ${d.ocupacionPct} por ciento`)
          .join('. ')}`}
      >
        {GRID_LINES.map(pct => {
          const y = PLOT_BOTTOM - scaleY(pct);
          return (
            <g key={pct}>
              <line
                x1={MARGIN_LEFT}
                y1={y}
                x2={VIEW_WIDTH - MARGIN_RIGHT}
                y2={y}
                className="chart-grid-line"
              />
              <text x={MARGIN_LEFT - 10} y={y + 4} className="chart-axis-label" textAnchor="end">
                {pct}%
              </text>
            </g>
          );
        })}

        {data.map((dia, i) => {
          const slotCenter = MARGIN_LEFT + slotWidth * i + slotWidth / 2;
          const x = slotCenter - BAR_WIDTH / 2;
          const barHeight = scaleY(dia.ocupacionPct);
          const y = PLOT_BOTTOM - barHeight;
          const esHoy = i === data.length - 1;

          return (
            <g key={dia.fecha}>
              {/* rx fijo con altura 0 dibujaría una pastilla rara: se omite la
                  barra cuando el día no tuvo ocupación. */}
              {barHeight > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={BAR_WIDTH}
                  height={barHeight}
                  rx={6}
                  className={esHoy ? 'chart-bar chart-bar-today' : 'chart-bar'}
                >
                  <title>{`${dia.fecha}: ${dia.ocupacionPct}%`}</title>
                </rect>
              )}

              <text
                x={slotCenter}
                y={y - 8}
                className="chart-value-label"
                textAnchor="middle"
              >
                {dia.ocupacionPct}%
              </text>

              <text
                x={slotCenter}
                y={PLOT_BOTTOM + 24}
                className={esHoy ? 'chart-axis-label chart-axis-label-today' : 'chart-axis-label'}
                textAnchor="middle"
              >
                {esHoy ? 'Hoy' : dia.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
