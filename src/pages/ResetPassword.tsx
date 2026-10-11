import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentSession, onAuthStateChange, updatePassword, signOut } from '../services/authService';
import '../index.css';

// Recovery-link landing page. Supabase (detectSessionInUrl) turns the link into
// a temporary session and fires PASSWORD_RECOVERY; that session authorizes the
// password change below.
export default function ResetPassword() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    getCurrentSession().then((session) => {
      if (session) setReady(true);
    });

    const { data: sub } = onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });

    // If no recovery session materializes, the link is invalid or expired.
    const timeout = setTimeout(() => {
      setReady((current) => (current === null ? false : current));
    }, 3000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const validate = (): string | null => {
    if (/\s/.test(password)) return 'La contraseña no puede contener espacios.';
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      return 'La contraseña debe incluir al menos una letra y un número.';
    }
    if (password !== confirm) return 'Las contraseñas no coinciden.';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await updatePassword(password);
      if (updateError) throw updateError;

      // Force a clean re-login with the new password.
      await signOut();
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="login-container">
        <div className="login-header">
          <h2 className="login-title">Nueva contraseña</h2>
          <p className="login-subtitle">Elegí una contraseña para tu cuenta</p>
        </div>

        {ready === false && (
          <div className="status-message status-error">
            El enlace es inválido o expiró. Volvé a solicitar uno desde "¿Olvidaste tu contraseña?".
          </div>
        )}

        {done ? (
          <div className="status-message status-success">
            ¡Contraseña actualizada! Te llevamos al inicio de sesión...
          </div>
        ) : (
          ready !== false && (
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label htmlFor="password">Nueva contraseña</label>
                <input
                  id="password"
                  type="password"
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres, con letra y número"
                  required
                  autoComplete="new-password"
                  disabled={ready === null}
                />
              </div>

              <div className="input-group">
                <label htmlFor="confirm">Confirmar contraseña</label>
                <input
                  id="confirm"
                  type="password"
                  className="input-field"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repetí la contraseña"
                  required
                  autoComplete="new-password"
                  disabled={ready === null}
                />
              </div>

              <button type="submit" className="login-btn" disabled={loading || ready === null}>
                {loading ? (
                  <>
                    <div className="loader"></div>
                    <span>Guardando...</span>
                  </>
                ) : ready === null ? (
                  'Verificando enlace...'
                ) : (
                  'Actualizar contraseña'
                )}
              </button>
            </form>
          )
        )}

        {error && (
          <div className="status-message status-error">
            {error}
          </div>
        )}

        <button type="button" onClick={() => navigate('/login')} className="link-btn" style={{ marginTop: '24px' }}>
          Volver al inicio de sesión
        </button>
      </div>
    </div>
  );
}
