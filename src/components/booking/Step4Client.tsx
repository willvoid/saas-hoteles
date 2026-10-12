import React, { useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import { LandingService } from '../../services/landingService';
import { BookingCliente, BookingPayload } from '../../types/booking';
import { PhoneField } from '../PhoneField';
import { separarTelefono, validarCodigoPais, validarNumero } from '../../utils/telefono';
import { validarDocumentoPorTipo, validarEmail, RUC_TIPO_DOC_VALUE } from '../../utils/diccionarioValidaciones';
import { Loader2, CheckCircle } from 'lucide-react';
import { COLORS, tint } from '../../constants/colors';

export default function Step4Client() {
  const { slug, catalogo, currentStep, setCurrentStep, bookingData, setClientData, setObservaciones, calculateTotal } = useBooking();
  const [loading, setLoading] = useState(false);
  const [codigoReserva, setCodigoReserva] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const catTipoDoc = catalogo.tipos_documento;

  const [clientForm, setClientForm] = useState<BookingCliente>(
    bookingData.cliente || {
      razon_social: '',
      nombre_fantasia: '',
      documento: '',
      telefono: '',
      celular: '',
      direccion: '',
      email: '',
      es_proveedor_del_estado: false,
      fk_tipo_documento: '' as any // Select vacío: obliga a elegir, igual que en Clientes.
    }
  );

  const [obs, setObs] = useState(bookingData.observaciones || '');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    setClientForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  /** Corta el tipeo ante un valor inválido, igual que en Clientes/Huéspedes. */
  const handleDocumentoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const tipoDoc = String(clientForm.fk_tipo_documento ?? '');
    const esCedula = tipoDoc === '1';
    if (esCedula ? /[^\d]/.test(rawValue) : !/^[A-Za-z0-9-]*$/.test(rawValue)) return;
    if (esCedula && rawValue.length > 0 && rawValue[0] === '0') return;
    if (rawValue.length > 15) return;
    setClientForm(prev => ({ ...prev, documento: rawValue }));
  };

  const handleFinalize = async () => {
    const tipoDoc = String(clientForm.fk_tipo_documento ?? '');

    // Basic validation — el correo quedó opcional, el resto sigue obligatorio.
    if (!clientForm.razon_social || !tipoDoc || !clientForm.documento || !clientForm.telefono) {
      setError("Por favor completa los campos obligatorios (*).");
      return;
    }

    const documentoError = validarDocumentoPorTipo(clientForm.documento, tipoDoc);
    if (documentoError) {
      setError(documentoError);
      return;
    }

    if (clientForm.email.trim()) {
      const emailError = validarEmail(clientForm.email.trim());
      if (emailError) {
        setError(emailError);
        return;
      }
    }

    const fijo = separarTelefono(clientForm.telefono, 'fijo');
    const telefonoError =
      validarCodigoPais(fijo.codigo, fijo.numero) || validarNumero(fijo.numero, fijo.codigo, 'fijo');
    if (telefonoError) {
      setError(`Teléfono: ${telefonoError}`);
      return;
    }

    const movil = separarTelefono(clientForm.celular, 'celular');
    const celularError =
      validarCodigoPais(movil.codigo, movil.numero) || validarNumero(movil.numero, movil.codigo, 'celular');
    if (celularError) {
      setError(`Celular: ${celularError}`);
      return;
    }

    setClientData(clientForm);
    setObservaciones(obs);
    setLoading(true);
    setError(null);

    // RUC no es un fk_tipo_documento real de la tabla de referencia (mismo
    // criterio que Clientes/Huéspedes): se manda null, y el RPC
    // fn_registrar_reserva_landing lo castea a bigint tal cual llega. Mandar
    // el literal 'RUC' rompería ese cast en el backend.
    const clienteParaEnviar: BookingCliente = {
      ...clientForm,
      fk_tipo_documento: (tipoDoc === RUC_TIPO_DOC_VALUE ? null : Number(tipoDoc)) as any,
    };

    // Mismo saneo para cada huésped cargado en el paso anterior (Step3Guests
    // ofrece el mismo select con RUC).
    const detallesParaEnviar = (bookingData.detalles || []).map(det => ({
      ...det,
      huespedes: (det.huespedes || []).map(h => ({
        ...h,
        fk_tipo_documento: (String(h.fk_tipo_documento) === RUC_TIPO_DOC_VALUE
          ? null
          : Number(h.fk_tipo_documento)) as any,
      })),
    }));

    const payload: BookingPayload = {
      fecha_entrada: bookingData.fecha_entrada as string,
      fecha_salida: bookingData.fecha_salida as string,
      origen: "WEB",
      observaciones: obs,
      cliente: clienteParaEnviar,
      detalles: detallesParaEnviar
    };

    try {
      const result = await LandingService.submitReserva(slug, payload);
      setCodigoReserva(result.codigo_reserva ?? '');
    } catch (err: any) {
      console.error("Error al procesar reserva", err);
      // Extraemos el mensaje de error de la BD si está disponible
      const errorMsg = err.message || "Ocurrió un error al procesar tu reserva. Intenta nuevamente.";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (codigoReserva !== null) {
    return (
      <div className="booking-step animation-fade-in success-state">
        <div className="success-icon">
          <CheckCircle size={40} />
        </div>
        <h2 className="success-title">¡Reserva Solicitada con Éxito!</h2>
        <p className="success-message">
          Hemos recibido tu solicitud de reserva. Tu código es <b>{codigoReserva}</b>. Nos pondremos en contacto contigo pronto al correo <b>{clientForm.email}</b> o al teléfono <b>{clientForm.telefono}</b> para confirmar los detalles finales y la disponibilidad.
        </p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className="booking-step animation-fade-in">
      <h2 className="step-title">Datos del Titular / Facturación</h2>
      <p className="step-subtitle">Ingresa los datos para la facturación y contacto principal de la reserva.</p>

      <div className="client-form-grid">
        <div className="input-box">
          <label>Razón Social / Nombre y Apellido *</label>
          <input 
            type="text" 
            name="razon_social"
            value={clientForm.razon_social}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="input-box">
          <label>Tipo de Doc. *</label>
          <select
            name="fk_tipo_documento"
            value={String(clientForm.fk_tipo_documento ?? '')}
            onChange={handleChange}
            required
          >
            <option value="" disabled hidden>Selecciona...</option>
            <option value={RUC_TIPO_DOC_VALUE} style={{ color: 'black' }}>RUC</option>
            {catTipoDoc.map(doc => (
              <option key={doc.cod_tipodoc} value={doc.cod_tipodoc} style={{ color: 'black' }}>{doc.descripcion_tipodoc}</option>
            ))}
          </select>
        </div>

        <div className="input-box">
          <label>Documento / RUC *</label>
          <input
            type="text"
            name="documento"
            value={clientForm.documento}
            onChange={handleDocumentoChange}
            disabled={!clientForm.fk_tipo_documento}
            placeholder={!clientForm.fk_tipo_documento ? 'Elegí primero el tipo de documento' : undefined}
            required
            // El backend usa este campo como ÚNICA clave para decidir si la
            // reserva es de un cliente existente (fn_registrar_reserva_landing
            // busca por documento exacto). A diferencia de email/teléfono, acá
            // el autocompletado del navegador no es sólo una molestia de UX:
            // si sugiere o completa el documento de OTRA persona que usó este
            // mismo navegador antes, la reserva queda vinculada en silencio al
            // cliente equivocado, sin ningún error visible.
            autoComplete="off"
          />
        </div>

        <div className="input-box">
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={clientForm.email}
            onChange={handleChange}
          />
        </div>

        <PhoneField
          id="telefono"
          label="Teléfono"
          modo="fijo"
          required
          groupClassName="input-box"
          value={clientForm.telefono}
          onChange={(v) => setClientForm(prev => ({ ...prev, telefono: v }))}
        />

        <PhoneField
          id="celular"
          label="Celular"
          groupClassName="input-box"
          value={clientForm.celular || ''}
          onChange={(v) => setClientForm(prev => ({ ...prev, celular: v }))}
        />

        <div className="input-box">
          <label>Dirección</label>
          <input 
            type="text" 
            name="direccion"
            value={clientForm.direccion || ''}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="input-box full-width" style={{ marginTop: '20px' }}>
        <label>Observaciones o peticiones especiales</label>
        <textarea 
          rows={3}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ej. Pasajeros solicitan cama matrimonial, check-in tardío, etc."
          style={{ width: '100%', padding: '12px', borderRadius: '8px', background: tint('black', 0.2), color: 'white', border: `1px solid ${COLORS.glassBorder}` }}
        />
      </div>

      <div className="input-box full-width" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Total a pagar por alojamiento</span>
        <strong style={{ fontSize: '1.2em' }}>Gs. {calculateTotal().toLocaleString()}</strong>
      </div>

      {error && <div className="field-error" style={{ marginTop: '15px' }}>{error}</div>}

      <div className="step-actions split">
        <button className="btn-secondary" onClick={() => setCurrentStep(currentStep - 1)} disabled={loading}>
          Atrás
        </button>
        <button className="btn-primary" onClick={handleFinalize} disabled={loading}>
          {loading ? (
            <><Loader2 size={18} className="animate-spin" style={{marginRight: '8px', display: 'inline'}} /> Procesando...</>
          ) : (
            'Finalizar Reserva'
          )}
        </button>
      </div>
    </div>
  );
}
