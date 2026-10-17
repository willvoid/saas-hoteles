import { describe, expect, it } from 'vitest';
import {
  categoriasParaTipo,
  emptyMovimientoForm,
  formFromMovimiento,
  movimientoPdfRows,
  validateMovimientoForm,
} from './movimientoForm';
import type { Categoria, Movimiento } from '../../services/superadminFinanzasService';

const cat = (id: string, tipo: 'ingreso' | 'egreso', activo = true): Categoria => ({
  id,
  nombre: id,
  tipo,
  activo,
  created_at: '',
});

describe('categoriasParaTipo', () => {
  it('keeps only active categories of the tipo, plus the one being edited', () => {
    const cats = [cat('a', 'ingreso'), cat('b', 'egreso'), cat('c', 'ingreso', false)];
    expect(categoriasParaTipo(cats, 'ingreso').map((c) => c.id)).toEqual(['a']);
    expect(categoriasParaTipo(cats, 'ingreso', 'c').map((c) => c.id)).toEqual(['a', 'c']);
  });
});

describe('validateMovimientoForm', () => {
  const ok = { ...emptyMovimientoForm('2026-03-10'), categoria_id: 'a', monto: '1500' };
  it('accepts a complete form and parses the amount', () => {
    const r = validateMovimientoForm(ok);
    expect(r.errors).toEqual({});
    expect(r.value).toMatchObject({ monto: 1500, fecha: '2026-03-10', categoria_id: 'a', tipo: 'egreso' });
  });
  it('flags missing category, zero amount and bad date', () => {
    const r = validateMovimientoForm({ ...ok, categoria_id: '', monto: '0', fecha: '' });
    expect(Object.keys(r.errors).sort()).toEqual(['categoria_id', 'fecha', 'monto']);
    expect(r.value).toBeNull();
  });
  it('sends null for blank optional text', () => {
    const r = validateMovimientoForm({ ...ok, descripcion: '  ', referencia: '' });
    expect(r.value?.descripcion).toBeNull();
    expect(r.value?.referencia).toBeNull();
  });
});

describe('formFromMovimiento', () => {
  it('maps a manual row into form state', () => {
    const m: Movimiento = {
      origen: 'manual', tipo: 'ingreso', fecha: '2026-03-02', monto: 900, referencia: 'R1',
      created_at: '', anulado: false, id: 'x', categoria_id: 'a', descripcion: 'd',
    };
    expect(formFromMovimiento(m)).toEqual({
      tipo: 'ingreso', categoria_id: 'a', monto: '900', fecha: '2026-03-02', descripcion: 'd', referencia: 'R1',
    });
  });
});

describe('movimientoPdfRows', () => {
  it('skips voided rows and labels subscription rows', () => {
    const rows = movimientoPdfRows([
      { origen: 'suscripcion', tipo: 'ingreso', fecha: '2026-03-01', monto: 1000, referencia: null, created_at: '', anulado: false, tenant_nombre: 'Hotel A', plan: 'pro' },
      { origen: 'manual', tipo: 'egreso', fecha: '2026-03-02', monto: 500, referencia: null, created_at: '', anulado: true, id: '1', categoria_nombre: 'Hosting' },
      { origen: 'manual', tipo: 'egreso', fecha: '2026-03-03', monto: 700, referencia: null, created_at: '', anulado: false, id: '2', categoria_nombre: 'Hosting', descripcion: 'Vercel' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0][1]).toBe('Ingreso');
    expect(rows[0][3]).toContain('Hotel A');
    expect(rows[1][3]).toBe('Vercel');
  });
});
