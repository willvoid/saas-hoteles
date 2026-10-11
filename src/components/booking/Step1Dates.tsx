import React, { useState } from 'react';
import { Calendar, Users, Baby } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';

export default function Step1Dates() {
  const { bookingData, updateSearch, currentStep, setCurrentStep } = useBooking();
  const [entrada, setEntrada] = useState(bookingData.fecha_entrada || '');
  const [salida, setSalida] = useState(bookingData.fecha_salida || '');
  // Defaulting to bookingData values or 1 adult if null
  const [adultos, setAdultos] = useState((bookingData as any).searchAdultos || 1);
  const [ninos, setNinos] = useState((bookingData as any).searchNinos || 0);

  const handleNext = () => {
    if (!entrada || !salida) return;
    if (salida <= entrada) {
      alert('La fecha de salida debe ser posterior a la de entrada');
      return;
    }
    const cartCleared = updateSearch(entrada, salida, adultos, ninos);
    if (cartCleared) {
      alert('Cambiaste las fechas, por lo que tu selección de habitaciones se reinició. Por favor, elegí de nuevo.');
    }
    setCurrentStep(currentStep + 1);
  };

  return (
    <div className="booking-step animation-fade-in">
      <h2 className="step-title">¿Cuándo quieres visitarnos?</h2>
      <p className="step-subtitle">Selecciona las fechas y cantidad de personas para ver disponibilidad.</p>

      <div className="dates-grid">
        <div className="input-box">
          <label><Calendar size={16} /> Fecha de Entrada</label>
          <input 
            type="date" 
            value={entrada} 
            onChange={(e) => setEntrada(e.target.value)} 
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
        <div className="input-box">
          <label><Calendar size={16} /> Fecha de Salida</label>
          <input 
            type="date" 
            value={salida} 
            onChange={(e) => setSalida(e.target.value)} 
            min={entrada || new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      <div className="dates-grid" style={{ marginTop: '20px' }}>
        <div className="input-box">
          <label><Users size={16} /> Adultos</label>
          <input 
            type="number" 
            min={1} 
            value={adultos} 
            onChange={(e) => setAdultos(Number(e.target.value))} 
          />
        </div>
        <div className="input-box">
          <label><Baby size={16} /> Niños</label>
          <input 
            type="number" 
            min={0} 
            value={ninos} 
            onChange={(e) => setNinos(Number(e.target.value))} 
          />
        </div>
      </div>

      <div className="step-actions">
        <button 
          className="btn-primary" 
          onClick={handleNext}
          disabled={!entrada || !salida}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
