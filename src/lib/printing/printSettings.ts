/**
 * Parámetros de impresión configurables.
 *
 * Fuente de verdad: tabla `print_settings` (singleton) en la base de datos.
 * Para que las funciones de impresión (sync) puedan leerlos sin esperar a la
 * red, se mantiene una caché en `localStorage`. La caché se rehidrata desde
 * la BD al cargar la app y al abrir la pestaña de Configuración.
 */

import { supabase } from '@/integrations/supabase/client';

export type Orientation = 'portrait' | 'landscape';

export interface PrintSize {
  widthMm: number;
  heightMm: number;
  orientation: Orientation;
}

export interface PrintSettings {
  receipt: PrintSize;
  label: PrintSize;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  receipt: { widthMm: 30, heightMm: 50, orientation: 'portrait' },
  label:   { widthMm: 60, heightMm: 40, orientation: 'landscape' },
};

const KEY = 'cristaliris.printSettings.v1';

/** Lectura SINCRÓNICA desde caché local (usada por las funciones de impresión). */
export const loadPrintSettings = (): PrintSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PRINT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      receipt: { ...DEFAULT_PRINT_SETTINGS.receipt, ...(parsed.receipt || {}) },
      label:   { ...DEFAULT_PRINT_SETTINGS.label,   ...(parsed.label   || {}) },
    };
  } catch {
    return DEFAULT_PRINT_SETTINGS;
  }
};

const writeCache = (s: PrintSettings) => {
  localStorage.setItem(KEY, JSON.stringify(s));
};

export const resetPrintSettings = () => {
  localStorage.removeItem(KEY);
};

// ─── BD ──────────────────────────────────────────────────────────────────────

const rowToSettings = (row: any): PrintSettings => ({
  receipt: {
    widthMm: Number(row.receipt_width_mm) || DEFAULT_PRINT_SETTINGS.receipt.widthMm,
    heightMm: Number(row.receipt_height_mm) || DEFAULT_PRINT_SETTINGS.receipt.heightMm,
    orientation: (row.receipt_orientation === 'landscape' ? 'landscape' : 'portrait'),
  },
  label: {
    widthMm: Number(row.label_width_mm) || DEFAULT_PRINT_SETTINGS.label.widthMm,
    heightMm: Number(row.label_height_mm) || DEFAULT_PRINT_SETTINGS.label.heightMm,
    orientation: (row.label_orientation === 'landscape' ? 'landscape' : 'portrait'),
  },
});

/** Lee los parámetros desde la BD y refresca la caché. */
export const fetchPrintSettings = async (): Promise<PrintSettings> => {
  const { data, error } = await supabase
    .from('print_settings')
    .select('*')
    .eq('singleton', true)
    .maybeSingle();
  if (error || !data) return loadPrintSettings();
  const s = rowToSettings(data);
  writeCache(s);
  return s;
};

/** Guarda en BD y actualiza la caché. */
export const savePrintSettings = async (s: PrintSettings): Promise<void> => {
  writeCache(s); // optimista
  const { data: existing } = await supabase
    .from('print_settings')
    .select('id')
    .eq('singleton', true)
    .maybeSingle();

  const payload = {
    receipt_width_mm: s.receipt.widthMm,
    receipt_height_mm: s.receipt.heightMm,
    receipt_orientation: s.receipt.orientation,
    label_width_mm: s.label.widthMm,
    label_height_mm: s.label.heightMm,
    label_orientation: s.label.orientation,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('print_settings')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('print_settings')
      .insert({ singleton: true, ...payload });
    if (error) throw error;
  }
};
