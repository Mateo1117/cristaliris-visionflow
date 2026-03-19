// Sistema Cristaliris — Core Types

export interface Sede {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  estado_activa: boolean;
}

export type RolUsuario = 'administrador' | 'optometra' | 'asesor_comercial' | 'auxiliar_optica' | 'mensajero' | 'contador' | 'visualizador';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  sedes_asignadas: string[];
  estado_activo: boolean;
  ultimo_acceso: string;
}

export interface Paciente {
  id: string;
  tipo_documento: 'CC' | 'CE' | 'TI' | 'PA' | 'NIT';
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  genero: 'M' | 'F' | 'O';
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  departamento: string;
  empresa_id?: string;
  modalidad_pago: 'contado' | 'nomina';
  sede_registro: string;
  fecha_registro: string;
  es_fuera_bogota: boolean;
}

export interface Empresa {
  id: string;
  nit: string;
  razon_social: string;
  porcentaje_descuento: 45 | 50;
  contacto_rrhh: string;
  email: string;
  telefono: string;
  estado_activa: boolean;
}

export type EstadoCita = 'agendada' | 'confirmada' | 'asistio' | 'no_asistio' | 'cancelada';

export interface Cita {
  id: string;
  paciente_id: string;
  paciente_nombre: string;
  optometra_id: string;
  optometra_nombre: string;
  sede_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoCita;
  origen: 'bot' | 'manual' | 'crm';
  observaciones?: string;
}

export type EstadoProducto =
  | 'pedido_creado'
  | 'alistamiento'
  | 'enviado_laboratorio'
  | 'recibido_laboratorio'
  | 'en_produccion'
  | 'producido'
  | 'en_transito'
  | 'recibido_optica'
  | 'control_calidad'
  | 'listo_entrega'
  | 'entregado';

export const ESTADOS_PRODUCTO: { key: EstadoProducto; label: string }[] = [
  { key: 'pedido_creado', label: 'Pedido Creado' },
  { key: 'alistamiento', label: 'Alistamiento' },
  { key: 'enviado_laboratorio', label: 'Envío a Laboratorio' },
  { key: 'en_produccion', label: 'Producción' },
  { key: 'producido', label: 'Producido' },
  { key: 'recibido_optica', label: 'Recibido en Óptica' },
  { key: 'control_calidad', label: 'Control de Calidad' },
  { key: 'listo_entrega', label: 'Listo para Entrega' },
  { key: 'entregado', label: 'Entregado' },
];

export interface OrdenProducto {
  id: string;
  orden_id: string;
  paciente_nombre: string;
  tipo_producto: 'lente' | 'montura' | 'insumo';
  tipo_lente_tiempo?: string | null;
  descripcion: string;
  laboratorio_nombre: string;
  estado_actual: EstadoProducto;
  fecha_creacion: string;
  dias_en_estado: number;
  tiempo_esperado_dias: number;
  es_garantia: boolean;
  es_reproceso: boolean;
  precio_venta: number;
  costo_laboratorio: number;
  costo_montura: number;
  costo_lente: number;
  costo_insumos: number;
  comision_financiera: number;
  utilidad_calculada: number;
}

export interface Orden {
  id: string;
  paciente_id: string;
  paciente_nombre: string;
  asesor_nombre: string;
  sede_nombre: string;
  fecha_creacion: string;
  modalidad_pago: string;
  total_final: number;
  saldo_pendiente: number;
  estado_pago: 'pendiente' | 'parcial' | 'pagado';
  productos: OrdenProducto[];
}

export interface KPIData {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: string;
}
