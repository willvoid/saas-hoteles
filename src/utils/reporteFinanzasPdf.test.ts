import { describe, expect, it } from 'vitest';
import { buildReporteFinanzasPdf, reporteFinanzasPdfFilename } from './reporteFinanzasPdf';
import type { TablaReporte } from './reporteFinanzas';

const tabla: TablaReporte = {
  titulo: 'Flujo de fondos',
  resumen: ['Saldo total: Gs. 10'],
  head: ['Fondo', 'Saldo'],
  body: [['Caja', 'Gs. 10']],
  foot: ['Total', 'Gs. 10'],
};

describe('buildReporteFinanzasPdf', () => {
  it('arma un documento con al menos una pagina', () => {
    const doc = buildReporteFinanzasPdf({ tabla, periodo: '2026-01-01 a 2026-03-31' });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('usa horizontal para tablas anchas', () => {
    const doc = buildReporteFinanzasPdf({ tabla: { ...tabla, orientacion: 'l' }, periodo: 'Año 2026' });
    expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
  });
});

describe('reporteFinanzasPdfFilename', () => {
  it('normaliza acentos y espacios', () => {
    expect(reporteFinanzasPdfFilename('Ingresos vs egresos', '2026-03-01_2026-03-31')).toBe(
      'ingresos-vs-egresos_2026-03-01_2026-03-31.pdf',
    );
    expect(reporteFinanzasPdfFilename('Libro IVA 2026', '2026')).toBe('libro-iva-2026_2026.pdf');
  });
});
