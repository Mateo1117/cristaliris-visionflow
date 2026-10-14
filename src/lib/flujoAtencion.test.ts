import { describe, it, expect } from 'vitest';
import { ESTADOS_CITA_MANUALES, ESTADO_CITA_LABEL, faltaMigracion, resumenOjo, textoFormula } from './flujoAtencion';

describe('resumenOjo', () => {
  it('muestra esfera, cilindro con eje y adición', () => {
    expect(resumenOjo({ esfera: -1.25, cilindro: -0.5, eje: 90, adicion: 2 })).toBe('-1.25 -0.50 × 90° ADD +2.00');
  });
  it('omite cilindro y adición en cero', () => {
    expect(resumenOjo({ esfera: 0.75, cilindro: 0, eje: null, adicion: 0 })).toBe('+0.75');
  });
  it('sin datos devuelve un guion', () => {
    expect(resumenOjo(undefined)).toBe('—');
    expect(resumenOjo({ esfera: null, cilindro: null })).toBe('—');
  });
});

describe('textoFormula', () => {
  it('arma el texto para observaciones de la orden', () => {
    const t = textoFormula({ od: { esfera: -1 }, oi: { esfera: -1.5 }, dp: 62, tipo_lente: 'Monofocal', filtros: 'AR' });
    expect(t).toContain('OD -1.00 · OI -1.50 · DP 62');
    expect(t).toContain('Lente: Monofocal · Filtros: AR');
  });
  it('sin fórmula devuelve vacío', () => {
    expect(textoFormula(null)).toBe('');
  });
});

describe('faltaMigracion', () => {
  it('reconoce función o columna inexistente', () => {
    expect(faltaMigracion({ code: 'PGRST202' })).toBe(true);
    expect(faltaMigracion({ code: '42883' })).toBe(true);
    expect(faltaMigracion({ code: '42703' })).toBe(true);
  });
  it('no confunde otros errores', () => {
    expect(faltaMigracion({ code: '42501', message: 'permiso' })).toBe(false);
    expect(faltaMigracion(null)).toBe(false);
  });
});

describe('estados de la cita', () => {
  it('todos los estados elegibles tienen etiqueta', () => {
    for (const e of ESTADOS_CITA_MANUALES) expect(ESTADO_CITA_LABEL[e]).toBeTruthy();
  });
});
