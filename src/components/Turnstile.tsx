import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Minimal typing of the Cloudflare Turnstile global (explicit render only).
interface TurnstileRenderOptions {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<TurnstileApi> | null = null;

// Loads the Turnstile script once for the whole app.
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile unavailable'));
    };
    script.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    // Allow a later mount to retry the load.
    scriptPromise = null;
    throw err;
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  reset: () => void;
}

interface TurnstileProps {
  // Receives the single-use token, or null once it expired or failed.
  onToken: (token: string | null) => void;
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile({ onToken }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;

    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId.current = api.render(container, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) onTokenRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  if (!SITE_KEY) {
    return (
      <div className="status-message status-error" role="alert">
        Falta configurar VITE_TURNSTILE_SITE_KEY: la verificación de seguridad no está disponible y no se puede enviar el registro.
      </div>
    );
  }

  return <div ref={containerRef} className="turnstile-widget" />;
});

export default Turnstile;
