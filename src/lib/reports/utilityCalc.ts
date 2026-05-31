/**
 * Cálculo de utilidad por producto/lente para el módulo de Reportes.
 *
 * Reglas:
 * - Costo total por producto = costo_laboratorio + costo_montura + costo_lente
 *   + costo_insumos + comision_financiera.
 * - Utilidad por fila = utilidad_calculada (si ≠ 0) o precio_venta - costoTotal.
 * - precio_venta ya se persiste neto de descuentos por convenio y montura
 *   propia, por lo que el ingreso refleja descuentos aplicados.
 * - Utilidad unitaria = utilidad total agregada / cantidad vendida.
 * - Margen % = utilidad / ingreso * 100 (margen sobre venta).
 */

export interface OrdenProductoRow {
  tipo_producto?: string | null;
  precio_venta?: number | string | null;
  costo_laboratorio?: number | string | null;
  costo_montura?: number | string | null;
  costo_lente?: number | string | null;
  costo_insumos?: number | string | null;
  comision_financiera?: number | string | null;
  utilidad_calculada?: number | string | null;
  descripcion?: string | null;
  productos_catalogo?: { nombre?: string | null; categoria?: string | null } | null;
}

export interface ProductoAgregado {
  nombre: string;
  categoria: string;
  cantidad: number;
  ingreso: number;
  utilidad: number;
  costo: number;
}

export interface LenteUtilidad extends ProductoAgregado {
  utilidad_unitaria: number;
  margen: number;
}

const CATEGORIAS_LENTE = ['monofocal', 'bifocal', 'progresivo', 'lente_contacto', 'lente'];

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function calcularCostoTotal(p: OrdenProductoRow): number {
  return (
    num(p.costo_laboratorio) +
    num(p.costo_montura) +
    num(p.costo_lente) +
    num(p.costo_insumos) +
    num(p.comision_financiera)
  );
}

export function calcularUtilidadFila(p: OrdenProductoRow): number {
  const stored = num(p.utilidad_calculada);
  if (stored !== 0) return stored;
  return num(p.precio_venta) - calcularCostoTotal(p);
}

export function agregarProductos(rows: OrdenProductoRow[]): ProductoAgregado[] {
  const map = new Map<string, ProductoAgregado>();
  for (const p of rows) {
    const nombre = p.productos_catalogo?.nombre || p.descripcion || 'Sin nombre';
    const categoria = p.productos_catalogo?.categoria || p.tipo_producto || 'otros';
    const cur = map.get(nombre) || { nombre, categoria, cantidad: 0, ingreso: 0, utilidad: 0, costo: 0 };
    cur.cantidad += 1;
    cur.ingreso += num(p.precio_venta);
    cur.utilidad += calcularUtilidadFila(p);
    cur.costo += calcularCostoTotal(p);
    map.set(nombre, cur);
  }
  return Array.from(map.values());
}

export function calcularUtilidadPorLente(rows: OrdenProductoRow[]): LenteUtilidad[] {
  return agregarProductos(rows)
    .filter(p => CATEGORIAS_LENTE.includes(p.categoria))
    .map(p => ({
      ...p,
      utilidad_unitaria: p.cantidad > 0 ? p.utilidad / p.cantidad : 0,
      margen: p.ingreso > 0 ? (p.utilidad / p.ingreso) * 100 : 0,
    }))
    .sort((a, b) => b.utilidad - a.utilidad);
}
