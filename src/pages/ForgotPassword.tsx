import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPasswordReset } from '../services/authService';
import '../index.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: resetError } = await sendPasswordReset(
        email.trim(),
        `${window.location.origin}/reset-password`
      );
      if (resetError) throw resetError;

      // Generic confirmation to avoid revealing which emails are registered.
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo de recuperación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="login-container">
        <div className="login-header">
          <h2 className="login-title">Recuperar contraseña</h2>
          <p className="login-subtitle">Te enviaremos un enlace para restablecerla</p>
        </div>

        {sent ? (
          <div className="status-message status-success">
            Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisá tu bandeja de entrada.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
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

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <>
                  <div className="loader"></div>
                  <span>Enviando...</span>
                </>
              ) : (
                'Enviar enlace'
              )}
            </button>
          </form>
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
