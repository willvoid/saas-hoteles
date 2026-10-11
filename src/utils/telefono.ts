// Reglas de los campos de teléfono/celular, partidos en dos: el código de país
// (siempre "+" y hasta 3 dígitos) y el número local.
//
// Con el código por defecto (+595) el número se carga como celular paraguayo,
// con el formato 09XX XXXXXX: sólo dígitos, arranca con 09, 10 dígitos en
// total y el espacio se inserta solo. Con cualquier otro código de país no se
// puede asumir un formato local, así que sólo se exigen dígitos y un largo
// razonable.

/** Código de país que trae el campo por defecto. */
export const CODIGO_PAIS_DEFECTO = '+595';

/** Máximo de dígitos del código de país (a la derecha del "+"). */
export const MAX_DIGITOS_CODIGO = 3;

/** Celular paraguayo: 09XX XXXXXX -> 10 dígitos, con el espacio tras el 4º. */
const PY_LARGO = 10;
const PY_CORTE_ESPACIO = 4;

/** Números de otros países: sin formato local conocido, sólo un rango sensato. */
const OTRO_PAIS_MIN = 6;
const OTRO_PAIS_MAX = 15;

/** Modo del campo: celular (máscara paraguaya) o línea fija / número libre. */
export type ModoTelefono = 'celular' | 'fijo';

/** True si el código de país corresponde a Paraguay. */
export const esParaguay = (codigo: string): boolean => codigo === CODIGO_PAIS_DEFECTO;

/** Dígitos de una cadena, descartando espacios, "+" y cualquier otro signo. */
const soloDigitos = (value: string): string => value.replace(/\D/g, '');

/**
 * Deja el campo de país siempre como "+" seguido de hasta 3 dígitos, sin
 * importar qué haya tipeado o pegado el usuario. El "+" nunca se pierde.
 */
export const sanitizarCodigoPais = (raw: string): string =>
  `+${soloDigitos(raw).slice(0, MAX_DIGITOS_CODIGO)}`;

/** Largo máximo de dígitos del número local según el código de país y el modo. */
export const maxDigitosNumero = (codigo: string, modo: ModoTelefono): number =>
  modo === 'celular' && esParaguay(codigo) ? PY_LARGO : OTRO_PAIS_MAX;

/**
 * Aplica el formato visible al número local. Para el celular paraguayo mete el
 * espacio automático (09XX XXXXXX); el resto se muestra tal cual.
 */
export const formatearNumero = (digitos: string, codigo: string, modo: ModoTelefono): string => {
  if (modo !== 'celular' || !esParaguay(codigo) || digitos.length <= PY_CORTE_ESPACIO) {
    return digitos;
  }
  return `${digitos.slice(0, PY_CORTE_ESPACIO)} ${digitos.slice(PY_CORTE_ESPACIO)}`;
};

/**
 * Error a mostrar mientras se tipea, o '' si los dígitos propuestos son un
 * prefijo válido. Se usa para cortar el tipeo, igual que el resto de los
 * módulos: el valor sólo se guarda si esta función devuelve ''.
 */
export const validarTipeoNumero = (
  digitos: string,
  codigo: string,
  modo: ModoTelefono,
): string => {
  const max = maxDigitosNumero(codigo, modo);
  if (digitos.length > max) {
    return `El número permite un máximo de ${max} dígitos.`;
  }
  if (modo === 'celular' && esParaguay(codigo)) {
    if (digitos.length >= 1 && digitos[0] !== '0') {
      return 'Un celular paraguayo empieza con 09 (formato 09XX XXXXXX).';
    }
    if (digitos.length >= 2 && digitos[1] !== '9') {
      return 'Un celular paraguayo empieza con 09 (formato 09XX XXXXXX).';
    }
  }
  return '';
};

/**
 * Error a mostrar al guardar, o '' si el número está completo y válido. Un
 * número vacío se considera válido: quién es obligatorio y quién no lo decide
 * cada formulario.
 */
export const validarNumero = (
  digitos: string,
  codigo: string,
  modo: ModoTelefono,
): string => {
  if (!digitos) return '';
  const tipeo = validarTipeoNumero(digitos, codigo, modo);
  if (tipeo) return tipeo;

  if (modo === 'celular' && esParaguay(codigo)) {
    if (digitos.length !== PY_LARGO) {
      return `El celular debe tener ${PY_LARGO} dígitos con el formato 09XX XXXXXX.`;
    }
    return '';
  }

  if (digitos.length < OTRO_PAIS_MIN) {
    return `El número debe tener al menos ${OTRO_PAIS_MIN} dígitos.`;
  }
  return '';
};

/** Error del código de país al guardar (sólo aplica si hay número cargado). */
export const validarCodigoPais = (codigo: string, digitos: string): string => {
  if (!digitos) return '';
  if (soloDigitos(codigo).length === 0) {
    return 'Ingresá el código de país (ejemplo: +595).';
  }
  return '';
};

/**
 * Valor que se persiste: "+595 0981 123456". Si no hay número, se guarda
 * vacío (el código de país solo no es un teléfono).
 */
export const unirTelefono = (codigo: string, digitos: string, modo: ModoTelefono): string => {
  if (!digitos) return '';
  return `${sanitizarCodigoPais(codigo)} ${formatearNumero(digitos, codigo, modo)}`;
};

/**
 * Separa un valor guardado en código de país y dígitos del número. Tolera lo
 * que ya está cargado en la base, que no tiene un formato único:
 * "+595 0981 123456", "+595981123456", "0981123456", "+595 981 123456".
 */
export const separarTelefono = (
  value: string | null | undefined,
  modo: ModoTelefono = 'celular',
): { codigo: string; numero: string } => {
  const texto = (value ?? '').trim();
  if (!texto) return { codigo: CODIGO_PAIS_DEFECTO, numero: '' };

  // Sin "+" no hay código de país guardado: es un número local viejo.
  if (!texto.startsWith('+')) {
    return {
      codigo: CODIGO_PAIS_DEFECTO,
      numero: normalizarLocalPy(soloDigitos(texto), CODIGO_PAIS_DEFECTO, modo),
    };
  }

  const resto = texto.slice(1);
  // Con separador el corte es explícito; sin él se asume el máximo de 3 dígitos.
  const corte = resto.search(/[\s-]/);
  const digitosCodigo =
    corte >= 0
      ? soloDigitos(resto.slice(0, corte)).slice(0, MAX_DIGITOS_CODIGO)
      : soloDigitos(resto).slice(0, MAX_DIGITOS_CODIGO);
  const digitosNumero =
    corte >= 0 ? soloDigitos(resto.slice(corte)) : soloDigitos(resto).slice(MAX_DIGITOS_CODIGO);

  const codigo = `+${digitosCodigo}`;
  return {
    codigo,
    numero: normalizarLocalPy(digitosNumero, codigo, modo).slice(0, maxDigitosNumero(codigo, modo)),
  };
};

/**
 * Los celulares paraguayos se escriben tanto "+595 981 123456" (sin el 0) como
 * "0981123456". El campo trabaja siempre con la forma local, así que se
 * devuelve el 0 inicial cuando el guardado venía sin él.
 */
const normalizarLocalPy = (digitos: string, codigo: string, modo: ModoTelefono): string => {
  if (modo !== 'celular' || !esParaguay(codigo)) return digitos;
  if (digitos.length === PY_LARGO - 1 && digitos.startsWith('9')) return `0${digitos}`;
  return digitos;
};
