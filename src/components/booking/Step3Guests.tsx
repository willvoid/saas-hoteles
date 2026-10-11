import React, { useState } from 'react';
import { User, ShieldAlert } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { validarDocumentoPorTipo, RUC_TIPO_DOC_VALUE } from '../../utils/diccionarioValidaciones';

type GuestErrors = { nombre_completo?: string; fk_tipo_documento?: string; documento?: string };

export default function Step3Guests() {
  const { catalogo, currentStep, setCurrentStep, bookingData, updateRoomGuests } = useBooking();
  // Local state to hold the form data for guests before saving to context
  const [localGuests, setLocalGuests] = useState<any[][]>(
    bookingData.detalles?.map(det =>
      det.huespedes && det.huespedes.length > 0
        ? det.huespedes
        : Array.from({ length: det.cantidad_adultos || 1 }, (_, i) => ({
            nombre_completo: '',
            documento: '',
            fk_tipo_documento: '',
            nacionalidad: 'Paraguaya',
            es_titular: i === 0
          }))
    ) || []
  );

  const catTipoDoc = catalogo.tipos_documento;
  const [guestErrors, setGuestErrors] = useState<GuestErrors[][]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const clearGuestError = (roomIndex: number, guestIndex: number, field: keyof GuestErrors) => {
    setGuestErrors(prev => {
      if (!prev[roomIndex]?.[guestIndex]?.[field]) return prev;
      const next = prev.map(room => room.map(g => ({ ...g })));
      delete next[roomIndex][guestIndex][field];
      return next;
    });
  };

  const handleGuestChange = (roomIndex: number, guestIndex: number, field: string, value: any) => {
    const newGuests = [...localGuests];
    newGuests[roomIndex][guestIndex] = {
      ...newGuests[roomIndex][guestIndex],
      [field]: value
    };
    setLocalGuests(newGuests);
    if (field === 'fk_tipo_documento' || field === 'nombre_completo' || (field === 'documento' && value.trim())) {
      clearGuestError(roomIndex, guestIndex, field as keyof GuestErrors);
    }
  };

  /** Corta el tipeo ante un valor inválido, igual que en Clientes. */
  const handleDocumentoChange = (roomIndex: number, guestIndex: number, rawValue: string) => {
    const tipoDoc = localGuests[roomIndex][guestIndex].fk_tipo_documento;
    const esCedula = tipoDoc === '1';
    if (esCedula ? /[^\d]/.test(rawValue) : !/^[A-Za-z0-9-]*$/.test(rawValue)) return;
    if (esCedula && rawValue.length > 0 && rawValue[0] === '0') return;
    if (rawValue.length > 15) return;
    handleGuestChange(roomIndex, guestIndex, 'documento', rawValue);
  };

  const addGuest = (roomIndex: number) => {
    const newGuests = [...localGuests];
    newGuests[roomIndex].push({
      nombre_completo: '',
      documento: '',
      fk_tipo_documento: '',
      nacionalidad: 'Paraguaya',
      es_titular: false
    });
    setLocalGuests(newGuests);
  };

  const removeGuest = (roomIndex: number, guestIndex: number) => {
    const newGuests = [...localGuests];
    newGuests[roomIndex].splice(guestIndex, 1);
    setLocalGuests(newGuests);
  };

  const handleNext = () => {
    const newErrors: GuestErrors[][] = localGuests.map(room =>
      room.map(guest => {
        const errs: GuestErrors = {};
        if (!guest.nombre_completo?.trim()) errs.nombre_completo = 'Obligatorio.';
        if (!guest.fk_tipo_documento) errs.fk_tipo_documento = 'Obligatorio.';
        if (!guest.documento?.trim()) {
          errs.documento = 'Obligatorio.';
        } else {
          const formatError = validarDocumentoPorTipo(guest.documento, guest.fk_tipo_documento);
          if (formatError) errs.documento = formatError;
        }
        return errs;
      })
    );

    const hasErrors = newErrors.some(room => room.some(g => Object.keys(g).length > 0));
    setGuestErrors(newErrors);

    if (hasErrors) {
      setFormError('Por favor completá los nombres y documentos de todos los huéspedes.');
      return;
    }

    setFormError(null);

    // Save to context
    localGuests.forEach((guests, index) => {
      updateRoomGuests(index, guests);
    });

    setCurrentStep(currentStep + 1);
  };

  return (
    <div className="booking-step animation-fade-in">
      <h2 className="step-title">Datos de los Huéspedes</h2>
      <p className="step-subtitle">Por favor ingresa los datos de las personas que ocuparán cada habitación.</p>

      {formError && (
        <div className="status-message status-error" style={{ marginBottom: '20px' }}>
          <ShieldAlert size={16} />
          <span>{formError}</span>
        </div>
      )}

      <div className="guests-forms-container">
        {localGuests.map((roomGuests, rIndex) => (
          <div key={rIndex} className="room-guest-group">
            <h3 className="room-guest-title">Habitación {rIndex + 1}</h3>

            <div className="guest-cards">
              {roomGuests.map((guest, gIndex) => {
                const errors = guestErrors[rIndex]?.[gIndex] || {};
                return (
                <div key={gIndex} className="guest-card">
                  <div className="guest-card-header">
                    <h4>Huésped {gIndex + 1} {guest.es_titular && <span className="titular-badge">Principal</span>}</h4>
                    {!guest.es_titular && (
                      <button className="btn-remove-guest" onClick={() => removeGuest(rIndex, gIndex)}>Eliminar</button>
                    )}
                  </div>

                  <div className="guest-form-grid">
                    <div className="input-box">
                      <label>Nombre Completo</label>
                      <input
                        type="text"
                        className={errors.nombre_completo ? 'input-error' : ''}
                        value={guest.nombre_completo}
                        onChange={(e) => handleGuestChange(rIndex, gIndex, 'nombre_completo', e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        required
                      />
                      {errors.nombre_completo && <span className="field-error">{errors.nombre_completo}</span>}
                    </div>

                    <div className="input-box">
                      <label>Tipo de Doc.</label>
                      <select
                        className={errors.fk_tipo_documento ? 'input-error' : ''}
                        value={guest.fk_tipo_documento}
                        onChange={(e) => handleGuestChange(rIndex, gIndex, 'fk_tipo_documento', e.target.value)}
                        required
                      >
                        <option value="" disabled hidden>Selecciona...</option>
                        <option value={RUC_TIPO_DOC_VALUE} style={{ color: 'black' }}>RUC</option>
                        {catTipoDoc.map(doc => (
                          <option key={doc.cod_tipodoc} value={doc.cod_tipodoc} style={{ color: 'black' }}>{doc.descripcion_tipodoc}</option>
                        ))}
                      </select>
                      {errors.fk_tipo_documento && <span className="field-error">{errors.fk_tipo_documento}</span>}
                    </div>

                    <div className="input-box">
                      <label>Documento de Identidad</label>
                      <input
                        type="text"
                        className={(errors.documento || validarDocumentoPorTipo(guest.documento, guest.fk_tipo_documento)) ? 'input-error' : ''}
                        value={guest.documento}
                        onChange={(e) => handleDocumentoChange(rIndex, gIndex, e.target.value)}
                        disabled={!guest.fk_tipo_documento}
                        placeholder={!guest.fk_tipo_documento ? 'Elegí primero el tipo de documento' : 'Nro. de Documento'}
                        required
                      />
                      {(errors.documento || validarDocumentoPorTipo(guest.documento, guest.fk_tipo_documento)) && (
                        <span className="field-error">
                          {errors.documento || validarDocumentoPorTipo(guest.documento, guest.fk_tipo_documento)}
                        </span>
                      )}
                    </div>

                    <div className="input-box">
                      <label>Nacionalidad</label>
                      <input
                        type="text"
                        value={guest.nacionalidad}
                        onChange={(e) => handleGuestChange(rIndex, gIndex, 'nacionalidad', e.target.value)}
                        placeholder="Nacionalidad"
                      />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            <button className="btn-add-guest" onClick={() => addGuest(rIndex)}>
              + Añadir otro huésped a esta habitación
            </button>
          </div>
        ))}
      </div>

      <div className="step-actions split">
        <button className="btn-secondary" onClick={() => setCurrentStep(currentStep - 1)}>
          Atrás
        </button>
        <button className="btn-primary" onClick={handleNext}>
          Siguiente paso
        </button>
      </div>
    </div>
  );
}
