/**
 * La base de datos restringe los valores de algunos campos (CHECK). Si la app
 * envía uno que no está en la lista, la orden falla con
 * "violates check constraint". Esta prueba compara las listas de la app con
 * la última migración que las define.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MEDIOS_PAGO } from './pricing';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261014030000_alinear_valores_permitidos.sql'), 'utf8');

/** Valores entre comillas de la restricción indicada. */
function permitidos(restriccion: string): string[] {
  const i = sql.indexOf(`ADD CONSTRAINT ${restriccion}`);
  expect(i, `no se encontró ${restriccion} en la migración`).toBeGreaterThan(-1);
  const bloque = sql.slice(i, sql.indexOf(');', i));
  return [...bloque.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

describe('valores permitidos en la base de datos', () => {
  it('todos los medios de pago de la app se pueden guardar en la orden y el paciente', () => {
    for (const r of ['ordenes_modalidad_pago_check', 'pacientes_modalidad_pago_check']) {
      const lista = permitidos(r);
      for (const m of MEDIOS_PAGO) expect(lista, `${r} no admite "${m.v}"`).toContain(m.v);
    }
  });

  it('los tipos de lente del formulario de órdenes se pueden guardar', () => {
    const lista = permitidos('orden_productos_tipo_lente_tiempo_check');
    for (const t of ['terminado', 'talla', 'progresivo', 'sol_formula', 'montura_3piezas']) expect(lista).toContain(t);
  });

  it('los tipos de inventario y de producto incluyen accesorio', () => {
    expect(permitidos('inventario_tipo_check')).toEqual(expect.arrayContaining(['montura', 'lente', 'insumo', 'accesorio']));
    expect(permitidos('orden_productos_tipo_producto_check')).toEqual(expect.arrayContaining(['lente', 'montura', 'insumo', 'accesorio']));
  });
});
