import { describe, it, expect } from 'vitest';
import { validarMontoTurno, validarTipeoMontoTurno } from './montoTurno';

describe('validarTipeoMontoTurno', () => {
  it('acepta el campo vacío y los dígitos', () => {
    expect(validarTipeoMontoTurno('', 'monto final')).toBe('');
    expect(validarTipeoMontoTurno('150000', 'monto final')).toBe('');
  });

  it('rechaza cualquier carácter que no sea número', () => {
    expect(validarTipeoMontoTurno('15.000', 'monto final')).toBe(
      'Solo puede ingresar números para el monto final.',
    );
    expect(validarTipeoMontoTurno('-5', 'monto inicial')).toBe(
      'Solo puede ingresar números para el monto inicial.',
    );
  });

  it('rechaza el 0 inicial', () => {
    expect(validarTipeoMontoTurno('0', 'monto final')).toBe('El monto final no puede empezar con 0.');
    expect(validarTipeoMontoTurno('0150', 'monto final')).toBe('El monto final no puede empezar con 0.');
  });

  it('rechaza pasarse de 8 dígitos', () => {
    expect(validarTipeoMontoTurno('12345678', 'monto final')).toBe('');
    expect(validarTipeoMontoTurno('123456789', 'monto final')).toBe(
      'El monto final permite un máximo de 8 dígitos.',
    );
  });
});

describe('validarMontoTurno', () => {
  it('exige un monto cargado', () => {
    expect(validarMontoTurno('', 'monto final')).toBe('Ingresá un monto final.');
    expect(validarMontoTurno('', 'monto inicial')).toBe('Ingresá un monto inicial.');
  });

  it('acepta un monto positivo', () => {
    expect(validarMontoTurno('150000', 'monto final')).toBe('');
  });

  it('rechaza el cero', () => {
    // El tipeo ya no deja escribir un 0 inicial, así que ese es el mensaje.
    expect(validarMontoTurno('0', 'monto final')).toBe('El monto final no puede empezar con 0.');
  });
});
