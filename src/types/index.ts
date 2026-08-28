// Sistema Cristaliris — Core Types

export interface Sede {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  estado_activa: boolean;
}

// Roles del sistema. DEBE coincidir exactamente con el enum `app_role` de la BD
// (ver supabase/migrations y src/integrations/supabase/types.ts).
export type AppRole =
  | 'admin'
  | 'optometra'
  | 'asesor_comercial'
  | 'auxiliar_optica'
  | 'mensajero'
  | 'contador'
  | 'visualizador';

/** @deprecated Usa `AppRole`. Se mantiene como alias por compatibilidad. */
export type RolUsuario = AppRole;

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

/**
 * Estados del flujo de producto (README 3.2), en ORDEN de avance.
 *
 * Debe contener los 11 valores del enum `estado_producto` de la BD y respetar
 * el mismo orden que `ORDEN_FLUJO_ESTADOS` (src/lib/businessDays.ts): esta
 * lista es la que dibuja las columnas del Kanban y alimenta los selectores de
 * ScanQR, así que un estado ausente aquí hace DESAPARECER del tablero a los
 * productos que estén en él (y no se puede avanzar por QR).
 *
 * `alistamiento` no aparece en el README pero sí en el enum y en el código, y
 * ocurre entre la creación del pedido y el envío al laboratorio.
 *
 * `color` son clases de Tailwind (tokens semánticos del tema) para las
 * insignias de estado; la intensidad crece a medida que avanza el flujo.
 */
export const ESTADOS_PRODUCTO: { key: EstadoProducto; label: string; color: string }[] = [
  { key: 'pedido_creado', label: 'Pedido Creado', color: 'bg-muted text-muted-foreground border-muted-foreground/30' },
  { key: 'alistamiento', label: 'Alistamiento', color: 'bg-secondary text-secondary-foreground border-border' },
  { key: 'enviado_laboratorio', label: 'Envío a Laboratorio', color: 'bg-info/15 text-info border-info/30' },
  { key: 'recibido_laboratorio', label: 'Recibido en Laboratorio', color: 'bg-info/25 text-info border-info/40' },
  { key: 'en_produccion', label: 'Producción', color: 'bg-warning/15 text-warning border-warning/30' },
  { key: 'producido', label: 'Producido', color: 'bg-warning/25 text-warning border-warning/40' },
  { key: 'en_transito', label: 'En Tránsito', color: 'bg-primary/15 text-primary border-primary/30' },
  { key: 'recibido_optica', label: 'Recibido en Óptica', color: 'bg-primary/25 text-primary border-primary/40' },
  { key: 'control_calidad', label: 'Control de Calidad', color: 'bg-accent text-accent-foreground border-border' },
  { key: 'listo_entrega', label: 'Listo para Entrega', color: 'bg-success/15 text-success border-success/30' },
  { key: 'entregado', label: 'Entregado', color: 'bg-success/30 text-success border-success/50' },
];

/** Etiqueta en español del estado (o el propio código legible si no existe). */
export function etiquetaEstadoProducto(estado: string): string {
  return ESTADOS_PRODUCTO.find((e) => e.key === estado)?.label ?? estado.replace(/_/g, ' ');
}

/** Clases de color de la insignia del estado. */
export function colorEstadoProducto(estado: string): string {
  return (
    ESTADOS_PRODUCTO.find((e) => e.key === estado)?.color ??
    'bg-muted text-muted-foreground border-muted-foreground/30'
  );
}

export interface OrdenProducto {
  id: string;
  orden_id: string;
  numero_orden?: number | null;
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
  numero_montura?: string | null;
  medidas_progresivo?: Record<string, any> | null;
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
