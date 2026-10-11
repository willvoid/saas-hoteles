// Reglas del monto de apertura y cierre de un turno de caja. Viven acá para
// que el arqueo del módulo de Caja y el que pide el cierre de sesión validen
// exactamente igual: mismas reglas y mismos mensajes.

/** Tope de dígitos del monto, mismo criterio que el número de habitación. */
export const MAX_DIGITOS_MONTO = 8;

/**
 * Corta el tipeo ante un valor inválido y devuelve el mensaje a mostrar al
 * momento. Devuelve '' si el valor se puede guardar tal cual.
 */
export const validarTipeoMontoTurno = (value: string, nombreCampo: string): string => {
  if (/[^\d]/.test(value)) {
    return `Solo puede ingresar números para el ${nombreCampo}.`;
  }
  if (value.length > 0 && value[0] === '0') {
    return `El ${nombreCampo} no puede empezar con 0.`;
  }
  if (value.length > MAX_DIGITOS_MONTO) {
    return `El ${nombreCampo} permite un máximo de ${MAX_DIGITOS_MONTO} dígitos.`;
  }
  return '';
};

/**
 * Validación al confirmar la apertura o el cierre. Devuelve '' si el monto es
 * válido.
 */
export const validarMontoTurno = (value: string, nombreCampo: string): string => {
  if (value === '') {
    return `Ingresá un ${nombreCampo}.`;
  }
  const errorTipeo = validarTipeoMontoTurno(value, nombreCampo);
  if (errorTipeo) return errorTipeo;
  if (Number(value) <= 0) {
    return `El ${nombreCampo} debe ser un número positivo.`;
  }
  return '';
};
