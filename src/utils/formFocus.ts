// Llevar al usuario hasta el campo que falló al guardar.
//
// En los formularios largos el mensaje de error queda arriba de todo y no se
// ve sin scrollear, así que además de mostrarlo se lleva la vista al campo
// que lo produjo y se le da el foco.

/**
 * Primer id de `orden` que tenga un mensaje de error cargado. `orden` define
 * la prioridad: normalmente el mismo orden en que los campos aparecen en
 * pantalla, para llevar al usuario al primer problema y no a uno del medio.
 */
export function primerCampoConError(
  errores: Record<string, string | undefined>,
  orden: readonly string[],
): string | null {
  return orden.find((id) => !!errores[id]) ?? null;
}

/**
 * Lleva la vista al campo `id` y le da el foco. Devuelve false si el campo no
 * está en el DOM (por ejemplo, uno que sólo se muestra en cierto modo), para
 * que el llamador sepa que el error quedó sólo en el cartel.
 *
 * Busca primero por `id` y, si no lo encuentra, por `name`: hay formularios
 * que sólo tienen el `name` del campo. El scroll se hace sobre el contenedor
 * cuando el id apunta a un envoltorio (como el buscador de clientes, que no es
 * un input en sí).
 */
export function enfocarCampo(id: string): boolean {
  if (typeof document === 'undefined') return false;
  const el =
    document.getElementById(id) ??
    document.querySelector<HTMLElement>(`[name="${CSS.escape(id)}"]`);
  if (!el) return false;

  // Se agenda para después del render: así React ya pintó el mensaje de error
  // y el campo queda centrado con el texto visible. Va con setTimeout y no con
  // requestAnimationFrame porque este último no corre si la pestaña no está
  // dibujando, y el foco quedaría sin aplicarse.
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const enfocable =
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
        ? el
        : el.querySelector<HTMLElement>('input, select, textarea');
    // preventScroll: el scrollIntoView de arriba ya se está encargando; sin
    // esto el foco produce un segundo salto brusco que corta la animación.
    enfocable?.focus({ preventScroll: true });
  }, 0);

  return true;
}

/**
 * Atajo para el caso más común: elegir el primer campo con error y llevar la
 * vista hasta él. Devuelve el id enfocado, o null si no había ninguno visible.
 */
export function enfocarPrimerError(
  errores: Record<string, string | undefined>,
  orden: readonly string[],
): string | null {
  const id = primerCampoConError(errores, orden);
  if (!id) return null;
  return enfocarCampo(id) ? id : null;
}
