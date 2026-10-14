import { describe, it, expect } from 'vitest';
import { ajustarPrecio, claveCategoria, etiquetaCategoria, formatoCOP, leerPrecio, ordenarCategorias } from './catalogo';

describe('catálogo', () => {
  it('ajusta precios por porcentaje y redondea a mil', () => {
    expect(ajustarPrecio(180000, 5)).toBe(189000);
    expect(ajustarPrecio(245000, 3)).toBe(252000); // 252.350 → 252.000
    expect(ajustarPrecio(100000, -10)).toBe(90000);
    expect(ajustarPrecio(1000, -200)).toBe(0);
  });
  it('lee precios escritos de varias formas', () => {
    expect(leerPrecio('180.000')).toBe(180000);
    expect(leerPrecio('$ 180,000')).toBe(180000);
    expect(leerPrecio('')).toBeNull();
  });
  it('etiquetas y claves de categoría', () => {
    expect(etiquetaCategoria('sol')).toBe('Lentes de sol');
    expect(etiquetaCategoria('filtro_azul')).toBe('Filtro azul');
    expect(claveCategoria('Lentes Ocupacionales Ñ')).toBe('lentes_ocupacionales_n');
  });
  it('ordena primero las categorías conocidas', () => {
    expect(ordenarCategorias(['sol', 'zeta', 'monofocal', 'alfa', 'sol'])).toEqual(['monofocal', 'sol', 'alfa', 'zeta']);
  });
  it('formatea pesos colombianos sin decimales', () => {
    expect(formatoCOP(180000).replace(/\s/g, ' ')).toMatch(/\$\s?180\.000/);
  });
});
