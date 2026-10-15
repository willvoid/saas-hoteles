import { useState } from 'react';
import { BotonPdf } from '../../components/finanzas/BotonPdf';
import { Campo } from '../../components/finanzas/Campo';
import { KpiCard } from '../../components/finanzas/KpiCard';
import { TablaFinanzas } from '../../components/finanzas/TablaFinanzas';
import { useReporteFinanzas } from '../../hooks/useReporteFinanzas';
import { reporteFinanzasService } from '../../services/reporteFinanzasService';
import { formatGs } from '../../utils/currency';
import { fechaNegocioHoy, periodoDe } from '../../utils/periodoContable';
import { tablaLibroIva, totalesLibroIva } from '../../utils/reporteFinanzas';
import { descargarReporteFinanzasPdf } from '../../utils/reporteFinanzasPdf';

const ANIOS_ATRAS = 5;

const cargar = (anio: number) => reporteFinanzasService.getLibroIva(anio);

// Simple VAT book: 12 months of output VAT, input VAT and VAT to pay.
export default function ReporteLibroIva() {
  const actual = periodoDe(fechaNegocioHoy()).anio;
  const [anio, setAnio] = useState(actual);
  const { data, loading, error } = useReporteFinanzas(cargar, anio);

  const tabla = data ? tablaLibroIva(anio, data) : null;
  const totales = data ? totalesLibroIva(data) : null;

  return (
    <div>
      <div className="fin-filtros">
        <Campo label="Año" htmlFor="fin-anio-iva">
          <select
            id="fin-anio-iva"
            className="input-field"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
          >
            {Array.from({ length: ANIOS_ATRAS + 1 }, (_, i) => actual - i).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Campo>
        <BotonPdf
          disabled={!tabla}
          onClick={() => tabla && descargarReporteFinanzasPdf({ tabla, periodo: `Año ${anio}` }, String(anio))}
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
              <KpiCard label="IVA débito" valor={formatGs(totales.iva_debito)} />
              <KpiCard label="IVA crédito" valor={formatGs(totales.iva_credito)} />
              <KpiCard
                label="IVA a pagar"
                valor={formatGs(totales.iva_a_pagar)}
                tono={totales.iva_a_pagar > 0 ? 'alerta' : 'neutro'}
              />
            </div>
            <TablaFinanzas
              head={tabla.head}
              body={tabla.body}
              foot={tabla.foot}
              derecha={[1, 2, 3, 4, 5, 6, 7, 8, 9]}
            />
          </>
        )
      )}
    </div>
  );
}
