import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Turnstile from '../components/Turnstile';
import type { TurnstileHandle } from '../components/Turnstile';
import { REGISTER_STEPS, registerFieldId, useRegisterWizard } from '../hooks/useRegisterWizard';
import { passwordStrength } from '../utils/registerValidation';
import type { RegisterField } from '../utils/registerValidation';
import '../index.css';
import './Register.css';

interface RegisterProps {
  hasSession: boolean;
}

interface Option {
  id: number;
  label: string;
}

interface FieldShellProps {
  field: RegisterField;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  span2?: boolean;
  children: (aria: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode;
}

// Label + control + hint + inline error, wired with aria-describedby.
function FieldShell({ field, label, required = true, error, hint, span2, children }: FieldShellProps) {
  const id = registerFieldId(field);
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ');
  return (
    <div className={`input-group register-field${span2 ? ' span-2' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : <span className="register-optional"> (opcional)</span>}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy || undefined })}
      {hint && (
        <p id={`${id}-hint`} className="register-hint">
          {hint}
        </p>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

export default function Register({ hasSession }: RegisterProps) {
  const navigate = useNavigate();
  const wizard = useRegisterWizard();
  const { step, values, errors, setValue, blurField, catalogs, geo } = wizard;

  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the step title when the step changes (not on first paint).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, wizard.done]);

  const text = (
    field: RegisterField,
    label: string,
    opts: {
      type?: string;
      autoComplete?: string;
      placeholder?: string;
      required?: boolean;
      hint?: ReactNode;
      span2?: boolean;
      inputMode?: 'numeric' | 'tel' | 'email' | 'text';
      maxLength?: number;
    } = {},
  ) => (
    <FieldShell
      field={field}
      label={label}
      required={opts.required}
      error={errors[field]}
      hint={opts.hint}
      span2={opts.span2}
    >
      {(aria) => (
        <input
          {...aria}
          name={field}
          type={opts.type ?? 'text'}
          className={`input-field${errors[field] ? ' input-error' : ''}`}
          value={values[field]}
          onChange={(e) => setValue(field, e.target.value)}
          onBlur={() => blurField(field)}
          autoComplete={opts.autoComplete}
          placeholder={opts.placeholder}
          inputMode={opts.inputMode}
          maxLength={opts.maxLength}
        />
      )}
    </FieldShell>
  );

  const select = (
    field: RegisterField,
    label: string,
    options: Option[],
    opts: { disabled?: boolean; loading?: boolean; span2?: boolean } = {},
  ) => (
    <FieldShell field={field} label={label} error={errors[field]} span2={opts.span2}>
      {(aria) => (
        <select
          {...aria}
          name={field}
          className={`input-field register-select${errors[field] ? ' input-error' : ''}`}
          value={values[field]}
          onChange={(e) => setValue(field, e.target.value)}
          onBlur={() => blurField(field)}
          disabled={opts.disabled || opts.loading}
        >
          <option value="">{opts.loading ? 'Cargando...' : 'Seleccione...'}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );

  const header = (
    <div className="login-header register-header">
      <Link to="/" className="register-back-home">
        &larr; Volver al inicio
      </Link>
      <h1 className="login-title">Creá tu cuenta</h1>
      <p className="login-subtitle">30 días de prueba gratis, sin tarjeta.</p>
    </div>
  );

  if (hasSession) {
    return (
      <div className="auth-page-wrapper register-page">
        <div className="login-container register-card">
          {header}
          <div className="status-message status-success" role="status">
            Ya iniciaste sesión. Para crear otro hotel entrá a tu lista de hoteles.
          </div>
          <Link to="/hoteles" className="login-btn register-link-btn">
            Ir a mis hoteles
          </Link>
        </div>
      </div>
    );
  }

  if (wizard.done) {
    return (
      <div className="auth-page-wrapper register-page">
        <div className="login-container register-card">
          <div className="login-header">
            <h1 className="login-title" ref={headingRef} tabIndex={-1}>
              ¡Casi listo!
            </h1>
          </div>
          <div className="status-message status-success register-done" role="status">
            <p>
              Te enviamos un correo a <strong>{wizard.doneEmail}</strong> para confirmar tu cuenta. Si los datos son
              correctos, lo vas a recibir en unos minutos.
            </p>
            <p>Después de confirmar, iniciá sesión y entrá a tu hotel.</p>
          </div>
          <p className="register-hint register-center">¿No lo ves? Revisá la carpeta de spam o correo no deseado.</p>
          <button type="button" className="login-btn" onClick={() => navigate('/login')}>
            Ir a iniciar sesión
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={wizard.resend}
            disabled={wizard.resendStatus === 'sending'}
          >
            {wizard.resendStatus === 'sending' ? 'Reenviando...' : 'Reenviar correo'}
          </button>
          <div aria-live="polite">
            {wizard.resendStatus === 'sent' && (
              <div className="status-message status-success">Si la cuenta existe, te reenviamos el correo.</div>
            )}
            {wizard.resendStatus === 'error' && (
              <div className="status-message status-error">No se pudo reenviar el correo. Intentá de nuevo en un rato.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!wizard.isLastStep) {
      wizard.next();
      return;
    }
    const ok = await wizard.submit(token);
    if (!ok) {
      // Tokens are single-use: always ask for a fresh one after a failed try.
      turnstileRef.current?.reset();
    }
  };

  const handleBack = () => {
    setToken(null);
    wizard.back();
  };

  const strength = passwordStrength(values.password);
  const catalogsReady = !!catalogs;
  const title = ['Tu cuenta', 'Tu hotel', 'Datos de la empresa y dirección'][step];
  const toOptions = (items: { id: number; descripcion: string }[] | undefined): Option[] =>
    (items ?? []).map((i) => ({ id: i.id, label: i.descripcion }));
  const toNames = (items: { id: number; nombre: string }[]): Option[] =>
    items.map((i) => ({ id: i.id, label: i.nombre }));
  const catalogBusy = wizard.catalogsLoading && !catalogsReady;
  const geoBusy = (level: 'distritos' | 'ciudades' | 'barrios') => wizard.geoLoading === level;

  const fieldsForStep = (): ReactNode => {
    if (step === 0) {
      return (
        <div className="form-grid">
          {text('email', 'Correo electrónico', {
            type: 'email',
            autoComplete: 'email',
            placeholder: 'ej. admin@hotel.com',
            span2: true,
          })}
          <FieldShell
            field="password"
            label="Contraseña"
            error={errors.password}
            span2
            hint={
              <>
                Entre 8 y 72 caracteres, con al menos una letra y un número.
                {strength.level > 0 && (
                  <span className={`register-strength register-strength-${strength.level}`}>
                    <span className="register-strength-bar" aria-hidden="true" />
                    Seguridad: {strength.label}
                  </span>
                )}
              </>
            }
          >
            {(aria) => (
              <div className="register-password">
                <input
                  {...aria}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`input-field${errors.password ? ' input-error' : ''}`}
                  value={values.password}
                  onChange={(e) => setValue('password', e.target.value)}
                  onBlur={() => blurField('password')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="register-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            )}
          </FieldShell>
          {text('nombre', 'Tu nombre', { autoComplete: 'name', span2: true })}
          {select('tipoDoc', 'Tipo de documento', toOptions(catalogs?.tipos_documento), { loading: catalogBusy })}
          {text('documento', 'Tu documento', { autoComplete: 'off', inputMode: 'text' })}
          {text('telefono', 'Tu teléfono', {
            type: 'tel',
            autoComplete: 'tel',
            required: false,
            inputMode: 'tel',
            span2: true,
          })}
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="form-grid">
          {text('hotelNombre', 'Nombre del hotel', {
            autoComplete: 'organization',
            placeholder: 'Ej. Hotel San Martín',
            span2: true,
          })}
          {text('slug', 'Identificador del hotel', {
            autoComplete: 'off',
            placeholder: 'hotel-san-martin',
            span2: true,
            hint: (
              <>
                Tu hotel va a estar en <strong>/h/{values.slug.trim() || 'identificador'}</strong>. Solo a-z, 0-9 y guion.
              </>
            ),
          })}
        </div>
      );
    }

    return (
      <div className="form-grid">
        {text('razonSocial', 'Razón social', { autoComplete: 'organization', span2: true })}
        {text('nombreFantasia', 'Nombre de fantasía', { required: false, autoComplete: 'off', span2: true })}
        {text('ruc', 'RUC', { autoComplete: 'off', placeholder: 'Ej. 80012345-6' })}
        {select('fkContribuyente', 'Tipo de contribuyente', toOptions(catalogs?.contribuyentes), { loading: catalogBusy })}
        {select('fkRegimen', 'Régimen tributario', toOptions(catalogs?.regimenes), { loading: catalogBusy, span2: true })}
        {text('direccion', 'Dirección', { autoComplete: 'street-address', placeholder: 'Calle y número', span2: true })}
        <FieldShell field="departamento" label="Departamento" error={errors.departamento}>
          {(aria) => (
            <select
              {...aria}
              name="departamento"
              className="input-field register-select"
              value={values.departamento}
              onChange={(e) => setValue('departamento', e.target.value)}
              disabled={catalogBusy}
            >
              <option value="">{catalogBusy ? 'Cargando...' : 'Seleccione...'}</option>
              {toNames(catalogs?.departamentos ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </FieldShell>
        {select('distrito', 'Distrito', toNames(geo.distritos), {
          disabled: !values.departamento,
          loading: geoBusy('distritos'),
        })}
        {select('ciudad', 'Ciudad', toNames(geo.ciudades), {
          disabled: !values.distrito,
          loading: geoBusy('ciudades'),
        })}
        {select('fkBarrio', 'Barrio', toNames(geo.barrios), {
          disabled: !values.ciudad,
          loading: geoBusy('barrios'),
        })}
      </div>
    );
  };

  return (
    <div className="auth-page-wrapper register-page">
      <div className="login-container register-card">
        {header}

        <ol className="register-stepper" aria-label="Progreso del registro">
          {REGISTER_STEPS.map((name, i) => (
            <li
              key={name}
              className={`register-step${i === step ? ' is-current' : ''}${i < step ? ' is-done' : ''}`}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="register-step-dot" aria-hidden="true">
                {i < step ? '✓' : i + 1}
              </span>
              <span className="register-step-name">{name}</span>
              <span className="sr-only-register">{` (paso ${i + 1} de ${REGISTER_STEPS.length})`}</span>
            </li>
          ))}
        </ol>

        <form key={step} onSubmit={handleSubmit} noValidate aria-labelledby="register-step-title">
          <h2 id="register-step-title" className="register-step-title" ref={headingRef} tabIndex={-1}>
            {title}
          </h2>

          {wizard.catalogsError && (
            <div className="status-message status-error" role="alert">
              {wizard.catalogsError}{' '}
              <button type="button" className="register-inline-btn" onClick={wizard.retryCatalogs}>
                Reintentar
              </button>
            </div>
          )}
          {step === 2 && wizard.geoError && (
            <div className="status-message status-error" role="alert">
              {wizard.geoError}{' '}
              <button type="button" className="register-inline-btn" onClick={wizard.retryGeo}>
                Reintentar
              </button>
            </div>
          )}

          {fieldsForStep()}

          {wizard.isLastStep && (
            <div className="register-turnstile">
              <Turnstile ref={turnstileRef} onToken={setToken} />
            </div>
          )}

          {wizard.submitError && (
            <div className="status-message status-error" role="alert">
              {wizard.submitError}
            </div>
          )}

          <div className="register-actions">
            {step > 0 && (
              <button type="button" className="btn-ghost" onClick={handleBack} disabled={wizard.submitting}>
                Atrás
              </button>
            )}
            <button
              type="submit"
              className="login-btn register-primary"
              disabled={wizard.submitting || (wizard.isLastStep && !token)}
            >
              {wizard.submitting ? (
                <>
                  <div className="loader" />
                  <span>Creando cuenta...</span>
                </>
              ) : wizard.isLastStep ? (
                'Crear cuenta'
              ) : (
                'Siguiente'
              )}
            </button>
          </div>
        </form>

        <p className="register-footer">
          ¿Ya tenés cuenta? <Link to="/login">Iniciá sesión</Link>
        </p>
      </div>
    </div>
  );
}
