import { useCallback, useEffect, useRef, useState } from 'react';
import { registerTenant } from '../services/registrationService';
import type { RegisterTenantInput } from '../services/registrationService';
import { getRegistrationCatalogs, getUbicaciones } from '../services/catalogService';
import type { CatalogName, RegistrationCatalogs, UbicacionNivel } from '../services/catalogService';
import { resendSignupConfirmation } from '../services/authService';
import { slugify } from '../utils/hotel';
import { enfocarCampo } from '../utils/formFocus';
import {
  ACCOUNT_FIELDS,
  COMPANY_FIELDS,
  EMPTY_REGISTER_VALUES,
  HOTEL_FIELDS,
  validateAccountStep,
  validateCompanyStep,
  validateHotelStep,
} from '../utils/registerValidation';
import type { RegisterField, RegisterValues, StepErrors } from '../utils/registerValidation';

export const REGISTER_STEPS = ['Cuenta', 'Hotel', 'Empresa'] as const;
const LAST_STEP = REGISTER_STEPS.length - 1;

const STEP_VALIDATORS = [validateAccountStep, validateHotelStep, validateCompanyStep] as const;
const STEP_FIELDS = [ACCOUNT_FIELDS, HOTEL_FIELDS, COMPANY_FIELDS] as const;

// DOM id of a wizard field (labels, aria-describedby and focus use it).
export const registerFieldId = (field: RegisterField): string => `register-${field}`;

export interface GeoOptions {
  distritos: CatalogName[];
  ciudades: CatalogName[];
  barrios: CatalogName[];
}

const NO_GEO: GeoOptions = { distritos: [], ciudades: [], barrios: [] };

// Which value holds the parent id of each level, and which values it clears.
const GEO_LEVELS: Record<UbicacionNivel, { parent: RegisterField; clears: RegisterField[]; resets: UbicacionNivel[] }> = {
  distritos: { parent: 'departamento', clears: ['distrito', 'ciudad', 'fkBarrio'], resets: ['ciudades', 'barrios'] },
  ciudades: { parent: 'distrito', clears: ['ciudad', 'fkBarrio'], resets: ['barrios'] },
  barrios: { parent: 'ciudad', clears: ['fkBarrio'], resets: [] },
};

// Field that selects the children of each level.
const GEO_TRIGGER: Partial<Record<RegisterField, UbicacionNivel>> = {
  departamento: 'distritos',
  distrito: 'ciudades',
  ciudad: 'barrios',
};

const toOptional = (value: string): string | null => value.trim() || null;

function buildInput(v: RegisterValues, turnstileToken: string): RegisterTenantInput {
  return {
    email: v.email.trim().toLowerCase(),
    password: v.password,
    turnstileToken,
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

export type ResendStatus = 'idle' | 'sending' | 'sent' | 'error';

export function useRegisterWizard() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<RegisterValues>(EMPTY_REGISTER_VALUES);
  const [errors, setErrors] = useState<StepErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneEmail, setDoneEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle');

  // Once the user edits the identifier by hand it stops following the name.
  const slugEdited = useRef(false);

  const [catalogs, setCatalogs] = useState<RegistrationCatalogs | null>(null);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);

  const [geo, setGeo] = useState<GeoOptions>(NO_GEO);
  const [geoLoading, setGeoLoading] = useState<UbicacionNivel | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Newest request id per level: stale responses are dropped.
  const geoRequest = useRef(0);
  const lastGeo = useRef<{ nivel: UbicacionNivel; padre: number } | null>(null);

  const loadCatalogs = useCallback(() => {
    let active = true;
    setCatalogsLoading(true);
    setCatalogsError(null);
    getRegistrationCatalogs()
      .then((c) => {
        if (active) setCatalogs(c);
      })
      .catch((err: unknown) => {
        if (active) setCatalogsError(err instanceof Error ? err.message : 'No se pudieron cargar las opciones.');
      })
      .finally(() => {
        if (active) setCatalogsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => loadCatalogs(), [loadCatalogs]);

  const loadGeo = useCallback((nivel: UbicacionNivel, padre: number) => {
    const id = ++geoRequest.current;
    lastGeo.current = { nivel, padre };
    setGeoLoading(nivel);
    setGeoError(null);
    getUbicaciones(nivel, padre)
      .then((items) => {
        if (id === geoRequest.current) setGeo((prev) => ({ ...prev, [nivel]: items }));
      })
      .catch((err: unknown) => {
        if (id === geoRequest.current) {
          setGeoError(err instanceof Error ? err.message : 'No se pudieron cargar las ubicaciones.');
        }
      })
      .finally(() => {
        if (id === geoRequest.current) setGeoLoading(null);
      });
  }, []);

  const retryGeo = useCallback(() => {
    if (lastGeo.current) loadGeo(lastGeo.current.nivel, lastGeo.current.padre);
  }, [loadGeo]);

  const setValue = useCallback(
    (field: RegisterField, value: string) => {
      setSubmitError(null);

      if (field === 'slug') slugEdited.current = true;

      setValues((prev) => {
        const next: RegisterValues = { ...prev, [field]: field === 'slug' ? value.toLowerCase() : value };
        if (field === 'hotelNombre' && !slugEdited.current) next.slug = slugify(value);
        const level = GEO_TRIGGER[field];
        if (level) for (const c of GEO_LEVELS[level].clears) next[c] = '';
        return next;
      });

      // Drop the error of the edited field (and of the identifier it feeds).
      setErrors((prev) => {
        const feedsSlug = field === 'hotelNombre' && !slugEdited.current;
        if (!prev[field] && !(feedsSlug && prev.slug)) return prev;
        const rest = { ...prev };
        delete rest[field];
        if (feedsSlug) delete rest.slug;
        return rest;
      });

      const level = GEO_TRIGGER[field];
      if (level) {
        // Invalidate in-flight loads of this and deeper levels.
        geoRequest.current++;
        setGeo((prev) => {
          const cleared = { ...prev, [level]: [] as CatalogName[] };
          for (const deeper of GEO_LEVELS[level].resets) cleared[deeper] = [];
          return cleared;
        });
        setGeoError(null);
        setGeoLoading(null);
        if (/^\d+$/.test(value)) loadGeo(level, Number(value));
      }
    },
    [loadGeo],
  );

  // Validates a single field on blur without flagging the untouched ones.
  const blurField = useCallback(
    (field: RegisterField) => {
      const stepErrors = STEP_VALIDATORS[step](values);
      setErrors((prev) => {
        const next = { ...prev };
        if (stepErrors[field]) next[field] = stepErrors[field];
        else delete next[field];
        return next;
      });
    },
    [step, values],
  );

  const validateStep = useCallback(
    (index: number): boolean => {
      const stepErrors = STEP_VALIDATORS[index](values);
      setErrors(stepErrors);
      const first = STEP_FIELDS[index].find((f) => stepErrors[f]);
      if (first) enfocarCampo(registerFieldId(first));
      return !first;
    },
    [values],
  );

  const next = useCallback(() => {
    if (step >= LAST_STEP) return;
    if (validateStep(step)) {
      setErrors({});
      setStep(step + 1);
    }
  }, [step, validateStep]);

  const back = useCallback(() => {
    if (step === 0 || submitting) return;
    setErrors({});
    setSubmitError(null);
    setStep(step - 1);
  }, [step, submitting]);

  // Returns true when the account request was accepted. The caller resets the
  // Turnstile widget on false (tokens are single-use).
  const submit = useCallback(
    async (turnstileToken: string | null): Promise<boolean> => {
      if (submitting) return false;

      // Re-check every step: jump back to the first one that is invalid.
      for (let i = 0; i <= LAST_STEP; i++) {
        const stepErrors = STEP_VALIDATORS[i](values);
        if (STEP_FIELDS[i].some((f) => stepErrors[f])) {
          setStep(i);
          setErrors(stepErrors);
          const first = STEP_FIELDS[i].find((f) => stepErrors[f]);
          if (first) enfocarCampo(registerFieldId(first));
          return false;
        }
      }
      if (!turnstileToken) {
        setSubmitError('Completá la verificación de seguridad para continuar.');
        return false;
      }

      setSubmitting(true);
      setSubmitError(null);
      try {
        await registerTenant(buildInput(values, turnstileToken));
        setDoneEmail(values.email.trim().toLowerCase());
        setDone(true);
        return true;
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'No se pudo crear la cuenta. Intentá de nuevo.');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, values],
  );

  const resend = useCallback(async () => {
    if (!doneEmail || resendStatus === 'sending') return;
    setResendStatus('sending');
    try {
      const { error } = await resendSignupConfirmation(doneEmail);
      setResendStatus(error ? 'error' : 'sent');
    } catch {
      setResendStatus('error');
    }
  }, [doneEmail, resendStatus]);

  return {
    step,
    isLastStep: step === LAST_STEP,
    values,
    errors,
    submitting,
    submitError,
    done,
    doneEmail,
    resendStatus,
    catalogs,
    catalogsLoading,
    catalogsError,
    retryCatalogs: loadCatalogs,
    geo,
    geoLoading,
    geoError,
    retryGeo,
    setValue,
    blurField,
    next,
    back,
    submit,
    resend,
  };
}
