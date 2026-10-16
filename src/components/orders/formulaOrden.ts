/**
 * Fórmulas de un trabajo.
 *
 * ORIGINAL, en este orden de prioridad:
 *  1. la de la historia clínica vinculada a esa orden;
 *  2. en una venta directa (sin consulta), la fórmula externa de las observaciones;
 *  3. la última historia del paciente con fórmula.
 *
 * AJUSTES (tabla formulas_ajuste): cada vez que el lente se rehace con otra
 * fórmula, por garantía o por reproceso en control de calidad. La vigente es
 * el ajuste más reciente o, si no hay, la original. Nada se reemplaza: el
 * detalle muestra la vigente y el historial completo.
 */
export interface HistoriaFormula {
  id: string;
  orden_id: string | null;
  fecha_consulta: string;
  optometra_nombre?: string | null;
  formula_od_esfera: number | null; formula_od_cilindro: number | null; formula_od_eje: number | null; formula_od_adicion: number | null;
  formula_oi_esfera: number | null; formula_oi_cilindro: number | null; formula_oi_eje: number | null; formula_oi_adicion: number | null;
  distancia_pupilar: number | null; altura_pupilar_od: number | null; altura_pupilar_oi: number | null;
  formula_tipo_lente: string | null; formula_filtros: string | null; formula_observaciones?: string | null;
}

export interface Ojo { esfera: number | null; cilindro: number | null; eje: number | null; adicion: number | null; altura: number | null }

/** Fórmula en un solo formato, venga de la historia o de una garantía. */
export interface Formula {
  od: Ojo;
  oi: Ojo;
  dp: number | null;
  tipo_lente: string | null;
  filtros?: string | null;
  notas?: string | null;
}

export interface AjusteFormula {
  id: string;
  origen: 'garantia' | 'reproceso';
  referencia: string | null;
  formula: Formula;
  motivo: string | null;
  created_at: string;
  autor?: string | null;
}

export type FormulaOrden =
  | { origen: 'orden' | 'ultima'; formula: Formula; fecha: string; autor: string | null }
  | { origen: 'externa'; texto: string }
  | null;

export interface FormulasTrabajo {
  original: FormulaOrden;
  /** Del más reciente al más antiguo. */
  ajustes: AjusteFormula[];
}

/** Fórmula con la que se debe hacer el trabajo ahora. */
export function formulaVigente(f: FormulasTrabajo | null | undefined): Formula | null {
  if (!f) return null;
  if (f.ajustes.length) return f.ajustes[0].formula;
  return f.original && f.original.origen !== 'externa' ? f.original.formula : null;
}

export const etiquetaAjuste = (a: AjusteFormula) =>
  a.origen === 'garantia' ? `Fórmula nueva · garantía${a.referencia ? ` ${a.referencia}` : ''}` : 'Fórmula nueva · reproceso en control de calidad';

export const OJO_VACIO: Ojo = { esfera: null, cilindro: null, eje: null, adicion: null, altura: null };
export const FORMULA_VACIA: Formula = { od: OJO_VACIO, oi: OJO_VACIO, dp: null, tipo_lente: null, filtros: null, notas: null };

export function formulaDesdeHistoria(h: HistoriaFormula): Formula {
  return {
    od: { esfera: h.formula_od_esfera, cilindro: h.formula_od_cilindro, eje: h.formula_od_eje, adicion: h.formula_od_adicion, altura: h.altura_pupilar_od },
    oi: { esfera: h.formula_oi_esfera, cilindro: h.formula_oi_cilindro, eje: h.formula_oi_eje, adicion: h.formula_oi_adicion, altura: h.altura_pupilar_oi },
    dp: h.distancia_pupilar,
    tipo_lente: h.formula_tipo_lente,
    filtros: h.formula_filtros,
    notas: h.formula_observaciones ?? null,
  };
}

export const tieneFormula = (f: Formula | null | undefined) =>
  !!f && [f.od.esfera, f.od.cilindro, f.oi.esfera, f.oi.cilindro].some((v) => v != null);

/** Fórmula ORIGINAL del trabajo. `historias` de la más reciente a la más antigua. */
export function elegirFormula(
  historias: HistoriaFormula[],
  ordenId: string | null | undefined,
  observacionesOrden?: string | null,
): FormulaOrden {
  const conFormula = historias.filter((h) => tieneFormula(formulaDesdeHistoria(h)));
  const deLaOrden = ordenId ? conFormula.find((h) => h.orden_id === ordenId) : undefined;
  if (deLaOrden) return { origen: 'orden', formula: formulaDesdeHistoria(deLaOrden), fecha: deLaOrden.fecha_consulta, autor: deLaOrden.optometra_nombre ?? null };
  const externa = formulaExterna(observacionesOrden);
  if (externa) return { origen: 'externa', texto: externa };
  const ultima = conFormula[0];
  return ultima ? { origen: 'ultima', formula: formulaDesdeHistoria(ultima), fecha: ultima.fecha_consulta, autor: ultima.optometra_nombre ?? null } : null;
}

/** Líneas de "Fórmula externa…" que deja la venta directa en las observaciones. */
export function formulaExterna(observaciones?: string | null): string | null {
  if (!observaciones) return null;
  const lineas = observaciones.split('\n');
  const i = lineas.findIndex((l) => /^Fórmula externa/i.test(l.trim()));
  if (i < 0) return null;
  const salida = [lineas[i]];
  for (const l of lineas.slice(i + 1)) {
    if (/^(OD |Altura pupilar|Lente:)/.test(l.trim())) salida.push(l); else break;
  }
  return salida.join('\n');
}

/** "-1.25", "+0.50", "—" */
export const valorDioptria = (v: number | null | undefined) =>
  v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}`;

const ojoCorto = (lado: string, o: Ojo) =>
  `${lado} ${valorDioptria(o.esfera)}${o.cilindro != null && Number(o.cilindro) !== 0 ? ` ${valorDioptria(o.cilindro)} x${o.eje ?? '—'}` : ''}${o.adicion ? ` Add ${valorDioptria(o.adicion)}` : ''}`;

/** "OD -1.25 -0.50 x180 / OI -1.00" (etiqueta, historial). */
export const textoCorto = (f: Formula) => `${ojoCorto('OD', f.od)} / ${ojoCorto('OI', f.oi)}`;

/** Texto completo para el historial de la garantía. */
export function textoFormulaCompleta(f: Formula): string {
  const partes = [textoCorto(f)];
  if (f.dp != null) partes.push(`DP ${f.dp}`);
  if (f.od.altura != null || f.oi.altura != null) partes.push(`Alt ${f.od.altura ?? '—'}/${f.oi.altura ?? '—'}`);
  if (f.tipo_lente) partes.push(f.tipo_lente);
  return partes.join(' · ');
}

/** Convierte lo escrito en el formulario ("-1,25", "", "180") a números. */
export function leerNumero(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
