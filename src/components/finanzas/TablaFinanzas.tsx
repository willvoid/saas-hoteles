interface TablaFinanzasProps {
  head: string[];
  body: string[][];
  foot?: string[];
  /** Indexes of the columns aligned to the right (amounts). */
  derecha?: number[];
  /** Marks a row (e.g. overdue) to be shown in the error color. */
  resaltar?: (fila: string[]) => boolean;
  vacio?: string;
}

/** Plain table of already formatted cells, the same ones the PDF prints.
 *  Presentational only. */
export function TablaFinanzas({
  head,
  body,
  foot,
  derecha = [],
  resaltar,
  vacio = 'No hay datos para el período elegido.',
}: TablaFinanzasProps) {
  const alinear = (i: number) => (derecha.includes(i) ? { textAlign: 'right' as const } : undefined);

  return (
    <div className="fin-tabla-scroll">
      <table className="fin-sub-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} style={alinear(i)}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="fin-muted">{vacio}</td>
            </tr>
          ) : (
            body.map((fila, r) => (
              <tr key={r} className={resaltar?.(fila) ? 'fin-vencido' : undefined}>
                {fila.map((celda, i) => (
                  <td key={i} className={derecha.includes(i) ? 'fin-monto' : undefined}>{celda}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {foot && body.length > 0 && (
          <tfoot>
            <tr className="fin-tabla-pie">
              {foot.map((celda, i) => (
                <td key={i} className={derecha.includes(i) ? 'fin-monto' : undefined}>{celda}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
