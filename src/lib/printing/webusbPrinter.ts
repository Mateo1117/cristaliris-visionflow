/**
 * Impresión directa a impresora térmica vía WebUSB (sin driver del sistema).
 *
 * - Protocolo: TSPL (estándar para impresoras de etiquetas: Jaltech, TSC,
 *   Xprinter, Gainscha…). Comandos clave: SIZE, GAP, CLS, BITMAP, PRINT.
 * - Resolución típica: 203 DPI = 8 dots/mm.
 * - El navegador recuerda el permiso por origen; en visitas posteriores
 *   reconectamos solos con `navigator.usb.getDevices()`.
 *
 * Solo Chromium (Chrome/Edge/Opera/Brave). En otros navegadores se cae al
 * flujo HTML clásico de impresión.
 */

export const PRINTER_DPI = 203;
export const DOTS_PER_MM = PRINTER_DPI / 25.4; // ≈ 8

const STATE_LISTENERS = new Set<() => void>();
let device: USBDevice | null = null;
let endpointOut: number | null = null;

const notify = () => STATE_LISTENERS.forEach(fn => { try { fn(); } catch {} });

export const onPrinterStateChange = (fn: () => void): (() => void) => {
  STATE_LISTENERS.add(fn);
  return () => STATE_LISTENERS.delete(fn);
};

export const isWebUsbSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'usb' in navigator;

export const isPrinterConnected = (): boolean =>
  !!device && device.opened && endpointOut !== null;

export const getPrinterName = (): string => {
  if (!device) return '';
  return [device.manufacturerName, device.productName].filter(Boolean).join(' ').trim()
    || `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`;
};

const claimPrinterInterface = async (d: USBDevice) => {
  if (!d.opened) await d.open();
  if (d.configuration === null) await d.selectConfiguration(1);
  const cfg = d.configuration!;
  // Buscar interfaz Printer (class 7) o caer a la primera con OUT endpoint
  let chosenIface = cfg.interfaces.find(i =>
    i.alternates.some(a => a.interfaceClass === 7),
  );
  if (!chosenIface) chosenIface = cfg.interfaces[0];
  if (!chosenIface) throw new Error('La impresora no expone interfaces USB.');
  try { await d.claimInterface(chosenIface.interfaceNumber); }
  catch (e: any) {
    throw new Error(
      'No se pudo reclamar la interfaz USB. Cierra cualquier otro programa que esté usando la impresora ' +
      '(spooler del sistema, app de impresión) e intenta de nuevo.',
    );
  }
  const alt =
    chosenIface.alternates.find(a => a.interfaceClass === 7) ||
    chosenIface.alternates[0];
  const ep = alt.endpoints.find(e => e.direction === 'out');
  if (!ep) throw new Error('La impresora no tiene endpoint de salida.');
  device = d;
  endpointOut = ep.endpointNumber;
  notify();
};

/** Intenta reconectar silenciosamente a una impresora ya autorizada. */
export const tryReconnectPrinter = async (): Promise<boolean> => {
  if (!isWebUsbSupported()) return false;
  try {
    const devices = await (navigator as any).usb.getDevices() as USBDevice[];
    if (!devices.length) return false;
    await claimPrinterInterface(devices[0]);
    return true;
  } catch (e) {
    console.warn('[WebUSB] reconnect failed', e);
    return false;
  }
};

/** Abre el diálogo del navegador para que el usuario elija la impresora. */
export const requestPrinter = async (): Promise<USBDevice> => {
  if (!isWebUsbSupported()) {
    throw new Error('Tu navegador no soporta WebUSB. Usa Chrome o Edge.');
  }
  const d = await (navigator as any).usb.requestDevice({
    filters: [
      { classCode: 7 },     // USB Printer class (cubre la mayoría de térmicas)
      { vendorId: 0x0483 }, // STMicroelectronics
      { vendorId: 0x0fe6 }, // ICS Advent
      { vendorId: 0x1fc9 }, // NXP
      { vendorId: 0x04b8 }, // Epson
      { vendorId: 0x0519 }, // Star Micronics
      { vendorId: 0x0416 }, // Winbond
      { vendorId: 0x067b }, // Prolific
      { vendorId: 0x1a86 }, // QinHeng
      { vendorId: 0x28e9 }, // GD32 (chips chinos comunes)
    ],
  }) as USBDevice;
  await claimPrinterInterface(d);
  return d;
};

export const disconnectPrinter = async (): Promise<void> => {
  try {
    if (device && device.opened) {
      try { await device.releaseInterface(device.configuration?.interfaces[0]?.interfaceNumber ?? 0); } catch {}
      await device.close();
    }
  } catch {}
  device = null;
  endpointOut = null;
  notify();
};

const sendBytes = async (data: Uint8Array) => {
  if (!device || endpointOut === null) throw new Error('Impresora no conectada.');
  const CHUNK = 2048;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, Math.min(i + CHUNK, data.length));
    await device.transferOut(endpointOut, slice);
  }
};

/**
 * Convierte un canvas a bitmap 1-bit empacado MSB-first.
 * TSPL: bit 1 = punto claro (no imprime), bit 0 = punto oscuro (imprime).
 */
const canvasToTspBitmap = (canvas: HTMLCanvasElement): { data: Uint8Array; bytesPerRow: number; height: number } => {
  const ctx = canvas.getContext('2d')!;
  const { data: rgba, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bytesPerRow = Math.ceil(width / 8);
  const out = new Uint8Array(bytesPerRow * height);
  out.fill(0xff); // todo blanco por defecto
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
      const gray = (r * 0.299 + g * 0.587 + b * 0.114);
      const isDark = a > 32 && gray < 128;
      if (isDark) {
        const byteIdx = y * bytesPerRow + (x >> 3);
        const bit = 7 - (x & 7);
        out[byteIdx] &= ~(1 << bit);
      }
    }
  }
  return { data: out, bytesPerRow, height };
};

const enc = new TextEncoder();

const concat = (...chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
};

/**
 * Envía el canvas ya renderizado y rotado a la impresora con tamaño físico
 * exacto y padding interno (en mm).
 */
export const printLabelViaWebUSB = async (
  bitmapCanvas: HTMLCanvasElement,
  pageWmm: number,
  pageHmm: number,
  padMm: number,
) => {
  if (!isPrinterConnected()) throw new Error('Impresora no vinculada.');

  const { data, bytesPerRow, height } = canvasToTspBitmap(bitmapCanvas);
  const xDots = Math.round(padMm * DOTS_PER_MM);
  const yDots = Math.round(padMm * DOTS_PER_MM);

  const header = enc.encode(
    `SIZE ${pageWmm} mm, ${pageHmm} mm\r\n` +
    `GAP 2 mm, 0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `REFERENCE 0,0\r\n` +
    `DENSITY 8\r\n` +
    `CLS\r\n` +
    `BITMAP ${xDots},${yDots},${bytesPerRow},${height},0,`,
  );
  const trailer = enc.encode(`\r\nPRINT 1,1\r\n`);

  await sendBytes(concat(header, data, trailer));
};

/** Imprime un patrón de prueba (rectángulo + texto) para validar tamaño y calibración. */
export const printTestPattern = async (pageWmm: number, pageHmm: number) => {
  if (!isPrinterConnected()) throw new Error('Impresora no vinculada.');
  const cmd =
    `SIZE ${pageWmm} mm, ${pageHmm} mm\r\n` +
    `GAP 2 mm, 0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `BOX 4,4,${Math.round(pageWmm * DOTS_PER_MM) - 4},${Math.round(pageHmm * DOTS_PER_MM) - 4},2\r\n` +
    `TEXT 20,20,"3",0,1,1,"PRUEBA"\r\n` +
    `TEXT 20,60,"2",0,1,1,"${pageWmm}x${pageHmm} mm"\r\n` +
    `PRINT 1,1\r\n`;
  await sendBytes(enc.encode(cmd));
};
