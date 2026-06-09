/**
 * Parámetros de impresión configurables por el usuario.
 * Se guardan en localStorage para que apliquen de inmediato sin backend.
 *
 * Los tamaños se expresan en milímetros y el layout PDF se auto-ajusta:
 * tamaños de fuente, paddings y tamaño de QR se escalan proporcionalmente
 * al ancho/alto definido.
 */

export type Orientation = 'portrait' | 'landscape';

export interface PrintSize {
  widthMm: number;
  heightMm: number;
  orientation: Orientation;
}

export interface PrintSettings {
  receipt: PrintSize;   // ticket de venta
  label: PrintSize;     // etiqueta con QR
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  receipt: { widthMm: 30, heightMm: 50, orientation: 'portrait' },
  label:   { widthMm: 60, heightMm: 40, orientation: 'landscape' },
};

const KEY = 'cristaliris.printSettings.v1';

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

export const savePrintSettings = (s: PrintSettings) => {
  localStorage.setItem(KEY, JSON.stringify(s));
};

export const resetPrintSettings = () => {
  localStorage.removeItem(KEY);
};
