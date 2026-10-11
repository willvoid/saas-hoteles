import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TurnoReporte } from '../services/reporteService';
import { formatGs } from './currency';

export interface ReporteTurnosPdfParams {
  desde: string;
  hasta: string;
  presetLabel: string;
  data: TurnoReporte[];
}

/**
 * Arma el PDF del reporte de turnos de caja. Devuelve el documento (en vez de
 * llamar a `.save()` acá adentro) para que la construcción sea testeable sin
 * disparar una descarga real en el navegador.
 */
export function buildReporteTurnosPdf({ desde, hasta, presetLabel, data }: ReporteTurnosPdfParams): jsPDF {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text('Hotel San Martín', 14, 18);

  doc.setFontSize(13);
  doc.text('Reporte de Turnos de Caja', 14, 27);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Período: ${presetLabel} (${desde} a ${hasta})`, 14, 34);
  doc.text(`Generado: ${new Date().toLocaleString('es-PY')}`, 14, 39);

  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text(`${data.length} ${data.length === 1 ? 'turno' : 'turnos'}`, 14, 50);

  autoTable(doc, {
    startY: 58,
    head: [['Caja', 'Usuario', 'Apertura', 'Cierre', 'Inicial', 'Final', 'Facturado']],
    body: data.map((t) => [
      t.caja,
      t.usuario,
      new Date(t.apertura).toLocaleString('es-PY'),
      // Un turno abierto guarda 0 como placeholder de monto_final (columna
      // NOT NULL); mismo criterio que la tabla en pantalla, no un cierre real.
      t.cierre ? new Date(t.cierre).toLocaleString('es-PY') : 'ABIERTO',
      formatGs(t.monto_inicial),
      t.monto_final === null ? '—' : formatGs(t.monto_final),
      `${formatGs(t.facturado)} (${t.cantidadFacturas})`,
    ]),
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 8 },
  });

  return doc;
}

/** Nombre de archivo sugerido: reporte-turnos_2026-07-01_2026-07-24.pdf */
export function reporteTurnosPdfFilename(desde: string, hasta: string): string {
  return `reporte-turnos_${desde}_${hasta}.pdf`;
}
