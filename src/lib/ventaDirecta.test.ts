import { describe, it, expect } from 'vitest';
import { FORMULA_VACIA, prepararVentaDirecta, textoVentaDirecta, tomarVentaDirecta } from './ventaDirecta';

describe('venta directa', () => {
  it('sin fórmula solo indica el canal', () => {
    expect(textoVentaDirecta('whatsapp', FORMULA_VACIA)).toBe('Venta directa sin consulta (WhatsApp).');
  });

  it('incluye la fórmula externa y quién la emitió', () => {
    const t = textoVentaDirecta('llamada', {
      ...FORMULA_VACIA,
      od: { esfera: '-1.25', cilindro: '-0.50', eje: '90', adicion: '' },
      dp: '62', tipo_lente: 'Progresivo', emitida_por: 'Dr. Ruiz', notas: 'Entregar a domicilio',
    });
    expect(t).toContain('Venta directa sin consulta (Llamada).');
    expect(t).toContain('Fórmula externa de Dr. Ruiz:');
    expect(t).toContain('OD Esf -1.25 Cil -0.50 Eje 90° · OI — · DP 62');
    expect(t).toContain('Lente: Progresivo');
    expect(t).toContain('Entregar a domicilio');
  });

  it('la venta preparada se entrega una sola vez', () => {
    prepararVentaDirecta({ pacienteId: 'p1', canal: 'whatsapp', formula: FORMULA_VACIA, fotos: [] });
    expect(tomarVentaDirecta()?.pacienteId).toBe('p1');
    expect(tomarVentaDirecta()).toBeNull();
  });
});
