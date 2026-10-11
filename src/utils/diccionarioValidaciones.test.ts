import { describe, it, expect } from 'vitest';
import { validarEmail, verificionCiPy, validarNumeroNoNegativo } from './diccionarioValidaciones';

describe('validarEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(validarEmail('juan.perez@gmail.com')).toBe('');
    expect(validarEmail('ana_25@hotel-sanmartin.com.py')).toBe('');
    expect(validarEmail('a1@x.io')).toBe('');
  });

  it('treats an empty value as valid (the field is optional)', () => {
    expect(validarEmail('')).toBe('');
  });

  it('rejects a missing or duplicated @', () => {
    expect(validarEmail('juanperez.com')).toMatch(/único @/);
    expect(validarEmail('juan@perez@gmail.com')).toMatch(/único @/);
  });

  it('requires real text before the @', () => {
    expect(validarEmail('@gmail.com')).toMatch(/Falta el texto/);
    expect(validarEmail('...@gmail.com')).toMatch(/sólo signos/);
    expect(validarEmail('+-+@gmail.com')).toMatch(/sólo signos/);
  });

  it('rejects malformed dots in the local part', () => {
    expect(validarEmail('.juan@gmail.com')).toMatch(/punto/);
    expect(validarEmail('juan.@gmail.com')).toMatch(/punto/);
    expect(validarEmail('ju..an@gmail.com')).toMatch(/dos puntos/);
  });

  it('rejects invalid characters and spaces', () => {
    expect(validarEmail('juan perez@gmail.com')).toMatch(/espacios/);
    expect(validarEmail('juan!perez@gmail.com')).toMatch(/sólo admite/);
  });

  it('requires a domain with a valid extension', () => {
    expect(validarEmail('juan@')).toMatch(/Falta el dominio/);
    expect(validarEmail('juan@gmail')).toMatch(/extensión/);
    expect(validarEmail('juan@gmail.c')).toMatch(/al menos 2 letras/);
    expect(validarEmail('juan@gmail.123')).toMatch(/al menos 2 letras/);
    expect(validarEmail('juan@gmail..com')).toMatch(/dos puntos/);
    expect(validarEmail('juan@-gmail.com')).toMatch(/no es válido/);
  });
});

describe('verificionCiPy', () => {
  it('only allows digits for Cédula de Identidad (type 1)', () => {
    expect(verificionCiPy('1234567', 1)).toBe('');
    expect(verificionCiPy('1234567', '1')).toBe('');
    expect(verificionCiPy('12A4567', 1)).toMatch(/solo se permiten números/);
  });

  it('ignores other document types', () => {
    expect(verificionCiPy('AB-1234', 2)).toBe('');
  });
});

describe('validarNumeroNoNegativo', () => {
  it('flags negatives and accepts zero or more', () => {
    expect(validarNumeroNoNegativo(-1)).toMatch(/no puede ser negativo/);
    expect(validarNumeroNoNegativo('-0.5', 'El monto')).toBe('El monto no puede ser negativo');
    expect(validarNumeroNoNegativo(0)).toBe('');
    expect(validarNumeroNoNegativo('10')).toBe('');
  });
});
