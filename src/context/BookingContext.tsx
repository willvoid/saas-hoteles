import React, { createContext, useContext, useState, ReactNode } from 'react';
import { BookingPayload, BookingDetalle, BookingCliente, LandingCatalogo } from '../types/booking';

interface BookingContextState {
  slug: string;
  catalogo: LandingCatalogo;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  bookingData: Partial<BookingPayload>;
  updateSearch: (entrada: string, salida: string, adultos: number, ninos: number) => boolean;
  addRoom: (detalle: BookingDetalle) => void;
  removeRoom: (index: number) => void;
  updateRoomGuests: (roomIndex: number, huespedes: any[]) => void;
  setClientData: (client: BookingCliente) => void;
  setObservaciones: (obs: string) => void;
  calculateTotal: () => number;
}

const BookingContext = createContext<BookingContextState | undefined>(undefined);

export function BookingProvider({ slug, catalogo, children }: { slug: string; catalogo: LandingCatalogo; children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [bookingData, setBookingData] = useState<Partial<BookingPayload> & { searchAdultos?: number, searchNinos?: number }>({
    origen: 'WEB',
    observaciones: '',
    detalles: [],
  });

  /** Updates the search dates/guests. Returns true if the cart was cleared because the dates changed. */
  const updateSearch = (entrada: string, salida: string, adultos: number, ninos: number): boolean => {
    let cartCleared = false;
    setBookingData((prev) => {
      const fechasCambiaron = prev.fecha_entrada !== undefined &&
        (prev.fecha_entrada !== entrada || prev.fecha_salida !== salida);
      cartCleared = fechasCambiaron && (prev.detalles || []).length > 0;
      return {
        ...prev,
        fecha_entrada: entrada,
        fecha_salida: salida,
        searchAdultos: adultos,
        searchNinos: ninos,
        detalles: fechasCambiaron ? [] : prev.detalles,
      };
    });
    return cartCleared;
  };

  const addRoom = (detalle: BookingDetalle) => {
    setBookingData((prev) => ({
      ...prev,
      detalles: [...(prev.detalles || []), detalle],
    }));
  };

  const removeRoom = (index: number) => {
    setBookingData((prev) => {
      const newDetalles = [...(prev.detalles || [])];
      newDetalles.splice(index, 1);
      return { ...prev, detalles: newDetalles };
    });
  };

  const updateRoomGuests = (roomIndex: number, huespedes: any[]) => {
    setBookingData((prev) => {
      const newDetalles = [...(prev.detalles || [])];
      if (newDetalles[roomIndex]) {
        newDetalles[roomIndex].huespedes = huespedes;
      }
      return { ...prev, detalles: newDetalles };
    });
  };

  const setClientData = (client: BookingCliente) => {
    setBookingData((prev) => ({
      ...prev,
      cliente: client,
    }));
  };

  const setObservaciones = (obs: string) => {
    setBookingData((prev) => ({
      ...prev,
      observaciones: obs,
    }));
  };

  const calculateTotal = () => {
    return (bookingData.detalles || []).reduce((acc, curr) => acc + (curr.subtotal || 0), 0);
  };

  return (
    <BookingContext.Provider
      value={{
        slug,
        catalogo,
        currentStep,
        setCurrentStep,
        bookingData,
        updateSearch,
        addRoom,
        removeRoom,
        updateRoomGuests,
        setClientData,
        setObservaciones,
        calculateTotal,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
}
