// NOTE: tables 0016-0021 (finanzas), planes and the fn_rep_*/fn_cerrar_mes RPCs were hand-merged until the next regeneration (supabase CLI needs Docker).
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      actividad_economica: {
        Row: {
          codigo_activity: number
          created_at: string
          descripcion_actividad_economica: string
          id_actividad_economica: number
        }
        Insert: {
          codigo_activity: number
          created_at?: string
          descripcion_actividad_economica: string
          id_actividad_economica?: never
        }
        Update: {
          codigo_activity?: number
          created_at?: string
          descripcion_actividad_economica?: string
          id_actividad_economica?: never
        }
        Relationships: []
      }
      actividad_empresa: {
        Row: {
          created_at: string
          es_principal: boolean
          fk_actividad: number
          fk_empresa: number
          id: number
        }
        Insert: {
          created_at?: string
          es_principal?: boolean
          fk_actividad: number
          fk_empresa: number
          id?: never
        }
        Update: {
          created_at?: string
          es_principal?: boolean
          fk_actividad?: number
          fk_empresa?: number
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "actividad_empresa_fk_actividad_fkey"
            columns: ["fk_actividad"]
            isOneToOne: false
            referencedRelation: "actividad_economica"
            referencedColumns: ["id_actividad_economica"]
          },
          {
            foreignKeyName: "actividad_empresa_fk_empresa_fkey"
            columns: ["fk_empresa"]
            isOneToOne: false
            referencedRelation: "datos_empresa"
            referencedColumns: ["id_empresa"]
          },
        ]
      }
      apertura_cierre_caja: {
        Row: {
          apertura: string
          cierre: string | null
          fk_caja: number
          fk_usuario: number
          fk_usuario_cierre: number | null
          id_turno: number
          monto_final: number
          monto_inicial: number
        }
        Insert: {
          apertura?: string
          cierre?: string | null
          fk_caja: number
          fk_usuario: number
          fk_usuario_cierre?: number | null
          id_turno?: never
          monto_final: number
          monto_inicial: number
        }
        Update: {
          apertura?: string
          cierre?: string | null
          fk_caja?: number
          fk_usuario?: number
          fk_usuario_cierre?: number | null
          id_turno?: never
          monto_final?: number
          monto_inicial?: number
        }
        Relationships: [
          {
            foreignKeyName: "apertura_cierre_caja_fk_caja_fkey"
            columns: ["fk_caja"]
            isOneToOne: false
            referencedRelation: "caja"
            referencedColumns: ["id_caja"]
          },
          {
            foreignKeyName: "apertura_cierre_caja_fk_usuario_fkey"
            columns: ["fk_usuario"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id_usuario"]
          },
          {
            foreignKeyName: "apertura_cierre_caja_fk_usuario_cierre_fkey"
            columns: ["fk_usuario_cierre"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      asientos: {
        Row: {
          descripcion: string
          estado: string
          fecha: string
          fk_origen: number | null
          fk_sucursal: number
          id: number
          nro_asiento: number
          origen_tipo: string | null
        }
        Insert: {
          descripcion: string
          estado: string
          fecha?: string
          fk_origen?: number | null
          fk_sucursal: number
          id?: never
          nro_asiento: number
          origen_tipo?: string | null
        }
        Update: {
          descripcion?: string
          estado?: string
          fecha?: string
          fk_origen?: number | null
          fk_sucursal?: number
          id?: never
          nro_asiento?: number
          origen_tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asientos_fk_sucursal_fkey"
            columns: ["fk_sucursal"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id_establecimiento"]
          },
        ]
      }
      barrios: {
        Row: {
          cod_barrio: number
          created_at: string
          fk_ciudad: number
          nombre_barrio: string
        }
        Insert: {
          cod_barrio: number
          created_at?: string
          fk_ciudad: number
          nombre_barrio: string
        }
        Update: {
          cod_barrio?: number
          created_at?: string
          fk_ciudad?: number
          nombre_barrio?: string
        }
        Relationships: [
          {
            foreignKeyName: "barrios_fk_ciudad_fkey"
            columns: ["fk_ciudad"]
            isOneToOne: false
            referencedRelation: "ciudades"
            referencedColumns: ["cod_ciudades"]
          },
        ]
      }
      bloqueos_habitacion: {
        Row: {
          fecha_fin: string | null
          fecha_inicio: string
          fk_habitacion: number
          id_bloqueo: number
          motivo: string
          observaciones: string | null
        }
        Insert: {
          fecha_fin?: string | null
          fecha_inicio: string
          fk_habitacion: number
          id_bloqueo?: never
          motivo: string
          observaciones?: string | null
        }
        Update: {
          fecha_fin?: string | null
          fecha_inicio?: string
          fk_habitacion?: number
          id_bloqueo?: never
          motivo?: string
          observaciones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bloqueos_habitacion_fk_habitacion_fkey"
            columns: ["fk_habitacion"]
            isOneToOne: false
            referencedRelation: "habitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      caja: {
        Row: {
          created_at: string
          descripcion_caja: string | null
          fk_establecimientos: number
          id_caja: number
          nro_caja: number
        }
        Insert: {
          created_at?: string
          descripcion_caja?: string | null
          fk_establecimientos: number
          id_caja?: never
          nro_caja: number
        }
        Update: {
          created_at?: string
          descripcion_caja?: string | null
          fk_establecimientos?: number
          id_caja?: never
          nro_caja?: number
        }
        Relationships: [
          {
            foreignKeyName: "caja_fk_establecimientos_fkey"
            columns: ["fk_establecimientos"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id_establecimiento"]
          },
        ]
      }
      cargo: {
        Row: {
          cargo: string
          created_at: string
          descripcion_cargo: string
          id_cargo: number
        }
        Insert: {
          cargo: string
          created_at?: string
          descripcion_cargo: string
          id_cargo?: never
        }
        Update: {
          cargo?: string
          created_at?: string
          descripcion_cargo?: string
          id_cargo?: never
        }
        Relationships: []
      }
      cargos_folio: {
        Row: {
          cantidad: number
          estado: string | null // 'ACTIVO' (visible) | 'INACTIVO' (eliminado lógico) | null (registros anteriores sin estado)
          fecha_cargo: string | null
          fk_concepto: number
          fk_folio: number
          fk_usuario: number
          id_cargo: number
          monto_total: number
          monto_unitario: number
        }
        Insert: {
          cantidad?: number
          estado?: string | null // 'ACTIVO' | 'INACTIVO'
          fecha_cargo?: string | null
          fk_concepto: number
          fk_folio: number
          fk_usuario: number
          id_cargo?: never
          monto_total: number
          monto_unitario: number
        }
        Update: {
          cantidad?: number
          estado?: string | null // 'ACTIVO' | 'INACTIVO'
          fecha_cargo?: string | null
          fk_concepto?: number
          fk_folio?: number
          fk_usuario?: number
          id_cargo?: never
          monto_total?: number
          monto_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "cargos_folio_fk_concepto_fkey"
            columns: ["fk_concepto"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id_concepto"]
          },
          {
            foreignKeyName: "cargos_folio_fk_folio_fkey"
            columns: ["fk_folio"]
            isOneToOne: false
            referencedRelation: "folios"
            referencedColumns: ["id_folio"]
          },
          {
            foreignKeyName: "cargos_folio_fk_usuario_fkey"
            columns: ["fk_usuario"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      categorias_finanzas: {
        Row: {
          activo: boolean
          created_at: string
          es_sistema: boolean
          fk_cuenta_contable: number
          id: number
          nombre: string
          tenant_id: number
          tipo: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          es_sistema?: boolean
          fk_cuenta_contable: number
          id?: never
          nombre: string
          tenant_id?: number
          tipo: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          es_sistema?: boolean
          fk_cuenta_contable?: number
          id?: never
          nombre?: string
          tenant_id?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_finanzas_cuenta_fkey"
            columns: ["fk_cuenta_contable"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
        ]
      }
      ciudades: {
        Row: {
          cod_ciudades: number
          created_at: string
          fk_distrito: number
          nombre_ciudad: string
        }
        Insert: {
          cod_ciudades: number
          created_at?: string
          fk_distrito: number
          nombre_ciudad: string
        }
        Update: {
          cod_ciudades?: number
          created_at?: string
          fk_distrito?: number
          nombre_ciudad?: string
        }
        Relationships: [
          {
            foreignKeyName: "ciudades_fk_distrito_fkey"
            columns: ["fk_distrito"]
            isOneToOne: false
            referencedRelation: "distritos"
            referencedColumns: ["cod_distrito"]
          },
        ]
      }
      clientes: {
        Row: {
          celular: string
          created_at: string
          direccion: string | null
          documento: string
          email: string | null
          es_proveedor_del_estado: boolean
          estado_cliente: string
          fk_barrios: number
          fk_tipo_contribuyente: number | null
          fk_tipo_documento: number
          fk_tipo_operacion: number
          id_cliente: number
          nombre_fantasia: string | null
          nro_casa: number
          razon_social: string
          telefono: string | null
        }
        Insert: {
          celular: string
          created_at?: string
          direccion?: string | null
          documento: string
          email?: string | null
          es_proveedor_del_estado: boolean
          estado_cliente?: string
          fk_barrios: number
          fk_tipo_contribuyente?: number | null
          fk_tipo_documento: number
          fk_tipo_operacion: number
          id_cliente?: never
          nombre_fantasia?: string | null
          nro_casa?: number
          razon_social: string
          telefono?: string | null
        }
        Update: {
          celular?: string
          created_at?: string
          direccion?: string | null
          documento?: string
          email?: string | null
          es_proveedor_del_estado?: boolean
          estado_cliente?: string
          fk_barrios?: number
          fk_tipo_contribuyente?: number | null
          fk_tipo_documento?: number
          fk_tipo_operacion?: number
          id_cliente?: never
          nombre_fantasia?: string | null
          nro_casa?: number
          razon_social?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_fk_barrios_fkey"
            columns: ["fk_barrios"]
            isOneToOne: false
            referencedRelation: "barrios"
            referencedColumns: ["cod_barrio"]
          },
          {
            foreignKeyName: "clientes_fk_tipo_documento_fkey"
            columns: ["fk_tipo_documento"]
            isOneToOne: false
            referencedRelation: "tipo_documento"
            referencedColumns: ["cod_tipodoc"]
          },
          {
            foreignKeyName: "clientes_fk_tipo_operacion_fkey"
            columns: ["fk_tipo_operacion"]
            isOneToOne: false
            referencedRelation: "tipo_operacion"
            referencedColumns: ["id_tipo_operacion"]
          },
          {
            foreignKeyName: "clientes_tipo_contribuyente_fkey"
            columns: ["fk_tipo_contribuyente"]
            isOneToOne: false
            referencedRelation: "tipo_contribuyente"
            referencedColumns: ["id_tipo_contribuyente"]
          },
        ]
      }
      cobros: {
        Row: {
          created_at: string
          estado: string
          fecha: string
          fk_cuenta_fondo: number
          fk_factura: number
          id: number
          monto: number
          observacion: string | null
          tenant_id: number
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha?: string
          fk_cuenta_fondo: number
          fk_factura: number
          id?: never
          monto: number
          observacion?: string | null
          tenant_id?: number
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          fk_cuenta_fondo?: number
          fk_factura?: number
          id?: never
          monto?: number
          observacion?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobros_factura_fkey"
            columns: ["fk_factura"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id_factura"]
          },
          {
            foreignKeyName: "cobros_fondo_fkey"
            columns: ["fk_cuenta_fondo"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
        ]
      }
      conceptos: {
        Row: {
          arancel: number
          created_at: string
          descripcion: string
          estado: string
          fk_iva: number
          fk_servicio: number | null
          fk_unidad_medida: number
          id_concepto: number
          nombre: string
        }
        Insert: {
          arancel: number
          created_at?: string
          descripcion: string
          estado: string
          fk_iva: number
          fk_servicio?: number | null
          fk_unidad_medida: number
          id_concepto?: never
          nombre: string
        }
        Update: {
          arancel?: number
          created_at?: string
          descripcion?: string
          estado?: string
          fk_iva?: number
          fk_servicio?: number | null
          fk_unidad_medida?: number
          id_concepto?: never
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepto_fk_iva_fkey"
            columns: ["fk_iva"]
            isOneToOne: false
            referencedRelation: "iva"
            referencedColumns: ["id_iva"]
          },
          {
            foreignKeyName: "concepto_fk_unidades_fkey"
            columns: ["fk_unidad_medida"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id_unidades"]
          },
        ]
      }
      cuentas_contables: {
        Row: {
          activo: boolean
          clave: string | null
          codigo: string | null
          created_at: string
          fk_cuenta_padre: number | null
          fk_tipo_cuenta: number
          id: number
          imputable: boolean
          nombre: string
        }
        Insert: {
          activo?: boolean
          clave?: string | null
          codigo?: string | null
          created_at?: string
          fk_cuenta_padre?: number | null
          fk_tipo_cuenta: number
          id?: never
          imputable: boolean
          nombre: string
        }
        Update: {
          activo?: boolean
          clave?: string | null
          codigo?: string | null
          created_at?: string
          fk_cuenta_padre?: number | null
          fk_tipo_cuenta?: number
          id?: never
          imputable?: boolean
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_contables_fk_cuenta_padre_fkey"
            columns: ["fk_cuenta_padre"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_contables_fk_tipo_cuenta_fkey"
            columns: ["fk_tipo_cuenta"]
            isOneToOne: false
            referencedRelation: "tipo_cuenta_contable"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_fondos: {
        Row: {
          activo: boolean
          created_at: string
          fk_caja: number | null
          fk_cuenta_contable: number
          id: number
          nombre: string
          tenant_id: number
          tipo: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          fk_caja?: number | null
          fk_cuenta_contable: number
          id?: never
          nombre: string
          tenant_id?: number
          tipo: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          fk_caja?: number | null
          fk_cuenta_contable?: number
          id?: never
          nombre?: string
          tenant_id?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_fondos_caja_fkey"
            columns: ["fk_caja"]
            isOneToOne: false
            referencedRelation: "caja"
            referencedColumns: ["id_caja"]
          },
          {
            foreignKeyName: "cuentas_fondos_cuenta_fkey"
            columns: ["fk_cuenta_contable"]
            isOneToOne: true
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
        ]
      }
      datos_empresa: {
        Row: {
          created_at: string
          estado: string
          fk_contribuyente: number
          fk_regimen: number
          id_empresa: number
          nombre_fantasia: string
          razon_social: string
          ruc: string
        }
        Insert: {
          created_at?: string
          estado: string
          fk_contribuyente: number
          fk_regimen: number
          id_empresa?: never
          nombre_fantasia: string
          razon_social: string
          ruc: string
        }
        Update: {
          created_at?: string
          estado?: string
          fk_contribuyente?: number
          fk_regimen?: number
          id_empresa?: never
          nombre_fantasia?: string
          razon_social?: string
          ruc?: string
        }
        Relationships: [
          {
            foreignKeyName: "datos_empresa_fk_contribuyente_fkey"
            columns: ["fk_contribuyente"]
            isOneToOne: false
            referencedRelation: "tipo_contribuyente"
            referencedColumns: ["id_tipo_contribuyente"]
          },
          {
            foreignKeyName: "datos_empresa_fk_regimen_fkey"
            columns: ["fk_regimen"]
            isOneToOne: false
            referencedRelation: "tipo_regimen"
            referencedColumns: ["id_regimen"]
          },
        ]
      }
      datos_factura_sifen: {
        Row: {
          cdc: string | null
          codigo_control: string | null
          codigo_seguridad: string
          enlace_qr: string | null
          estado_cdc: number | null
          fecha_firma: string
          fk_factura: number
          id: number
          json_sifen: Json | null
          xml_url: string | null
        }
        Insert: {
          cdc?: string | null
          codigo_control?: string | null
          codigo_seguridad: string
          enlace_qr?: string | null
          estado_cdc?: number | null
          fecha_firma?: string
          fk_factura: number
          id?: never
          json_sifen?: Json | null
          xml_url?: string | null
        }
        Update: {
          cdc?: string | null
          codigo_control?: string | null
          codigo_seguridad?: string
          enlace_qr?: string | null
          estado_cdc?: number | null
          fecha_firma?: string
          fk_factura?: number
          id?: never
          json_sifen?: Json | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datos_factura_sifen_fk_factura_fkey"
            columns: ["fk_factura"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id_factura"]
          },
        ]
      }
      departamentos: {
        Row: {
          cod_depto: number
          created_at: string
          fk_pais: number
          nombre_depto: string
        }
        Insert: {
          cod_depto: number
          created_at?: string
          fk_pais: number
          nombre_depto: string
        }
        Update: {
          cod_depto?: number
          created_at?: string
          fk_pais?: number
          nombre_depto?: string
        }
        Relationships: [
          {
            foreignKeyName: "departamentos_fk_pais_fkey"
            columns: ["fk_pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id_pais"]
          },
        ]
      }
      detalle_asientos: {
        Row: {
          created_at: string
          debe: number
          fk_asientos: number
          fk_cuenta_contables: number
          haber: number
          id: number
        }
        Insert: {
          created_at?: string
          debe?: number
          fk_asientos: number
          fk_cuenta_contables: number
          haber?: number
          id?: never
        }
        Update: {
          created_at?: string
          debe?: number
          fk_asientos?: number
          fk_cuenta_contables?: number
          haber?: number
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "detalle_asientos_fk_asientos_fkey"
            columns: ["fk_asientos"]
            isOneToOne: false
            referencedRelation: "asientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detalle_asientos_fk_cuenta_contables_fkey"
            columns: ["fk_cuenta_contables"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
        ]
      }
      detalle_factura: {
        Row: {
          cantidad: number
          created_at: string
          descripcion: string
          estado: string
          fk_cargo_folio: number | null
          fk_concepto: number
          fk_factura: number | null
          id_detalle: number
          iva_aplicado: number
          monto: number
          subtotal: number
        }
        Insert: {
          cantidad: number
          created_at?: string
          descripcion: string
          estado: string
          fk_cargo_folio?: number | null
          fk_concepto: number
          fk_factura?: number | null
          id_detalle?: never
          iva_aplicado: number
          monto: number
          subtotal: number
        }
        Update: {
          cantidad?: number
          created_at?: string
          descripcion?: string
          estado?: string
          fk_cargo_folio?: number | null
          fk_concepto?: number
          fk_factura?: number | null
          id_detalle?: never
          iva_aplicado?: number
          monto?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "detalle_factura_fk_cargo_folio_fkey"
            columns: ["fk_cargo_folio"]
            isOneToOne: false
            referencedRelation: "cargos_folio"
            referencedColumns: ["id_cargo"]
          },
          {
            foreignKeyName: "detalle_factura_fk_concepto_fkey"
            columns: ["fk_concepto"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id_concepto"]
          },
          {
            foreignKeyName: "detalle_factura_fk_factura_fkey"
            columns: ["fk_factura"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id_factura"]
          },
        ]
      }
      detalle_reservas: {
        Row: {
          cantidad_adultos: number
          cantidad_ninos: number
          created_at: string
          estado: string
          fk_habitacion: number
          fk_reserva: number
          fk_tarifa: number
          id_detalle: number
          precio_unitario: number
          subtotal: number
        }
        Insert: {
          cantidad_adultos?: number
          cantidad_ninos?: number
          created_at?: string
          estado?: string
          fk_habitacion: number
          fk_reserva: number
          fk_tarifa: number
          id_detalle?: never
          precio_unitario: number
          subtotal: number
        }
        Update: {
          cantidad_adultos?: number
          cantidad_ninos?: number
          created_at?: string
          estado?: string
          fk_habitacion?: number
          fk_reserva?: number
          fk_tarifa?: number
          id_detalle?: never
          precio_unitario?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "detalle_reservas_fk_habitacion_fkey"
            columns: ["fk_habitacion"]
            isOneToOne: false
            referencedRelation: "habitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detalle_reservas_fk_reserva_fkey"
            columns: ["fk_reserva"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id_reserva"]
          },
          {
            foreignKeyName: "detalle_reservas_fk_tarifa_fkey"
            columns: ["fk_tarifa"]
            isOneToOne: false
            referencedRelation: "tarifas"
            referencedColumns: ["id"]
          },
        ]
      }
      distritos: {
        Row: {
          cod_distrito: number
          created_at: string
          fk_depto: number
          nombre_distrito: string
        }
        Insert: {
          cod_distrito: number
          created_at?: string
          fk_depto: number
          nombre_distrito: string
        }
        Update: {
          cod_distrito?: number
          created_at?: string
          fk_depto?: number
          nombre_distrito?: string
        }
        Relationships: [
          {
            foreignKeyName: "distritos_fk_depto_fkey"
            columns: ["fk_depto"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["cod_depto"]
          },
        ]
      }
      edificios: {
        Row: {
          created_at: string
          estado: string
          fk_sucursal: number
          id: number
          nombre: string
        }
        Insert: {
          created_at?: string
          estado: string
          fk_sucursal: number
          id?: number
          nombre: string
        }
        Update: {
          created_at?: string
          estado?: string
          fk_sucursal?: number
          id?: number
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "edificios_fk_sucursal_fkey"
            columns: ["fk_sucursal"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id_establecimiento"]
          },
        ]
      }
      establecimientos: {
        Row: {
          codigo_establecimiento: string
          complemento_direccion_1: string
          complemento_direccion_2: string | null
          created_at: string
          denominacion: string
          direccion: string
          email: string | null
          estado_establecimiento: string
          fk_barrio: number
          fk_empresa: number
          id_establecimiento: number
          numero_casa: string
          telefono: string | null
        }
        Insert: {
          codigo_establecimiento: string
          complemento_direccion_1: string
          complemento_direccion_2?: string | null
          created_at?: string
          denominacion: string
          direccion: string
          email?: string | null
          estado_establecimiento: string
          fk_barrio: number
          fk_empresa: number
          id_establecimiento?: never
          numero_casa: string
          telefono?: string | null
        }
        Update: {
          codigo_establecimiento?: string
          complemento_direccion_1?: string
          complemento_direccion_2?: string | null
          created_at?: string
          denominacion?: string
          direccion?: string
          email?: string | null
          estado_establecimiento?: string
          fk_barrio?: number
          fk_empresa?: number
          id_establecimiento?: never
          numero_casa?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establecimientos_fk_barrio_fkey"
            columns: ["fk_barrio"]
            isOneToOne: false
            referencedRelation: "barrios"
            referencedColumns: ["cod_barrio"]
          },
          {
            foreignKeyName: "establecimientos_fk_empresa_fkey"
            columns: ["fk_empresa"]
            isOneToOne: false
            referencedRelation: "datos_empresa"
            referencedColumns: ["id_empresa"]
          },
        ]
      }
      estado_limpieza: {
        Row: {
          estado: string
          fk_empleado: number | null
          fk_habitacion: number
          id_estado_limpieza: number
          ultima_actualizacion: string | null
        }
        Insert: {
          estado: string
          fk_empleado?: number | null
          fk_habitacion: number
          id_estado_limpieza?: never
          ultima_actualizacion?: string | null
        }
        Update: {
          estado?: string
          fk_empleado?: number | null
          fk_habitacion?: number
          id_estado_limpieza?: never
          ultima_actualizacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estado_limpieza_fk_empleado_fkey"
            columns: ["fk_empleado"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id_usuario"]
          },
          {
            foreignKeyName: "estado_limpieza_fk_habitacion_fkey"
            columns: ["fk_habitacion"]
            isOneToOne: false
            referencedRelation: "habitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          condicion_venta: number
          descuento_global: number
          efectivo: number
          estado: string
          fecha_emision: string
          fecha_vencimiento: string | null
          fk_cliente: number
          fk_establecimientos: number
          fk_factura_asociada: number | null
          fk_folio: number | null
          fk_inmueble: number
          fk_modo_pago: number | null
          fk_monedas: number
          fk_motivo: number | null
          fk_tipo_factura: number
          fk_turno: number
          id_factura: number
          nro_secuencial: number
          observacion: string
          saldo_pendiente: number
          tipo_emision: number | null
          total_exenta: number
          total_general: number
          total_gravado_10: number
          total_gravado_5: number
          total_iva: number
          vuelto: number
        }
        Insert: {
          condicion_venta: number
          descuento_global?: number
          efectivo: number
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          fk_cliente: number
          fk_establecimientos: number
          fk_factura_asociada?: number | null
          fk_folio?: number | null
          fk_inmueble: number
          fk_modo_pago?: number | null
          fk_monedas: number
          fk_motivo?: number | null
          fk_tipo_factura: number
          fk_turno: number
          id_factura?: never
          nro_secuencial: number
          observacion: string
          saldo_pendiente?: number
          tipo_emision?: number | null
          total_exenta: number
          total_general: number
          total_gravado_10: number
          total_gravado_5: number
          total_iva: number
          vuelto: number
        }
        Update: {
          condicion_venta?: number
          descuento_global?: number
          efectivo?: number
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          fk_cliente?: number
          fk_establecimientos?: number
          fk_factura_asociada?: number | null
          fk_folio?: number | null
          fk_inmueble?: number
          fk_modo_pago?: number | null
          fk_monedas?: number
          fk_motivo?: number | null
          fk_tipo_factura?: number
          fk_turno?: number
          id_factura?: never
          nro_secuencial?: number
          observacion?: string
          saldo_pendiente?: number
          tipo_emision?: number | null
          total_exenta?: number
          total_general?: number
          total_gravado_10?: number
          total_gravado_5?: number
          total_iva?: number
          vuelto?: number
        }
        Relationships: [
          {
            foreignKeyName: "facturas_fk_cliente_fkey"
            columns: ["fk_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id_cliente"]
          },
          {
            foreignKeyName: "facturas_fk_establecimientos_fkey"
            columns: ["fk_establecimientos"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id_establecimiento"]
          },
          {
            foreignKeyName: "facturas_fk_factura_asociada_fkey"
            columns: ["fk_factura_asociada"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id_factura"]
          },
          {
            foreignKeyName: "facturas_fk_folio_fkey"
            columns: ["fk_folio"]
            isOneToOne: false
            referencedRelation: "folios"
            referencedColumns: ["id_folio"]
          },
          {
            foreignKeyName: "facturas_fk_modo_pago_fkey"
            columns: ["fk_modo_pago"]
            isOneToOne: false
            referencedRelation: "modo_pago"
            referencedColumns: ["id_modo_pago"]
          },
          {
            foreignKeyName: "facturas_fk_monedas_fkey"
            columns: ["fk_monedas"]
            isOneToOne: false
            referencedRelation: "monedas"
            referencedColumns: ["id_monedas"]
          },
          {
            foreignKeyName: "facturas_fk_motivo_fkey"
            columns: ["fk_motivo"]
            isOneToOne: false
            referencedRelation: "motivos_emision"
            referencedColumns: ["id_motivos"]
          },
          {
            foreignKeyName: "facturas_fk_tipo_factura_fkey"
            columns: ["fk_tipo_factura"]
            isOneToOne: false
            referencedRelation: "tipo_factura"
            referencedColumns: ["id_tipo_factura"]
          },
          {
            foreignKeyName: "facturas_fk_turno_fkey"
            columns: ["fk_turno"]
            isOneToOne: false
            referencedRelation: "apertura_cierre_caja"
            referencedColumns: ["id_turno"]
          },
        ]
      }
      folios: {
        Row: {
          created_at: string | null
          estado: string
          fk_reserva: number
          fk_usuario_reapertura: number | null
          id_folio: number
          reabierto_at: string | null
          total_acumulado: number
        }
        Insert: {
          created_at?: string | null
          estado?: string
          fk_reserva: number
          fk_usuario_reapertura?: number | null
          id_folio?: never
          reabierto_at?: string | null
          total_acumulado?: number
        }
        Update: {
          created_at?: string | null
          estado?: string
          fk_reserva?: number
          fk_usuario_reapertura?: number | null
          id_folio?: never
          reabierto_at?: string | null
          total_acumulado?: number
        }
        Relationships: [
          {
            foreignKeyName: "folios_fk_reserva_fkey"
            columns: ["fk_reserva"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id_reserva"]
          },
          {
            foreignKeyName: "folios_fk_usuario_reapertura_fkey"
            columns: ["fk_usuario_reapertura"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      gastos: {
        Row: {
          condicion: string
          created_at: string
          estado: string
          exenta: number
          fecha: string
          fecha_vencimiento: string | null
          fk_categoria: number
          fk_cuenta_fondo: number | null
          fk_establecimientos: number
          fk_proveedor: number | null
          gravado_10: number
          gravado_5: number
          id: number
          iva_10: number
          iva_5: number
          nro_comprobante: string | null
          observacion: string | null
          saldo_pendiente: number
          tenant_id: number
          total: number
        }
        Insert: {
          condicion: string
          created_at?: string
          estado?: string
          exenta?: number
          fecha?: string
          fecha_vencimiento?: string | null
          fk_categoria: number
          fk_cuenta_fondo?: number | null
          fk_establecimientos: number
          fk_proveedor?: number | null
          gravado_10?: number
          gravado_5?: number
          id?: never
          iva_10?: number
          iva_5?: number
          nro_comprobante?: string | null
          observacion?: string | null
          saldo_pendiente?: number
          tenant_id?: number
          total?: number
        }
        Update: {
          condicion?: string
          created_at?: string
          estado?: string
          exenta?: number
          fecha?: string
          fecha_vencimiento?: string | null
          fk_categoria?: number
          fk_cuenta_fondo?: number | null
          fk_establecimientos?: number
          fk_proveedor?: number | null
          gravado_10?: number
          gravado_5?: number
          id?: never
          iva_10?: number
          iva_5?: number
          nro_comprobante?: string | null
          observacion?: string | null
          saldo_pendiente?: number
          tenant_id?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "gastos_categoria_fkey"
            columns: ["fk_categoria"]
            isOneToOne: false
            referencedRelation: "categorias_finanzas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_establecimiento_fkey"
            columns: ["fk_establecimientos"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id_establecimiento"]
          },
          {
            foreignKeyName: "gastos_fondo_fkey"
            columns: ["fk_cuenta_fondo"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_proveedor_fkey"
            columns: ["fk_proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      habitaciones: {
        Row: {
          created_at: string
          descripcion: string | null
          fk_piso: number
          fk_tipo_habitacion: number
          id: number
          numero_habitacion: number
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          fk_piso: number
          fk_tipo_habitacion: number
          id?: number
          numero_habitacion: number
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          fk_piso?: number
          fk_tipo_habitacion?: number
          id?: number
          numero_habitacion?: number
        }
        Relationships: [
          {
            foreignKeyName: "habitaciones_fk_piso_fkey"
            columns: ["fk_piso"]
            isOneToOne: false
            referencedRelation: "pisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habitaciones_fk_tipo_habitacion_fkey"
            columns: ["fk_tipo_habitacion"]
            isOneToOne: false
            referencedRelation: "tipo_habitacion"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_estancia: {
        Row: {
          descripcion: string | null
          fecha_movimiento: string | null
          fk_reserva: number
          fk_usuario: number
          id_historial: number
          tipo_movimiento: string
        }
        Insert: {
          descripcion?: string | null
          fecha_movimiento?: string | null
          fk_reserva: number
          fk_usuario: number
          id_historial?: never
          tipo_movimiento: string
        }
        Update: {
          descripcion?: string | null
          fecha_movimiento?: string | null
          fk_reserva?: number
          fk_usuario?: number
          id_historial?: never
          tipo_movimiento?: string
        }
        Relationships: [
          {
            foreignKeyName: "historial_estancia_fk_reserva_fkey"
            columns: ["fk_reserva"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id_reserva"]
          },
          {
            foreignKeyName: "historial_estancia_fk_usuario_fkey"
            columns: ["fk_usuario"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      huespedes_reserva: {
        Row: {
          created_at: string
          documento: string
          es_titular: boolean
          fk_detalle_reserva: number
          fk_tipo_documento: number
          id_huesped: number
          nacionalidad: string | null
          nombre_completo: string
        }
        Insert: {
          created_at?: string
          documento: string
          es_titular?: boolean
          fk_detalle_reserva: number
          fk_tipo_documento: number
          id_huesped?: never
          nacionalidad?: string | null
          nombre_completo: string
        }
        Update: {
          created_at?: string
          documento?: string
          es_titular?: boolean
          fk_detalle_reserva?: number
          fk_tipo_documento?: number
          id_huesped?: never
          nacionalidad?: string | null
          nombre_completo?: string
        }
        Relationships: [
          {
            foreignKeyName: "huespedes_reserva_fk_detalle_fkey"
            columns: ["fk_detalle_reserva"]
            isOneToOne: false
            referencedRelation: "detalle_reservas"
            referencedColumns: ["id_detalle"]
          },
          {
            foreignKeyName: "huespedes_reserva_fk_tipo_doc_fkey"
            columns: ["fk_tipo_documento"]
            isOneToOne: false
            referencedRelation: "tipo_documento"
            referencedColumns: ["cod_tipodoc"]
          },
        ]
      }
      iva: {
        Row: {
          created_at: string
          descripcion: string
          id_iva: number
          valor: number
        }
        Insert: {
          created_at?: string
          descripcion: string
          id_iva?: never
          valor: number
        }
        Update: {
          created_at?: string
          descripcion?: string
          id_iva?: never
          valor?: number
        }
        Relationships: []
      }
      medios_pago_fondo: {
        Row: {
          created_at: string
          fk_fondo: number
          fk_modo_pago: number
          id: number
          tenant_id: number
        }
        Insert: {
          created_at?: string
          fk_fondo: number
          fk_modo_pago: number
          id?: never
          tenant_id?: number
        }
        Update: {
          created_at?: string
          fk_fondo?: number
          fk_modo_pago?: number
          id?: never
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "medios_pago_fondo_fk_modo_pago_fkey"
            columns: ["fk_modo_pago"]
            isOneToOne: false
            referencedRelation: "modo_pago"
            referencedColumns: ["id_modo_pago"]
          },
          {
            foreignKeyName: "medios_pago_fondo_fondo_fkey"
            columns: ["fk_fondo"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
        ]
      }
      modo_pago: {
        Row: {
          created_at: string
          descripcion: string
          id_modo_pago: number
        }
        Insert: {
          created_at?: string
          descripcion: string
          id_modo_pago?: never
        }
        Update: {
          created_at?: string
          descripcion?: string
          id_modo_pago?: never
        }
        Relationships: []
      }
      monedas: {
        Row: {
          cod_moneda: number
          cotizacion_gs: number
          created_at: string
          dec: number
          divisa: string
          id_monedas: number
          num: number
        }
        Insert: {
          cod_moneda: number
          cotizacion_gs: number
          created_at?: string
          dec: number
          divisa: string
          id_monedas?: never
          num: number
        }
        Update: {
          cod_moneda?: number
          cotizacion_gs?: number
          created_at?: string
          dec?: number
          divisa?: string
          id_monedas?: never
          num?: number
        }
        Relationships: []
      }
      motivos_emision: {
        Row: {
          created_at: string
          descripcion: string
          id_motivos: number
        }
        Insert: {
          created_at?: string
          descripcion: string
          id_motivos?: never
        }
        Update: {
          created_at?: string
          descripcion?: string
          id_motivos?: never
        }
        Relationships: []
      }
      notificacion: {
        Row: {
          created_at: string
          cuerpo: string | null
          fk_habitacion: number | null
          fk_usuario: number
          id_notificacion: number
          leida: boolean
          leida_at: string | null
          titulo: string
          tipo: string
        }
        Insert: {
          created_at?: string
          cuerpo?: string | null
          fk_habitacion?: number | null
          fk_usuario: number
          id_notificacion?: never
          leida?: boolean
          leida_at?: string | null
          titulo: string
          tipo: string
        }
        Update: {
          created_at?: string
          cuerpo?: string | null
          fk_habitacion?: number | null
          fk_usuario?: number
          id_notificacion?: never
          leida?: boolean
          leida_at?: string | null
          titulo?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacion_fk_habitacion_fkey"
            columns: ["fk_habitacion"]
            isOneToOne: false
            referencedRelation: "habitaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacion_fk_usuario_fkey"
            columns: ["fk_usuario"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      pagos: {
        Row: {
          created_at: string
          estado: string
          fecha: string
          fk_cuenta_fondo: number
          fk_gasto: number
          id: number
          monto: number
          observacion: string | null
          tenant_id: number
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha?: string
          fk_cuenta_fondo: number
          fk_gasto: number
          id?: never
          monto: number
          observacion?: string | null
          tenant_id?: number
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          fk_cuenta_fondo?: number
          fk_gasto?: number
          id?: never
          monto?: number
          observacion?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagos_fondo_fkey"
            columns: ["fk_cuenta_fondo"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_gasto_fkey"
            columns: ["fk_gasto"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
        ]
      }
      paises: {
        Row: {
          created_at: string
          id_pais: number
          pais: string
          pais_descripcion: string | null
        }
        Insert: {
          created_at?: string
          id_pais?: never
          pais: string
          pais_descripcion?: string | null
        }
        Update: {
          created_at?: string
          id_pais?: never
          pais?: string
          pais_descripcion?: string | null
        }
        Relationships: []
      }
      periodos_cerrados: {
        Row: {
          anio: number
          cerrado_en: string
          cerrado_por: number
          id: number
          mes: number
          tenant_id: number
        }
        Insert: {
          anio: number
          cerrado_en?: string
          cerrado_por: number
          id?: never
          mes: number
          tenant_id?: number
        }
        Update: {
          anio?: number
          cerrado_en?: string
          cerrado_por?: number
          id?: never
          mes?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "periodos_cerrados_usuario_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      pisos: {
        Row: {
          created_at: string
          estado: string
          fk_edificio: number
          id: number
          numero: number
        }
        Insert: {
          created_at?: string
          estado: string
          fk_edificio: number
          id?: number
          numero: number
        }
        Update: {
          created_at?: string
          estado?: string
          fk_edificio?: number
          id?: number
          numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "pisos_fk_edificio_fkey"
            columns: ["fk_edificio"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          codigo: string
          max_habitaciones: number | null
          max_hoteles: number | null
          max_usuarios: number | null
          mod_contabilidad: boolean
          mod_sifen: boolean
          moneda: string
          nombre: string
          orden: number
          precio_anual: number
          precio_mensual: number
          visible: boolean
        }
        Insert: never
        Update: never
        Relationships: []
      }
      proveedores: {
        Row: {
          activo: boolean
          created_at: string
          email: string | null
          id: number
          nombre: string
          ruc: string | null
          telefono: string | null
          tenant_id: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string | null
          id?: never
          nombre: string
          ruc?: string | null
          telefono?: string | null
          tenant_id?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string | null
          id?: never
          nombre?: string
          ruc?: string | null
          telefono?: string | null
          tenant_id?: number
        }
        Relationships: []
      }
      reservas: {
        Row: {
          codigo_reserva: string
          created_at: string
          estado: string
          fecha_entrada: string
          fecha_salida: string
          fk_cliente: number
          fk_usuario: number
          id_reserva: number
          observaciones: string | null
          origen: string
          total_estimado: number
        }
        Insert: {
          codigo_reserva: string
          created_at?: string
          estado?: string
          fecha_entrada: string
          fecha_salida: string
          fk_cliente: number
          fk_usuario: number
          id_reserva?: never
          observaciones?: string | null
          origen: string
          total_estimado?: number
        }
        Update: {
          codigo_reserva?: string
          created_at?: string
          estado?: string
          fecha_entrada?: string
          fecha_salida?: string
          fk_cliente?: number
          fk_usuario?: number
          id_reserva?: never
          observaciones?: string | null
          origen?: string
          total_estimado?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservas_fk_cliente_fkey"
            columns: ["fk_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id_cliente"]
          },
          {
            foreignKeyName: "reservas_fk_usuario_fkey"
            columns: ["fk_usuario"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      saldos_iniciales_fondos: {
        Row: {
          created_at: string
          estado: string
          fecha: string
          fk_cuenta_fondo: number
          fk_establecimientos: number
          id: number
          monto: number
          observacion: string | null
          tenant_id: number
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha?: string
          fk_cuenta_fondo: number
          fk_establecimientos: number
          id?: never
          monto: number
          observacion?: string | null
          tenant_id?: number
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          fk_cuenta_fondo?: number
          fk_establecimientos?: number
          id?: never
          monto?: number
          observacion?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldos_iniciales_fondos_establecimiento_fkey"
            columns: ["fk_establecimientos"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id_establecimiento"]
          },
          {
            foreignKeyName: "saldos_iniciales_fondos_fondo_fkey"
            columns: ["fk_cuenta_fondo"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
        ]
      }
      saldos_mensuales: {
        Row: {
          anio: number
          created_at: string
          fk_cuenta: number
          id: number
          mes: number
          saldo_debe_acumulado: number
          saldo_final: number
          saldo_haber_acumulado: number
        }
        Insert: {
          anio: number
          created_at?: string
          fk_cuenta: number
          id?: never
          mes: number
          saldo_debe_acumulado: number
          saldo_final: number
          saldo_haber_acumulado: number
        }
        Update: {
          anio?: number
          created_at?: string
          fk_cuenta?: number
          id?: never
          mes?: number
          saldo_debe_acumulado?: number
          saldo_final?: number
          saldo_haber_acumulado?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldos_mensuales_fk_cuenta_fkey"
            columns: ["fk_cuenta"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifas: {
        Row: {
          created_at: string
          estado: string
          fecha_fin: string | null
          fecha_inicio: string
          fk_tipo_habitacion: number
          id: number
          nombre: string
          precio_base: number
        }
        Insert: {
          created_at?: string
          estado: string
          fecha_fin?: string | null
          fecha_inicio?: string
          fk_tipo_habitacion: number
          id?: number
          nombre: string
          precio_base: number
        }
        Update: {
          created_at?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          fk_tipo_habitacion?: number
          id?: number
          nombre?: string
          precio_base?: number
        }
        Relationships: [
          {
            foreignKeyName: "tarifas_fk_tipo_habitacion_fkey"
            columns: ["fk_tipo_habitacion"]
            isOneToOne: false
            referencedRelation: "tipo_habitacion"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          ciclo_facturacion: string | null
          created_at: string
          estado: string
          fk_usuario_web: number | null
          id: number
          nombre: string
          plan: string
          slug: string
          trial_fin: string | null
          vigente_hasta: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      timbrados: {
        Row: {
          created_at: string
          estado: string
          fk_establecimiento: number
          id_timbrado: number
          inicio: string
          timbrado: string
          vencimiento: string
        }
        Insert: {
          created_at?: string
          estado: string
          fk_establecimiento: number
          id_timbrado?: never
          inicio: string
          timbrado: string
          vencimiento: string
        }
        Update: {
          created_at?: string
          estado?: string
          fk_establecimiento?: number
          id_timbrado?: never
          inicio?: string
          timbrado?: string
          vencimiento?: string
        }
        Relationships: [
          {
            foreignKeyName: "timbrados_fk_establecimiento_fkey"
            columns: ["fk_establecimiento"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id_establecimiento"]
          },
        ]
      }
      tipo_contribuyente: {
        Row: {
          codigo_contribuyente: number
          created_at: string
          descripcion: string
          id_tipo_contribuyente: number
        }
        Insert: {
          codigo_contribuyente: number
          created_at?: string
          descripcion: string
          id_tipo_contribuyente?: never
        }
        Update: {
          codigo_contribuyente?: number
          created_at?: string
          descripcion?: string
          id_tipo_contribuyente?: never
        }
        Relationships: []
      }
      tipo_cuenta_contable: {
        Row: {
          created_at: string
          descripcion: string | null
          id: number
          nombre: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      tipo_documento: {
        Row: {
          cod_tipodoc: number
          created_at: string
          descripcion_tipodoc: string
        }
        Insert: {
          cod_tipodoc: number
          created_at?: string
          descripcion_tipodoc: string
        }
        Update: {
          cod_tipodoc?: number
          created_at?: string
          descripcion_tipodoc?: string
        }
        Relationships: []
      }
      tipo_factura: {
        Row: {
          created_at: string
          descripcion: string | null
          id_tipo_factura: number
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          id_tipo_factura?: never
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          id_tipo_factura?: never
        }
        Relationships: []
      }
      tipo_habitacion: {
        Row: {
          capacidad: number
          created_at: string
          descripcion: string
          id: number
          nombre: string
        }
        Insert: {
          capacidad: number
          created_at?: string
          descripcion: string
          id?: number
          nombre: string
        }
        Update: {
          capacidad?: number
          created_at?: string
          descripcion?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      tipo_operacion: {
        Row: {
          codigo_tipo_op: string
          created_at: string
          id_tipo_operacion: number
        }
        Insert: {
          codigo_tipo_op: string
          created_at?: string
          id_tipo_operacion?: never
        }
        Update: {
          codigo_tipo_op?: string
          created_at?: string
          id_tipo_operacion?: never
        }
        Relationships: []
      }
      tipo_regimen: {
        Row: {
          codigo_regimen: number
          created_at: string
          descripcion: string
          id_regimen: number
        }
        Insert: {
          codigo_regimen: number
          created_at?: string
          descripcion: string
          id_regimen?: never
        }
        Update: {
          codigo_regimen?: number
          created_at?: string
          descripcion?: string
          id_regimen?: never
        }
        Relationships: []
      }
      transferencias_fondos: {
        Row: {
          created_at: string
          estado: string
          fecha: string
          fk_establecimientos: number
          fk_fondo_destino: number
          fk_fondo_origen: number
          id: number
          monto: number
          observacion: string | null
          tenant_id: number
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha?: string
          fk_establecimientos: number
          fk_fondo_destino: number
          fk_fondo_origen: number
          id?: never
          monto: number
          observacion?: string | null
          tenant_id?: number
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          fk_establecimientos?: number
          fk_fondo_destino?: number
          fk_fondo_origen?: number
          id?: never
          monto?: number
          observacion?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_fondos_destino_fkey"
            columns: ["fk_fondo_destino"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_fondos_establecimiento_fkey"
            columns: ["fk_establecimientos"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id_establecimiento"]
          },
          {
            foreignKeyName: "transferencias_fondos_origen_fkey"
            columns: ["fk_fondo_origen"]
            isOneToOne: false
            referencedRelation: "cuentas_fondos"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades_medida: {
        Row: {
          cod_unidades_medida: number
          created_at: string
          descripcion: string
          id_unidades: number
          representacion: string
        }
        Insert: {
          cod_unidades_medida: number
          created_at?: string
          descripcion: string
          id_unidades?: never
          representacion: string
        }
        Update: {
          cod_unidades_medida?: number
          created_at?: string
          descripcion?: string
          id_unidades?: never
          representacion?: string
        }
        Relationships: []
      }
      usuario: {
        Row: {
          auth_id: string | null
          correo: string
          created_at: string
          documento: string
          estado: string | null
          fk_cargo: number
          fk_tipo_doc: number
          id_usuario: number
          nombre: string
          telefono: string | null
          tenant_id: number
          usuario: string
        }
        Insert: {
          auth_id?: string | null
          correo: string
          created_at?: string
          documento: string
          estado?: string | null
          fk_cargo: number
          fk_tipo_doc: number
          id_usuario?: never
          nombre: string
          telefono?: string | null
          tenant_id?: number
          usuario: string
        }
        Update: {
          auth_id?: string | null
          correo?: string
          created_at?: string
          documento?: string
          estado?: string | null
          fk_cargo?: number
          fk_tipo_doc?: number
          id_usuario?: never
          nombre?: string
          telefono?: string | null
          tenant_id?: number
          usuario?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_fk_cargo_fkey"
            columns: ["fk_cargo"]
            isOneToOne: false
            referencedRelation: "cargo"
            referencedColumns: ["id_cargo"]
          },
          {
            foreignKeyName: "usuarios_fk_tipo_doc_fkey"
            columns: ["fk_tipo_doc"]
            isOneToOne: false
            referencedRelation: "tipo_documento"
            referencedColumns: ["cod_tipodoc"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_cerrar_mes: {
        Args: { p_anio: number; p_mes: number }
        Returns: undefined
      }
      fn_reabrir_mes: {
        Args: { p_anio: number; p_mes: number }
        Returns: undefined
      }
      fn_rep_resultado: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          mes: string
          fk_categoria: number
          categoria: string
          tipo: string
          monto: number
        }[]
      }
      fn_rep_cxc: {
        Args: { p_corte?: string | null }
        Returns: {
          fk_cliente: number
          cliente: string
          documento: string
          id_factura: number
          nro: string
          fecha_emision: string
          fecha_vencimiento: string
          total_general: number
          saldo_pendiente: number
          dias_vencido: number
          bucket: string
        }[]
      }
      fn_rep_cxp: {
        Args: { p_corte?: string | null }
        Returns: {
          fk_proveedor: number
          proveedor: string
          ruc: string | null
          id_gasto: number
          nro_comprobante: string | null
          fecha: string
          fecha_vencimiento: string
          total: number
          saldo_pendiente: number
          dias_vencido: number
          bucket: string
        }[]
      }
      fn_rep_flujo_fondos: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          fk_fondo: number
          fondo: string
          tipo: string
          activo: boolean
          saldo_inicial: number
          ingresos: number
          egresos: number
          saldo_final: number
        }[]
      }
      fn_rep_movimientos_fondo: {
        Args: { p_fondo: number; p_desde: string; p_hasta: string }
        Returns: {
          fecha: string
          nro_asiento: number
          descripcion: string
          origen_tipo: string
          fk_origen: number
          debe: number
          haber: number
          saldo_acumulado: number
        }[]
      }
      fn_rep_libro_iva: {
        Args: { p_anio: number }
        Returns: {
          mes: number
          base_ventas_10: number
          base_ventas_5: number
          base_ventas_exentas: number
          iva_debito: number
          compras_gravadas_10: number
          compras_gravadas_5: number
          compras_exentas: number
          iva_credito: number
          iva_a_pagar: number
        }[]
      }
      fn_landing_catalogo: {
        Args: { p_slug: string }
        Returns: Json | null
      }
      fn_landing_ocupacion: {
        Args: { p_slug: string; p_desde: string; p_hasta: string }
        Returns: { fk_habitacion: number }[]
      }
      fn_registrar_reserva_landing: {
        Args: { p_slug: string; p_payload: Json }
        Returns: Json
      }
      fn_mis_hoteles: {
        Args: Record<PropertyKey, never>
        Returns: {
          tenant_id: number
          nombre: string
          slug: string
          estado: string
          trial_fin: string | null
          id_usuario: number
          cargo: string
          es_activo: boolean
        }[]
      }
      current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      current_usuario_id: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      marcar_notificacion_leida: {
        Args: { p_id: number }
        Returns: undefined
      }
      marcar_todas_notificaciones_leidas: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema["Enums"]
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema["CompositeTypes"]
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
