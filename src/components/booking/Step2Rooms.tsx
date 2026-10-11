import React, { useState, useEffect } from 'react';
import { BedDouble, Check, Loader2, Info } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import { LandingService } from '../../services/landingService';
import { calculateNights, calculateRoomSubtotal } from '../../utils/pricing';
import { resolveTarifaForStay } from '../../utils/tarifas';

export default function Step2Rooms() {
  const { slug, catalogo, currentStep, setCurrentStep, addRoom, removeRoom, bookingData, calculateTotal } = useBooking();
  const tipos = catalogo.tipos_habitacion;
  const tarifas = catalogo.tarifas;
  // Ids de tipo_habitacion con al menos una unidad física libre en el rango
  // elegido. `null` mientras carga (no filtra todavía, para no parpadear a
  // "sin disponibilidad" antes de tener la respuesta).
  const [tiposDisponibles, setTiposDisponibles] = useState<Set<number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Bloquean las reservas en Pendiente/Confirmada/Check-in y los bloqueos de mantenimiento.
        const ocupadas = await LandingService.getHabitacionesOcupadas(
          slug,
          bookingData.fecha_entrada || '',
          bookingData.fecha_salida || ''
        );

        // Un tipo está disponible si ALGUNA de sus unidades físicas no está en el set de ocupadas.
        const disponibles = new Set<number>();
        for (const h of catalogo.habitaciones) {
          if (!ocupadas.has(h.id)) disponibles.add(h.fk_tipo_habitacion);
        }
        setTiposDisponibles(disponibles);
      } catch (err) {
        console.error("Error fetching room availability:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getTarifaVigente = (tipoId: number) =>
    resolveTarifaForStay(tarifas, tipoId, bookingData.fecha_entrada || '');

  const handleAddRoom = (tipo: any) => {
    const tarifa = getTarifaVigente(tipo.id);

    if (!tarifa) {
      alert("No hay una tarifa configurada para esta fecha.");
      return;
    }

    const precio = tarifa.precio_base;
    const tarifaId = tarifa.id;

    const nights = calculateNights(bookingData.fecha_entrada || '', bookingData.fecha_salida || '');

    addRoom({
      fk_tipo_habitacion: tipo.id,
      fk_tarifa: tarifaId,
      cantidad_adultos: (bookingData as any).searchAdultos || 1,
      cantidad_ninos: (bookingData as any).searchNinos || 0,
      precio_unitario: precio,
      subtotal: calculateRoomSubtotal(precio, nights),
      huespedes: []
    });
  };

  if (loading) {
    return (
      <div className="step-loading">
        <Loader2 className="animate-spin" size={32} />
        <p>Buscando disponibilidad...</p>
      </div>
    );
  }

  const selectedCount = bookingData.detalles?.length || 0;
  const tiposVisibles = tipos.filter(t => tiposDisponibles?.has(t.id));

  return (
    <div className="booking-step animation-fade-in step2-layout">
      {/* Sticky panel: title | selected rooms (compact) | buttons */}
      <div className="step2-sticky-panel">
        <div className="step2-header">
          <div className="step2-title-group">
            <h2 className="step-title">Elige tus habitaciones</h2>
            <p className="step-subtitle">Selecciona las habitaciones que deseas reservar.</p>
          </div>

          {selectedCount > 0 && (
            <div className="step2-selected-compact">
              <span className="step2-selected-label">Seleccionadas</span>
              <ul className="step2-selected-list">
                {bookingData.detalles?.map((det, index) => {
                  const tipoName = tipos.find(t => t.id === det.fk_tipo_habitacion)?.nombre;
                  return (
                    <li key={index} className="step2-selected-item">
                      <span>{index + 1}. {tipoName} — Gs. {(det.subtotal ?? 0).toLocaleString()}</span>
                      <button className="step2-remove-btn" onClick={() => removeRoom(index)}>×</button>
                    </li>
                  );
                })}
              </ul>
              <div className="step2-selected-total">
                <strong>Total: Gs. {calculateTotal().toLocaleString()}</strong>
              </div>
            </div>
          )}

          <div className="step2-actions-group">
            <button
              className="btn-secondary"
              style={{ padding: '8px 20px' }}
              onClick={() => setCurrentStep(currentStep - 1)}
            >
              Atrás
            </button>
            <div className="cart-summary">
              <strong>{selectedCount}</strong> hab.
              {selectedCount > 0 && (
                <span className="cart-summary-total"> · Gs. {calculateTotal().toLocaleString()}</span>
              )}
            </div>
            <button
              className="btn-primary"
              style={{ padding: '8px 20px' }}
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={selectedCount === 0}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable rooms grid */}
      <div className="step2-rooms-scroll">
        {tiposVisibles.length === 0 ? (
          <div className="room-sin-disponibilidad">
            <Info size={20} />
            <p>No hay habitaciones disponibles para las fechas elegidas. Probá con otro rango.</p>
          </div>
        ) : (
        <div className="rooms-grid">
          {tiposVisibles.map((tipo) => (
            <div key={tipo.id} className="room-card">
              {tipo.imagen_url ? (
                <div className="room-image" style={{ height: '200px', overflow: 'hidden' }}>
                  <img
                    src={tipo.imagen_url}
                    alt={tipo.nombre}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ) : (
                <div className="room-image-placeholder">
                  <BedDouble size={48} className="text-secondary" opacity={0.5} />
                </div>
              )}
              <div className="room-content">
                <h3>{tipo.nombre}</h3>
                <p className="room-desc">{tipo.descripcion || "Habitación cómoda y equipada."}</p>

                <div className="room-amenities">
                  <span><UsersIcon /> Hasta {tipo.capacidad} personas</span>
                </div>

                <div className="room-footer">
                  <div className="room-price">
                    <span className="price-currency">Gs.</span>
                    <span className="price-amount">{(getTarifaVigente(tipo.id)?.precio_base ?? 0).toLocaleString()}</span>
                    <span className="price-period">/noche</span>
                  </div>

                  <button
                    className="btn-add-room"
                    onClick={() => handleAddRoom(tipo)}
                  >
                    Añadir al carrito
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

function UsersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
  );
}
