import { useState, useEffect } from 'react';
import { ReservationService } from '../services/reservationService';
import AutocompleteClientes from '../components/AutocompleteClientes';
import { alojamientoService } from '../services/alojamientoService';
import { enfocarPrimerError } from '../utils/formFocus';
import { INITIAL_ESTADOS, esReservaCerrada, type ReservaEstado } from '../utils/reservaEstado';
import '../index.css';

/** Campos del formulario, para poder conservarlos al ir y volver de Clientes. */
export interface ReservaBorrador {
  fecha_entrada: string;
  fecha_salida: string;
  estado: string;
  fk_cliente: string;
  origen: string;
  observaciones: string;
}

interface ReservationFormProps {
  onCancel: () => void;
  onCreated: () => void;
  currentUser: any;
  reservationToEdit?: any;
  /**
   * Lleva al alta de un cliente nuevo. Recibe lo ya cargado en el formulario
   * para poder restaurarlo al volver. Si no se pasa (p.ej. al editar una
   * reserva desde el listado), el botón no se muestra.
   */
  onCrearCliente?: (borrador: ReservaBorrador) => void;
  /** Estado a restaurar al volver de Clientes (con o sin cliente nuevo). */
  borradorInicial?: ReservaBorrador | null;
  /** Avisa que ya se aplicó `borradorInicial`, para que no se reutilice. */
  onBorradorInicialConsumido?: () => void;
}

/** Observaciones admite texto largo: es el campo donde se cargan pedidos y detalles. */
const MAX_OBSERVACIONES = 500;
const EMPIEZA_CON_LETRA = /^[a-zA-ZáéíóúüÁÉÍÓÚÜñÑ]/;

/** Orden en pantalla, para llevar el foco al primer campo que falle. */
const ORDEN_CAMPOS = ['fk_cliente', 'fecha_entrada', 'fecha_salida', 'observaciones'] as const;

/** Normaliza a YYYY-MM-DD lo que venga de la base (fecha suelta o timestamp). */
const aISO = (fecha: string | null | undefined): string =>
  fecha ? new Date(fecha).toISOString().split('T')[0] : '';

/** Fecha de hoy en formato YYYY-MM-DD, en hora local (no UTC). */
const hoyISO = (): string => {
  const ahora = new Date();
  const offset = ahora.getTimezoneOffset() * 60000;
  return new Date(ahora.getTime() - offset).toISOString().split('T')[0];
};

/** Día siguiente a una fecha YYYY-MM-DD, para el piso de la fecha de salida. */
const diaSiguiente = (fecha: string): string => {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

export default function ReservationForm({
  onCancel,
  onCreated,
  currentUser,
  reservationToEdit,
  onCrearCliente,
  borradorInicial,
  onBorradorInicialConsumido,
}: ReservationFormProps) {
  const [formData, setFormData] = useState<ReservaBorrador>(borradorInicial ?? {
    fecha_entrada: '',
    fecha_salida: '',
    estado: 'Pendiente',
    fk_cliente: '',
    origen: 'Presencial',
    observaciones: ''
  });

  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const origins = ['Presencial', 'Web', 'Teléfono', 'Booking', 'Airbnb', 'Otro'];

  // Tras el Check-out la estancia está cerrada: el formulario queda de sólo
  // lectura. El listado ya no ofrece el botón de editar; esto cubre el caso de
  // llegar igual (link viejo, estado que cambió con el form abierto).
  const soloLectura = esReservaCerrada(reservationToEdit?.estado);

  // Fechas con las que se abrió el formulario: contra ellas se detecta si la
  // estadía se movió, para recalcular el alojamiento recién cuando cambia.
  const fechasOriginales = {
    entrada: aISO(reservationToEdit?.fecha_entrada),
    salida: aISO(reservationToEdit?.fecha_salida),
  };

  useEffect(() => {
    if (reservationToEdit) {
      setFormData({
        fecha_entrada: aISO(reservationToEdit.fecha_entrada),
        fecha_salida: aISO(reservationToEdit.fecha_salida),
        estado: reservationToEdit.estado || 'Pendiente',
        fk_cliente: reservationToEdit.fk_cliente?.toString() || '',
        origen: reservationToEdit.origen || 'Presencial',
        observaciones: reservationToEdit.observaciones || ''
      });
    }
  }, [reservationToEdit]);

  // El borrador ya se aplicó como estado inicial del useState; sólo resta
  // avisar para que Dashboard lo descarte y no se reutilice más adelante.
  useEffect(() => {
    if (borradorInicial) onBorradorInicialConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadClients = async () => {
      try {
        const clientList = await ReservationService.getClientsList();
        setClients(clientList);
      } catch (err: any) {
        console.error("Error al cargar clientes", err);
      }
    };
    loadClients();
  }, []);

  const clearError = (field: string) => {
    setFormErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  const checkRequired = (field: string, value: string) => {
    if (!value || !value.toString().trim()) {
      setFormErrors(prev => ({ ...prev, [field]: 'Este campo es obligatorio.' }));
    }
  };

  // Piso de la fecha de entrada: hoy. Al editar una reserva que ya arrancó se
  // respeta su fecha original, para no obligar a moverla sólo por abrir el form.
  const minFechaEntrada =
    reservationToEdit && formData.fecha_entrada && formData.fecha_entrada < hoyISO()
      ? formData.fecha_entrada
      : hoyISO();
  const minFechaSalida = formData.fecha_entrada
    ? diaSiguiente(formData.fecha_entrada)
    : diaSiguiente(minFechaEntrada);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Fechas: se rechaza la selección inválida en el momento, además del `min`
    // que ya deshabilita esos días en el calendario nativo.
    if (name === 'fecha_entrada') {
      if (value && value < minFechaEntrada) {
        setFormErrors(prev => ({
          ...prev,
          fecha_entrada: 'La fecha de entrada no puede ser anterior a hoy.',
        }));
        return;
      }
      clearError('fecha_entrada');
      // Si la salida quedó antes o igual que la nueva entrada, se limpia para
      // que el usuario la vuelva a elegir sobre un rango ya válido.
      setFormData(prev => ({
        ...prev,
        fecha_entrada: value,
        fecha_salida: prev.fecha_salida && value && prev.fecha_salida <= value ? '' : prev.fecha_salida,
      }));
      clearError('fecha_salida');
      return;
    }

    if (name === 'fecha_salida') {
      if (value && formData.fecha_entrada && value <= formData.fecha_entrada) {
        setFormErrors(prev => ({
          ...prev,
          fecha_salida: 'La fecha de salida debe ser posterior a la de entrada.',
        }));
        return;
      }
      if (value && !formData.fecha_entrada) {
        setFormErrors(prev => ({
          ...prev,
          fecha_salida: 'Elegí primero la fecha de entrada.',
        }));
        return;
      }
      clearError('fecha_salida');
      setFormData(prev => ({ ...prev, fecha_salida: value }));
      return;
    }

    if (name === 'observaciones') {
      if (value.length > MAX_OBSERVACIONES) {
        setFormErrors(prev => ({
          ...prev,
          observaciones: `Las observaciones permiten un máximo de ${MAX_OBSERVACIONES} caracteres.`,
        }));
        return;
      }
      if (value.length > 0 && !EMPIEZA_CON_LETRA.test(value)) {
        setFormErrors(prev => ({
          ...prev,
          observaciones: 'Las observaciones deben comenzar con una letra.',
        }));
        return;
      }
      if (/ {2}/.test(value)) {
        setFormErrors(prev => ({
          ...prev,
          observaciones: 'Las observaciones no pueden tener dos espacios seguidos.',
        }));
        return;
      }
      clearError('observaciones');
      setFormData(prev => ({ ...prev, observaciones: value }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
    if (value) clearError(name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (soloLectura) {
      setError('La reserva ya hizo Check-out: sólo se puede visualizar.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    const errors: Record<string, string> = {};
    if (!formData.fk_cliente) errors.fk_cliente = 'Obligatorio.';
    if (!formData.fecha_entrada) errors.fecha_entrada = 'Obligatorio.';
    if (!formData.fecha_salida) errors.fecha_salida = 'Obligatorio.';

    if (formData.fecha_entrada && formData.fecha_entrada < minFechaEntrada) {
      errors.fecha_entrada = "La fecha de entrada no puede ser anterior a hoy.";
    }

    if (formData.fecha_entrada && formData.fecha_salida && formData.fecha_salida <= formData.fecha_entrada) {
      errors.fecha_salida = "Debe ser posterior a la fecha de entrada.";
    }

    if (formData.observaciones.trim().length > MAX_OBSERVACIONES) {
      errors.observaciones = `Las observaciones permiten un máximo de ${MAX_OBSERVACIONES} caracteres.`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      enfocarPrimerError(errors, ORDEN_CAMPOS);
      setLoading(false);
      return;
    }
    setFormErrors({});

    try {
      if (reservationToEdit) {
        // El estado NO se edita aquí: se cambia desde el detalle de la reserva
        // a través de la máquina de estados (ReservationService.changeEstado).
        const updatePayload = {
          fecha_entrada: formData.fecha_entrada,
          fecha_salida: formData.fecha_salida,
          fk_cliente: parseInt(formData.fk_cliente),
          origen: formData.origen,
          observaciones: formData.observaciones
        };
        await ReservationService.updateReservation(reservationToEdit.id_reserva, updatePayload);

        // Mover las fechas cambia las noches de todas las habitaciones: hay
        // que recalcular subtotales, total estimado y el cargo de Alojamiento
        // del folio, si la estadía ya arrancó.
        const fechasCambiaron =
          fechasOriginales.entrada !== formData.fecha_entrada ||
          fechasOriginales.salida !== formData.fecha_salida;

        if (fechasCambiaron) {
          const fkUsuario = currentUser?.id_usuario || currentUser?.id || 0;
          try {
            const resultado = await alojamientoService.sincronizarPorCambioDeFechas({
              reservationId: reservationToEdit.id_reserva,
              fechaEntradaAnterior: fechasOriginales.entrada,
              fechaSalidaAnterior: fechasOriginales.salida,
              fechaEntradaNueva: formData.fecha_entrada,
              fechaSalidaNueva: formData.fecha_salida,
              fkUsuario,
            });
            await ReservationService.addHistorialEntry({
              fk_reserva: reservationToEdit.id_reserva,
              tipo_movimiento: 'CAMBIO_FECHAS',
              descripcion:
                `Fechas: ${fechasOriginales.entrada} → ${fechasOriginales.salida} ` +
                `reemplazadas por ${formData.fecha_entrada} → ${formData.fecha_salida} ` +
                `(${resultado.nochesAnteriores} a ${resultado.nochesNuevas} noches). ` +
                `Alojamiento recalculado en ${resultado.habitacionesAjustadas} habitación(es)` +
                `${resultado.folioAjustado ? ' y ajustado en el folio' : ''}.`,
              fk_usuario: fkUsuario,
            });
          } catch (e: any) {
            // La reserva ya se guardó; avisar sin perder el cambio de fechas.
            setError(
              `La reserva se actualizó, pero no se pudo recalcular el alojamiento: ${e.message}`,
            );
            setLoading(false);
            return;
          }
        }

        setSuccess("¡Reserva actualizada exitosamente!");
      } else {
        const payload = {
          ...formData,
          estado: formData.estado as ReservaEstado,
          fk_cliente: parseInt(formData.fk_cliente),
          fk_usuario: currentUser?.id_usuario || currentUser?.id
        };
        const created = await ReservationService.createReservation(payload);
        // Registrar en historial
        if (created?.id_reserva) {
          try {
            await ReservationService.addHistorialEntry({
              fk_reserva: created.id_reserva,
              tipo_movimiento: 'CREACION',
              descripcion: `Reserva creada. Entrada: ${formData.fecha_entrada}, Salida: ${formData.fecha_salida}. Estado: ${formData.estado}.`,
              fk_usuario: currentUser?.id_usuario || currentUser?.id || 0
            });
          } catch (e) { console.error('Error registrando historial:', e); }
        }
        setSuccess("¡Reserva registrada exitosamente!");
      }

      setTimeout(() => {
        onCreated();
      }, 1500);

    } catch (err: any) {
      setError(err.message || "Error al registrar la reserva.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
      <div className="login-header" style={{ marginBottom: "20px" }}>
        <h2 className="login-title">
          {soloLectura ? 'Reserva (sólo lectura)' : reservationToEdit ? 'Editar Reserva' : 'Nueva Reserva'}
        </h2>
        <p className="login-subtitle">
          {soloLectura
            ? 'La estancia ya hizo Check-out: los datos no se pueden modificar.'
            : reservationToEdit ? 'Modifica los detalles de la reserva.' : 'Ingresa los detalles de la nueva reserva.'}
        </p>
      </div>

      {soloLectura && (
        <div className="status-message status-error" style={{ marginBottom: '16px' }}>
          Esta reserva ya hizo Check-out. Sólo se puede visualizar.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Un fieldset deshabilitado apaga de una sola vez todos los controles
            de adentro, incluido el input del autocomplete de clientes. */}
        <fieldset
          disabled={soloLectura}
          style={{ border: 'none', padding: 0, margin: 0, minInlineSize: 'auto' }}
        >
        <div className="form-grid">

          <div className="input-group">
            <label htmlFor="fk_cliente">Cliente / Huésped *</label>
            <div id="fk_cliente" style={{ border: formErrors.fk_cliente ? '1px solid #ef4444' : 'none', borderRadius: '6px' }}>
              <AutocompleteClientes
                clients={clients}
                value={formData.fk_cliente}
                lockOnSelect
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, fk_cliente: value.toString() }));
                  if (value) clearError('fk_cliente');
                }}
              />
            </div>
            {formErrors.fk_cliente && <span className="field-error" style={{ marginTop: '4px' }}>{formErrors.fk_cliente}</span>}
            {onCrearCliente && (
              <button
                type="button"
                className="link-btn"
                style={{ marginTop: '6px', fontSize: '13px' }}
                onClick={() => onCrearCliente(formData)}
              >
                + Crear nuevo cliente
              </button>
            )}
          </div>

          <div className="input-group">
            <label htmlFor="fecha_entrada">Fecha de Entrada *</label>
            <input
              id="fecha_entrada"
              name="fecha_entrada"
              type="date"
              className={`input-field ${formErrors.fecha_entrada ? 'input-error' : ''}`}
              value={formData.fecha_entrada}
              onChange={handleChange}
              onBlur={(e) => checkRequired('fecha_entrada', e.target.value)}
              min={minFechaEntrada}
              required
              style={{ colorScheme: 'dark' }}
            />
            {formErrors.fecha_entrada && <span className="field-error">{formErrors.fecha_entrada}</span>}
          </div>

          <div className="input-group">
            <label htmlFor="fecha_salida">Fecha de Salida *</label>
            <input
              id="fecha_salida"
              name="fecha_salida"
              type="date"
              className={`input-field ${formErrors.fecha_salida ? 'input-error' : ''}`}
              value={formData.fecha_salida}
              onChange={handleChange}
              onBlur={(e) => {
                 checkRequired('fecha_salida', e.target.value);
                 if (e.target.value && formData.fecha_entrada && e.target.value <= formData.fecha_entrada) {
                    setFormErrors(prev => ({ ...prev, fecha_salida: 'Debe ser posterior a la fecha de entrada.' }));
                 }
              }}
              min={minFechaSalida}
              required
              style={{ colorScheme: 'dark' }}
            />
            {formErrors.fecha_salida && <span className="field-error">{formErrors.fecha_salida}</span>}
          </div>

          <div className="input-group">
            <label htmlFor="estado">Estado *</label>
            {reservationToEdit ? (
              <>
                <input
                  id="estado"
                  className="input-field"
                  value={formData.estado}
                  disabled
                  readOnly
                />
                <span
                  className="field-error"
                  style={{ color: 'var(--text-secondary)', marginTop: '4px' }}
                >
                  El estado se cambia desde el detalle de la reserva.
                </span>
              </>
            ) : (
              <select
                id="estado"
                name="estado"
                className="input-field"
                value={formData.estado}
                onChange={handleChange}
                required
              >
                {INITIAL_ESTADOS.map(st => (
                  <option key={st} value={st} style={{ color: "black" }}>{st}</option>
                ))}
              </select>
            )}
          </div>

          <div className="input-group">
            <label htmlFor="origen">Origen de la Reserva *</label>
            <select 
              id="origen" 
              name="origen" 
              className="input-field" 
              value={formData.origen} 
              onChange={handleChange} 
              required
            >
              {origins.map(orig => (
                <option key={orig} value={orig} style={{ color: "black" }}>{orig}</option>
              ))}
            </select>
          </div>

          <div className="input-group span-2">
            <label htmlFor="observaciones">Observaciones</label>
            <textarea
              id="observaciones"
              name="observaciones"
              className={`input-field ${formErrors.observaciones ? 'input-error' : ''}`}
              rows={3}
              value={formData.observaciones}
              onChange={handleChange}
              placeholder="Detalles adicionales, peticiones especiales, etc."
              style={{ resize: 'vertical', maxWidth: '100%', width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '4px' }}>
              {formErrors.observaciones
                ? <span className="field-error">{formErrors.observaciones}</span>
                : <span />}
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {formData.observaciones.length}/{MAX_OBSERVACIONES}
              </span>
            </div>
          </div>

        </div>
        </fieldset>

        {!soloLectura && (
          <div style={{ marginTop: '30px' }}>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <>
                  <div className="loader"></div>
                  <span>Guardando...</span>
                </>
              ) : (
                reservationToEdit ? 'Actualizar Reserva' : 'Crear Reserva'
              )}
            </button>
          </div>
        )}
      </form>

      {error && (
        <div className="status-message status-error">
          {error}
        </div>
      )}
      {success && (
        <div className="status-message status-success">
          {success}
        </div>
      )}

      <button onClick={onCancel} className="link-btn" style={{ marginTop: '20px' }}>
        Cancelar y volver
      </button>
    </div>
  );
}
