export type TonoKpi = 'neutro' | 'positivo' | 'negativo' | 'alerta';

interface KpiCardProps {
  label: string;
  /** Formatted value; null shows a dash (loading or failed). */
  valor: string | null;
  /** Small line under the value (e.g. the overdue part). */
  nota?: string;
  tono?: TonoKpi;
  /** Load error of this card only; the others keep working. */
  error?: string | null;
}

/** One figure of the finance summary. Presentational only. */
export function KpiCard({ label, valor, nota, tono = 'neutro', error }: KpiCardProps) {
  return (
    <div className={`fin-kpi fin-kpi-${tono}`}>
      <div className="fin-kpi-label">{label}</div>
      <div className="fin-kpi-valor">{error ? '—' : (valor ?? '—')}</div>
      {error ? (
        <div className="fin-kpi-nota fin-vencido" role="alert">{error}</div>
      ) : (
        nota && <div className="fin-kpi-nota">{nota}</div>
      )}
    </div>
  );
}
