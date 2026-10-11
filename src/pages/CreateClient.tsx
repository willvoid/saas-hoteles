import React, { useState, useEffect } from 'react';
import { ClientService } from '../services/clientService';
import { verificionCiPy, validarEmail, validarRuc, validarPasaporte, RUC_TIPO_DOC_VALUE } from '../utils/diccionarioValidaciones';
import { separarTelefono, validarCodigoPais, validarNumero } from '../utils/telefono';
import { enfocarCampo, enfocarPrimerError } from '../utils/formFocus';
import { PhoneField } from '../components/PhoneField';
import { ModuleLayout } from '../components/ModuleLayout';
import { ClienteRecurrenteBadge } from '../components/ClienteRecurrenteBadge';
import { isClienteRecurrente, getReservationCount } from '../utils/clienteRecurrencia';
import '../index.css';

interface CreateClientProps {
  onCancel: () => void;
  /** Al crear (no editar), recibe la fila recién insertada. */
  onCreated?: (createdClient?: any) => void;
  clientToEdit?: any | null;
}

// Campos de texto libre: mismo criterio que Gestión de habitaciones y
// establecimientos (arranca con letra, tope de caracteres, sin dobles espacios).
const CAMPOS_TEXTO: Record<string, { label: string; max: number }> = {
  razon_social: { label: 'La razón social', max: 60 },
  nombre_fantasia: { label: 'El nombre de fantasía', max: 50 },
  direccion: { label: 'La dirección', max: 60 },
};

/** Letras (con acentos/ñ), números, espacios y la puntuación típica de nombres y direcciones. */
const TEXTO_PERMITIDO = /^[a-zA-ZáéíóúüÁÉÍÓÚÜñÑ0-9\s.,'ºª#&/-]*$/;
const EMPIEZA_CON_LETRA = /^[a-zA-ZáéíóúüÁÉÍÓÚÜñÑ]/;

/**
 * Orden en que los campos aparecen en el formulario. Al fallar el guardado se
 * lleva la vista al primero con error: el formulario es largo y el cartel de
 * arriba queda fuera de pantalla.
 */
const ORDEN_CAMPOS = [
  'razon_social',
  'fk_tipo_documento',
  'documento',
  'email',
  'telefono',
  'celular',
] as const;

/**
 * RUC no es un tipo de documento de la tabla de referencia: al elegirlo,
 * fk_tipo_documento se manda null. La validación de formato se deriva del
 * valor elegido en el select en vez de un id numérico.
 */
const validarDocumentoCliente = (value: string, tipoDoc: string): string =>
  tipoDoc === RUC_TIPO_DOC_VALUE ? validarRuc(value) : verificionCiPy(value, tipoDoc) || validarPasaporte(value, tipoDoc);

export default function CreateClient({ onCancel, onCreated, clientToEdit }: CreateClientProps) {
  const isEditing = !!clientToEdit;

  // Main form data
  const [formData, setFormData] = useState({
    razon_social: clientToEdit?.razon_social || '',
    nombre_fantasia: clientToEdit?.nombre_fantasia || '',
    documento: clientToEdit?.documento || '',
    telefono: clientToEdit?.telefono || '',
    celular: clientToEdit?.celular || '',
    direccion: clientToEdit?.direccion || '',
    nro_casa: clientToEdit?.nro_casa?.toString() || '0',
    email: clientToEdit?.email || '',
    es_proveedor_del_estado: clientToEdit?.es_proveedor_del_estado || false,
    estado_cliente: clientToEdit?.estado_cliente || 'Activo',
    fk_tipo_operacion: clientToEdit?.fk_tipo_operacion?.toString() || '2',
    fk_tipo_documento: clientToEdit?.fk_tipo_documento?.toString() || '',
    fk_tipo_contribuyente: clientToEdit?.fk_tipo_contribuyente?.toString() || '',
    fk_barrios: clientToEdit?.fk_barrios?.toString() || '',
  });

  // Location temporary state for cascading dropdowns
  const [locState, setLocState] = useState({
    pais: '',
    departamento: '',
    distrito: '',
    ciudad: '',
  });

  // Reference Catalogs
  const [catTipoDoc, setCatTipoDoc] = useState<any[]>([]);
  const [catTipoCont, setCatTipoCont] = useState<any[]>([]);
  const [catTipoOp, setCatTipoOp] = useState<any[]>([]);

  // Location Catalogs
  const [catPaises, setCatPaises] = useState<any[]>([]);
  const [catDepartamentos, setCatDepartamentos] = useState<any[]>([]);
  const [catDistritos, setCatDistritos] = useState<any[]>([]);
  const [catCiudades, setCatCiudades] = useState<any[]>([]);
  const [catBarrios, setCatBarrios] = useState<any[]>([]);

  // UI State
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Initial Fetch Setup
  useEffect(() => {
    const fetchInitials = async () => {
      try {
        const [docs, conts, ops, paises] = await Promise.all([
          ClientService.getTipoDocumento(),
          ClientService.getTipoContribuyente(),
          ClientService.getTipoOperacion(),
          ClientService.getPaises(),
        ]);
        setCatTipoDoc(docs);
        setCatTipoCont(conts);
        setCatTipoOp(ops);
        setCatPaises(paises);
      } catch (err: any) {
        console.error("Error fetching initials:", err);
        setError("Error al conectar con la base de datos para obtener referenciales.");
      }
    };
    fetchInitials();
  }, []);

  // Cascading Effects
  useEffect(() => {
    if (locState.pais) {
      ClientService.getDepartamentos(Number(locState.pais)).then(setCatDepartamentos);
      // Reset child selections
      setCatDistritos([]); setCatCiudades([]); setCatBarrios([]);
      setLocState(p => ({ ...p, departamento: '', distrito: '', ciudad: '' }));
      if (!isEditing || locState.pais !== '') {
        setFormData(p => ({ ...p, fk_barrios: '' }));
      }
    }
  }, [locState.pais]);

  useEffect(() => {
    if (locState.departamento) {
      ClientService.getDistritos(Number(locState.departamento)).then(setCatDistritos);
      setCatCiudades([]); setCatBarrios([]);
      setLocState(p => ({ ...p, distrito: '', ciudad: '' }));
      setFormData(p => ({ ...p, fk_barrios: '' }));
    }
  }, [locState.departamento]);

  useEffect(() => {
    if (locState.distrito) {
      ClientService.getCiudades(Number(locState.distrito)).then(setCatCiudades);
      setCatBarrios([]);
      setLocState(p => ({ ...p, ciudad: '' }));
      setFormData(p => ({ ...p, fk_barrios: '' }));
    }
  }, [locState.distrito]);

  useEffect(() => {
    if (locState.ciudad) {
      ClientService.getBarrios(Number(locState.ciudad)).then(setCatBarrios);
      setFormData(p => ({ ...p, fk_barrios: '' }));
    }
  }, [locState.ciudad]);

  // Debounced duplicate check
  useEffect(() => {
    const timer = setTimeout(async () => {
      const docTrimmed = formData.documento.trim();
      if (docTrimmed.length > 3) { // Minimal length to check
        try {
          const existing = await ClientService.checkExistingDocument(docTrimmed);
          if (existing && (!isEditing || existing.id_cliente !== clientToEdit.id_cliente)) {
            setFormErrors(prev => ({ ...prev, documento: `El documento ${docTrimmed} ya está registrado.` }));
          } else {
            setFormErrors(prev => {
              const newErrors = { ...prev };
              if (newErrors.documento && newErrors.documento.includes('ya está registrado')) {
                delete newErrors.documento;
              }
              return newErrors;
            });
          }
        } catch (err) {
          console.error("Error checking document:", err);
        }
      } else {
        setFormErrors(prev => {
          const newErrors = { ...prev };
          if (newErrors.documento && newErrors.documento.includes('ya está registrado')) {
            delete newErrors.documento;
          }
          return newErrors;
        });
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [formData.documento, isEditing, clientToEdit]);

  // Handlers
  const commit = (name: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear required error as soon as user types
    if (
      (name === 'razon_social' || name === 'fk_tipo_documento' || name === 'documento') &&
      typeof value === 'string' && value.trim()
    ) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        if (newErrors[name] === 'Este campo es obligatorio.') {
          delete newErrors[name];
        }
        return newErrors;
      });
    }

    // Contacto: basta con uno de los tres; al cargar cualquiera, el error de
    // "falta contacto" deja de aplicar (se re-evalúa recién al guardar).
    if (
      (name === 'email' || name === 'telefono' || name === 'celular') &&
      typeof value === 'string' && value.trim()
    ) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.contacto;
        return newErrors;
      });
    }
  };

  /**
   * Corta el tipeo ante cualquier valor inválido y muestra el error al momento,
   * igual que en Gestión de habitaciones. El valor sólo se guarda si pasa todas
   * las reglas del campo.
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      commit(name, (e.target as HTMLInputElement).checked);
      return;
    }

    setError(null);

    if (CAMPOS_TEXTO[name]) {
      const { label, max } = CAMPOS_TEXTO[name];
      if (value.length > max) {
        setError(`${label} permite un máximo de ${max} caracteres.`);
        return;
      }
      if (value.length > 0 && !EMPIEZA_CON_LETRA.test(value)) {
        setError(`${label} debe comenzar con una letra.`);
        return;
      }
      if (/ {2}/.test(value)) {
        setError(`${label} no puede tener dos espacios seguidos.`);
        return;
      }
      if (!TEXTO_PERMITIDO.test(value)) {
        setError(`${label} contiene caracteres no permitidos.`);
        return;
      }
      commit(name, value);
      return;
    }

    if (name === 'documento') {
      // Cédula paraguaya (tipo 1): sólo dígitos. Otros documentos (RUC,
      // pasaporte) admiten alfanumérico con guiones.
      const esCedula = formData.fk_tipo_documento === '1';
      if (esCedula ? /[^\d]/.test(value) : !/^[A-Za-z0-9-]*$/.test(value)) {
        setError(
          esCedula
            ? 'Para Cédula de Identidad sólo se permiten números.'
            : 'El documento sólo admite letras, números y guiones.',
        );
        return;
      }
      // Los pasaportes/RUC sí pueden arrancar con 0; la cédula no.
      if (esCedula && value.length > 0 && value[0] === '0') {
        setError('La cédula no puede empezar con 0.');
        return;
      }
      if (value.length > 15) {
        setError('El documento permite un máximo de 15 caracteres.');
        return;
      }
      commit(name, value);
      return;
    }

    if (name === 'email') {
      if (/\s/.test(value)) {
        setError('El correo no puede contener espacios.');
        return;
      }
      if (!/^[A-Za-z0-9._%+@-]*$/.test(value)) {
        setError('El correo sólo admite letras, números y los signos . _ % + - @');
        return;
      }
      if ((value.match(/@/g) || []).length > 1) {
        setError('El correo debe tener un único @.');
        return;
      }
      if (value.length > 50) {
        setError('El correo permite un máximo de 50 caracteres.');
        return;
      }
      commit(name, value);
      return;
    }

    commit(name, value);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'razon_social' || name === 'fk_tipo_documento' || name === 'documento') {
      if (!value.trim()) {
        setFormErrors(prev => ({ ...prev, [name]: 'Este campo es obligatorio.' }));
      }
    }

    // El formato completo del correo se evalúa recién al salir del campo, para
    // no marcar en rojo un correo que todavía se está escribiendo.
    if (name === 'email') {
      const emailError = validarEmail(value.trim());
      setFormErrors(prev => {
        const newErrors = { ...prev };
        if (emailError) newErrors.email = emailError;
        else delete newErrors.email;
        return newErrors;
      });
    }
  };

  const handleLocChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLocState(p => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Basic Validation
    const errors: Record<string, string> = {};
    if (!formData.razon_social.trim()) errors.razon_social = "La razón social es obligatoria.";
    else if (formData.razon_social.trim().length < 3) {
      errors.razon_social = "La razón social debe tener al menos 3 caracteres.";
    }
    if (!formData.fk_tipo_documento) errors.fk_tipo_documento = "El tipo de documento es obligatorio.";
    if (!formData.documento.trim()) errors.documento = "El documento es obligatorio.";

    if (formData.documento && formData.fk_tipo_documento) {
      const validationError = validarDocumentoCliente(formData.documento, formData.fk_tipo_documento);
      if (validationError) {
        errors.documento = validationError;
      }
    }

    const emailError = validarEmail(formData.email.trim());
    if (emailError) errors.email = emailError;

    const fijo = separarTelefono(formData.telefono, 'fijo');
    const telefonoError =
      validarCodigoPais(fijo.codigo, fijo.numero) || validarNumero(fijo.numero, fijo.codigo, 'fijo');
    if (telefonoError) errors.telefono = telefonoError;

    const movil = separarTelefono(formData.celular, 'celular');
    const celularError =
      validarCodigoPais(movil.codigo, movil.numero) || validarNumero(movil.numero, movil.codigo, 'celular');
    if (celularError) errors.celular = celularError;

    // Basta con uno de los tres: correo, teléfono o celular.
    if (!formData.email.trim() && !formData.telefono.trim() && !formData.celular.trim()) {
      errors.contacto = "Completá al menos un dato de contacto: correo, teléfono o celular.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      // "contacto" no es un campo: es la regla de "al menos uno de los tres",
      // así que se lleva al correo, que es el primero de esa terna.
      if (!enfocarPrimerError(errors, ORDEN_CAMPOS) && errors.contacto) {
        enfocarCampo('email');
      }
      setLoading(false);
      return;
    }

    setFormErrors({}); // Clear validation errors

    try {
      // Check for existing document
      // If editing, we allow the same document if it belongs to the same client
      const documento = formData.documento.trim();
      const existing = await ClientService.checkExistingDocument(documento);
      if (existing && (!isEditing || existing.id_cliente !== clientToEdit.id_cliente)) {
        setFormErrors({ documento: `El documento ${documento} ya está registrado.` });
        enfocarCampo('documento');
        setLoading(false);
        return;
      }

      const payload = {
        ...formData,
        razon_social: formData.razon_social.trim(),
        nombre_fantasia: formData.nombre_fantasia.trim(),
        direccion: formData.direccion.trim(),
        email: formData.email.trim(),
        telefono: formData.telefono.trim(),
        celular: formData.celular.trim(),
        documento,
        nro_casa: formData.nro_casa ? parseInt(formData.nro_casa) : null,
        fk_tipo_documento:
          formData.fk_tipo_documento === RUC_TIPO_DOC_VALUE ? null : parseInt(formData.fk_tipo_documento),
        fk_tipo_contribuyente: formData.fk_tipo_contribuyente ? parseInt(formData.fk_tipo_contribuyente) : null,
        fk_tipo_operacion: formData.fk_tipo_operacion ? parseInt(formData.fk_tipo_operacion) : null,
        fk_barrios: formData.fk_barrios ? parseInt(formData.fk_barrios) : null,
      };

      let creado: any;
      if (isEditing) {
        await ClientService.updateClient(clientToEdit.id_cliente, payload);
        setSuccess("¡Cliente actualizado exitosamente!");
      } else {
        const filas = await ClientService.createClient(payload);
        creado = filas?.[0];
        setSuccess("¡Cliente registrado exitosamente!");
      }

      setTimeout(() => {
        if (onCreated) onCreated(creado);
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al intentar guardar el cliente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout
      title={isEditing ? 'Editar Cliente' : 'Registrar Cliente'}
      description={isEditing 
        ? 'Actualiza los datos del cliente/huésped.' 
        : 'Añade un nuevo cliente/huésped al sistema, completando sus referencias.'}
      actions={
        <button onClick={onCancel} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
          Cancelar y volver
        </button>
      }
    >
      {error && (
        <div className="status-message status-error" style={{ marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {isEditing && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px', 
          marginBottom: '20px', 
          padding: '12px 16px', 
          borderRadius: '12px', 
          background: 'rgba(255, 255, 255, 0.03)', 
          border: '1px solid var(--glass-border)' 
        }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Historial del cliente:</span>
          <ClienteRecurrenteBadge 
            isRecurrente={isClienteRecurrente(clientToEdit)} 
            count={getReservationCount(clientToEdit)} 
            showCount 
            size="md" 
          />
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* Sección: Datos Principales */}
        <h3 className="section-title">Datos Principales</h3>
        <div className="form-grid">
          <div className="input-group">
            <label htmlFor="razon_social">Razón Social / Nombre Completo *</label>
            <input 
              id="razon_social" 
              name="razon_social" 
              type="text" 
              className={`input-field ${formErrors.razon_social ? 'input-error' : ''}`} 
              value={formData.razon_social} 
              onChange={handleChange} 
              onBlur={handleBlur}
              required 
            />
            {formErrors.razon_social && <span className="field-error">{formErrors.razon_social}</span>}
          </div>

          <div className="input-group">
            <label htmlFor="nombre_fantasia">Nombre de Fantasía</label>
            <input id="nombre_fantasia" name="nombre_fantasia" type="text" className="input-field" value={formData.nombre_fantasia} onChange={handleChange} />
          </div>

          <div className="input-group">
            <label htmlFor="fk_tipo_documento">Tipo de Doc. *</label>
            <select 
              id="fk_tipo_documento" 
              name="fk_tipo_documento" 
              className={`input-field ${formErrors.fk_tipo_documento ? 'input-error' : ''}`} 
              value={formData.fk_tipo_documento} 
              onChange={handleChange} 
              onBlur={handleBlur}
              required
            >
              <option value="" disabled hidden>Selecciona...</option>
              <option value={RUC_TIPO_DOC_VALUE} style={{ color: "black" }}>RUC</option>
              {catTipoDoc.map(doc => (
                <option key={doc.cod_tipodoc} value={doc.cod_tipodoc} style={{ color: "black" }}>{doc.descripcion_tipodoc}</option>
              ))}
            </select>
            {formErrors.fk_tipo_documento && <span className="field-error">{formErrors.fk_tipo_documento}</span>}
          </div>

          <div className="input-group">
            <label htmlFor="documento">Nº Documento *</label>
            <input
              id="documento"
              name="documento"
              type="text"
              className={`input-field ${(formErrors.documento || validarDocumentoCliente(formData.documento, formData.fk_tipo_documento)) ? 'input-error' : ''}`}
              value={formData.documento}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={!formData.fk_tipo_documento}
              placeholder={!formData.fk_tipo_documento ? 'Elegí primero el tipo de documento' : 'Ej: 80012345-6'}
              required
            />
            {(formErrors.documento || validarDocumentoCliente(formData.documento, formData.fk_tipo_documento)) && (
              <span className="field-error">
                {formErrors.documento || validarDocumentoCliente(formData.documento, formData.fk_tipo_documento)}
              </span>
            )}
          </div>
        </div>

        {/* Sección "Información Fiscal" (Tipo de Contribuyente, Tipo de
            Operación, Es proveedor del Estado) oculta por pedido: los
            campos ya no eran obligatorios, formData sigue mandando sus
            valores por defecto porque fk_tipo_operacion y
            es_proveedor_del_estado son NOT NULL en la tabla clientes. */}

        {/* Sección: Contacto */}
        <h3 className="section-title">Contacto</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px' }}>
          Completá al menos uno de estos tres campos.
        </p>
        {formErrors.contacto && (
          <div className="status-message status-error" style={{ marginBottom: '16px' }}>
            {formErrors.contacto}
          </div>
        )}
        <div className="form-grid">
          <div className="input-group">
            <label htmlFor="email">Correo Electrónico</label>
            {/* type="text": el formato lo valida validarEmail, así el usuario ve
                nuestro mensaje y no el tooltip nativo del navegador. */}
            <input
              id="email"
              name="email"
              type="text"
              inputMode="email"
              className={`input-field ${formErrors.email || formErrors.contacto ? 'input-error' : ''}`}
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Ej. nombre@gmail.com"
            />
            {formErrors.email && <span className="field-error">{formErrors.email}</span>}
          </div>
          <PhoneField
            id="telefono"
            label="Teléfono Fijo"
            modo="fijo"
            value={formData.telefono}
            onChange={(v) => commit('telefono', v)}
            error={formErrors.telefono}
          />
          <PhoneField
            id="celular"
            label="Celular"
            value={formData.celular}
            onChange={(v) => commit('celular', v)}
            error={formErrors.celular}
          />
        </div>

        <div className="divider" style={{height:'1px', background: 'rgba(255,255,255,0.1)', margin: '20px 0'}}></div>

        {/* Sección: Ubicación (Cascada) */}
        <h3 className="section-title">Ubicación Geo-espacial</h3>
        <p style={{fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px'}}>
          {isEditing && formData.fk_barrios 
            ? "El cliente ya tiene un barrio asignado. Solo modifica estos campos si deseas cambiar la ubicación actual."
            : "Selecciona la nueva ubicación del cliente."}
        </p>

        <div className="form-grid">
          <div className="input-group">
            <label htmlFor="pais">País</label>
            <select id="pais" name="pais" className="input-field" value={locState.pais} onChange={handleLocChange}>
              <option value="">Selecciona País...</option>
              {catPaises.map(p => (
                <option key={p.id_pais} value={p.id_pais} style={{ color: "black" }}>{p.pais}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="departamento">Departamento</label>
            <select id="departamento" name="departamento" className="input-field" value={locState.departamento} onChange={handleLocChange} disabled={!locState.pais}>
              <option value="">Selecciona Depto...</option>
              {catDepartamentos.map(d => (
                <option key={d.cod_depto} value={d.cod_depto} style={{ color: "black" }}>{d.nombre_depto}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="distrito">Distrito</label>
            <select id="distrito" name="distrito" className="input-field" value={locState.distrito} onChange={handleLocChange} disabled={!locState.departamento}>
              <option value="">Selecciona Distrito...</option>
              {catDistritos.map(d => (
                <option key={d.cod_distrito} value={d.cod_distrito} style={{ color: "black" }}>{d.nombre_distrito}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="ciudad">Ciudad</label>
            <select id="ciudad" name="ciudad" className="input-field" value={locState.ciudad} onChange={handleLocChange} disabled={!locState.distrito}>
              <option value="">Selecciona Ciudad...</option>
              {catCiudades.map(c => (
                <option key={c.cod_ciudades} value={c.cod_ciudades} style={{ color: "black" }}>{c.nombre_ciudad}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="fk_barrios">Barrio Final</label>
            <select id="fk_barrios" name="fk_barrios" className="input-field" value={formData.fk_barrios} onChange={handleChange} disabled={!locState.ciudad && !isEditing}>
              <option value="">Selecciona Barrio...</option>
              {/* Añadimos el barrio actual visible si estamos editando y no hemos tocado la cascada */}
              {isEditing && formData.fk_barrios && !locState.ciudad && (
                 <option value={formData.fk_barrios} style={{ color: "black" }}>Mantener barrio original (ID: {formData.fk_barrios})</option>
              )}
              {catBarrios.map(b => (
                <option key={b.cod_barrio} value={b.cod_barrio} style={{ color: "black" }}>{b.nombre_barrio}</option>
              ))}
            </select>
          </div>

          <div className="input-group span-2">
            <label htmlFor="direccion">Dirección Específica</label>
            <input id="direccion" name="direccion" type="text" className="input-field" value={formData.direccion} onChange={handleChange} placeholder="Calle, referencias, etc." />
          </div>
        </div>

        <div style={{ marginTop: '30px' }}>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <>
                <div className="loader"></div>
                <span>Guardando...</span>
              </>
            ) : (
              isEditing ? 'Guardar Cambios' : 'Completar Registro'
            )}
          </button>
        </div>
      </form>

      {success && (
        <div className="status-message status-success" style={{ marginTop: '20px' }}>
          {success}
        </div>
      )}
    </ModuleLayout>
  );
}
