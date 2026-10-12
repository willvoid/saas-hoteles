import { describe, expect, it } from 'vitest';
import { readFunctionError } from './functionError';

const jsonResponse = (body: unknown, status = 409) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('readFunctionError', () => {
  it('returns the error message from the response body', async () => {
    const error = { message: 'Edge Function returned a non-2xx status code', context: jsonResponse({ error: 'Ya existe un usuario con ese correo.' }) };
    expect(await readFunctionError(error)).toBe('Ya existe un usuario con ese correo.');
  });

  it('can be read twice (the body is cloned)', async () => {
    const error = { context: jsonResponse({ error: 'Listo.' }) };
    expect(await readFunctionError(error)).toBe('Listo.');
    expect(await readFunctionError(error)).toBe('Listo.');
  });

  it('falls back when the body has no usable error', async () => {
    expect(await readFunctionError({ context: jsonResponse({}) }, 'x')).toBe('x');
    expect(await readFunctionError({ context: jsonResponse({ error: '  ' }) }, 'x')).toBe('x');
    expect(await readFunctionError({ context: jsonResponse({ error: 42 }) }, 'x')).toBe('x');
  });

  it('falls back when the body is not JSON', async () => {
    expect(await readFunctionError({ context: new Response('<html>', { status: 502 }) }, 'x')).toBe('x');
  });

  it('falls back when there is no response context (network error)', async () => {
    expect(await readFunctionError(new Error('Failed to fetch'), 'x')).toBe('x');
    expect(await readFunctionError(null, 'x')).toBe('x');
    expect(await readFunctionError(undefined)).toMatch(/No se pudo completar/);
  });
});
