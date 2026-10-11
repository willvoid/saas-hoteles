// Control de acceso por cargo (RBAC).
// Los nombres de cargo vienen de la tabla `cargo` y los escribe el usuario,
// por eso se normalizan (mayúsculas, espacios y acentos) antes de comparar.

export type TabId =
  | 'home'
  | 'clientes'
  | 'reservas'
  | 'folios'
  | 'facturacion'
  | 'caja'
  | 'habitaciones'
  | 'tipos_habitacion'
  | 'tarifas'
  | 'estado-limpieza'
  | 'usuarios'
  | 'establecimientos'
  | 'empresas'
  | 'edificios'
  | 'pisos'
  | 'productos'
  | 'reportes';

export type Role = 'admin' | 'gerente' | 'recepcionista' | 'limpiador' | 'unknown';

const ALL_TABS: TabId[] = [
  'home', 'clientes', 'reservas', 'folios',
  'facturacion', 'caja',
  'habitaciones', 'tipos_habitacion', 'tarifas',
  'estado-limpieza', 'usuarios',
  'establecimientos', 'empresas',
  'edificios', 'pisos',
  'productos', 'reportes'
];

export function normalizeRole(cargo?: string | null): Role {
  if (!cargo) return 'unknown';
  const normalized = cargo
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  switch (normalized) {
    case 'admin':
    case 'administrador':
      return 'admin';
    case 'gerente':
      return 'gerente';
    case 'recepcionista':
      return 'recepcionista';
    case 'limpiador':
    case 'limpiadora':
      return 'limpiador';
    default:
      return 'unknown';
  }
}

export function allowedTabs(role: Role): TabId[] {
  switch (role) {
    case 'admin':
    case 'gerente':
      return ALL_TABS;
    case 'limpiador':
      return ['estado-limpieza'];
    case 'recepcionista':
    // Cargo desconocido: se trata como recepcionista (acceso operativo sin
    // administración de usuarios) para no bloquear toda la app por un nombre
    // de cargo mal escrito. Un ADMIN puede corregir el cargo luego.
    case 'unknown':
    default:
      // Módulos exclusivos de admin/gerente: administración de usuarios,
      // establecimientos/empresas, infraestructura edilicia (edificios/pisos)
      // y reportes financieros (ingresos, desglose por método de pago).
      return ALL_TABS.filter(
        tab =>
          tab !== 'usuarios' &&
          tab !== 'establecimientos' &&
          tab !== 'empresas' &&
          tab !== 'edificios' &&
          tab !== 'pisos' &&
          tab !== 'reportes'
      );
  }
}

export function canAccessTab(role: Role, tab: TabId): boolean {
  return allowedTabs(role).includes(tab);
}

// Solo el limpiador tiene prohibido bloquear/desbloquear habitaciones: en
// Estado y limpieza puede ver los bloqueos, pero no crearlos, editarlos ni
// levantarlos. Lo suyo es el estado de limpieza.
export function canBlockRooms(role: Role): boolean {
  return role !== 'limpiador';
}

// Elegir QUIÉN limpia una habitación es de recepción para arriba. El limpiador
// sólo puede ponerse a sí mismo: al pasar una habitación a "En Limpieza" queda
// registrado como el encargado, sin poder asignársela a otra persona.
export function canAssignCleaner(role: Role): boolean {
  return role !== 'limpiador';
}

// Administración de cuentas: el ADMIN gestiona a todos; el gerente gestiona a
// todos MENOS a los administradores (no los ve en la tabla ni puede editarlos
// o cambiarles el estado). El resto de los cargos no llega a este módulo.
export function canManageUser(actor: Role, target: Role): boolean {
  if (actor === 'admin') return true;
  if (actor === 'gerente') return target !== 'admin';
  return false;
}

// Asignar el cargo ADMIN queda reservado al ADMIN: si un gerente pudiera
// hacerlo, la restricción anterior sería sólo cosmética (crearía o promovería
// un administrador y luego no podría volver a tocarlo).
export function canAssignAdminRole(role: Role): boolean {
  return role === 'admin';
}

export function defaultTab(role: Role): TabId {
  return role === 'limpiador' ? 'estado-limpieza' : 'home';
}
