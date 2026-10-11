import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Wallet, Download } from 'lucide-react';
import { reporteService } from '../services/reporteService';
import type { ReporteIngresos, TurnoReporte } from '../services/reporteService';
import { RANGE_PRESETS, resolveRange, todayIso } from '../utils/reportRanges';
import type { RangePreset } from '../utils/reportRanges';
import { formatGs } from '../utils/currency';
import { buildReporteIngresosPdf, reporteIngresosPdfFilename } from '../utils/reporteIngresosPdf';
import { buildReporteTurnosPdf, reporteTurnosPdfFilename } from '../utils/reporteTurnosPdf';
import { ModuleLayout } from '../components/ModuleLayout';
import '../index.css';

const panelStyle: CSSProperties = {
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: 16,
  padding: 24,
};

type ReporteId = 'ingresos' | 'turnos';

export default function ManageReportes() {
  const today = useMemo(() => todayIso(), []);

  const [reporte, setReporte] = useState<ReporteId>('ingresos');
  const [preset, setPreset] = useState<RangePreset>('esteMes');
  const [desde, setDesde] = useState(() => resolveRange('esteMes', today).desde);
  const [hasta, setHasta] = useState(() => resolveRange('esteMes', today).hasta);

  const [data, setData] = useState<ReporteIngresos | null>(null);
  const [turnos, setTurnos] = useState<TurnoReporte[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Al cambiar el preset (salvo "Personalizado"), recalculamos el rango.
  const handlePresetChange = (next: RangePreset) => {
    setPreset(next);
    if (next !== 'personalizado') {
      const range = resolveRange(next, today);
      setDesde(range.desde);
      setHasta(range.hasta);
    }
  };

  const handleDescargarPdf = () => {
    const presetLabel = RANGE_PRESETS.find((p) => p.id === preset)?.label ?? preset;
    if (reporte === 'ingresos') {
      if (!data) return;
      const doc = buildReporteIngresosPdf({ desde, hasta, presetLabel, data });
      doc.save(reporteIngresosPdfFilename(desde, hasta));
    } else {
      if (!turnos) return;
      const doc = buildReporteTurnosPdf({ desde, hasta, presetLabel, data: turnos });
      doc.save(reporteTurnosPdfFilename(desde, hasta));
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!desde || !hasta) return;
      try {
        setLoading(true);
        setError(null);
        if (reporte === 'ingresos') {
          const result = await reporteService.getIngresos(desde, hasta);
          if (!cancelled) setData(result);
        } else {
          const result = await reporteService.getTurnos(desde, hasta);
          if (!cancelled) setTurnos(result);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el reporte.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [desde, hasta, reporte]);

  return (
    <ModuleLayout
      title={reporte === 'ingresos' ? 'Reportes · Ingresos' : 'Reportes · Turnos de caja'}
      description={
        reporte === 'ingresos'
          ? 'Total ingresado y desglose por método de pago en el período seleccionado.'
          : 'Aperturas y cierres de caja del período: quién abrió cada turno, con cuánto y qué facturó.'
      }
      actions={
        <button
          className="btn-primary-sm"
          onClick={handleDescargarPdf}
          disabled={loading || (reporte === 'ingresos' ? !data : !turnos)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Download size={16} /> Descargar PDF
        </button>
      }
    >
      <div style={{ ...panelStyle, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="input-group" style={{ minWidth: 200 }}>
            <label htmlFor="reporte-tipo">Reporte</label>
            <select
              id="reporte-tipo"
              className="input-field"
              value={reporte}
              onChange={(e) => setReporte(e.target.value as ReporteId)}
            >
              <option value="ingresos">Ingresos</option>
              <option value="turnos">Turnos de caja</option>
            </select>
          </div>

          <div className="input-group" style={{ minWidth: 200 }}>
            <label htmlFor="rango-preset">Período</label>
            <select
              id="rango-preset"
              className="input-field"
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value as RangePreset)}
            >
              {RANGE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {preset === 'personalizado' && (
            <>
              <div className="input-group">
                <label htmlFor="rango-desde">Desde</label>
                <input
                  id="rango-desde"
                  type="date"
                  className="input-field"
                  value={desde}
                  max={hasta || today}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label htmlFor="rango-hasta">Hasta</label>
                <input
                  id="rango-hasta"
                  type="date"
                  className="input-field"
                  value={hasta}
                  min={desde}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div className="status-message status-error" style={{ marginBottom: 20 }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="loader"></div>
        </div>
      ) : reporte === 'turnos' ? (
        <div style={panelStyle}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Turnos del período {turnos && turnos.length > 0 && (
              <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: 14 }}>
                ({turnos.length})
              </span>
            )}
          </div>
          {!turnos || turnos.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)' }}>No hay turnos abiertos en este período.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 14 }}>
                    <th style={{ padding: '8px 12px 8px 0', fontWeight: 500 }}>Caja</th>
                    <th style={{ padding: '8px 12px 8px 0', fontWeight: 500 }}>Usuario</th>
                    <th style={{ padding: '8px 12px 8px 0', fontWeight: 500 }}>Apertura</th>
                    <th style={{ padding: '8px 12px 8px 0', fontWeight: 500 }}>Cierre</th>
                    <th style={{ padding: '8px 12px 8px 0', fontWeight: 500 }}>Inicial</th>
                    <th style={{ padding: '8px 12px 8px 0', fontWeight: 500 }}>Final</th>
                    <th style={{ padding: '8px 0', fontWeight: 500 }}>Facturado</th>
                  </tr>
                </thead>
                <tbody>
                  {turnos.map((t) => (
                    <tr key={t.id_turno} style={{ borderTop: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '10px 12px 10px 0' }}>{t.caja}</td>
                      <td style={{ padding: '10px 12px 10px 0' }}>{t.usuario}</td>
                      <td style={{ padding: '10px 12px 10px 0' }}>{new Date(t.apertura).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px 10px 0' }}>
                        {t.cierre ? (
                          new Date(t.cierre).toLocaleString()
                        ) : (
                          <span className="status-badge" style={{ '--badge-color': '#10b981' } as CSSProperties}>
                            ABIERTO
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px 10px 0' }}>{formatGs(t.monto_inicial)}</td>
                      <td style={{ padding: '10px 12px 10px 0' }}>
                        {/* Un turno abierto guarda 0 como placeholder hasta el
                            arqueo: mostrarlo como "Gs. 0" haría parecer que la
                            caja se cerró vacía. */}
                        {t.monto_final === null ? (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        ) : (
                          formatGs(t.monto_final)
                        )}
                      </td>
                      <td style={{ padding: '10px 0' }}>
                        <span style={{ fontWeight: 600 }}>{formatGs(t.facturado)}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 13, marginLeft: 6 }}>
                          ({t.cantidadFacturas})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : data ? (
        <>
          <div style={{ ...panelStyle, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Wallet size={22} color="#34d399" />
              <span style={{ fontSize: 18, fontWeight: 600 }}>Total ingresado</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{formatGs(data.total)}</div>
            <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
              {data.cantidadFacturas} {data.cantidadFacturas === 1 ? 'factura' : 'facturas'}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Por método de pago</div>
            {data.porMetodo.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)' }}>No hay ingresos en este período.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 14 }}>
                    <th style={{ padding: '8px 0', fontWeight: 500 }}>Método</th>
                    <th style={{ padding: '8px 0', fontWeight: 500 }}>Facturas</th>
                    <th style={{ padding: '8px 0', fontWeight: 500 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porMetodo.map((row) => (
                    <tr key={row.metodo} style={{ borderTop: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '10px 0' }}>{row.metodo}</td>
                      <td style={{ padding: '10px 0' }}>{row.cantidad}</td>
                      <td style={{ padding: '10px 0', fontWeight: 600 }}>{formatGs(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </ModuleLayout>
  );
}
