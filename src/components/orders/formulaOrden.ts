/**
 * Fórmula que corresponde a una orden: la de la historia clínica vinculada
 * a esa orden; si no hay, la última historia del paciente; y en una venta
 * directa (sin consulta), la fórmula externa que quedó en las observaciones.
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

export type FormulaOrden =
  | { origen: 'orden' | 'ultima'; historia: HistoriaFormula }
  | { origen: 'externa'; texto: string }
  | null;

const tieneValores = (h: HistoriaFormula) =>
  [h.formula_od_esfera, h.formula_od_cilindro, h.formula_oi_esfera, h.formula_oi_cilindro].some((v) => v != null);

/** `historias` ordenadas de la más reciente a la más antigua. */
export function elegirFormula(historias: HistoriaFormula[], ordenId: string | null | undefined, observacionesOrden?: string | null): FormulaOrden {
  const deLaOrden = ordenId ? historias.find((h) => h.orden_id === ordenId && tieneValores(h)) : undefined;
  if (deLaOrden) return { origen: 'orden', historia: deLaOrden };
  const externa = formulaExterna(observacionesOrden);
  if (externa) return { origen: 'externa', texto: externa };
  const ultima = historias.find(tieneValores);
  return ultima ? { origen: 'ultima', historia: ultima } : null;
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
