import { useState } from 'react';
import { LandingService } from '../services/landingService';
import { buildBookingPayload, validateClientForm, type BuildBookingPayloadInput } from '../utils/bookingPayload';

export interface BookingSubmitInput extends BuildBookingPayloadInput {
  /** Runs synchronously after validation passes and before loading starts. */
  onValidated?: () => void;
}

export interface UseBookingSubmit {
  submit: (input: BookingSubmitInput) => Promise<void>;
  loading: boolean;
  error: string | null;
  codigoReserva: string | null;
}

export function useBookingSubmit(slug: string): UseBookingSubmit {
  const [loading, setLoading] = useState(false);
  const [codigoReserva, setCodigoReserva] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (input: BookingSubmitInput) => {
    const validationError = validateClientForm(input.form);
    if (validationError) {
      setError(validationError);
      return;
    }

    input.onValidated?.();
    setLoading(true);
    setError(null);

    const payload = buildBookingPayload(input);

    try {
      const result = await LandingService.submitReserva(slug, payload);
      setCodigoReserva(result.codigo_reserva ?? '');
    } catch (err: any) {
      console.error('Error al procesar reserva', err);
      // Surface the DB error message when available.
      const errorMsg = err.message || 'Ocurrió un error al procesar tu reserva. Intenta nuevamente.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return { submit, loading, error, codigoReserva };
}
