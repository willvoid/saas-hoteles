import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  signInWithPassword,
  signOut,
  resendSignupConfirmation,
  getCurrentUser,
  resolveSession,
} from '../services/authService';
import type { SessionUser } from '../services/authService';
import type { TenantInfo } from '../services/tenantService';
import '../index.css';

interface LoginProps {
  setUser: (user: SessionUser) => void;
  setSuspendedTenant: (tenant: TenantInfo | null) => void;
  setHasSession: (value: boolean) => void;
}

export default function Login({ setUser, setSuspendedTenant, setHasSession }: LoginProps) {
  const location = useLocation();
  // Motivo del redirect (p. ej. la cuenta fue desactivada mientras navegaba).
  const mensajeRedirect = (location.state as { mensaje?: string } | null)?.mensaje ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(mensajeRedirect);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setUnconfirmedEmail(null);

    try {
      const emailNormalizado = email.trim().toLowerCase();
      const { error: signInError } = await signInWithPassword(emailNormalizado, password);

      if (signInError) {
        if (signInError.code === 'email_not_confirmed') {
          setUnconfirmedEmail(emailNormalizado);
          throw new Error('Tu correo aún no está verificado. Revisa tu bandeja de entrada.');
        }
        throw new Error('Credenciales incorrectas. Verifica tu correo y contraseña.');
      }

      // Session is now active; load the profile of the active hotel and enforce
      // estado. Every account lands on the hotel selector: it lists the hotels
      // (also when none is active yet) and enters the chosen one.
      setHasSession(true);
      const authUser = await getCurrentUser();
      const result = authUser ? await resolveSession(authUser.id) : { status: 'missing' as const };

      if (result.status === 'suspended') {
        setSuspendedTenant(result.tenant);
        navigate('/hoteles');
        return;
      }

      if (result.status === 'missing') {
        navigate('/hoteles');
        return;
      }

      if ((result.user.estado || 'Activo').trim().toLowerCase() === 'inactivo') {
        await signOut();
        setHasSession(false);
        throw new Error('Usuario inactivo. Contacte al administrador.');
      }

      setUser(result.user);
      navigate('/hoteles');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!unconfirmedEmail) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const { error: resendError } = await resendSignupConfirmation(unconfirmedEmail);
      if (resendError) throw resendError;
      setInfo('Te reenviamos el correo de verificación.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar el correo de verificación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18"></path>
              <path d="M9 8h1"></path>
              <path d="M9 12h1"></path>
              <path d="M9 16h1"></path>
              <path d="M14 8h1"></path>
              <path d="M14 12h1"></path>
              <path d="M14 16h1"></path>
              <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path>
            </svg>
          </div>
          <h2 className="login-title">Sistema de gestión hotelera</h2>
          <p className="login-subtitle">Ingresa a tu cuenta para continuar</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ej. admin@hotel.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="button" onClick={() => navigate('/recuperar-clave')} className="link-btn" style={{ marginBottom: '16px' }}>
            ¿Olvidaste tu contraseña?
          </button>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <>
                <div className="loader"></div>
                <span>Ingresando...</span>
              </>
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>

        {error && (
          <div className="status-message status-error">
            {error}
          </div>
        )}
        {info && (
          <div className="status-message status-success">
            {info}
          </div>
        )}
        {unconfirmedEmail && (
          <button type="button" onClick={handleResend} className="link-btn" style={{ marginTop: '12px' }} disabled={loading}>
            Reenviar correo de verificación
          </button>
        )}
      </div>
    </div>
  );
}
