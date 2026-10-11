import { describe, it, expect } from 'vitest';
import {
  CODIGO_PAIS_DEFECTO,
  formatearNumero,
  sanitizarCodigoPais,
  separarTelefono,
  unirTelefono,
  validarCodigoPais,
  validarNumero,
  validarTipeoNumero,
} from './telefono';

describe('sanitizarCodigoPais', () => {
  it('siempre deja el + al inicio, aunque se intente borrar', () => {
    expect(sanitizarCodigoPais('')).toBe('+');
    expect(sanitizarCodigoPais('595')).toBe('+595');
    expect(sanitizarCodigoPais('+595')).toBe('+595');
  });

  it('no admite nada a la izquierda del +: el + vuelve al inicio', () => {
    // El componente impide poner el cursor antes del +; esto es el respaldo
    // (pegado, autocompletado del navegador) y el tope de 3 dígitos sigue valiendo.
    expect(sanitizarCodigoPais('1+595')).toBe('+159');
    expect(sanitizarCodigoPais('++54')).toBe('+54');
  });

  it('descarta lo que no sea número y corta en 3 dígitos', () => {
    expect(sanitizarCodigoPais('+59a5')).toBe('+595');
    expect(sanitizarCodigoPais('+5951234')).toBe('+595');
  });
});

describe('formatearNumero', () => {
  it('mete el espacio solo en el celular paraguayo', () => {
    expect(formatearNumero('0981', '+595', 'celular')).toBe('0981');
    expect(formatearNumero('09811', '+595', 'celular')).toBe('0981 1');
    expect(formatearNumero('0981123456', '+595', 'celular')).toBe('0981 123456');
  });

  it('no formatea números de otros países ni líneas fijas', () => {
    expect(formatearNumero('1122334455', '+54', 'celular')).toBe('1122334455');
    expect(formatearNumero('0211234567', '+595', 'fijo')).toBe('0211234567');
  });
});

describe('validarTipeoNumero', () => {
  it('acepta los prefijos válidos de un celular paraguayo', () => {
    expect(validarTipeoNumero('', '+595', 'celular')).toBe('');
    expect(validarTipeoNumero('0', '+595', 'celular')).toBe('');
    expect(validarTipeoNumero('09', '+595', 'celular')).toBe('');
    expect(validarTipeoNumero('0981123456', '+595', 'celular')).toBe('');
  });

  it('corta el tipeo si no arranca con 09', () => {
    expect(validarTipeoNumero('1', '+595', 'celular')).not.toBe('');
    expect(validarTipeoNumero('08', '+595', 'celular')).not.toBe('');
  });

  it('corta el tipeo al pasarse del largo', () => {
    expect(validarTipeoNumero('09811234567', '+595', 'celular')).not.toBe('');
    expect(validarTipeoNumero('1234567890123456', '+54', 'celular')).not.toBe('');
  });

  it('no exige el 09 con otro código de país', () => {
    expect(validarTipeoNumero('1122334455', '+54', 'celular')).toBe('');
  });
});

describe('validarNumero', () => {
  it('acepta el número vacío: la obligatoriedad la decide el formulario', () => {
    expect(validarNumero('', '+595', 'celular')).toBe('');
  });

  it('exige los 10 dígitos del celular paraguayo', () => {
    expect(validarNumero('0981123456', '+595', 'celular')).toBe('');
    expect(validarNumero('098112345', '+595', 'celular')).not.toBe('');
  });

  it('exige un mínimo razonable en otros países', () => {
    expect(validarNumero('12345', '+54', 'celular')).not.toBe('');
    expect(validarNumero('1122334455', '+54', 'celular')).toBe('');
  });
});

describe('validarCodigoPais', () => {
  it('exige el código sólo si hay número cargado', () => {
    expect(validarCodigoPais('+', '')).toBe('');
    expect(validarCodigoPais('+', '0981123456')).not.toBe('');
    expect(validarCodigoPais('+595', '0981123456')).toBe('');
  });
});

describe('unirTelefono', () => {
  it('guarda código y número formateado', () => {
    expect(unirTelefono('+595', '0981123456', 'celular')).toBe('+595 0981 123456');
    expect(unirTelefono('+54', '1122334455', 'celular')).toBe('+54 1122334455');
  });

  it('sin número no hay teléfono que guardar', () => {
    expect(unirTelefono('+595', '', 'celular')).toBe('');
  });
});

describe('separarTelefono', () => {
  it('lee el formato que guarda el campo', () => {
    expect(separarTelefono('+595 0981 123456')).toEqual({ codigo: '+595', numero: '0981123456' });
  });

  it('lee los formatos viejos ya cargados en la base', () => {
    expect(separarTelefono('+595981123456')).toEqual({ codigo: '+595', numero: '0981123456' });
    expect(separarTelefono('+595 981 123456')).toEqual({ codigo: '+595', numero: '0981123456' });
    expect(separarTelefono('0981123456')).toEqual({ codigo: '+595', numero: '0981123456' });
    expect(separarTelefono('+54 1122334455')).toEqual({ codigo: '+54', numero: '1122334455' });
  });

  it('vuelve al código por defecto cuando no hay valor', () => {
    expect(separarTelefono('')).toEqual({ codigo: CODIGO_PAIS_DEFECTO, numero: '' });
    expect(separarTelefono(null)).toEqual({ codigo: CODIGO_PAIS_DEFECTO, numero: '' });
    expect(separarTelefono(undefined)).toEqual({ codigo: CODIGO_PAIS_DEFECTO, numero: '' });
  });

  it('recorta lo que exceda el largo permitido', () => {
    expect(separarTelefono('+595 0981 12345678').numero).toBe('0981123456');
  });

  it('ida y vuelta: lo guardado se vuelve a leer igual', () => {
    const guardado = unirTelefono('+595', '0981123456', 'celular');
    expect(separarTelefono(guardado)).toEqual({ codigo: '+595', numero: '0981123456' });
  });
});
