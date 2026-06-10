/**
 * Parámetros de impresión configurables.
 *
 * Fuente de verdad: tabla `print_settings` (singleton) en la base de datos.
 * Para que las funciones de impresión (sync) puedan leerlos sin esperar a la
 * red, se mantiene una caché en `localStorage`. La caché se rehidrata desde
 * la BD al cargar la app y al abrir la pestaña de Configuración.
 */

import { supabase } from '@/integrations/supabase/client';
import { buildDefaultLayout, type LabelLayout } from './labelLayout';

export type Orientation = 'portrait' | 'landscape';

export interface PrintSize {
  widthMm: number;
  heightMm: number;
  orientation: Orientation;
  /** Pre-rota el contenido 90° para compensar el driver de impresoras que rotan automáticamente. */
  rotateContent?: boolean;
}

export interface PrintSettings {
  receipt: PrintSize;
  label: PrintSize;
  /** Diseño visual de la etiqueta (posición de QR y campos). */
  labelLayout?: LabelLayout;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  receipt: { widthMm: 30, heightMm: 50, orientation: 'portrait', rotateContent: false },
  label:   { widthMm: 30, heightMm: 50, orientation: 'portrait', rotateContent: false },
  labelLayout: buildDefaultLayout(30, 50),
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
      labelLayout: parsed.labelLayout || DEFAULT_PRINT_SETTINGS.labelLayout,
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
    rotateContent: Boolean(row.receipt_rotate_content),
  },
  label: {
    widthMm: Number(row.label_width_mm) || DEFAULT_PRINT_SETTINGS.label.widthMm,
    heightMm: Number(row.label_height_mm) || DEFAULT_PRINT_SETTINGS.label.heightMm,
    orientation: (row.label_orientation === 'landscape' ? 'landscape' : 'portrait'),
    rotateContent: Boolean(row.label_rotate_content),
  },
  labelLayout: row.label_layout && typeof row.label_layout === 'object'
    ? (row.label_layout as LabelLayout)
    : buildDefaultLayout(Number(row.label_width_mm) || 30, Number(row.label_height_mm) || 40),
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

  const payload: Record<string, any> = {
    receipt_width_mm: s.receipt.widthMm,
    receipt_height_mm: s.receipt.heightMm,
    receipt_orientation: s.receipt.orientation,
    receipt_rotate_content: !!s.receipt.rotateContent,
    label_width_mm: s.label.widthMm,
    label_height_mm: s.label.heightMm,
    label_orientation: s.label.orientation,
    label_rotate_content: !!s.label.rotateContent,
    label_layout: s.labelLayout ?? null,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('print_settings')
      .update(payload as any)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('print_settings')
      .insert({ singleton: true, ...payload } as any);
    if (error) throw error;
  }
};
