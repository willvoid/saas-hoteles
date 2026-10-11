import { useEffect, useRef, useState } from 'react';
import {
  CODIGO_PAIS_DEFECTO,
  esParaguay,
  formatearNumero,
  ModoTelefono,
  sanitizarCodigoPais,
  separarTelefono,
  unirTelefono,
  validarTipeoNumero,
} from '../utils/telefono';

interface PhoneFieldProps {
  id: string;
  label: string;
  /** Valor guardado, en el formato "+595 0981 123456". */
  value: string;
  /** Recibe el valor ya unido y listo para persistir (o '' si no hay número). */
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Error del formulario (obligatoriedad, validación al guardar). */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /**
   * 'celular' aplica la máscara paraguaya 09XX XXXXXX cuando el código es
   * +595; 'fijo' sólo pide dígitos (líneas fijas y números institucionales).
   */
  modo?: ModoTelefono;
  /** Clase del contenedor: los formularios usan `input-group` y el booking web `input-box`. */
  groupClassName?: string;
}

/**
 * Teléfono partido en dos campos: código de país y número local.
 *
 * El código arranca en +595 y el "+" es fijo — no se puede borrar ni escribir a
 * su izquierda —, con hasta 3 dígitos a la derecha. Mientras el código sea
 * +595 y el modo sea 'celular', el número se carga como 09XX XXXXXX: sólo
 * dígitos y el espacio se inserta solo.
 */
export function PhoneField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  required,
  disabled,
  modo = 'celular',
  groupClassName = 'input-group',
}: PhoneFieldProps) {
  const inicial = separarTelefono(value, modo);
  const [codigo, setCodigo] = useState(inicial.codigo);
  const [numero, setNumero] = useState(inicial.numero);
  const [errorTipeo, setErrorTipeo] = useState('');
  // Último valor que emitimos hacia arriba: sirve para distinguir un cambio
  // propio (no hay que re-parsear) de uno externo (cargar una edición, resetear
  // el formulario), que sí debe reflejarse en los dos campos.
  const ultimoEmitido = useRef(value);

  useEffect(() => {
    if (value === ultimoEmitido.current) return;
    const partes = separarTelefono(value, modo);
    setCodigo(partes.codigo);
    setNumero(partes.numero);
    setErrorTipeo('');
    ultimoEmitido.current = value;
  }, [value, modo]);

  const emitir = (nuevoCodigo: string, nuevoNumero: string) => {
    const unido = unirTelefono(nuevoCodigo, nuevoNumero, modo);
    ultimoEmitido.current = unido;
    onChange(unido);
  };

  const handleCodigoChange = (raw: string) => {
    const nuevoCodigo = sanitizarCodigoPais(raw);
    setCodigo(nuevoCodigo);
    // Cambiar de país cambia las reglas del número: lo ya cargado puede dejar
    // de ser válido, así que se revalida en el momento.
    setErrorTipeo(validarTipeoNumero(numero, nuevoCodigo, modo));
    emitir(nuevoCodigo, numero);
  };

  const handleNumeroChange = (raw: string) => {
    const digitos = raw.replace(/\D/g, '');
    // El espacio del formato lo pone el campo, así que borrar sobre él no debe
    // trabarse: si se acortó el texto pero los dígitos son los mismos, el
    // backspace cayó sobre el espacio y lo que se quiso borrar es el dígito.
    const seAcorto = raw.length < formatearNumero(numero, codigo, modo).length;
    const propuesto = digitos === numero && seAcorto ? digitos.slice(0, -1) : digitos;
    const mensaje = validarTipeoNumero(propuesto, codigo, modo);
    if (mensaje) {
      setErrorTipeo(mensaje);
      return;
    }
    setErrorTipeo('');
    setNumero(propuesto);
    emitir(codigo, propuesto);
  };

  /** El cursor nunca puede quedar a la izquierda del "+". */
  const protegerMas = (input: HTMLInputElement) => {
    if (input.selectionStart === 0) {
      const fin = input.selectionEnd === 0 ? 1 : input.selectionEnd ?? 1;
      input.setSelectionRange(1, fin);
    }
  };

  const handleCodigoKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const inicio = input.selectionStart ?? 0;
    const fin = input.selectionEnd ?? 0;
    // Backspace pegado al "+" (sin selección) lo borraría: se ignora.
    if (e.key === 'Backspace' && inicio <= 1 && fin <= 1) e.preventDefault();
    // Ídem Delete parado sobre el "+". Con algo seleccionado sí se deja pasar:
    // borra los dígitos y el "+" lo repone `sanitizarCodigoPais`.
    if (e.key === 'Delete' && inicio === 0 && fin === 0) e.preventDefault();
    // El inicio del campo, a efectos del cursor, es la posición 1 (tras el "+").
    if (!e.shiftKey && (e.key === 'Home' || (e.key === 'ArrowLeft' && inicio <= 1))) {
      e.preventDefault();
      input.setSelectionRange(1, 1);
    }
  };

  const mensaje = error || errorTipeo;
  const placeholder =
    modo === 'celular' && esParaguay(codigo) ? '0981 123456' : 'Número sin el código de país';

  return (
    <div className={groupClassName}>
      <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <input
          id={`${id}-codigo`}
          name={`${id}-codigo`}
          type="text"
          inputMode="numeric"
          className={`input-field ${mensaje ? 'input-error' : ''}`}
          style={{ width: '84px', flex: '0 0 84px', textAlign: 'center' }}
          value={codigo}
          onChange={(e) => handleCodigoChange(e.target.value)}
          onKeyDown={handleCodigoKeyDown}
          onSelect={(e) => protegerMas(e.currentTarget)}
          onClick={(e) => protegerMas(e.currentTarget)}
          onBlur={onBlur}
          disabled={disabled}
          aria-label={`Código de país de ${label.toLowerCase()}`}
          title={`Código de país (por defecto ${CODIGO_PAIS_DEFECTO})`}
        />
        <input
          id={id}
          name={id}
          type="tel"
          inputMode="numeric"
          className={`input-field ${mensaje ? 'input-error' : ''}`}
          style={{ flex: 1, minWidth: 0 }}
          value={formatearNumero(numero, codigo, modo)}
          onChange={(e) => handleNumeroChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={placeholder}
        />
      </div>
      {mensaje && <span className="field-error">{mensaje}</span>}
    </div>
  );
}

export default PhoneField;
