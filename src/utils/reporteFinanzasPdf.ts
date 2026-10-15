import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TablaReporte } from './reporteFinanzas';

export interface ReporteFinanzasPdfParams {
  tabla: TablaReporte;
  /** Period or cutoff line, e.g. "2026-03-01 a 2026-03-31". */
  periodo: string;
}

/**
 * Builds the PDF of a finance report from an already shaped table. Returns the
 * document instead of saving it so the build stays testable without a browser
 * download (same approach as reporteIngresosPdf).
 */
export function buildReporteFinanzasPdf({ tabla, periodo }: ReporteFinanzasPdfParams): jsPDF {
  const doc = new jsPDF({ orientation: tabla.orientacion === 'l' ? 'landscape' : 'portrait' });

  doc.setFontSize(18);
  doc.text('Hotel San Martín', 14, 18);

  doc.setFontSize(13);
  doc.text(tabla.titulo, 14, 27);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(periodo, 14, 34);
  doc.text(`Generado: ${new Date().toLocaleString('es-PY')}`, 14, 39);

  doc.setTextColor(0);
  doc.setFontSize(11);
  let y = 49;
  for (const linea of tabla.resumen) {
    doc.text(linea, 14, y);
    y += 6;
  }

  autoTable(doc, {
    startY: y + 2,
    head: [tabla.head],
    body: tabla.body,
    foot: tabla.foot ? [tabla.foot] : undefined,
    headStyles: { fillColor: [59, 130, 246] },
    footStyles: { fillColor: [229, 231, 235], textColor: 20 },
    styles: { fontSize: 9 },
  });

  return doc;
}

/** Builds the report PDF and triggers the browser download (not unit tested:
 *  `save` needs a DOM; the build and the file name are). */
export function descargarReporteFinanzasPdf(params: ReporteFinanzasPdfParams, sufijo: string): void {
  buildReporteFinanzasPdf(params).save(reporteFinanzasPdfFilename(params.tabla.titulo, sufijo));
}

/** Suggested file name: ingresos-vs-egresos_2026-03-01_2026-03-31.pdf */
export function reporteFinanzasPdfFilename(titulo: string, sufijo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base}_${sufijo}.pdf`;
}
