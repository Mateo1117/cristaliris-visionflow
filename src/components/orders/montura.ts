/** Datos de la montura en el formulario de la orden (ver MonturaOrden.tsx). */

export type ModoMontura = 'ninguna' | 'inventario' | 'otra';

export interface MonturaOrdenValor {
  modo: ModoMontura;
  inventario_id: string | null;
  descripcion: string;
  referencia: string;
  /** Texto del precio para que el campo se pueda borrar y escribir libremente. */
  precio: string;
  costo: number;
  aplica_descuento: boolean;
  fotos: File[];
}

export const MONTURA_VACIA: MonturaOrdenValor = {
  modo: 'ninguna', inventario_id: null, descripcion: '', referencia: '', precio: '', costo: 0, aplica_descuento: true, fotos: [],
};

/** Precio numérico de la montura (0 si no aplica). */
export const precioMontura = (m: MonturaOrdenValor) =>
  m.modo === 'ninguna' ? 0 : Number((m.precio || '').replace(/[^\d]/g, '')) || 0;

/** Descripción con la que se guarda la línea de la montura. */
export const descripcionMontura = (m: MonturaOrdenValor) => {
  const desc = m.descripcion.trim();
  // Si ya dice "Montura…" no se repite ("Montura · Montura").
  const partes = [/^montura\b/i.test(desc) ? '' : 'Montura', desc, m.referencia.trim() && `Ref. ${m.referencia.trim()}`];
  return partes.filter(Boolean).join(' · ') || 'Montura';
};
