import { KpiCard } from '../../components/finanzas/KpiCard';
import { useResumenFinanzas } from '../../hooks/useResumenFinanzas';
import { formatGs } from '../../utils/currency';
import type { FilaCxc, FilaCxp } from '../../types/finanzas';

const gs = (valor: number | undefined): string | null => (valor === undefined ? null : formatGs(valor));

interface ListaVencidosProps<T> {
  titulo: string;
  vacio: string;
  filas: T[] | undefined;
  error: string | null;
  parte: (fila: T) => string;
  documento: (fila: T) => string;
  clave: (fila: T) => number;
}

// The five oldest overdue balances; rows come already ordered and trimmed.
function ListaVencidos<T extends { dias_vencido: number; saldo_pendiente: number }>({
  titulo,
  vacio,
  filas,
  error,
  parte,
  documento,
  clave,
}: ListaVencidosProps<T>) {
  return (
    <div>
      <h3 className="fin-seccion-titulo">{titulo}</h3>
      {error ? (
        <div className="fin-error-box" role="alert">{error}</div>
      ) : !filas || filas.length === 0 ? (
        <p className="fin-hint">{vacio}</p>
      ) : (
        <table className="fin-sub-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Comprobante</th>
              <th>Días vencido</th>
              <th style={{ textAlign: 'right' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={clave(f)}>
                <td>{parte(f)}</td>
                <td>{documento(f)}</td>
                <td className="fin-vencido">{f.dias_vencido}</td>
                <td className="fin-monto">{formatGs(f.saldo_pendiente)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Finance summary: current-month result, funds, receivables, payables and VAT.
// Each card fails on its own (see useResumenFinanzas).
export default function ResumenPanel() {
  const r = useResumenFinanzas();
  const resultado = r.resultado.data;
  const cargando = r.loading;

  return (
    <div className="tab-content">
      <h3 className="fin-seccion-titulo">Mes en curso</h3>
      <div className="fin-kpi-grid">
        <KpiCard label="Ingresos del mes" valor={cargando ? null : gs(resultado?.ingresos)} error={r.resultado.error} />
        <KpiCard label="Egresos del mes" valor={cargando ? null : gs(resultado?.egresos)} error={r.resultado.error} />
        <KpiCard
          label={resultado && resultado.resultado < 0 ? 'Resultado (pérdida)' : 'Resultado (ganancia)'}
          valor={cargando ? null : gs(resultado?.resultado)}
          tono={resultado ? (resultado.resultado < 0 ? 'negativo' : 'positivo') : 'neutro'}
          error={r.resultado.error}
        />
        <KpiCard label="IVA a pagar del mes" valor={cargando ? null : gs(r.ivaDelMes.data ?? undefined)} error={r.ivaDelMes.error} />
      </div>

      <h3 className="fin-seccion-titulo">Hoy</h3>
      <div className="fin-kpi-grid">
        <KpiCard label="Saldo total de fondos" valor={cargando ? null : gs(r.saldoFondos.data ?? undefined)} error={r.saldoFondos.error} />
        <KpiCard
          label="Por cobrar"
          valor={cargando ? null : gs(r.porCobrar.data?.total)}
          nota={r.porCobrar.data ? `Vencido: ${formatGs(r.porCobrar.data.vencido)}` : undefined}
          tono={r.porCobrar.data && r.porCobrar.data.vencido > 0 ? 'alerta' : 'neutro'}
          error={r.porCobrar.error}
        />
        <KpiCard
          label="Por pagar"
          valor={cargando ? null : gs(r.porPagar.data?.total)}
          nota={r.porPagar.data ? `Vencido: ${formatGs(r.porPagar.data.vencido)}` : undefined}
          tono={r.porPagar.data && r.porPagar.data.vencido > 0 ? 'alerta' : 'neutro'}
          error={r.porPagar.error}
        />
      </div>

      <div className="fin-resumen-listas">
        <ListaVencidos<FilaCxc>
          titulo="Cobros más vencidos"
          vacio="No hay facturas vencidas por cobrar."
          filas={r.porCobrar.data?.masVencidos}
          error={r.porCobrar.error}
          parte={(f) => f.cliente}
          documento={(f) => `Factura ${f.nro}`}
          clave={(f) => f.id_factura}
        />
        <ListaVencidos<FilaCxp>
          titulo="Pagos más vencidos"
          vacio="No hay gastos vencidos por pagar."
          filas={r.porPagar.data?.masVencidos}
          error={r.porPagar.error}
          parte={(f) => f.proveedor}
          documento={(f) => f.nro_comprobante ?? `Gasto ${f.id_gasto}`}
          clave={(f) => f.id_gasto}
        />
      </div>
    </div>
  );
}
