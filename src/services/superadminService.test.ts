import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import {
  createTenant,
  getTenant,
  listTenants,
  setTenantEstado,
  setTenantPlan,
  whoami,
} from './superadminService';

function httpError(message: string) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ error: message }), { status: 403 }),
  };
}

describe('superadminService', () => {
  beforeEach(() => invoke.mockReset());

  it('whoami returns the flag from the function', async () => {
    invoke.mockResolvedValue({ data: { data: { isPlatformAdmin: true } }, error: null });
    await expect(whoami()).resolves.toEqual({ isPlatformAdmin: true });
    expect(invoke).toHaveBeenCalledWith('superadmin', { body: { action: 'whoami' } });
  });

  it('listTenants sends list_tenants and unwraps data', async () => {
    const rows = [{ id: 1, nombre: 'H' }];
    invoke.mockResolvedValue({ data: { data: rows }, error: null });
    await expect(listTenants()).resolves.toEqual(rows);
    expect(invoke).toHaveBeenCalledWith('superadmin', { body: { action: 'list_tenants' } });
  });

  it('getTenant sends tenant_id', async () => {
    const detail = { tenant: { id: 3 }, usuarios: [], establecimientos: [] };
    invoke.mockResolvedValue({ data: { data: detail }, error: null });
    await expect(getTenant(3)).resolves.toEqual(detail);
    expect(invoke).toHaveBeenCalledWith('superadmin', { body: { action: 'get_tenant', tenant_id: 3 } });
  });

  it('setTenantEstado sends estado', async () => {
    invoke.mockResolvedValue({ data: { data: { tenant_id: 3, estado: 'suspendido' } }, error: null });
    await setTenantEstado(3, 'suspendido');
    expect(invoke).toHaveBeenCalledWith('superadmin', {
      body: { action: 'set_estado', tenant_id: 3, estado: 'suspendido' },
    });
  });

  it('setTenantPlan sends plan fields', async () => {
    invoke.mockResolvedValue({
      data: { data: { tenant_id: 3, plan: 'pro', ciclo: 'anual', vigente_hasta: '2027-01-01' } },
      error: null,
    });
    const r = await setTenantPlan(3, { plan: 'pro', ciclo: 'anual', monto: 100 });
    expect(r.vigente_hasta).toBe('2027-01-01');
    expect(invoke).toHaveBeenCalledWith('superadmin', {
      body: { action: 'set_plan', tenant_id: 3, plan: 'pro', ciclo: 'anual', monto: 100 },
    });
  });

  it('createTenant spreads the input into the body', async () => {
    invoke.mockResolvedValue({ data: { data: { tenant_id: 9, auth_id: 'u' } }, error: null });
    const input = { email: 'a@b.co', password: 'secret123' } as unknown as Parameters<typeof createTenant>[0];
    await expect(createTenant(input)).resolves.toEqual({ tenant_id: 9, auth_id: 'u' });
    expect(invoke).toHaveBeenCalledWith('superadmin', {
      body: { action: 'create_tenant', email: 'a@b.co', password: 'secret123' },
    });
  });

  it('throws the Spanish message from a non-2xx response', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError('Acceso denegado.') });
    await expect(listTenants()).rejects.toThrow('Acceso denegado.');
  });

  it('throws when the payload carries an error', async () => {
    invoke.mockResolvedValue({ data: { error: 'Boom' }, error: null });
    await expect(listTenants()).rejects.toThrow('Boom');
  });

  it('throws a generic error when the response has no data', async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    await expect(listTenants()).rejects.toThrow();
  });
});
