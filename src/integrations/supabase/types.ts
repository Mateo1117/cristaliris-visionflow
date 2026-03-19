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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      abonos: {
        Row: {
          created_at: string
          fecha_abono: string
          id: string
          medio_pago: string
          monto: number
          observaciones: string | null
          orden_id: string
          paciente_id: string
          referencia_pago: string | null
          registrado_por: string | null
          soporte_url: string | null
        }
        Insert: {
          created_at?: string
          fecha_abono?: string
          id?: string
          medio_pago: string
          monto: number
          observaciones?: string | null
          orden_id: string
          paciente_id: string
          referencia_pago?: string | null
          registrado_por?: string | null
          soporte_url?: string | null
        }
        Update: {
          created_at?: string
          fecha_abono?: string
          id?: string
          medio_pago?: string
          monto?: number
          observaciones?: string | null
          orden_id?: string
          paciente_id?: string
          referencia_pago?: string | null
          registrado_por?: string | null
          soporte_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abonos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abonos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_diaria: {
        Row: {
          created_at: string
          diferencia: number | null
          egresos: number | null
          estado: string
          fecha: string
          hora_apertura: string
          hora_cierre: string | null
          id: string
          ingresos_efectivo: number | null
          ingresos_tarjeta: number | null
          ingresos_transferencia: number | null
          monto_apertura: number
          monto_cierre: number | null
          observaciones: string | null
          sede_id: string | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          diferencia?: number | null
          egresos?: number | null
          estado?: string
          fecha?: string
          hora_apertura?: string
          hora_cierre?: string | null
          id?: string
          ingresos_efectivo?: number | null
          ingresos_tarjeta?: number | null
          ingresos_transferencia?: number | null
          monto_apertura?: number
          monto_cierre?: number | null
          observaciones?: string | null
          sede_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          diferencia?: number | null
          egresos?: number | null
          estado?: string
          fecha?: string
          hora_apertura?: string
          hora_cierre?: string | null
          id?: string
          ingresos_efectivo?: number | null
          ingresos_tarjeta?: number | null
          ingresos_transferencia?: number | null
          monto_apertura?: number
          monto_cierre?: number | null
          observaciones?: string | null
          sede_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_diaria_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      citas: {
        Row: {
          created_at: string
          estado: string
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          observaciones: string | null
          optometra_id: string | null
          origen: string | null
          paciente_id: string
          sede_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha: string
          hora_fin: string
          hora_inicio: string
          id?: string
          observaciones?: string | null
          optometra_id?: string | null
          origen?: string | null
          paciente_id: string
          sede_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
          observaciones?: string | null
          optometra_id?: string | null
          origen?: string | null
          paciente_id?: string
          sede_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "citas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizaciones: {
        Row: {
          asesor_id: string | null
          created_at: string
          estado: string
          fecha_vencimiento: string | null
          id: string
          items: Json
          orden_id_convertida: string | null
          paciente_id: string
          total_estimado: number | null
          updated_at: string
        }
        Insert: {
          asesor_id?: string | null
          created_at?: string
          estado?: string
          fecha_vencimiento?: string | null
          id?: string
          items?: Json
          orden_id_convertida?: string | null
          paciente_id: string
          total_estimado?: number | null
          updated_at?: string
        }
        Update: {
          asesor_id?: string | null
          created_at?: string
          estado?: string
          fecha_vencimiento?: string | null
          id?: string
          items?: Json
          orden_id_convertida?: string | null
          paciente_id?: string
          total_estimado?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_orden_id_convertida_fkey"
            columns: ["orden_id_convertida"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          contacto_rrhh: string | null
          created_at: string
          email: string | null
          estado_activa: boolean
          id: string
          nit: string
          porcentaje_descuento: number
          razon_social: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          contacto_rrhh?: string | null
          created_at?: string
          email?: string | null
          estado_activa?: boolean
          id?: string
          nit: string
          porcentaje_descuento?: number
          razon_social: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          contacto_rrhh?: string | null
          created_at?: string
          email?: string | null
          estado_activa?: boolean
          id?: string
          nit?: string
          porcentaje_descuento?: number
          razon_social?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      estados_producto: {
        Row: {
          estado_anterior: Database["public"]["Enums"]["estado_producto"] | null
          estado_nuevo: Database["public"]["Enums"]["estado_producto"]
          fecha_cambio: string
          id: string
          ip_registro: string | null
          justificacion: string | null
          metodo: string | null
          orden_producto_id: string
          usuario_id: string | null
        }
        Insert: {
          estado_anterior?:
            | Database["public"]["Enums"]["estado_producto"]
            | null
          estado_nuevo: Database["public"]["Enums"]["estado_producto"]
          fecha_cambio?: string
          id?: string
          ip_registro?: string | null
          justificacion?: string | null
          metodo?: string | null
          orden_producto_id: string
          usuario_id?: string | null
        }
        Update: {
          estado_anterior?:
            | Database["public"]["Enums"]["estado_producto"]
            | null
          estado_nuevo?: Database["public"]["Enums"]["estado_producto"]
          fecha_cambio?: string
          id?: string
          ip_registro?: string | null
          justificacion?: string | null
          metodo?: string | null
          orden_producto_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estados_producto_orden_producto_id_fkey"
            columns: ["orden_producto_id"]
            isOneToOne: false
            referencedRelation: "orden_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      festivos: {
        Row: {
          anio: number | null
          descripcion: string | null
          fecha: string
          id: string
        }
        Insert: {
          anio?: number | null
          descripcion?: string | null
          fecha: string
          id?: string
        }
        Update: {
          anio?: number | null
          descripcion?: string | null
          fecha?: string
          id?: string
        }
        Relationships: []
      }
      garantias: {
        Row: {
          ciclo: number
          created_at: string
          envio_asumido_por: string | null
          estado: string | null
          fecha_resolucion: string | null
          fecha_solicitud: string
          guia_envio: string | null
          id: string
          laboratorio_id: string | null
          motivo: string
          observaciones: string | null
          orden_producto_id: string
          subcodigo: string
          updated_at: string
        }
        Insert: {
          ciclo?: number
          created_at?: string
          envio_asumido_por?: string | null
          estado?: string | null
          fecha_resolucion?: string | null
          fecha_solicitud?: string
          guia_envio?: string | null
          id?: string
          laboratorio_id?: string | null
          motivo: string
          observaciones?: string | null
          orden_producto_id: string
          subcodigo: string
          updated_at?: string
        }
        Update: {
          ciclo?: number
          created_at?: string
          envio_asumido_por?: string | null
          estado?: string | null
          fecha_resolucion?: string | null
          fecha_solicitud?: string
          guia_envio?: string | null
          id?: string
          laboratorio_id?: string | null
          motivo?: string
          observaciones?: string | null
          orden_producto_id?: string
          subcodigo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "garantias_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_orden_producto_id_fkey"
            columns: ["orden_producto_id"]
            isOneToOne: false
            referencedRelation: "orden_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      historias_clinicas: {
        Row: {
          agudeza_visual_od: string | null
          agudeza_visual_oi: string | null
          altura_pupilar_od: number | null
          altura_pupilar_oi: number | null
          anamnesis: string | null
          antecedentes: string | null
          codigo_cie10: string | null
          created_at: string
          diagnostico: string | null
          distancia_pupilar: number | null
          distancia_pupilar_od: number | null
          distancia_pupilar_oi: number | null
          distancia_vertice: number | null
          fecha_consulta: string
          firma_optometra: string | null
          formula_od_adicion: number | null
          formula_od_cilindro: number | null
          formula_od_eje: number | null
          formula_od_esfera: number | null
          formula_oi_adicion: number | null
          formula_oi_cilindro: number | null
          formula_oi_eje: number | null
          formula_oi_esfera: number | null
          id: string
          observaciones: string | null
          optometra_id: string | null
          paciente_id: string
          plan_manejo: string | null
          refraccion_od: string | null
          refraccion_oi: string | null
          updated_at: string
        }
        Insert: {
          agudeza_visual_od?: string | null
          agudeza_visual_oi?: string | null
          altura_pupilar_od?: number | null
          altura_pupilar_oi?: number | null
          anamnesis?: string | null
          antecedentes?: string | null
          codigo_cie10?: string | null
          created_at?: string
          diagnostico?: string | null
          distancia_pupilar?: number | null
          distancia_pupilar_od?: number | null
          distancia_pupilar_oi?: number | null
          distancia_vertice?: number | null
          fecha_consulta?: string
          firma_optometra?: string | null
          formula_od_adicion?: number | null
          formula_od_cilindro?: number | null
          formula_od_eje?: number | null
          formula_od_esfera?: number | null
          formula_oi_adicion?: number | null
          formula_oi_cilindro?: number | null
          formula_oi_eje?: number | null
          formula_oi_esfera?: number | null
          id?: string
          observaciones?: string | null
          optometra_id?: string | null
          paciente_id: string
          plan_manejo?: string | null
          refraccion_od?: string | null
          refraccion_oi?: string | null
          updated_at?: string
        }
        Update: {
          agudeza_visual_od?: string | null
          agudeza_visual_oi?: string | null
          altura_pupilar_od?: number | null
          altura_pupilar_oi?: number | null
          anamnesis?: string | null
          antecedentes?: string | null
          codigo_cie10?: string | null
          created_at?: string
          diagnostico?: string | null
          distancia_pupilar?: number | null
          distancia_pupilar_od?: number | null
          distancia_pupilar_oi?: number | null
          distancia_vertice?: number | null
          fecha_consulta?: string
          firma_optometra?: string | null
          formula_od_adicion?: number | null
          formula_od_cilindro?: number | null
          formula_od_eje?: number | null
          formula_od_esfera?: number | null
          formula_oi_adicion?: number | null
          formula_oi_cilindro?: number | null
          formula_oi_eje?: number | null
          formula_oi_esfera?: number | null
          id?: string
          observaciones?: string | null
          optometra_id?: string | null
          paciente_id?: string
          plan_manejo?: string | null
          refraccion_od?: string | null
          refraccion_oi?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "historias_clinicas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios_medicos: {
        Row: {
          activo: boolean
          created_at: string
          dia_semana: number
          duracion_cita: number
          hora_fin: string
          hora_inicio: string
          id: string
          medico_id: string
          sede_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          dia_semana: number
          duracion_cita?: number
          hora_fin: string
          hora_inicio: string
          id?: string
          medico_id: string
          sede_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          dia_semana?: number
          duracion_cita?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
          medico_id?: string
          sede_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "horarios_medicos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario: {
        Row: {
          cantidad_disponible: number
          codigo_referencia: string | null
          costo_unitario: number | null
          created_at: string
          descripcion: string | null
          estado: string | null
          id: string
          marca: string | null
          modelo: string | null
          precio_venta: number | null
          sede_id: string | null
          stock_minimo: number
          tipo: string
          ubicacion_estante: string | null
          updated_at: string
        }
        Insert: {
          cantidad_disponible?: number
          codigo_referencia?: string | null
          costo_unitario?: number | null
          created_at?: string
          descripcion?: string | null
          estado?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          precio_venta?: number | null
          sede_id?: string | null
          stock_minimo?: number
          tipo: string
          ubicacion_estante?: string | null
          updated_at?: string
        }
        Update: {
          cantidad_disponible?: number
          codigo_referencia?: string | null
          costo_unitario?: number | null
          created_at?: string
          descripcion?: string | null
          estado?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          precio_venta?: number | null
          sede_id?: string | null
          stock_minimo?: number
          tipo?: string
          ubicacion_estante?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratorios: {
        Row: {
          contacto: string | null
          created_at: string
          email: string | null
          estado_activo: boolean
          id: string
          nombre: string
          telefono: string | null
          tiempo_promedio_entrega: number | null
          updated_at: string
        }
        Insert: {
          contacto?: string | null
          created_at?: string
          email?: string | null
          estado_activo?: boolean
          id?: string
          nombre: string
          telefono?: string | null
          tiempo_promedio_entrega?: number | null
          updated_at?: string
        }
        Update: {
          contacto?: string | null
          created_at?: string
          email?: string | null
          estado_activo?: boolean
          id?: string
          nombre?: string
          telefono?: string | null
          tiempo_promedio_entrega?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      log_auditoria: {
        Row: {
          accion: string
          created_at: string
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          entidad: string
          entidad_id: string | null
          id: string
          ip: string | null
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          entidad: string
          entidad_id?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          entidad?: string
          entidad_id?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      movimientos_inventario: {
        Row: {
          cantidad: number
          cantidad_anterior: number
          cantidad_nueva: number
          created_at: string
          id: string
          inventario_id: string
          motivo: string | null
          orden_producto_id: string | null
          tipo_movimiento: string
          usuario_id: string | null
        }
        Insert: {
          cantidad: number
          cantidad_anterior: number
          cantidad_nueva: number
          created_at?: string
          id?: string
          inventario_id: string
          motivo?: string | null
          orden_producto_id?: string | null
          tipo_movimiento: string
          usuario_id?: string | null
        }
        Update: {
          cantidad?: number
          cantidad_anterior?: number
          cantidad_nueva?: number
          created_at?: string
          id?: string
          inventario_id?: string
          motivo?: string | null
          orden_producto_id?: string | null
          tipo_movimiento?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_orden_producto_id_fkey"
            columns: ["orden_producto_id"]
            isOneToOne: false
            referencedRelation: "orden_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_productos: {
        Row: {
          ciclo_garantia: number | null
          codigo_qr: string | null
          comision_financiera: number | null
          costo_insumos: number | null
          costo_laboratorio: number | null
          costo_lente: number | null
          costo_montura: number | null
          created_at: string
          descripcion: string
          es_garantia: boolean | null
          es_reproceso: boolean | null
          estado_actual: Database["public"]["Enums"]["estado_producto"]
          fecha_control_calidad: string | null
          fecha_entrega_real: string | null
          fecha_envio_lab: string | null
          fecha_listo_entrega: string | null
          fecha_recepcion_lab: string | null
          garantia_codigo: string | null
          id: string
          laboratorio_id: string | null
          lente_tipo: string | null
          montura_id: string | null
          numero_orden_laboratorio: string | null
          observaciones: string | null
          orden_id: string
          precio_venta: number | null
          tipo_lente_tiempo: string | null
          tipo_producto: string
          updated_at: string
          utilidad_calculada: number | null
        }
        Insert: {
          ciclo_garantia?: number | null
          codigo_qr?: string | null
          comision_financiera?: number | null
          costo_insumos?: number | null
          costo_laboratorio?: number | null
          costo_lente?: number | null
          costo_montura?: number | null
          created_at?: string
          descripcion: string
          es_garantia?: boolean | null
          es_reproceso?: boolean | null
          estado_actual?: Database["public"]["Enums"]["estado_producto"]
          fecha_control_calidad?: string | null
          fecha_entrega_real?: string | null
          fecha_envio_lab?: string | null
          fecha_listo_entrega?: string | null
          fecha_recepcion_lab?: string | null
          garantia_codigo?: string | null
          id?: string
          laboratorio_id?: string | null
          lente_tipo?: string | null
          montura_id?: string | null
          numero_orden_laboratorio?: string | null
          observaciones?: string | null
          orden_id: string
          precio_venta?: number | null
          tipo_lente_tiempo?: string | null
          tipo_producto: string
          updated_at?: string
          utilidad_calculada?: number | null
        }
        Update: {
          ciclo_garantia?: number | null
          codigo_qr?: string | null
          comision_financiera?: number | null
          costo_insumos?: number | null
          costo_laboratorio?: number | null
          costo_lente?: number | null
          costo_montura?: number | null
          created_at?: string
          descripcion?: string
          es_garantia?: boolean | null
          es_reproceso?: boolean | null
          estado_actual?: Database["public"]["Enums"]["estado_producto"]
          fecha_control_calidad?: string | null
          fecha_entrega_real?: string | null
          fecha_envio_lab?: string | null
          fecha_listo_entrega?: string | null
          fecha_recepcion_lab?: string | null
          garantia_codigo?: string | null
          id?: string
          laboratorio_id?: string | null
          lente_tipo?: string | null
          montura_id?: string | null
          numero_orden_laboratorio?: string | null
          observaciones?: string | null
          orden_id?: string
          precio_venta?: number | null
          tipo_lente_tiempo?: string | null
          tipo_producto?: string
          updated_at?: string
          utilidad_calculada?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orden_productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_productos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes: {
        Row: {
          aprobacion_nomina_estado: string | null
          asesor_id: string | null
          cotizacion_id: string | null
          created_at: string
          descuento_empresa: number | null
          descuento_porcentaje: number | null
          empresa_id: string | null
          estado_pago: string
          id: string
          modalidad_pago: string
          observaciones: string | null
          optometra_id: string | null
          paciente_id: string
          recargo_financiero: number | null
          saldo_pendiente: number | null
          sede_id: string | null
          soporte_pago_url: string | null
          subtotal: number | null
          total_final: number | null
          updated_at: string
        }
        Insert: {
          aprobacion_nomina_estado?: string | null
          asesor_id?: string | null
          cotizacion_id?: string | null
          created_at?: string
          descuento_empresa?: number | null
          descuento_porcentaje?: number | null
          empresa_id?: string | null
          estado_pago?: string
          id?: string
          modalidad_pago?: string
          observaciones?: string | null
          optometra_id?: string | null
          paciente_id: string
          recargo_financiero?: number | null
          saldo_pendiente?: number | null
          sede_id?: string | null
          soporte_pago_url?: string | null
          subtotal?: number | null
          total_final?: number | null
          updated_at?: string
        }
        Update: {
          aprobacion_nomina_estado?: string | null
          asesor_id?: string | null
          cotizacion_id?: string | null
          created_at?: string
          descuento_empresa?: number | null
          descuento_porcentaje?: number | null
          empresa_id?: string | null
          estado_pago?: string
          id?: string
          modalidad_pago?: string
          observaciones?: string | null
          optometra_id?: string | null
          paciente_id?: string
          recargo_financiero?: number | null
          saldo_pendiente?: number | null
          sede_id?: string | null
          soporte_pago_url?: string | null
          subtotal?: number | null
          total_final?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          apellidos: string
          ciudad: string | null
          created_at: string
          departamento: string | null
          direccion: string | null
          email: string | null
          empresa_id: string | null
          es_fuera_bogota: boolean
          fecha_nacimiento: string | null
          genero: string | null
          id: string
          modalidad_pago: string
          nombres: string
          numero_documento: string
          observaciones: string | null
          referido_por: string | null
          sede_registro: string | null
          telefono: string | null
          tipo_documento: string
          updated_at: string
        }
        Insert: {
          apellidos: string
          ciudad?: string | null
          created_at?: string
          departamento?: string | null
          direccion?: string | null
          email?: string | null
          empresa_id?: string | null
          es_fuera_bogota?: boolean
          fecha_nacimiento?: string | null
          genero?: string | null
          id?: string
          modalidad_pago?: string
          nombres: string
          numero_documento: string
          observaciones?: string | null
          referido_por?: string | null
          sede_registro?: string | null
          telefono?: string | null
          tipo_documento: string
          updated_at?: string
        }
        Update: {
          apellidos?: string
          ciudad?: string | null
          created_at?: string
          departamento?: string | null
          direccion?: string | null
          email?: string | null
          empresa_id?: string | null
          es_fuera_bogota?: boolean
          fecha_nacimiento?: string | null
          genero?: string | null
          id?: string
          modalidad_pago?: string
          nombres?: string
          numero_documento?: string
          observaciones?: string | null
          referido_por?: string | null
          sede_registro?: string | null
          telefono?: string | null
          tipo_documento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_sede_registro_fkey"
            columns: ["sede_registro"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          estado_activo: boolean
          id: string
          nombre: string
          sedes_asignadas: string[] | null
          telefono: string | null
          ultimo_acceso: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          estado_activo?: boolean
          id?: string
          nombre: string
          sedes_asignadas?: string[] | null
          telefono?: string | null
          ultimo_acceso?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          estado_activo?: boolean
          id?: string
          nombre?: string
          sedes_asignadas?: string[] | null
          telefono?: string | null
          ultimo_acceso?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sedes: {
        Row: {
          configuracion: Json | null
          created_at: string
          direccion: string | null
          estado_activa: boolean
          id: string
          nombre: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          configuracion?: Json | null
          created_at?: string
          direccion?: string | null
          estado_activa?: boolean
          id?: string
          nombre: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          configuracion?: Json | null
          created_at?: string
          direccion?: string | null
          estado_activa?: boolean
          id?: string
          nombre?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "optometra"
        | "asesor_comercial"
        | "auxiliar_optica"
        | "mensajero"
        | "contador"
        | "visualizador"
      estado_producto:
        | "pedido_creado"
        | "enviado_laboratorio"
        | "recibido_laboratorio"
        | "en_produccion"
        | "producido"
        | "en_transito"
        | "recibido_optica"
        | "control_calidad"
        | "listo_entrega"
        | "entregado"
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
    Enums: {
      app_role: [
        "admin",
        "optometra",
        "asesor_comercial",
        "auxiliar_optica",
        "mensajero",
        "contador",
        "visualizador",
      ],
      estado_producto: [
        "pedido_creado",
        "enviado_laboratorio",
        "recibido_laboratorio",
        "en_produccion",
        "producido",
        "en_transito",
        "recibido_optica",
        "control_calidad",
        "listo_entrega",
        "entregado",
      ],
    },
  },
} as const
