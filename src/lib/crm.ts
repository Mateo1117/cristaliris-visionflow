/**
 * CRM: pacientes que compraron y ya recibieron sus gafas.
 *
 * Cada fila de entrada es un producto de orden en etapa "entregado"; aquí se
 * agrupan por paciente con su historial de compras, totales, saldo y el
 * seguimiento que toca (llamada de satisfacción después de la entrega y
 * control anual), según los contactos registrados en crm_seguimientos.
 */

export interface ProductoEntregado {
  id: string;
  orden_id: string;
  descripcion: string | null;
  tipo_producto: string | null;
  numero_montura: string | null;
  precio_venta: number | null;
  fecha_entrega_real: string | null;
  updated_at?: string | null;
  laboratorio_nombre?: string | null;
  orden: {
    id: string;
    numero_orden: string | null;
    created_at: string;
    total_final: number | null;
    saldo_pendiente: number | null;
    paciente_id: string;
  };
  paciente: {
    id: string;
    nombres: string;
    apellidos: string;
    tipo_documento: string | null;
    numero_documento: string | null;
    telefono: string | null;
    email: string | null;
    ciudad: string | null;
    fecha_nacimiento: string | null;
    empresa: string | null;
  };
}

export interface Seguimiento {
  id: string;
  paciente_id: string;
  orden_id: string | null;
  tipo: TipoContacto;
  motivo: MotivoContacto;
  resultado: ResultadoContacto;
  nota: string | null;
  proximo_contacto: string | null;
  usuario_id: string | null;
  created_at: string;
}

export type TipoContacto = 'llamada' | 'whatsapp' | 'visita' | 'nota';
export type MotivoContacto = 'satisfaccion' | 'control_anual' | 'cobro' | 'promocion' | 'garantia' | 'otro';
export type ResultadoContacto = 'contactado' | 'no_contesta' | 'satisfecho' | 'insatisfecho' | 'agendo_cita' | 'no_interesado';

export const TIPO_CONTACTO: Record<TipoContacto, string> = {
  llamada: 'Llamada', whatsapp: 'WhatsApp', visita: 'Visita', nota: 'Nota',
};
export const MOTIVO_CONTACTO: Record<MotivoContacto, string> = {
  satisfaccion: 'Satisfacción', control_anual: 'Control anual', cobro: 'Cobro de saldo',
  promocion: 'Promoción', garantia: 'Garantía', otro: 'Otro',
};
export const RESULTADO_CONTACTO: Record<ResultadoContacto, string> = {
  contactado: 'Contactado', no_contesta: 'No contesta', satisfecho: 'Satisfecho',
  insatisfecho: 'Insatisfecho', agendo_cita: 'Agendó cita', no_interesado: 'No interesado',
};

/** Días después de la entrega para llamar a preguntar cómo le fue. */
export const DIAS_SATISFACCION = 8;
/** Meses después de la entrega para el control visual anual. */
export const MESES_CONTROL = 12;
/** Días de anticipación con que el control anual aparece como "próximo". */
export const AVISO_CONTROL_DIAS = 30;

export interface Compra {
  orden_id: string;
  numero_orden: string | null;
  fecha_compra: string;
  fecha_entrega: string;
  total: number;
  saldo: number;
  productos: Array<{ id: string; descripcion: string; montura: string | null; laboratorio: string | null; precio: number }>;
}

export type Pendiente = 'satisfaccion' | 'control_anual' | 'control_vencido' | 'contacto_programado' | 'saldo';

export interface ClienteCrm {
  paciente: ProductoEntregado['paciente'];
  compras: Compra[];
  totalComprado: number;
  saldo: number;
  primeraCompra: string;
  ultimaEntrega: string;
  diasDesdeEntrega: number;
  proximoControl: string;
  seguimientos: Seguimiento[];
  ultimoContacto: Seguimiento | null;
  /** Lo que toca hacer con este paciente hoy (vacío = al día). */
  pendientes: Pendiente[];
}

const DIA = 86_400_000;
const soloFecha = (iso: string) => iso.slice(0, 10);
const diasEntre = (desde: string, hasta: string) =>
  Math.floor((Date.parse(soloFecha(hasta)) - Date.parse(soloFecha(desde))) / DIA);

export const sumarMesesISO = (iso: string, meses: number) => {
  const d = new Date(`${soloFecha(iso)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
};

/**
 * Agrupa los productos entregados por paciente y calcula qué seguimiento le
 * corresponde a cada uno. `hoy` en formato YYYY-MM-DD.
 */
export function agruparClientes(filas: ProductoEntregado[], seguimientos: Seguimiento[], hoy: string): ClienteCrm[] {
  const porPaciente = new Map<string, { paciente: ProductoEntregado['paciente']; compras: Map<string, Compra> }>();

  for (const f of filas) {
    const entrega = f.fecha_entrega_real ?? f.updated_at ?? f.orden.created_at;
    let p = porPaciente.get(f.paciente.id);
    if (!p) { p = { paciente: f.paciente, compras: new Map() }; porPaciente.set(f.paciente.id, p); }
    let c = p.compras.get(f.orden.id);
    if (!c) {
      c = {
        orden_id: f.orden.id, numero_orden: f.orden.numero_orden, fecha_compra: f.orden.created_at,
        fecha_entrega: entrega, total: Number(f.orden.total_final) || 0, saldo: Number(f.orden.saldo_pendiente) || 0, productos: [],
      };
      p.compras.set(f.orden.id, c);
    }
    if (entrega > c.fecha_entrega) c.fecha_entrega = entrega;
    c.productos.push({
      id: f.id, descripcion: f.descripcion || f.tipo_producto || 'Producto', montura: f.numero_montura,
      laboratorio: f.laboratorio_nombre ?? null, precio: Number(f.precio_venta) || 0,
    });
  }

  const segPorPaciente = new Map<string, Seguimiento[]>();
  for (const s of seguimientos) {
    const l = segPorPaciente.get(s.paciente_id) ?? [];
    l.push(s);
    segPorPaciente.set(s.paciente_id, l);
  }

  return [...porPaciente.values()].map(({ paciente, compras }) => {
    const lista = [...compras.values()].sort((a, b) => b.fecha_entrega.localeCompare(a.fecha_entrega));
    const ultimaEntrega = lista[0].fecha_entrega;
    const segs = (segPorPaciente.get(paciente.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const proximoControl = sumarMesesISO(ultimaEntrega, MESES_CONTROL);
    const saldo = lista.reduce((s, c) => s + c.saldo, 0);

    // Contactos después de la última entrega, por motivo.
    const despues = segs.filter((s) => s.created_at >= soloFecha(ultimaEntrega));
    const hubo = (motivo: MotivoContacto) => despues.some((s) => s.motivo === motivo && s.resultado !== 'no_contesta');
    const dias = diasEntre(ultimaEntrega, hoy);
    const diasAlControl = diasEntre(hoy, proximoControl);

    const pendientes: Pendiente[] = [];
    if (dias >= DIAS_SATISFACCION && !hubo('satisfaccion') && diasAlControl > AVISO_CONTROL_DIAS) pendientes.push('satisfaccion');
    if (!hubo('control_anual')) {
      if (diasAlControl < 0) pendientes.push('control_vencido');
      else if (diasAlControl <= AVISO_CONTROL_DIAS) pendientes.push('control_anual');
    }
    const programado = segs.find((s) => s.proximo_contacto);
    if (programado?.proximo_contacto && programado.proximo_contacto <= hoy) pendientes.push('contacto_programado');
    if (saldo > 0) pendientes.push('saldo');

    return {
      paciente,
      compras: lista,
      totalComprado: lista.reduce((s, c) => s + c.total, 0),
      saldo,
      primeraCompra: lista.reduce((m, c) => (c.fecha_compra < m ? c.fecha_compra : m), lista[0].fecha_compra),
      ultimaEntrega,
      diasDesdeEntrega: dias,
      proximoControl,
      seguimientos: segs,
      ultimoContacto: segs[0] ?? null,
      pendientes,
    };
  }).sort((a, b) => b.ultimaEntrega.localeCompare(a.ultimaEntrega));
}

export const PENDIENTE_LABEL: Record<Pendiente, string> = {
  satisfaccion: 'Llamar: ¿cómo le fue?',
  control_anual: 'Control anual próximo',
  control_vencido: 'Control anual vencido',
  contacto_programado: 'Contacto programado',
  saldo: 'Saldo pendiente',
};

export type FiltroCrm = 'todos' | 'por_contactar' | 'control' | 'saldo' | 'al_dia';

export function filtrarClientes(clientes: ClienteCrm[], filtro: FiltroCrm, busqueda: string): ClienteCrm[] {
  const q = busqueda.trim().toLowerCase();
  return clientes.filter((c) => {
    if (q) {
      const texto = [
        c.paciente.nombres, c.paciente.apellidos, c.paciente.numero_documento, c.paciente.telefono, c.paciente.empresa,
        ...c.compras.flatMap((o) => [o.numero_orden, ...o.productos.map((p) => `${p.descripcion} ${p.montura ?? ''}`)]),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!texto.includes(q)) return false;
    }
    switch (filtro) {
      case 'por_contactar': return c.pendientes.some((p) => p === 'satisfaccion' || p === 'contacto_programado');
      case 'control': return c.pendientes.some((p) => p === 'control_anual' || p === 'control_vencido');
      case 'saldo': return c.saldo > 0;
      case 'al_dia': return c.pendientes.length === 0;
      default: return true;
    }
  });
}

/** Número para wa.me (Colombia por defecto). */
export const telefonoWhatsApp = (tel?: string | null) => {
  const d = (tel ?? '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('57') && d.length > 10 ? d : `57${d}`;
};

/** Mensaje de WhatsApp sugerido según lo que toca. */
export function mensajeWhatsApp(c: ClienteCrm, motivo: MotivoContacto): string {
  const nombre = c.paciente.nombres.split(' ')[0];
  switch (motivo) {
    case 'control_anual':
      return `Hola ${nombre}, le saludamos de Cristaliris. Ya se acerca un año desde que recibió sus gafas: es buen momento para su control visual. ¿Le agendamos una cita?`;
    case 'cobro':
      return `Hola ${nombre}, le saludamos de Cristaliris. Le recordamos que tiene un saldo pendiente de ${c.saldo.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}. Quedamos atentos.`;
    default:
      return `Hola ${nombre}, le saludamos de Cristaliris. ¿Cómo le ha ido con sus gafas nuevas? Si necesita algún ajuste, con gusto le atendemos.`;
  }
}
