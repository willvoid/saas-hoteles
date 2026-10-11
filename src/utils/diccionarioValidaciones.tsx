/**
 * Valida que si el tipo de documento es Cédula de Identidad (ID=1),
 * el valor solo contenga números.
 * @param value Valor del campo de documento
 * @param tipoDocId ID del tipo de documento seleccionado
 * @returns Mensaje de error si no es válido, string vacío si es válido
 */
export const verificionCiPy = (value: string, tipoDocId: string | number): string => {
  if (tipoDocId === 1 || tipoDocId === '1') {
    // Expresión regular que permite solo números
    const isOnlyNumbers = /^\d*$/.test(value);
    if (!isOnlyNumbers) {
      return "Para Cédula de Identidad solo se permiten números";
    }
  }
  return "";
};

/**
 * Valor que representa la opción "RUC" en los selects de tipo de documento.
 * No es un id real de `tipo_documento`: al elegirla, `fk_tipo_documento` se
 * envía como null (el RUC es un dato fiscal, no un tipo de documento de la
 * tabla de referencia).
 */
export const RUC_TIPO_DOC_VALUE = 'RUC';

/**
 * Valida el formato del RUC paraguayo: cuerpo numérico (6 a 8 dígitos), un
 * guion y el dígito verificador. Ej: 4567890-1 (persona física), 80012345-6
 * (persona jurídica).
 * @param value Valor del campo de documento
 * @returns Mensaje de error si no es válido, string vacío si es válido
 */
export const validarRuc = (value: string): string => {
  if (!value) return "";
  if (!/^\d{6,8}-\d$/.test(value)) {
    return "El RUC debe tener el formato número-dígito verificador (ej: 80012345-6)";
  }
  return "";
};

/**
 * Valida el formato de Pasaporte (tipo de documento ID=2), según ICAO Doc
 * 9303: alfanumérico, sin espacios ni guiones, hasta 12 caracteres.
 * @param value Valor del campo de documento
 * @param tipoDocId ID del tipo de documento seleccionado
 * @returns Mensaje de error si no es válido, string vacío si es válido
 */
export const validarPasaporte = (value: string, tipoDocId: string | number): string => {
  if (tipoDocId !== 2 && tipoDocId !== '2') return "";
  if (!value) return "";
  if (!/^[A-Za-z0-9]{1,12}$/.test(value)) {
    return "El pasaporte solo admite letras y números, hasta 12 caracteres";
  }
  return "";
};

/**
 * Valida el documento según el tipo elegido en el select, sea un cliente o un
 * huésped/titular de reserva: RUC no es un fk_tipo_documento real (se manda
 * `null` al backend), así que su validación de formato se deriva del valor
 * elegido en el select en vez de un id numérico. Mismo criterio en los tres
 * formularios que lo usan (Clientes, Huéspedes y Titular de reserva).
 * @param value Valor del campo de documento
 * @param tipoDoc Valor elegido en el select: id de tipo_documento o RUC_TIPO_DOC_VALUE
 * @returns Mensaje de error si no es válido, string vacío si es válido
 */
export const validarDocumentoPorTipo = (value: string, tipoDoc: string): string =>
  tipoDoc === RUC_TIPO_DOC_VALUE ? validarRuc(value) : verificionCiPy(value, tipoDoc) || validarPasaporte(value, tipoDoc);

/**
 * Cédula extranjera (ID=3) y Carnet de residencia (ID=4) no tienen validador
 * de formato propio a propósito: el documento pertenece a otro país, así que
 * no hay un patrón único que lo describa sin rechazar casos válidos. Quedan
 * cubiertos solo por la regla genérica de caracteres (alfanumérico + guion) y
 * el tope de longitud que ya aplican los formularios.
 */

/**
 * Valida que un número no sea negativo.
 * @param value Valor numérico
 * @param nombreCampo Nombre del campo para el mensaje de error (opcional)
 * @returns Mensaje de error si es negativo, string vacío si es válido
 */
export const validarNumeroNoNegativo = (value: string | number, nombreCampo: string = "El valor"): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num < 0) {
    return `${nombreCampo} no puede ser negativo`;
  }
  return "";
};

/**
 * Valida un correo electrónico con criterios equivalentes a los que aplica
 * Google al crear una cuenta: la parte local debe tener contenido real (no
 * puede ser sólo signos), no admite puntos al inicio/final ni consecutivos, y
 * el dominio necesita al menos un punto con una extensión de 2+ letras.
 *
 * @param value Correo a validar (se asume ya recortado por el llamador)
 * @returns Mensaje de error si no es válido, string vacío si es válido
 */
export const validarEmail = (value: string): string => {
  if (!value) return "";

  if (/\s/.test(value)) return "El correo no puede contener espacios.";

  const partes = value.split("@");
  if (partes.length !== 2) {
    return "El correo debe tener un único @ (ejemplo: nombre@dominio.com).";
  }

  const [local, dominio] = partes;

  if (!local) return "Falta el texto antes del @ (ejemplo: nombre@dominio.com).";
  if (local.length > 64) return "El texto antes del @ es demasiado largo.";
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) {
    return "El texto antes del @ sólo admite letras, números y . _ % + -";
  }
  // Debe tener contenido real: "..." o "+-+" no son nombres de usuario válidos.
  if (!/[A-Za-z0-9]/.test(local)) {
    return "El texto antes del @ no puede ser sólo signos.";
  }
  if (local.startsWith(".") || local.endsWith(".")) {
    return "El texto antes del @ no puede empezar ni terminar con un punto.";
  }
  if (local.includes("..")) {
    return "El texto antes del @ no puede tener dos puntos seguidos.";
  }

  if (!dominio) return "Falta el dominio después del @ (ejemplo: nombre@gmail.com).";
  if (!dominio.includes(".")) {
    return "El dominio debe incluir una extensión (ejemplo: gmail.com).";
  }
  if (dominio.includes("..")) {
    return "El dominio no puede tener dos puntos seguidos.";
  }

  const etiquetas = dominio.split(".");
  if (etiquetas.some((e) => !/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/.test(e))) {
    return "El dominio ingresado no es válido (ejemplo: gmail.com).";
  }
  if (!/^[A-Za-z]{2,}$/.test(etiquetas[etiquetas.length - 1])) {
    return "La extensión del dominio debe tener al menos 2 letras (ejemplo: .com).";
  }

  return "";
};
