/**
 * Fotos de una orden en el bucket privado `orden-fotos`.
 *
 * Las fotos subidas desde el tablero se guardan en la carpeta del producto
 * (`<orden_producto_id>/`) y las de la montura al crear la orden, en la de la
 * orden (`<orden_id>/`). Se leen ambas para que aparezcan todas.
 */
import { supabase } from '@/integrations/supabase/client';

export interface FotoOrden { carpeta: string; name: string; url: string }

const carpetas = (item: { id: string; orden_id?: string | null }) =>
  [...new Set([item.id, item.orden_id].filter(Boolean) as string[])];

/** Número de fotos (para la tarjeta del tablero). */
export async function contarFotos(item: { id: string; orden_id?: string | null }): Promise<number> {
  let total = 0;
  for (const c of carpetas(item)) {
    const { data } = await supabase.storage.from('orden-fotos').list(c);
    total += (data ?? []).filter((f) => f.name !== '.emptyFolderPlaceholder').length;
  }
  return total;
}

/** Fotos con enlace firmado temporal (el bucket es privado). */
export async function listarFotos(item: { id: string; orden_id?: string | null }): Promise<FotoOrden[]> {
  const encontradas: Array<{ carpeta: string; name: string }> = [];
  for (const c of carpetas(item)) {
    const { data, error } = await supabase.storage.from('orden-fotos').list(c);
    if (error) throw error;
    for (const f of data ?? []) if (f.name !== '.emptyFolderPlaceholder') encontradas.push({ carpeta: c, name: f.name });
  }
  if (!encontradas.length) return [];
  const { data: firmados, error } = await supabase.storage.from('orden-fotos')
    .createSignedUrls(encontradas.map((f) => `${f.carpeta}/${f.name}`), 60 * 60);
  if (error) throw error;
  return encontradas.map((f, i) => ({ ...f, url: firmados?.[i]?.signedUrl ?? '' }));
}
