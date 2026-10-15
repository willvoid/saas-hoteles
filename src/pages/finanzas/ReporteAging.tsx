import { useState } from 'react';
import { BotonPdf } from '../../components/finanzas/BotonPdf';
import { Campo } from '../../components/finanzas/Campo';
import { KpiCard } from '../../components/finanzas/KpiCard';
import { TablaFinanzas } from '../../components/finanzas/TablaFinanzas';
import { useReporteFinanzas } from '../../hooks/useReporteFinanzas';
import { reporteFinanzasService } from '../../services/reporteFinanzasService';
import { agruparPorBucket } from '../../utils/aging';
import { formatGs } from '../../utils/currency';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import { tablaAging, vencidoTotal } from '../../utils/reporteFinanzas';
import { descargarReporteFinanzasPdf } from '../../utils/reporteFinanzasPdf';
import type { FilaCxc, FilaCxp } from '../../types/finanzas';

type Filas = FilaCxc[] | FilaCxp[];

const cargarCxc = (corte: string): Promise<Filas> => reporteFinanzasService.getCxc(corte);
const cargarCxp = (corte: string): Promise<Filas> => reporteFinanzasService.getCxp(corte);

interface ReporteAgingProps {
  tipo: 'cxc' | 'cxp';
}

// Receivable or payable aging at a cutoff date (default today). The balance is
// the current one; the cutoff only moves the aging buckets.
export default function ReporteAging({ tipo }: ReporteAgingProps) {
  const [corte, setCorte] = useState(() => fechaNegocioHoy());
  const { data, loading, error } = useReporteFinanzas<string, Filas>(
    tipo === 'cxc' ? cargarCxc : cargarCxp,
    corte || null,
  );

  const tabla = data ? tablaAging(tipo, data) : null;
  const grupos = data ? agruparPorBucket<FilaCxc | FilaCxp>(data) : null;

  return (
    <div>
      <div className="fin-filtros">
        <Campo label="Corte al" htmlFor="fin-corte">
          <input
            id="fin-corte"
            type="date"
            className="input-field"
            value={corte}
            onChange={(e) => setCorte(e.target.value)}
          />
        </Campo>
        <BotonPdf
          disabled={!tabla}
          onClick={() => tabla && descargarReporteFinanzasPdf({ tabla, periodo: `Corte al ${corte}` }, corte)}
        />
      </div>
      {error && <div className="fin-error-box" role="alert">{error}</div>}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        tabla &&
        grupos &&
        data && (
          <>
            <div className="fin-kpi-grid">
              <KpiCard label={tipo === 'cxc' ? 'Total por cobrar' : 'Total por pagar'} valor={formatGs(grupos.total)} />
              <KpiCard label="Vencido" valor={formatGs(vencidoTotal(data))} tono="alerta" />
              {grupos.grupos.map((g) => (
                <KpiCard key={g.bucket} label={`Tramo ${g.bucket}`} valor={formatGs(g.total)} />
              ))}
            </div>
            <TablaFinanzas
              head={tabla.head}
              body={tabla.body}
              foot={tabla.foot}
              derecha={[4, 5]}
              resaltar={(fila) => Number(fila[4]) > 0}
              vacio="No hay saldos pendientes."
            />
          </>
        )
      )}
    </div>
  );
}
