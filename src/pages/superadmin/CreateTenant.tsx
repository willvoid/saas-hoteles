import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerFieldId, useRegisterWizard } from '../../hooks/useRegisterWizard';
import { useCreateTenant } from '../../hooks/useTenantsAdmin';
import type { CreateTenantInput } from '../../services/superadminService';
import { enfocarCampo } from '../../utils/formFocus';
import {
  ACCOUNT_FIELDS,
  COMPANY_FIELDS,
  HOTEL_FIELDS,
  validateAccountStep,
  validateCompanyStep,
  validateHotelStep,
} from '../../utils/registerValidation';
import type { RegisterField, RegisterValues, StepErrors } from '../../utils/registerValidation';
import '../../index.css';
import '../Register.css';

interface Option {
  id: number;
  label: string;
}

const ALL_FIELDS: readonly RegisterField[] = [...ACCOUNT_FIELDS, ...HOTEL_FIELDS, ...COMPANY_FIELDS];

// Same rules as the public sign-up wizard, applied to the whole form at once.
const validateAll = (v: RegisterValues): StepErrors => ({
  ...validateAccountStep(v),
  ...validateHotelStep(v),
  ...validateCompanyStep(v),
});

const toOptional = (value: string): string | null => value.trim() || null;

function buildInput(v: RegisterValues): CreateTenantInput {
  return {
    email: v.email.trim().toLowerCase(),
    password: v.password,
    hotel: { nombre: v.hotelNombre.trim(), slug: v.slug.trim().toLowerCase() },
    admin: {
      nombre: v.nombre.trim(),
      documento: v.documento.trim(),
      fk_tipo_doc: Number(v.tipoDoc),
      telefono: toOptional(v.telefono),
    },
    empresa: {
      ruc: v.ruc.trim(),
      razon_social: v.razonSocial.trim(),
      nombre_fantasia: toOptional(v.nombreFantasia),
      fk_contribuyente: Number(v.fkContribuyente),
      fk_regimen: Number(v.fkRegimen),
    },
    establecimiento: {
      direccion: v.direccion.trim(),
      fk_barrio: Number(v.fkBarrio),
      denominacion: null,
      numero_casa: null,
      complemento_direccion_1: null,
      complemento_direccion_2: null,
      telefono: null,
      email: null,
    },
  };
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

export default function CreateTenant() {
  const navigate = useNavigate();
  const wizard = useRegisterWizard();
  const { values, setValue, catalogs, geo } = wizard;
  const { submitting, error: submitError, create } = useCreateTenant();

  const [errors, setErrors] = useState<StepErrors>({});
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const change = (field: RegisterField, value: string) => {
    setValue(field, value);
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const rest = { ...prev };
      delete rest[field];
      return rest;
    });
  };

  const blur = (field: RegisterField) => {
    const message = validateAll(values)[field];
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const found = validateAll(values);
    setErrors(found);
    const first = ALL_FIELDS.find((f) => found[f]);
    if (first) {
      enfocarCampo(registerFieldId(first));
      return;
    }
    const result = await create(buildInput(values));
    if (result) setCreatedEmail(values.email.trim().toLowerCase());
  };

  const text = (
    field: RegisterField,
    label: string,
    opts: { type?: string; required?: boolean; hint?: ReactNode; span2?: boolean; placeholder?: string; autoComplete?: string } = {},
  ) => (
    <FieldShell field={field} label={label} required={opts.required} error={errors[field]} hint={opts.hint} span2={opts.span2}>
      {(aria) => (
        <input
          {...aria}
          name={field}
          type={opts.type ?? 'text'}
          className={`input-field${errors[field] ? ' input-error' : ''}`}
          value={values[field]}
          onChange={(e) => change(field, e.target.value)}
          onBlur={() => blur(field)}
          placeholder={opts.placeholder}
          autoComplete={opts.autoComplete ?? 'off'}
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
          onChange={(e) => change(field, e.target.value)}
          onBlur={() => blur(field)}
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

  if (createdEmail) {
    return (
      <div className="auth-page-wrapper register-page">
        <div className="login-container register-card">
          <div className="login-header">
            <h1 className="login-title">Hotel creado</h1>
          </div>
          <div className="status-message status-success" role="status">
            El hotel quedó creado y la cuenta <strong>{createdEmail}</strong> ya puede iniciar sesión.
          </div>
          <button type="button" className="login-btn" onClick={() => navigate('/superadmin')}>
            Volver al listado
          </button>
        </div>
      </div>
    );
  }

  const toOptions = (items: { id: number; descripcion: string }[] | undefined): Option[] =>
    (items ?? []).map((i) => ({ id: i.id, label: i.descripcion }));
  const toNames = (items: { id: number; nombre: string }[]): Option[] =>
    items.map((i) => ({ id: i.id, label: i.nombre }));
  const catalogBusy = wizard.catalogsLoading && !catalogs;
  const geoBusy = (level: 'distritos' | 'ciudades' | 'barrios') => wizard.geoLoading === level;

  return (
    <div className="auth-page-wrapper register-page">
      <div className="login-container register-card">
        <div className="login-header register-header">
          <Link to="/superadmin" className="register-back-home">
            &larr; Volver al listado
          </Link>
          <h1 className="login-title">Nuevo hotel</h1>
          <p className="login-subtitle">
            Crea la cuenta del administrador y el hotel con sus datos fiscales.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate aria-label="Crear hotel">
          {wizard.catalogsError && (
            <div className="status-message status-error" role="alert">
              {wizard.catalogsError}{' '}
              <button type="button" className="register-inline-btn" onClick={wizard.retryCatalogs}>
                Reintentar
              </button>
            </div>
          )}
          {wizard.geoError && (
            <div className="status-message status-error" role="alert">
              {wizard.geoError}{' '}
              <button type="button" className="register-inline-btn" onClick={wizard.retryGeo}>
                Reintentar
              </button>
            </div>
          )}

          <h2 className="register-step-title">Cuenta del administrador</h2>
          <div className="form-grid">
            {text('email', 'Correo electrónico', { type: 'email', span2: true, autoComplete: 'off' })}
            <FieldShell
              field="password"
              label="Contraseña inicial"
              error={errors.password}
              span2
              hint="Entre 8 y 72 caracteres, con al menos una letra y un número."
            >
              {(aria) => (
                <div className="register-password">
                  <input
                    {...aria}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    className={`input-field${errors.password ? ' input-error' : ''}`}
                    value={values.password}
                    onChange={(e) => change('password', e.target.value)}
                    onBlur={() => blur('password')}
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
            {text('nombre', 'Nombre del administrador', { span2: true })}
            {select('tipoDoc', 'Tipo de documento', toOptions(catalogs?.tipos_documento), { loading: catalogBusy })}
            {text('documento', 'Documento')}
            {text('telefono', 'Teléfono', { type: 'tel', required: false, span2: true })}
          </div>

          <h2 className="register-step-title">Hotel</h2>
          <div className="form-grid">
            {text('hotelNombre', 'Nombre del hotel', { span2: true })}
            {text('slug', 'Identificador del hotel', {
              span2: true,
              placeholder: 'hotel-san-martin',
              hint: (
                <>
                  Quedará en <strong>/h/{values.slug.trim() || 'identificador'}</strong>. Solo a-z, 0-9 y guion.
                </>
              ),
            })}
          </div>

          <h2 className="register-step-title">Empresa y dirección</h2>
          <div className="form-grid">
            {text('razonSocial', 'Razón social', { span2: true })}
            {text('nombreFantasia', 'Nombre de fantasía', { required: false, span2: true })}
            {text('ruc', 'RUC', { placeholder: 'Ej. 80012345-6' })}
            {select('fkContribuyente', 'Tipo de contribuyente', toOptions(catalogs?.contribuyentes), { loading: catalogBusy })}
            {select('fkRegimen', 'Régimen tributario', toOptions(catalogs?.regimenes), { loading: catalogBusy, span2: true })}
            {text('direccion', 'Dirección', { span2: true, placeholder: 'Calle y número' })}
            <FieldShell field="departamento" label="Departamento" error={errors.departamento}>
              {(aria) => (
                <select
                  {...aria}
                  name="departamento"
                  className="input-field register-select"
                  value={values.departamento}
                  onChange={(e) => change('departamento', e.target.value)}
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

          <div aria-live="polite">
            {submitError && (
              <div className="status-message status-error" role="alert">
                {submitError}
              </div>
            )}
          </div>

          <div className="register-actions">
            <button type="button" className="btn-ghost" onClick={() => navigate('/superadmin')} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="login-btn register-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <div className="loader" />
                  <span>Creando hotel...</span>
                </>
              ) : (
                'Crear hotel'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
