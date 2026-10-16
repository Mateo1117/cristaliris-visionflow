import { describe, it, expect } from 'vitest';
import { FORMULA_VACIA, elegirFormula, etiquetaAjuste, formulaExterna, formulaVigente, leerNumero, textoCorto, textoFormulaCompleta, valorDioptria, type HistoriaFormula } from './formulaOrden';

const hc = (x: Partial<HistoriaFormula>): HistoriaFormula => ({
  id: Math.random().toString(), orden_id: null, fecha_consulta: '2026-10-16T10:00:00Z',
  formula_od_esfera: -1.25, formula_od_cilindro: -0.5, formula_od_eje: 180, formula_od_adicion: null,
  formula_oi_esfera: -1, formula_oi_cilindro: null, formula_oi_eje: null, formula_oi_adicion: null,
  distancia_pupilar: 62, altura_pupilar_od: null, altura_pupilar_oi: null, formula_tipo_lente: null, formula_filtros: null, ...x,
});

describe('fórmula de la orden', () => {
  it('prefiere la historia vinculada a la orden sobre la más reciente', () => {
    const r = elegirFormula([hc({ id: 'nueva', fecha_consulta: '2026-10-17T10:00:00Z' }), hc({ id: 'de-orden', orden_id: 'o1' })], 'o1');
    expect(r).toMatchObject({ origen: 'orden', fecha: '2026-10-16T10:00:00Z' });
  });

  it('sin historia de la orden usa la fórmula externa de la venta directa, y si no, la última', () => {
    const obs = 'Venta directa sin consulta (WhatsApp).\nFórmula externa de Dr. Ruiz:\nOD -1.00 · OI -0.75 · DP 62\nAltura pupilar: OD 18 · OI 18\nNota libre';
    expect(elegirFormula([hc({ id: 'u' })], 'o1', obs)).toEqual({
      origen: 'externa', texto: 'Fórmula externa de Dr. Ruiz:\nOD -1.00 · OI -0.75 · DP 62\nAltura pupilar: OD 18 · OI 18',
    });
    expect(elegirFormula([hc({ id: 'u' })], 'o1', null)).toMatchObject({ origen: 'ultima', formula: { od: { esfera: -1.25, eje: 180 }, dp: 62 } });
  });

  it('ignora historias sin fórmula (p. ej. guardadas incompletas)', () => {
    const vacia = hc({ id: 'v', orden_id: 'o1', formula_od_esfera: null, formula_od_cilindro: null, formula_oi_esfera: null, formula_oi_cilindro: null });
    expect(elegirFormula([vacia], 'o1')).toBeNull();
    expect(formulaExterna('sin fórmula')).toBeNull();
  });

  it('formatea dioptrías con signo', () => {
    expect([valorDioptria(-1.25), valorDioptria(0.5), valorDioptria(null)]).toEqual(['-1.25', '+0.50', '—']);
  });
});

describe('historial de fórmulas', () => {
  const nueva = { ...FORMULA_VACIA, od: { esfera: -2, cilindro: -0.75, eje: 90, adicion: null, altura: 19 }, oi: { esfera: -1.5, cilindro: null, eje: null, adicion: null, altura: 19 }, dp: 63, tipo_lente: 'Monofocal AR' };
  const original = elegirFormula([hc({ orden_id: 'o1' })], 'o1');

  it('la vigente es el ajuste más reciente; sin ajustes, la original', () => {
    expect(formulaVigente({ original, ajustes: [] })?.od.esfera).toBe(-1.25);
    const ajustes = [
      { id: 'b', origen: 'reproceso' as const, referencia: null, formula: nueva, motivo: 'eje', created_at: '2026-10-19' },
      { id: 'a', origen: 'garantia' as const, referencia: 'G1-ABC', formula: FORMULA_VACIA, motivo: null, created_at: '2026-10-18' },
    ];
    expect(formulaVigente({ original, ajustes })?.dp).toBe(63);
    expect(etiquetaAjuste(ajustes[1])).toBe('Fórmula nueva · garantía G1-ABC');
    expect(etiquetaAjuste(ajustes[0])).toBe('Fórmula nueva · reproceso en control de calidad');
  });

  it('textos y lectura de números escritos', () => {
    expect(textoCorto(nueva)).toBe('OD -2.00 -0.75 x90 / OI -1.50');
    expect(textoFormulaCompleta(nueva)).toBe('OD -2.00 -0.75 x90 / OI -1.50 · DP 63 · Alt 19/19 · Monofocal AR');
    expect([leerNumero('-1,25'), leerNumero(''), leerNumero('abc'), leerNumero('180')]).toEqual([-1.25, null, null, 180]);
  });
});
