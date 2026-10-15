import { useState } from 'react';
import { BotonPdf } from '../../components/finanzas/BotonPdf';
import { KpiCard } from '../../components/finanzas/KpiCard';
import { RangoFechas } from '../../components/finanzas/RangoFechas';
import { TablaFinanzas } from '../../components/finanzas/TablaFinanzas';
import { useReporteFinanzas } from '../../hooks/useReporteFinanzas';
import { reporteFinanzasService } from '../../services/reporteFinanzasService';
import { formatGs } from '../../utils/currency';
import { rangoMesActual } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import { tablaResultado, totalesResultado } from '../../utils/reporteFinanzas';
import { descargarReporteFinanzasPdf } from '../../utils/reporteFinanzasPdf';

interface Rango {
  desde: string;
  hasta: string;
}

const cargar = ({ desde, hasta }: Rango) => reporteFinanzasService.getResultado(desde, hasta);

// Income vs expenses by month and category; defaults to the current month.
export default function ReporteResultado() {
  const [rango, setRango] = useState<Rango>(() => rangoMesActual(fechaNegocioHoy()));
  const valido = !!rango.desde && !!rango.hasta && rango.desde <= rango.hasta;
  const { data, loading, error } = useReporteFinanzas(cargar, valido ? rango : null);

  const totales = data ? totalesResultado(data) : null;
  const tabla = data ? tablaResultado(data) : null;

  return (
    <div>
      <div className="fin-filtros">
        <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
        <BotonPdf
          disabled={!tabla}
          onClick={() =>
            tabla &&
            descargarReporteFinanzasPdf(
              { tabla, periodo: `Período: ${rango.desde} a ${rango.hasta}` },
              `${rango.desde}_${rango.hasta}`,
            )
          }
        />
      </div>
      {error && <div className="fin-error-box" role="alert">{error}</div>}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        tabla &&
        totales && (
          <>
            <div className="fin-kpi-grid">
              <KpiCard label="Total ingresos" valor={formatGs(totales.ingresos)} />
              <KpiCard label="Total egresos" valor={formatGs(totales.egresos)} />
              <KpiCard
                label={totales.resultado < 0 ? 'Resultado (pérdida)' : 'Resultado (ganancia)'}
                valor={formatGs(totales.resultado)}
                tono={totales.resultado < 0 ? 'negativo' : 'positivo'}
              />
            </div>
            <TablaFinanzas head={tabla.head} body={tabla.body} derecha={[3]} />
          </>
        )
      )}
    </div>
  );
}
