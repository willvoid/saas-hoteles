import { describe, expect, it } from 'vitest';
import {
  armarGastoNuevo,
  filtrarPorCliente,
  mesesDelAnio,
  validarCobroForm,
  inicioDeAnio,
  parseMonto,
  rangoMesActual,
  validarGastoForm,
  validarPagoForm,
  validarProveedorForm,
  validarSaldoInicialForm,
  validarTransferenciaForm,
  type GastoFormValores,
} from './finanzasForm';

const gastoBase: GastoFormValores = {
  fecha: '2026-03-10',
  fk_categoria: 4,
  fk_proveedor: '',
  nro_comprobante: '',
  gravado_10: '110000',
  gravado_5: '',
  exenta: '',
  condicion: 'contado',
  fecha_vencimiento: '',
  fk_cuenta_fondo: 2,
};

describe('parseMonto', () => {
  it('keeps digits only and returns an integer', () => {
    expect(parseMonto('150000')).toBe(150000);
    expect(parseMonto('1.500.000')).toBe(1500000);
    expect(parseMonto('-50')).toBe(50);
  });

  it('reads empty or non numeric text as zero', () => {
    expect(parseMonto('')).toBe(0);
    expect(parseMonto('abc')).toBe(0);
  });
});

describe('rangoMesActual / inicioDeAnio', () => {
  it('spans the whole month of the given business date', () => {
    expect(rangoMesActual('2026-03-10')).toEqual({ desde: '2026-03-01', hasta: '2026-03-31' });
    expect(rangoMesActual('2026-02-15')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoMesActual('2028-02-01')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(rangoMesActual('2026-12-31')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
  });

  it('starts the year on January 1st', () => {
    expect(inicioDeAnio('2026-10-15')).toBe('2026-01-01');
  });
});

describe('validarGastoForm', () => {
  it('accepts a valid cash expense', () => {
    expect(validarGastoForm(gastoBase, [])).toEqual({});
  });

  it('requires date, category and a positive total', () => {
    const errores = validarGastoForm(
      { ...gastoBase, fecha: '', fk_categoria: '', gravado_10: '', gravado_5: '', exenta: '' },
      [],
    );
    expect(errores.fecha).toBeTruthy();
    expect(errores.fk_categoria).toBeTruthy();
    expect(errores.monto).toBeTruthy();
  });

  it('requires a fund for cash expenses', () => {
    expect(validarGastoForm({ ...gastoBase, fk_cuenta_fondo: '' }, []).fk_cuenta_fondo).toBeTruthy();
  });

  it('requires a supplier for credit expenses but not for cash ones', () => {
    const credito: GastoFormValores = { ...gastoBase, condicion: 'credito', fk_cuenta_fondo: '' };
    expect(validarGastoForm(credito, []).fk_proveedor).toBeTruthy();
    expect(validarGastoForm({ ...credito, fk_proveedor: 7 }, [])).toEqual({});
    expect(validarGastoForm(gastoBase, []).fk_proveedor).toBeUndefined();
  });

  it('does not ask for a fund on credit expenses', () => {
    const credito: GastoFormValores = {
      ...gastoBase,
      condicion: 'credito',
      fk_proveedor: 7,
      fk_cuenta_fondo: '',
    };
    expect(validarGastoForm(credito, []).fk_cuenta_fondo).toBeUndefined();
  });

  it('rejects a due date before the expense date, only for credit', () => {
    const credito: GastoFormValores = {
      ...gastoBase,
      condicion: 'credito',
      fk_proveedor: 7,
      fk_cuenta_fondo: '',
      fecha_vencimiento: '2026-03-09',
    };
    expect(validarGastoForm(credito, []).fecha_vencimiento).toBeTruthy();
    expect(validarGastoForm({ ...credito, fecha_vencimiento: '2026-03-10' }, [])).toEqual({});
    // A stale due date on a cash expense is ignored (it is not sent).
    expect(
      validarGastoForm({ ...gastoBase, fecha_vencimiento: '2026-01-01' }, []).fecha_vencimiento,
    ).toBeUndefined();
  });

  it('flags a date inside a closed month', () => {
    const errores = validarGastoForm(gastoBase, [{ anio: 2026, mes: 3 }]);
    expect(errores.fecha).toMatch(/cerrado/i);
    expect(validarGastoForm(gastoBase, [{ anio: 2026, mes: 2 }])).toEqual({});
  });
});

describe('armarGastoNuevo', () => {
  it('builds a cash payload with the fund and no due date', () => {
    expect(
      armarGastoNuevo({ ...gastoBase, nro_comprobante: ' 001-001-0000123 ', fecha_vencimiento: '2026-04-01' }),
    ).toEqual({
      fecha: '2026-03-10',
      fk_categoria: 4,
      fk_proveedor: null,
      nro_comprobante: '001-001-0000123',
      gravado_10: 110000,
      gravado_5: 0,
      exenta: 0,
      condicion: 'contado',
      fecha_vencimiento: null,
      fk_cuenta_fondo: 2,
    });
  });

  it('builds a credit payload without fund and with the due date', () => {
    const nuevo = armarGastoNuevo({
      ...gastoBase,
      condicion: 'credito',
      fk_proveedor: 7,
      fecha_vencimiento: '2026-04-01',
      exenta: '5000',
    });
    expect(nuevo.fk_cuenta_fondo).toBeNull();
    expect(nuevo.fecha_vencimiento).toBe('2026-04-01');
    expect(nuevo.fk_proveedor).toBe(7);
    expect(nuevo.exenta).toBe(5000);
  });

  it('sends a null due date when a credit expense leaves it empty', () => {
    const nuevo = armarGastoNuevo({ ...gastoBase, condicion: 'credito', fk_proveedor: 7 });
    expect(nuevo.fecha_vencimiento).toBeNull();
  });

  it('sends a null receipt number when blank', () => {
    expect(armarGastoNuevo({ ...gastoBase, nro_comprobante: '   ' }).nro_comprobante).toBeNull();
  });
});

describe('validarPagoForm', () => {
  const pago = { fk_gasto: 3, fk_cuenta_fondo: 2, monto: '40000', fecha: '2026-03-10' };

  it('accepts an amount up to the balance', () => {
    expect(validarPagoForm(pago, 100000, [])).toEqual({});
    expect(validarPagoForm({ ...pago, monto: '100000' }, 100000, [])).toEqual({});
  });

  it('rejects zero, empty and above-balance amounts', () => {
    expect(validarPagoForm({ ...pago, monto: '' }, 100000, []).monto).toBeTruthy();
    expect(validarPagoForm({ ...pago, monto: '0' }, 100000, []).monto).toBeTruthy();
    expect(validarPagoForm({ ...pago, monto: '100001' }, 100000, []).monto).toMatch(/saldo/i);
  });

  it('requires the expense, the fund and the date', () => {
    const errores = validarPagoForm({ ...pago, fk_gasto: '', fk_cuenta_fondo: '', fecha: '' }, null, []);
    expect(errores.fk_gasto).toBeTruthy();
    expect(errores.fk_cuenta_fondo).toBeTruthy();
    expect(errores.fecha).toBeTruthy();
  });

  it('flags a date inside a closed month', () => {
    expect(validarPagoForm(pago, 100000, [{ anio: 2026, mes: 3 }]).fecha).toMatch(/cerrado/i);
  });
});

describe('validarTransferenciaForm', () => {
  const t = { origen: 1, destino: 2, monto: '25000', fecha: '2026-03-10' };

  it('accepts distinct funds and a positive amount', () => {
    expect(validarTransferenciaForm(t, [])).toEqual({});
  });

  it('rejects the same fund on both sides', () => {
    expect(validarTransferenciaForm({ ...t, destino: 1 }, []).destino).toBeTruthy();
  });

  it('requires both funds, a positive amount and the date', () => {
    const errores = validarTransferenciaForm({ origen: '', destino: '', monto: '0', fecha: '' }, []);
    expect(errores.origen).toBeTruthy();
    expect(errores.destino).toBeTruthy();
    expect(errores.monto).toBeTruthy();
    expect(errores.fecha).toBeTruthy();
  });

  it('flags a date inside a closed month', () => {
    expect(validarTransferenciaForm(t, [{ anio: 2026, mes: 3 }]).fecha).toMatch(/cerrado/i);
  });
});

describe('validarSaldoInicialForm', () => {
  const s = { fondo: 1, monto: '0', fecha: '2026-03-01' };

  it('accepts zero but needs a typed amount', () => {
    expect(validarSaldoInicialForm(s, [])).toEqual({});
    expect(validarSaldoInicialForm({ ...s, monto: '' }, []).monto).toBeTruthy();
  });

  it('requires the fund and the date', () => {
    const errores = validarSaldoInicialForm({ fondo: '', monto: '10', fecha: '' }, []);
    expect(errores.fondo).toBeTruthy();
    expect(errores.fecha).toBeTruthy();
  });

  it('flags a date inside a closed month', () => {
    expect(validarSaldoInicialForm(s, [{ anio: 2026, mes: 3 }]).fecha).toMatch(/cerrado/i);
  });
});

describe('validarProveedorForm', () => {
  it('requires a non blank name', () => {
    expect(validarProveedorForm({ nombre: '  ', ruc: '', telefono: '', email: '' }).nombre).toBeTruthy();
    expect(validarProveedorForm({ nombre: 'ACME', ruc: '', telefono: '', email: '' })).toEqual({});
  });

  it('checks the email shape only when it is filled in', () => {
    const base = { nombre: 'ACME', ruc: '', telefono: '' };
    expect(validarProveedorForm({ ...base, email: 'no-es-mail' }).email).toBeTruthy();
    expect(validarProveedorForm({ ...base, email: 'ventas@acme.com.py' })).toEqual({});
  });
});

describe('validarCobroForm', () => {
  const cobro = { fk_factura: 7, fk_cuenta_fondo: 2, monto: '40000', fecha: '2026-03-10' };

  it('accepts an amount from 1 up to the balance', () => {
    expect(validarCobroForm(cobro, 100000, [])).toEqual({});
    expect(validarCobroForm({ ...cobro, monto: '1' }, 100000, [])).toEqual({});
    expect(validarCobroForm({ ...cobro, monto: '100000' }, 100000, [])).toEqual({});
  });

  it('rejects zero, empty and above-balance amounts', () => {
    expect(validarCobroForm({ ...cobro, monto: '' }, 100000, []).monto).toBeTruthy();
    expect(validarCobroForm({ ...cobro, monto: '0' }, 100000, []).monto).toBeTruthy();
    expect(validarCobroForm({ ...cobro, monto: '100001' }, 100000, []).monto).toMatch(/saldo/i);
  });

  it('requires the invoice, the fund and the date', () => {
    const errores = validarCobroForm({ ...cobro, fk_factura: '', fk_cuenta_fondo: '', fecha: '' }, null, []);
    expect(errores.fk_factura).toBeTruthy();
    expect(errores.fk_cuenta_fondo).toBeTruthy();
    expect(errores.fecha).toBeTruthy();
  });

  it('flags a date inside a closed month', () => {
    expect(validarCobroForm(cobro, 100000, [{ anio: 2026, mes: 3 }]).fecha).toMatch(/cerrado/i);
  });
});

describe('filtrarPorCliente', () => {
  const filas = [
    { id: 1, cliente: { razon_social: 'Hotel Sol SA', documento: '800123-4' } },
    { id: 2, cliente: { razon_social: 'María Gómez', documento: '4567890' } },
    { id: 3, cliente: null },
  ];

  it('returns every row for a blank text', () => {
    expect(filtrarPorCliente(filas, '')).toHaveLength(3);
    expect(filtrarPorCliente(filas, '   ')).toHaveLength(3);
  });

  it('matches name or document, ignoring case and accents', () => {
    expect(filtrarPorCliente(filas, 'sol').map((f) => f.id)).toEqual([1]);
    expect(filtrarPorCliente(filas, 'MARIA gomez').map((f) => f.id)).toEqual([2]);
    expect(filtrarPorCliente(filas, '4567').map((f) => f.id)).toEqual([2]);
  });

  it('drops rows without client when a text is given', () => {
    expect(filtrarPorCliente(filas, 'zzz')).toEqual([]);
  });
});

describe('mesesDelAnio', () => {
  const ahora = new Date('2026-03-15T15:00:00Z');
  const cerrados = [{ anio: 2026, mes: 1, cerrado_en: '2026-02-03T10:00:00Z', cerrado_por: 5 }];

  it('always returns the twelve months in order with their label', () => {
    const meses = mesesDelAnio(2026, cerrados, ahora);
    expect(meses).toHaveLength(12);
    expect(meses[0].etiqueta).toBe('Enero 2026');
    expect(meses[11].etiqueta).toBe('Diciembre 2026');
    expect(meses.map((m) => m.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('marks closed months with who and when, open ones without', () => {
    const [enero, febrero] = mesesDelAnio(2026, cerrados, ahora);
    expect(enero).toMatchObject({ cerrado: true, cerradoEn: '2026-02-03T10:00:00Z', cerradoPor: 5 });
    expect(febrero).toMatchObject({ cerrado: false, cerradoEn: null, cerradoPor: null });
  });

  it('flags only the months after the current business month as future', () => {
    const meses = mesesDelAnio(2026, [], ahora);
    expect(meses.filter((m) => m.futuro).map((m) => m.mes)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('treats a whole past year as past and a whole future year as future', () => {
    expect(mesesDelAnio(2025, [], ahora).some((m) => m.futuro)).toBe(false);
    expect(mesesDelAnio(2027, [], ahora).every((m) => m.futuro)).toBe(true);
  });

  it('ignores closed periods of other years', () => {
    expect(mesesDelAnio(2025, cerrados, ahora).some((m) => m.cerrado)).toBe(false);
  });
});
