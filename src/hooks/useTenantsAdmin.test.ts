import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/superadminService', () => ({}));

import { runTenantAction, toErrorMessage } from './useTenantsAdmin';

describe('toErrorMessage', () => {
  it('uses the Error message, else the fallback', () => {
    expect(toErrorMessage(new Error('boom'), 'x')).toBe('boom');
    expect(toErrorMessage('nope', 'x')).toBe('x');
    expect(toErrorMessage(new Error(''), 'x')).toBe('x');
  });
});

describe('runTenantAction', () => {
  it('runs the action and returns a success feedback', async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    await expect(runTenantAction({ plan: 'pro' }, action, 'Listo')).resolves.toEqual({ ok: true, message: 'Listo' });
    expect(action).toHaveBeenCalledOnce();
  });

  it('returns an error feedback when the action rejects', async () => {
    const action = vi.fn().mockRejectedValue(new Error('Acceso denegado.'));
    await expect(runTenantAction({ plan: 'pro' }, action, 'Listo')).resolves.toEqual({
      ok: false,
      message: 'Acceso denegado.',
    });
  });

  it('never runs the action on the template tenant', async () => {
    const action = vi.fn();
    const result = await runTenantAction({ plan: 'plantilla' }, action, 'Listo');
    expect(result.ok).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
});
