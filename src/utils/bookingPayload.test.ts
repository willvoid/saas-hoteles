import { describe, it, expect } from 'vitest';
import {
  SUBMIT_REQUIRED_FIELDS_ERROR,
  buildBookingPayload,
  sanitizeDetalles,
  sanitizeTipoDocumento,
  validateClientForm,
  type ClientFormInput,
} from './bookingPayload';
import type { BookingDetalle, BookingHuesped } from '../types/booking';

const validForm = (overrides: Partial<ClientFormInput> = {}): ClientFormInput => ({
  razon_social: 'Hotel Sol SA',
  nombre_fantasia: 'Sol',
  documento: '1234567',
  telefono: '+54 123456',
  celular: '',
  direccion: 'Calle 1',
  email: 'info@sol.com',
  es_proveedor_del_estado: false,
  fk_tipo_documento: '1',
  ...overrides,
});

const guest = (overrides: Record<string, unknown> = {}): BookingHuesped =>
  ({
    nombre_completo: 'Ana Perez',
    documento: '1234567',
    fk_tipo_documento: '1',
    nacionalidad: 'PY',
    es_titular: true,
    ...overrides,
  }) as unknown as BookingHuesped;

const detalle = (huespedes: BookingHuesped[]): BookingDetalle => ({
  fk_tipo_habitacion: 1,
  fk_tarifa: 2,
  cantidad_adultos: 2,
  cantidad_ninos: 0,
  precio_unitario: 100000,
  subtotal: 200000,
  huespedes,
});

describe('validateClientForm', () => {
  it('returns null for a valid form', () => {
    expect(validateClientForm(validForm())).toBeNull();
  });

  it.each(['razon_social', 'fk_tipo_documento', 'documento', 'telefono'] as const)(
    'requires %s with the exact required-fields message',
    (field) => {
      expect(validateClientForm(validForm({ [field]: '' }))).toBe(
        'Por favor completa los campos obligatorios (*).',
      );
      expect(SUBMIT_REQUIRED_FIELDS_ERROR).toBe('Por favor completa los campos obligatorios (*).');
    },
  );

  it('treats an undefined tipo documento as missing', () => {
    expect(validateClientForm(validForm({ fk_tipo_documento: undefined }))).toBe(
      SUBMIT_REQUIRED_FIELDS_ERROR,
    );
  });

  it('reports required fields before documento errors', () => {
    expect(validateClientForm(validForm({ razon_social: '', documento: 'abc' }))).toBe(
      SUBMIT_REQUIRED_FIELDS_ERROR,
    );
  });

  describe('documento', () => {
    it('tipo 1 with non-digits', () => {
      expect(validateClientForm(validForm({ documento: '12a4' }))).toBe(
        'Para Cédula de Identidad solo se permiten números',
      );
    });

    it('RUC with a bad format', () => {
      expect(validateClientForm(validForm({ fk_tipo_documento: 'RUC', documento: 'abc' }))).toBe(
        'El RUC debe tener el formato número-dígito verificador (ej: 80012345-6)',
      );
    });

    it('tipo 2 invalid', () => {
      expect(validateClientForm(validForm({ fk_tipo_documento: 2, documento: 'ab-cd' }))).toBe(
        'El pasaporte solo admite letras y números, hasta 12 caracteres',
      );
    });

    it('tipo 2 valid passes', () => {
      expect(validateClientForm(validForm({ fk_tipo_documento: 2, documento: 'AB123456' }))).toBeNull();
    });
  });

  describe('email', () => {
    it('reports the validarEmail message for a bad email', () => {
      expect(validateClientForm(validForm({ email: 'a@@b.com' }))).toBe(
        'El correo debe tener un único @ (ejemplo: nombre@dominio.com).',
      );
    });

    it('empty email is valid', () => {
      expect(validateClientForm(validForm({ email: '' }))).toBeNull();
    });

    it('whitespace-only email is valid', () => {
      expect(validateClientForm(validForm({ email: '   ' }))).toBeNull();
    });
  });

  describe('telefono', () => {
    it('too short number', () => {
      expect(validateClientForm(validForm({ telefono: '+54 123' }))).toBe(
        'Teléfono: El número debe tener al menos 6 dígitos.',
      );
    });

    it('missing country code is reachable via separarTelefono ("+ 123456")', () => {
      expect(validateClientForm(validForm({ telefono: '+ 123456' }))).toBe(
        'Teléfono: Ingresá el código de país (ejemplo: +595).',
      );
    });
  });

  describe('celular', () => {
    it('wrong length for a Paraguayan mobile', () => {
      expect(validateClientForm(validForm({ celular: '0981' }))).toBe(
        'Celular: El celular debe tener 10 dígitos con el formato 09XX XXXXXX.',
      );
    });

    it('must start with 09', () => {
      expect(validateClientForm(validForm({ celular: '1234567890' }))).toBe(
        'Celular: Un celular paraguayo empieza con 09 (formato 09XX XXXXXX).',
      );
    });

    it('a valid Paraguayan mobile passes', () => {
      expect(validateClientForm(validForm({ celular: '0981 123456' }))).toBeNull();
    });

    it.each([
      ['empty string', ''],
      ['undefined', undefined],
      ['whitespace', '   '],
    ])('%s celular is optional and valid', (_label, celular) => {
      expect(validateClientForm(validForm({ celular }))).toBeNull();
    });
  });

  describe('ordering', () => {
    it('documento beats email, telefono and celular', () => {
      expect(
        validateClientForm(
          validForm({ documento: '12a4', email: 'bad', telefono: '+54 1', celular: '1' }),
        ),
      ).toBe('Para Cédula de Identidad solo se permiten números');
    });

    it('email beats telefono and celular', () => {
      expect(
        validateClientForm(validForm({ email: 'a@@b.com', telefono: '+54 1', celular: '1' })),
      ).toBe('El correo debe tener un único @ (ejemplo: nombre@dominio.com).');
    });

    it('telefono beats celular when both are bad', () => {
      expect(validateClientForm(validForm({ telefono: '+54 123', celular: '1234567890' }))).toBe(
        'Teléfono: El número debe tener al menos 6 dígitos.',
      );
    });
  });
});

describe('sanitizeTipoDocumento', () => {
  it('RUC becomes null', () => {
    expect(sanitizeTipoDocumento('RUC')).toBeNull();
  });

  it('numeric string becomes a number', () => {
    expect(sanitizeTipoDocumento('1')).toBe(1);
  });

  it('number stays a number', () => {
    expect(sanitizeTipoDocumento(2)).toBe(2);
  });

  it('undefined becomes NaN (current behavior pinned)', () => {
    expect(sanitizeTipoDocumento(undefined)).toBeNaN();
  });

  it('empty string becomes 0 (current behavior pinned)', () => {
    expect(sanitizeTipoDocumento('')).toBe(0);
  });

  it('null becomes 0 (current behavior pinned)', () => {
    expect(sanitizeTipoDocumento(null)).toBe(0);
  });
});

describe('sanitizeDetalles', () => {
  it('sanitizes every guest, preserving the other fields', () => {
    const result = sanitizeDetalles([
      detalle([
        guest({ fk_tipo_documento: 'RUC', documento: '80012345-6' }),
        guest({ fk_tipo_documento: '1', es_titular: false, nombre_completo: 'Luis' }),
      ]),
      detalle([guest({ fk_tipo_documento: '2' })]),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].huespedes).toEqual([
      guest({ fk_tipo_documento: null, documento: '80012345-6' }),
      guest({ fk_tipo_documento: 1, es_titular: false, nombre_completo: 'Luis' }),
    ]);
    expect(result[1].huespedes[0].fk_tipo_documento).toBe(2);
    expect(result[0].precio_unitario).toBe(100000);
    expect(result[0].fk_tarifa).toBe(2);
  });

  it('undefined detalles -> []', () => {
    expect(sanitizeDetalles(undefined)).toEqual([]);
  });

  it('detalle with undefined huespedes -> huespedes []', () => {
    const d = { ...detalle([]), huespedes: undefined } as unknown as BookingDetalle;
    const result = sanitizeDetalles([d]);
    expect(result).toHaveLength(1);
    expect(result[0].huespedes).toEqual([]);
  });

  it('guest with undefined fk becomes NaN (current guest coercion pinned)', () => {
    const result = sanitizeDetalles([detalle([guest({ fk_tipo_documento: undefined })])]);
    expect(result[0].huespedes[0].fk_tipo_documento).toBeNaN();
  });

  it('does not mutate the input and returns new references', () => {
    const input = [detalle([guest({ fk_tipo_documento: 'RUC' })])];
    const snapshot = JSON.parse(JSON.stringify(input));
    const result = sanitizeDetalles(input);
    expect(input).toEqual(snapshot);
    expect(input[0].huespedes[0].fk_tipo_documento).toBe('RUC');
    expect(result).not.toBe(input);
    expect(result[0]).not.toBe(input[0]);
    expect(result[0].huespedes).not.toBe(input[0].huespedes);
    expect(result[0].huespedes[0]).not.toBe(input[0].huespedes[0]);
    expect(result[0].huespedes[0].fk_tipo_documento).toBeNull();
  });
});

describe('buildBookingPayload', () => {
  const bookingData = {
    fecha_entrada: '2026-11-01',
    fecha_salida: '2026-11-03',
    detalles: [detalle([guest({ fk_tipo_documento: 'RUC' })])],
  };

  it('builds the full payload shape', () => {
    const form = validForm({ email: '  info@sol.com  ' });
    const payload = buildBookingPayload({ form, observaciones: '  late check-in  ', bookingData });
    expect(payload).toEqual({
      fecha_entrada: '2026-11-01',
      fecha_salida: '2026-11-03',
      origen: 'WEB',
      observaciones: '  late check-in  ',
      cliente: { ...form, fk_tipo_documento: 1 },
      detalles: [detalle([guest({ fk_tipo_documento: null })])],
    });
    expect(payload.cliente.email).toBe('  info@sol.com  ');
  });

  it('RUC client sends null while the input form keeps "RUC"', () => {
    const form = validForm({ fk_tipo_documento: 'RUC', documento: '80012345-6' });
    const payload = buildBookingPayload({ form, observaciones: '', bookingData });
    expect(payload.cliente.fk_tipo_documento).toBeNull();
    expect(payload.cliente.documento).toBe('80012345-6');
    expect(form.fk_tipo_documento).toBe('RUC');
  });

  it('undefined detalles -> []', () => {
    const payload = buildBookingPayload({
      form: validForm(),
      observaciones: '',
      bookingData: { fecha_entrada: 'a', fecha_salida: 'b' },
    });
    expect(payload.detalles).toEqual([]);
  });
});
