// Reads the Spanish `{ error }` message an Edge Function returns on a non-2xx.
//
// supabase.functions.invoke() drops the response body on those statuses and
// reports a generic English "Edge Function returned a non-2xx status code"; the
// real message travels in `error.context` (the raw Response).
export async function readFunctionError(
  error: unknown,
  fallback = 'No se pudo completar la operación. Intentá de nuevo.',
): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body: unknown = await context.clone().json();
      const message = (body as { error?: unknown } | null)?.error;
      if (typeof message === 'string' && message.trim()) return message;
    } catch {
      // Body was not JSON (gateway error, timeout): use the fallback.
    }
  }
  return fallback;
}
