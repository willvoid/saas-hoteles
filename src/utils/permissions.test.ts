import { describe, it, expect } from 'vitest';
import {
  allowedTabs,
  canAssignAdminRole,
  canAssignCleaner,
  canAccessFinanzas,
  canAccessTab,
  canBlockRooms,
  canManageUser,
  normalizeRole,
} from './permissions';

describe('canManageUser', () => {
  it('lets an admin manage every role, including other admins', () => {
    expect(canManageUser('admin', 'admin')).toBe(true);
    expect(canManageUser('admin', 'gerente')).toBe(true);
    expect(canManageUser('admin', 'recepcionista')).toBe(true);
    expect(canManageUser('admin', 'limpiador')).toBe(true);
    expect(canManageUser('admin', 'unknown')).toBe(true);
  });

  it('blocks a gerente from managing admins but allows the rest', () => {
    expect(canManageUser('gerente', 'admin')).toBe(false);
    expect(canManageUser('gerente', 'gerente')).toBe(true);
    expect(canManageUser('gerente', 'recepcionista')).toBe(true);
    expect(canManageUser('gerente', 'limpiador')).toBe(true);
    expect(canManageUser('gerente', 'unknown')).toBe(true);
  });

  it('blocks roles that do not administer accounts at all', () => {
    expect(canManageUser('recepcionista', 'recepcionista')).toBe(false);
    expect(canManageUser('limpiador', 'limpiador')).toBe(false);
    expect(canManageUser('unknown', 'recepcionista')).toBe(false);
  });

  it('resolves "Administrador" to admin, so a gerente cannot manage it either', () => {
    expect(canManageUser('gerente', normalizeRole('Administrador'))).toBe(false);
    expect(canManageUser('gerente', normalizeRole('  ADMIN  '))).toBe(false);
  });
});

describe('canAssignAdminRole', () => {
  it('only the admin can hand out the admin cargo', () => {
    expect(canAssignAdminRole('admin')).toBe(true);
    expect(canAssignAdminRole('gerente')).toBe(false);
    expect(canAssignAdminRole('recepcionista')).toBe(false);
    expect(canAssignAdminRole('unknown')).toBe(false);
  });
});

describe('resolución del cargo de la sesión', () => {
  // `current_user_role()` devuelve lower(trim(cargo)); es la fuente de verdad
  // del rol (la misma que usan las policies de RLS), así que normalizeRole
  // tiene que entenderla tal cual viene.
  it('entiende el cargo tal como lo devuelve current_user_role()', () => {
    expect(normalizeRole('limpiador')).toBe('limpiador');
    expect(normalizeRole('limpiadora')).toBe('limpiador');
    expect(normalizeRole('recepcionista')).toBe('recepcionista');
    expect(normalizeRole('gerente')).toBe('gerente');
    expect(normalizeRole('administrador')).toBe('admin');
    expect(normalizeRole('admin')).toBe('admin');
  });

  // Regresión: cuando el cargo no se puede leer (la RLS de `cargo` devolvía el
  // embed en null sin error), el rol caía en 'unknown', que por diseño da
  // acceso casi total. Un limpiador terminaba viendo todos los módulos y
  // pudiendo bloquear habitaciones. El fallback permisivo se mantiene a
  // propósito, pero deja registro de por qué NUNCA hay que llegar acá con un
  // cargo real: hay que resolverlo con current_user_role().
  it('un cargo vacío cae en el fallback permisivo, no en el mínimo', () => {
    expect(normalizeRole('')).toBe('unknown');
    expect(normalizeRole(null)).toBe('unknown');
    expect(normalizeRole(undefined)).toBe('unknown');

    expect(canBlockRooms('unknown')).toBe(true);
    expect(allowedTabs('unknown').length).toBeGreaterThan(1);
    expect(allowedTabs('unknown')).toContain('reservas');
  });
});

describe('el limpiador dentro de Estado y limpieza', () => {
  it('sólo entra a Estado y limpieza', () => {
    expect(allowedTabs('limpiador')).toEqual(['estado-limpieza']);
  });

  it('no bloquea ni desbloquea habitaciones', () => {
    expect(canBlockRooms('limpiador')).toBe(false);
    expect(canBlockRooms('recepcionista')).toBe(true);
    expect(canBlockRooms('gerente')).toBe(true);
    expect(canBlockRooms('admin')).toBe(true);
  });

  it('no elige quién limpia: sólo puede quedar él como encargado', () => {
    expect(canAssignCleaner('limpiador')).toBe(false);
    expect(canAssignCleaner('recepcionista')).toBe(true);
    expect(canAssignCleaner('gerente')).toBe(true);
    expect(canAssignCleaner('admin')).toBe(true);
  });

  it('resuelve "Limpiadora" al mismo rol, con las mismas restricciones', () => {
    const rol = normalizeRole('Limpiadora');
    expect(rol).toBe('limpiador');
    expect(canBlockRooms(rol)).toBe(false);
    expect(canAssignCleaner(rol)).toBe(false);
  });
});

describe('Finanzas', () => {
  const on = { contabilidad: true, sifen: false };
  const off = { contabilidad: false, sifen: false };

  it('only admin and gerente have the finanzas tab', () => {
    expect(canAccessTab('admin', 'finanzas')).toBe(true);
    expect(canAccessTab('gerente', 'finanzas')).toBe(true);
    expect(canAccessTab('recepcionista', 'finanzas')).toBe(false);
    expect(canAccessTab('limpiador', 'finanzas')).toBe(false);
    expect(canAccessTab('unknown', 'finanzas')).toBe(false);
  });

  it('requires the contabilidad module on top of the role', () => {
    expect(canAccessFinanzas('admin', on)).toBe(true);
    expect(canAccessFinanzas('gerente', on)).toBe(true);
    expect(canAccessFinanzas('admin', off)).toBe(false);
    expect(canAccessFinanzas('gerente', off)).toBe(false);
  });

  it('denies other roles even when the module is on', () => {
    expect(canAccessFinanzas('recepcionista', on)).toBe(false);
    expect(canAccessFinanzas('limpiador', on)).toBe(false);
    expect(canAccessFinanzas('unknown', on)).toBe(false);
  });
});
