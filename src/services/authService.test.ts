import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const tenant = { id: 1, estado: 'activo' };
vi.mock('./supabaseClient', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) builder[m] = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: { id_usuario: 1, cargo: { cargo: 'admin' } }, error: null });
  return {
    supabase: {
      from: () => builder,
      rpc: () => Promise.resolve({ data: 'admin', error: null }),
      functions: { invoke: (...a: unknown[]) => invoke(...a) },
    },
  };
});
vi.mock('./tenantService', () => ({
  getCurrentTenantId: () => Promise.resolve(1),
  loadTenant: () => Promise.resolve(tenant),
  TENANT_SUSPENDIDO: 'suspendido',
}));

import { resolveSession } from './authService';

describe('resolveSession isPlatformAdmin', () => {
  beforeEach(() => invoke.mockReset());

  it('is true when whoami says so', async () => {
    invoke.mockResolvedValue({ data: { data: { isPlatformAdmin: true } }, error: null });
    const r = await resolveSession('a');
    expect(r.status === 'ok' && r.isPlatformAdmin).toBe(true);
  });

  it('is false and does not break login when whoami fails', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await resolveSession('a');
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.isPlatformAdmin).toBe(false);
  });
});
