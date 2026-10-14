/** Catálogo de productos (lentes) y sus precios. */

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  categoria: string;
  precio_full: number;
  aplica_descuento: boolean;
  activo: boolean;
  orden_display: number;
}

/** Categorías conocidas, en el orden en que se muestran. */
export const CATEGORIAS: Array<{ valor: string; etiqueta: string }> = [
  { valor: 'monofocal', etiqueta: 'Monofocales' },
  { valor: 'bifocal', etiqueta: 'Bifocales' },
  { valor: 'progresivo', etiqueta: 'Progresivos' },
  { valor: 'lente_contacto', etiqueta: 'Lentes de contacto' },
  { valor: 'sol', etiqueta: 'Lentes de sol' },
  { valor: 'otros', etiqueta: 'Otros' },
];

/** Etiqueta legible de una categoría; las nuevas se muestran con mayúscula inicial. */
export function etiquetaCategoria(valor: string): string {
  const conocida = CATEGORIAS.find((c) => c.valor === valor);
  if (conocida) return conocida.etiqueta;
  const t = valor.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Lentes progresivos premium" → "lentes_progresivos_premium" (clave de categoría). */
export const claveCategoria = (texto: string) =>
  texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Orden de categorías: primero las conocidas, luego las nuevas por nombre. */
export function ordenarCategorias(valores: string[]): string[] {
  const pos = (v: string) => {
    const i = CATEGORIAS.findIndex((c) => c.valor === v);
    return i < 0 ? CATEGORIAS.length : i;
  };
  return [...new Set(valores)].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
}

export const formatoCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

/**
 * Ajuste porcentual de precio redondeado al múltiplo indicado (por defecto
 * $1.000), p. ej. +5 % sobre $180.000 → $189.000. Nunca devuelve negativo.
 */
export function ajustarPrecio(precio: number, porcentaje: number, redondeo = 1000): number {
  const nuevo = precio * (1 + porcentaje / 100);
  return Math.max(0, Math.round(nuevo / redondeo) * redondeo);
}

/** Lee un precio escrito por el usuario: "180.000", "$180,000", "180000" → 180000. */
export function leerPrecio(texto: string): number | null {
  const limpio = (texto ?? '').replace(/[^\d]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}
