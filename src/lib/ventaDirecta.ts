/**
 * Venta directa: el paciente compra sin pasar por consulta en la óptica
 * (envió su fórmula por WhatsApp, atención virtual, fórmula de otro
 * especialista). Facturación arma los datos y abre la orden o la cotización
 * con ellos; las fotos no caben en la URL, así que se pasan en memoria.
 */

export const CANALES_VENTA = [
  { valor: 'whatsapp', etiqueta: 'WhatsApp' },
  { valor: 'llamada', etiqueta: 'Llamada' },
  { valor: 'correo', etiqueta: 'Correo' },
  { valor: 'presencial', etiqueta: 'Presencial sin consulta' },
] as const;

export interface OjoExterno { esfera: string; cilindro: string; eje: string; adicion: string }

export interface FormulaExterna {
  od: OjoExterno;
  oi: OjoExterno;
  dp: string;
  tipo_lente: string;
  emitida_por: string;
  notas: string;
}

export interface VentaDirecta {
  pacienteId: string;
  canal: string;
  formula: FormulaExterna;
  fotos: File[];
}

export const OJO_VACIO: OjoExterno = { esfera: '', cilindro: '', eje: '', adicion: '' };
export const FORMULA_VACIA: FormulaExterna = { od: { ...OJO_VACIO }, oi: { ...OJO_VACIO }, dp: '', tipo_lente: '', emitida_por: '', notas: '' };

const ojo = (o: OjoExterno) => {
  const partes = [o.esfera && `Esf ${o.esfera}`, o.cilindro && `Cil ${o.cilindro}`, o.eje && `Eje ${o.eje}°`, o.adicion && `Add ${o.adicion}`].filter(Boolean);
  return partes.length ? partes.join(' ') : '—';
};

const tieneFormula = (f: FormulaExterna) =>
  [f.od, f.oi].some((o) => Object.values(o).some((v) => v.trim())) || !!(f.dp || f.tipo_lente || f.emitida_por);

/** Texto para las observaciones de la orden (o la cotización). */
export function textoVentaDirecta(canal: string, f: FormulaExterna): string {
  const etiqueta = CANALES_VENTA.find((c) => c.valor === canal)?.etiqueta ?? canal;
  const lineas = [`Venta directa sin consulta (${etiqueta}).`];
  if (tieneFormula(f)) {
    lineas.push(`Fórmula externa${f.emitida_por ? ` de ${f.emitida_por.trim()}` : ''}:`);
    lineas.push(`OD ${ojo(f.od)} · OI ${ojo(f.oi)}${f.dp ? ` · DP ${f.dp}` : ''}`);
    if (f.tipo_lente) lineas.push(`Lente: ${f.tipo_lente.trim()}`);
  }
  if (f.notas.trim()) lineas.push(f.notas.trim());
  return lineas.join('\n');
}

let pendiente: VentaDirecta | null = null;

/** Guarda la venta para que la recoja Órdenes o Cotizaciones. */
export function prepararVentaDirecta(v: VentaDirecta) { pendiente = v; }

/** Entrega la venta preparada (una sola vez). */
export function tomarVentaDirecta(): VentaDirecta | null {
  const v = pendiente;
  pendiente = null;
  return v;
}
