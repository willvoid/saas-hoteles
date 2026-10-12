import React, { useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import { useBookingSubmit } from '../../hooks/useBookingSubmit';
import { BookingCliente } from '../../types/booking';
import { PhoneField } from '../PhoneField';
import { RUC_TIPO_DOC_VALUE } from '../../utils/diccionarioValidaciones';
import { Loader2, CheckCircle } from 'lucide-react';
import { COLORS, tint } from '../../constants/colors';

export default function Step4Client() {
  const { slug, catalogo, currentStep, setCurrentStep, bookingData, setClientData, setObservaciones, calculateTotal } = useBooking();
  const { submit, loading, error, codigoReserva } = useBookingSubmit(slug);
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

  const handleFinalize = () =>
    submit({
      form: clientForm,
      observaciones: obs,
      bookingData,
      // Store the raw form (RUC stays as the 'RUC' string) once validation passes.
      onValidated: () => {
        setClientData(clientForm);
        setObservaciones(obs);
      },
    });

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
