import type { Paciente, Cita, OrdenProducto, KPIData, EstadoProducto } from '@/types';

export const mockPacientes: Paciente[] = [
  { id: '1', tipo_documento: 'CC', numero_documento: '1023456789', nombres: 'María', apellidos: 'García López', fecha_nacimiento: '1985-03-15', genero: 'F', telefono: '3101234567', email: 'maria.garcia@email.com', direccion: 'Cra 15 #45-67', ciudad: 'Bogotá', departamento: 'Cundinamarca', modalidad_pago: 'contado', sede_registro: 'Sede Norte', fecha_registro: '2024-01-10', es_fuera_bogota: false },
  { id: '2', tipo_documento: 'CC', numero_documento: '80234567', nombres: 'Carlos', apellidos: 'Rodríguez Martínez', fecha_nacimiento: '1978-07-22', genero: 'M', telefono: '3209876543', email: 'carlos.rodriguez@email.com', direccion: 'Calle 100 #20-30', ciudad: 'Bogotá', departamento: 'Cundinamarca', empresa_id: '1', modalidad_pago: 'nomina', sede_registro: 'Sede Norte', fecha_registro: '2024-02-05', es_fuera_bogota: false },
  { id: '3', tipo_documento: 'CC', numero_documento: '52345678', nombres: 'Ana', apellidos: 'Martínez Soto', fecha_nacimiento: '1992-11-08', genero: 'F', telefono: '3156789012', email: 'ana.martinez@email.com', direccion: 'Av 68 #12-34', ciudad: 'Bogotá', departamento: 'Cundinamarca', modalidad_pago: 'contado', sede_registro: 'Sede Sur', fecha_registro: '2024-03-18', es_fuera_bogota: false },
  { id: '4', tipo_documento: 'CC', numero_documento: '79876543', nombres: 'Luis', apellidos: 'Hernández Díaz', fecha_nacimiento: '1990-05-30', genero: 'M', telefono: '3004567890', email: 'luis.hernandez@email.com', direccion: 'Cra 7 #80-15', ciudad: 'Medellín', departamento: 'Antioquia', modalidad_pago: 'contado', sede_registro: 'Sede Norte', fecha_registro: '2024-04-02', es_fuera_bogota: true },
  { id: '5', tipo_documento: 'CE', numero_documento: '456789', nombres: 'Patricia', apellidos: 'Moreno Vega', fecha_nacimiento: '1988-09-12', genero: 'F', telefono: '3178901234', email: 'patricia.moreno@email.com', direccion: 'Calle 72 #10-45', ciudad: 'Bogotá', departamento: 'Cundinamarca', empresa_id: '2', modalidad_pago: 'nomina', sede_registro: 'Sede Norte', fecha_registro: '2024-05-15', es_fuera_bogota: false },
  { id: '6', tipo_documento: 'CC', numero_documento: '1098765432', nombres: 'Andrés', apellidos: 'Castro Ruiz', fecha_nacimiento: '1995-01-25', genero: 'M', telefono: '3112345678', email: 'andres.castro@email.com', direccion: 'Cra 30 #55-20', ciudad: 'Bogotá', departamento: 'Cundinamarca', modalidad_pago: 'contado', sede_registro: 'Sede Sur', fecha_registro: '2024-06-01', es_fuera_bogota: false },
];

export const mockCitas: Cita[] = [
  { id: '1', paciente_id: '1', paciente_nombre: 'María García', optometra_id: 'opt1', optometra_nombre: 'Dr. Ramírez', sede_id: 's1', fecha: '2026-03-11', hora_inicio: '08:00', hora_fin: '08:20', estado: 'confirmada', origen: 'manual' },
  { id: '2', paciente_id: '2', paciente_nombre: 'Carlos Rodríguez', optometra_id: 'opt1', optometra_nombre: 'Dr. Ramírez', sede_id: 's1', fecha: '2026-03-11', hora_inicio: '08:20', hora_fin: '08:40', estado: 'agendada', origen: 'bot' },
  { id: '3', paciente_id: '3', paciente_nombre: 'Ana Martínez', optometra_id: 'opt2', optometra_nombre: 'Dra. López', sede_id: 's1', fecha: '2026-03-11', hora_inicio: '09:00', hora_fin: '09:20', estado: 'confirmada', origen: 'manual' },
  { id: '4', paciente_id: '4', paciente_nombre: 'Luis Hernández', optometra_id: 'opt1', optometra_nombre: 'Dr. Ramírez', sede_id: 's1', fecha: '2026-03-11', hora_inicio: '10:00', hora_fin: '10:20', estado: 'asistio', origen: 'crm' },
  { id: '5', paciente_id: '5', paciente_nombre: 'Patricia Moreno', optometra_id: 'opt2', optometra_nombre: 'Dra. López', sede_id: 's1', fecha: '2026-03-11', hora_inicio: '10:40', hora_fin: '11:00', estado: 'agendada', origen: 'bot' },
  { id: '6', paciente_id: '6', paciente_nombre: 'Andrés Castro', optometra_id: 'opt1', optometra_nombre: 'Dr. Ramírez', sede_id: 's1', fecha: '2026-03-12', hora_inicio: '08:00', hora_fin: '08:20', estado: 'agendada', origen: 'manual' },
];

const estados: EstadoProducto[] = ['pedido_creado', 'enviado_laboratorio', 'recibido_laboratorio', 'en_produccion', 'producido', 'en_transito', 'recibido_optica', 'control_calidad', 'listo_entrega', 'entregado'];

export const mockProductos: OrdenProducto[] = [
  { id: 'p1', orden_id: 'o1', paciente_nombre: 'María García', tipo_producto: 'lente', descripcion: 'Progresivo Varilux X', laboratorio_nombre: 'Servioptica', estado_actual: 'pedido_creado', fecha_creacion: '2026-03-09', dias_en_estado: 2, tiempo_esperado_dias: 3, es_garantia: false, es_reproceso: false },
  { id: 'p2', orden_id: 'o1', paciente_nombre: 'María García', tipo_producto: 'montura', descripcion: 'Ray-Ban RB5228', laboratorio_nombre: 'N/A', estado_actual: 'listo_entrega', fecha_creacion: '2026-03-05', dias_en_estado: 1, tiempo_esperado_dias: 1, es_garantia: false, es_reproceso: false },
  { id: 'p3', orden_id: 'o2', paciente_nombre: 'Carlos Rodríguez', tipo_producto: 'lente', descripcion: 'Bifocal FT-28 CR39', laboratorio_nombre: 'Industrias Ópticas', estado_actual: 'en_produccion', fecha_creacion: '2026-03-07', dias_en_estado: 3, tiempo_esperado_dias: 3, es_garantia: false, es_reproceso: false },
  { id: 'p4', orden_id: 'o3', paciente_nombre: 'Ana Martínez', tipo_producto: 'lente', descripcion: 'Monofocal AR Blue', laboratorio_nombre: 'Servioptica', estado_actual: 'enviado_laboratorio', fecha_creacion: '2026-03-10', dias_en_estado: 1, tiempo_esperado_dias: 1, es_garantia: false, es_reproceso: false },
  { id: 'p5', orden_id: 'o4', paciente_nombre: 'Luis Hernández', tipo_producto: 'lente', descripcion: 'Progresivo Hoyalux iD', laboratorio_nombre: 'Hoya', estado_actual: 'control_calidad', fecha_creacion: '2026-03-03', dias_en_estado: 1, tiempo_esperado_dias: 3, es_garantia: false, es_reproceso: false },
  { id: 'p6', orden_id: 'o5', paciente_nombre: 'Patricia Moreno', tipo_producto: 'lente', descripcion: 'Monofocal Transitions', laboratorio_nombre: 'Essilor', estado_actual: 'recibido_optica', fecha_creacion: '2026-03-04', dias_en_estado: 2, tiempo_esperado_dias: 1, es_garantia: true, es_reproceso: false },
  { id: 'p7', orden_id: 'o6', paciente_nombre: 'Andrés Castro', tipo_producto: 'lente', descripcion: 'Ocupacional Digital', laboratorio_nombre: 'Servioptica', estado_actual: 'producido', fecha_creacion: '2026-03-06', dias_en_estado: 1, tiempo_esperado_dias: 3, es_garantia: false, es_reproceso: false },
  { id: 'p8', orden_id: 'o6', paciente_nombre: 'Andrés Castro', tipo_producto: 'montura', descripcion: 'Oakley OX8046', laboratorio_nombre: 'N/A', estado_actual: 'entregado', fecha_creacion: '2026-03-01', dias_en_estado: 0, tiempo_esperado_dias: 1, es_garantia: false, es_reproceso: false },
  { id: 'p9', orden_id: 'o7', paciente_nombre: 'Rosa Jiménez', tipo_producto: 'lente', descripcion: 'Monofocal CR39', laboratorio_nombre: 'Industrias Ópticas', estado_actual: 'en_transito', fecha_creacion: '2026-03-05', dias_en_estado: 1, tiempo_esperado_dias: 1, es_garantia: false, es_reproceso: true },
  { id: 'p10', orden_id: 'o8', paciente_nombre: 'Fernando Pérez', tipo_producto: 'lente', descripcion: 'Progresivo Zeiss', laboratorio_nombre: 'Zeiss', estado_actual: 'recibido_laboratorio', fecha_creacion: '2026-03-08', dias_en_estado: 2, tiempo_esperado_dias: 3, es_garantia: false, es_reproceso: false },
];

export const mockKPIs: KPIData[] = [
  { label: 'Ventas del Mes', value: '$12.450.000', change: 12.5, changeLabel: 'vs mes anterior' },
  { label: 'Órdenes Activas', value: 34, change: -3, changeLabel: 'vs semana anterior' },
  { label: 'Utilidad del Mes', value: '$5.230.000', change: 8.2, changeLabel: 'vs mes anterior' },
  { label: 'Pacientes Nuevos', value: 28, change: 15, changeLabel: 'vs mes anterior' },
  { label: 'Tasa de Cierre', value: '68%', change: 5, changeLabel: 'vs mes anterior' },
  { label: 'Tiempo Prom. Entrega', value: '2.3 días', change: -0.5, changeLabel: 'vs mes anterior' },
  { label: 'Garantías', value: 3, change: -2, changeLabel: 'vs mes anterior' },
  { label: 'Cartera Pendiente', value: '$4.120.000', change: -8, changeLabel: 'vs mes anterior' },
];

export const mockVentasMensuales = [
  { mes: 'Ene', ventas: 9800000, utilidad: 4100000 },
  { mes: 'Feb', ventas: 11200000, utilidad: 4700000 },
  { mes: 'Mar', ventas: 12450000, utilidad: 5230000 },
  { mes: 'Abr', ventas: 10900000, utilidad: 4500000 },
  { mes: 'May', ventas: 13100000, utilidad: 5500000 },
  { mes: 'Jun', ventas: 11800000, utilidad: 4900000 },
];

export const mockProductosPorEstado = estados.map((estado, i) => ({
  estado,
  cantidad: [3, 2, 1, 2, 1, 1, 2, 1, 2, 4][i],
}));

export const mockLaboratoriosCumplimiento = [
  { nombre: 'Servioptica', cumplimiento: 92, ordenes: 45 },
  { nombre: 'Industrias Ópticas', cumplimiento: 85, ordenes: 32 },
  { nombre: 'Hoya', cumplimiento: 95, ordenes: 18 },
  { nombre: 'Essilor', cumplimiento: 88, ordenes: 25 },
  { nombre: 'Zeiss', cumplimiento: 97, ordenes: 12 },
];
