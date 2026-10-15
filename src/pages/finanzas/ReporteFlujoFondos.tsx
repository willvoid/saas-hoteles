import { useState } from 'react';
import { BotonPdf } from '../../components/finanzas/BotonPdf';
import { Campo } from '../../components/finanzas/Campo';
import { RangoFechas } from '../../components/finanzas/RangoFechas';
import { TablaFinanzas } from '../../components/finanzas/TablaFinanzas';
import { useReporteFinanzas } from '../../hooks/useReporteFinanzas';
import { reporteFinanzasService } from '../../services/reporteFinanzasService';
import { inicioDeAnio, rangoMesActual } from '../../utils/finanzasForm';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import { tablaFlujoFondos, tablaMovimientosFondo } from '../../utils/reporteFinanzas';
import { descargarReporteFinanzasPdf } from '../../utils/reporteFinanzasPdf';

interface Rango {
  desde: string;
  hasta: string;
}

interface ParamsMovimientos extends Rango {
  fondo: number;
}

const cargarFlujo = ({ desde, hasta }: Rango) => reporteFinanzasService.getFlujoFondos(desde, hasta);
const cargarMovimientos = ({ fondo, desde, hasta }: ParamsMovimientos) =>
  reporteFinanzasService.getMovimientosFondo(fondo, desde, hasta);

// Fund flow for a period (opening, in, out, closing balance per fund) with a
// drill-down to the movements of one fund and its running balance.
export default function ReporteFlujoFondos() {
  const [rango, setRango] = useState<Rango>(() => {
    const hoy = fechaNegocioHoy();
    return { desde: inicioDeAnio(hoy), hasta: rangoMesActual(hoy).hasta };
  });
  const [fondoId, setFondoId] = useState<number | null>(null);
  const valido = !!rango.desde && !!rango.hasta && rango.desde <= rango.hasta;

  const flujo = useReporteFinanzas(cargarFlujo, valido ? rango : null);
  const movimientos = useReporteFinanzas(
    cargarMovimientos,
    valido && fondoId !== null ? { fondo: fondoId, ...rango } : null,
  );

  const tabla = flujo.data ? tablaFlujoFondos(flujo.data) : null;
  const fondoNombre = flujo.data?.find((f) => f.fk_fondo === fondoId)?.fondo ?? '';
  const tablaMov = movimientos.data ? tablaMovimientosFondo(fondoNombre, movimientos.data) : null;
  const sufijo = `${rango.desde}_${rango.hasta}`;
  const periodo = `Período: ${rango.desde} a ${rango.hasta}`;

  return (
    <div>
      <div className="fin-filtros">
        <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
        <BotonPdf
          disabled={!tabla}
          onClick={() => tabla && descargarReporteFinanzasPdf({ tabla, periodo }, sufijo)}
        />
      </div>
      {flujo.error && <div className="fin-error-box" role="alert">{flujo.error}</div>}
      {flujo.loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        tabla && <TablaFinanzas head={tabla.head} body={tabla.body} foot={tabla.foot} derecha={[2, 3, 4, 5]} />
      )}

      <h3 className="fin-seccion-titulo">Movimientos de un fondo</h3>
      <div className="fin-filtros">
        <Campo label="Fondo" htmlFor="fin-fondo-mov">
          <select
            id="fin-fondo-mov"
            className="input-field"
            value={fondoId ?? ''}
            onChange={(e) => setFondoId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Elegí un fondo</option>
            {(flujo.data ?? []).map((f) => (
              <option key={f.fk_fondo} value={f.fk_fondo}>{f.fondo}</option>
            ))}
          </select>
        </Campo>
        {tablaMov && (
          <BotonPdf
            etiqueta="PDF de movimientos"
            onClick={() => descargarReporteFinanzasPdf({ tabla: tablaMov, periodo }, sufijo)}
          />
        )}
      </div>
      {movimientos.error && <div className="fin-error-box" role="alert">{movimientos.error}</div>}
      {movimientos.loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      ) : (
        tablaMov && (
          <TablaFinanzas
            head={tablaMov.head}
            body={tablaMov.body}
            derecha={[3, 4, 5]}
            vacio="El fondo no tiene movimientos en el período."
          />
        )
      )}
    </div>
  );
}
