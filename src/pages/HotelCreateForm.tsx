import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { EmpresaService } from '../services/empresaService';
import { EstablecimientoService } from '../services/establecimientoService';
import { UsuarioService } from '../services/usuarioService';
import { createHotel } from '../services/hotelService';
import type { SessionUser } from '../services/authService';
import { EMPTY_HOTEL_FORM, buildCreateHotelPayload, slugify, validateHotelForm } from '../utils/hotel';
import type { HotelForm } from '../utils/hotel';
import { enfocarCampo } from '../utils/formFocus';

interface HotelCreateFormProps {
  // Profile in the active hotel: prefills the administrator data of the new one.
  user: SessionUser | null;
  onCancel: () => void;
  // Runs after the hotel was created and the session already points at it.
  onCreated: () => Promise<void>;
}

interface Option {
  value: string | number;
  label: string;
}

interface Catalogs {
  contribuyentes: Option[];
  regimenes: Option[];
  barrios: Option[];
  tiposDoc: Option[];
}

const NO_CATALOGS: Catalogs = { contribuyentes: [], regimenes: [], barrios: [], tiposDoc: [] };

export default function HotelCreateForm({ user, onCancel, onCreated }: HotelCreateFormProps) {
  const [form, setForm] = useState<HotelForm>({
    ...EMPTY_HOTEL_FORM,
    adminNombre: user?.nombre ?? '',
    adminTipoDoc: user?.fk_tipo_doc ? String(user.fk_tipo_doc) : '',
    adminDocumento: user?.documento ?? '',
    adminTelefono: user?.telefono ?? '',
  });
  // Once the user edits the identifier by hand it stops following the name.
  const [slugEditado, setSlugEditado] = useState(false);
  const [catalogs, setCatalogs] = useState<Catalogs>(NO_CATALOGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    Promise.all([
      EmpresaService.getTiposContribuyente(),
      EmpresaService.getTiposRegimen(),
      EstablecimientoService.getBarrios(),
      UsuarioService.getTiposDocumento(),
    ])
      .then(([contribuyentes, regimenes, barrios, tiposDoc]) => {
        if (!activo) return;
        setCatalogs({
          contribuyentes: contribuyentes.map((c) => ({ value: c.id_tipo_contribuyente, label: c.descripcion })),
          regimenes: regimenes.map((r) => ({ value: r.id_regimen, label: r.descripcion })),
          barrios: barrios.map((b) => ({ value: b.cod_barrio, label: b.nombre_barrio })),
          tiposDoc: tiposDoc.map((d) => ({ value: d.cod_tipodoc, label: d.descripcion_tipodoc })),
        });
      })
      .catch((err: unknown) => {
        if (activo) setError(`No se pudieron cargar las opciones del formulario: ${err instanceof Error ? err.message : ''}`);
      });
    return () => {
      activo = false;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const campo = e.target.name as keyof HotelForm;
    const value = e.target.value;
    setError(null);

    setForm((prev) => {
      if (campo === 'nombre') {
        return { ...prev, nombre: value, slug: slugEditado ? prev.slug : slugify(value) };
      }
      if (campo === 'slug') return { ...prev, slug: value.toLowerCase() };
      return { ...prev, [campo]: value };
    });
    if (campo === 'slug') setSlugEditado(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const invalido = validateHotelForm(form);
    if (invalido) {
      setError(invalido.mensaje);
      enfocarCampo(invalido.campo);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createHotel(buildCreateHotelPayload(form));
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el hotel.');
      setSaving(false);
    }
  };

  const text = (campo: keyof HotelForm, label: string, placeholder?: string, span2 = false) => (
    <div className={`input-group${span2 ? ' span-2' : ''}`}>
      <label htmlFor={campo}>{label}</label>
      <input
        id={campo}
        name={campo}
        type="text"
        className="input-field"
        value={form[campo]}
        onChange={handleChange}
        placeholder={placeholder}
      />
    </div>
  );

  const select = (campo: keyof HotelForm, label: string, options: Option[]) => (
    <div className="input-group">
      <label htmlFor={campo}>{label}</label>
      <select
        id={campo}
        name={campo}
        className="input-field"
        value={form[campo]}
        onChange={handleChange}
        style={{ appearance: 'none' }}
      >
        <option value="">Seleccione...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={saving ? () => undefined : onCancel}
      title="Nuevo hotel"
      maxWidth={720}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="hotel-create-form" className="btn-primary-sm" disabled={saving}>
            {saving ? 'Creando...' : 'Crear hotel'}
          </button>
        </div>
      }
    >
      {error && <div className="status-message status-error" style={{ marginBottom: '20px' }}>{error}</div>}

      <form id="hotel-create-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          {text('nombre', 'Nombre del hotel *', 'Ej. Hotel San Martín', true)}
          {text('slug', 'Identificador *', 'hotel-san-martin', true)}

          {text('razonSocial', 'Razón social *', 'Ej. Hotelería San Martín S.A.', true)}
          {text('nombreFantasia', 'Nombre de fantasía', 'Ej. Hotel San Martín')}
          {text('ruc', 'RUC *', 'Ej. 80012345-6')}
          {select('fkContribuyente', 'Tipo de contribuyente *', catalogs.contribuyentes)}
          {select('fkRegimen', 'Régimen tributario *', catalogs.regimenes)}

          {text('direccion', 'Dirección *', 'Calle y número', true)}
          {select('fkBarrio', 'Barrio *', catalogs.barrios)}

          {text('adminNombre', 'Tu nombre *')}
          {select('adminTipoDoc', 'Tipo de documento *', catalogs.tiposDoc)}
          {text('adminDocumento', 'Tu documento *')}
          {text('adminTelefono', 'Tu teléfono')}
        </div>
      </form>
    </Modal>
  );
}
