import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReporteIngresos } from '../services/reporteService';
import { formatGs } from './currency';

export interface ReporteIngresosPdfParams {
  desde: string;
  hasta: string;
  presetLabel: string;
  data: ReporteIngresos;
}

/**
 * Arma el PDF del reporte de ingresos. Devuelve el documento (en vez de
 * llamar a `.save()` acá adentro) para que la construcción sea testeable
 * sin disparar una descarga real en el navegador.
 */
export function buildReporteIngresosPdf({ desde, hasta, presetLabel, data }: ReporteIngresosPdfParams): jsPDF {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text('Hotel San Martín', 14, 18);

  doc.setFontSize(13);
  doc.text('Reporte de Ingresos', 14, 27);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Período: ${presetLabel} (${desde} a ${hasta})`, 14, 34);
  doc.text(`Generado: ${new Date().toLocaleString('es-PY')}`, 14, 39);

  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text(`Total ingresado: ${formatGs(data.total)}`, 14, 50);
  doc.text(
    `${data.cantidadFacturas} ${data.cantidadFacturas === 1 ? 'factura' : 'facturas'}`,
    14,
    56
  );

  autoTable(doc, {
    startY: 64,
    head: [['Método de pago', 'Facturas', 'Total']],
    body: data.porMetodo.map((row) => [row.metodo, String(row.cantidad), formatGs(row.total)]),
    headStyles: { fillColor: [59, 130, 246] },
  });

  return doc;
}

/** Nombre de archivo sugerido: reporte-ingresos_2026-07-01_2026-07-24.pdf */
export function reporteIngresosPdfFilename(desde: string, hasta: string): string {
  return `reporte-ingresos_${desde}_${hasta}.pdf`;
}
