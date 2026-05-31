/**
 * Impresión directa por WebUSB — sin drivers de SO.
 * Compatible con Jaltech POS JAL-838L (2-en-1, 80 mm + etiquetas).
 *
 *  - Recibo 80 mm  → ESC/POS  (modo recibo)
 *  - Etiqueta QR   → TSPL/TSC (modo etiqueta, switch DIP)
 *
 * Requiere Chrome/Edge sobre HTTPS (o localhost). En Windows el dispositivo
 * NO debe tener el driver oficial reclamando la interfaz; si lo está,
 * desinstalarlo o usar Zadig → WinUSB para liberar la interfaz USB.
 */

// ───────────────────────────────────────────────────────────────────────────
// Conexión WebUSB
// ───────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'thermal-usb-printer';

// VID conocidos de impresoras térmicas POS / Jaltech / clones
const KNOWN_FILTERS: USBDeviceFilter[] = [
  { vendorId: 0x0483 }, // STMicro (Jaltech y muchos clones)
  { vendorId: 0x0416 }, // Winbond
  { vendorId: 0x0fe6 }, // ICS Advent
  { vendorId: 0x04b8 }, // Epson
  { vendorId: 0x0519 }, // Star
  { vendorId: 0x154f }, // SNBC
  { vendorId: 0x1a86 }, // QinHeng (CH34x)
  { vendorId: 0x6868 }, // Genéricos POS
  { vendorId: 0x28e9 }, // Genéricos POS
];

let cached: { device: USBDevice; endpoint: number } | null = null;

const isWebUsbAvailable = () => typeof navigator !== 'undefined' && 'usb' in navigator;

export const pickUsbPrinter = async (): Promise<USBDevice> => {
  if (!isWebUsbAvailable()) {
    throw new Error('Tu navegador no soporta WebUSB. Usa Chrome o Edge.');
  }
  const device = await navigator.usb.requestDevice({ filters: KNOWN_FILTERS });
  // Recordar VID/PID para reconexión silenciosa
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    vendorId: device.vendorId, productId: device.productId,
  }));
  return device;
};

const findAuthorizedDevice = async (): Promise<USBDevice | null> => {
  if (!isWebUsbAvailable()) return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  const devices = await navigator.usb.getDevices();
  if (stored) {
    const { vendorId, productId } = JSON.parse(stored);
    const d = devices.find(x => x.vendorId === vendorId && x.productId === productId);
    if (d) return d;
  }
  return devices[0] ?? null;
};

const openPrinter = async (device: USBDevice): Promise<{ device: USBDevice; endpoint: number }> => {
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  // Buscar primera interfaz con endpoint OUT bulk
  const iface = device.configuration!.interfaces.find(i =>
    i.alternates.some(a => a.endpoints.some(e => e.direction === 'out' && e.type === 'bulk'))
  );
  if (!iface) throw new Error('No se encontró endpoint USB de salida en la impresora.');
  try { await device.claimInterface(iface.interfaceNumber); }
  catch (e: any) {
    throw new Error(
      'No se pudo reclamar la interfaz USB. ' +
      'Desinstala el driver del fabricante en Windows o usa Zadig (WinUSB) para liberarla.'
    );
  }
  const endpoint = iface.alternates[0].endpoints.find(e => e.direction === 'out' && e.type === 'bulk')!;
  return { device, endpoint: endpoint.endpointNumber };
};

const getConnection = async (forcePicker = false) => {
  if (cached && cached.device.opened && !forcePicker) return cached;
  let device = forcePicker ? null : await findAuthorizedDevice();
  if (!device) device = await pickUsbPrinter();
  cached = await openPrinter(device);
  return cached;
};

const send = async (bytes: Uint8Array, forcePicker = false) => {
  const conn = await getConnection(forcePicker);
  // Trocear en chunks de 64 KB por compatibilidad
  const CHUNK = 64 * 1024;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await conn.device.transferOut(conn.endpoint, bytes.slice(i, i + CHUNK));
  }
};

export const isUsbPrinterConnected = async (): Promise<boolean> => {
  if (!isWebUsbAvailable()) return false;
  const d = await findAuthorizedDevice();
  return !!d;
};

// ───────────────────────────────────────────────────────────────────────────
// Codificación de texto (CP858 cubre ñ, tildes, € y símbolos COP)
// ───────────────────────────────────────────────────────────────────────────

// Mapa parcial Unicode → CP858 para los caracteres habituales en español
const CP858: Record<string, number> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86,
  'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8a, 'ï': 0x8b, 'î': 0x8c, 'ì': 0x8d,
  'Ä': 0x8e, 'Å': 0x8f, 'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93, 'ö': 0x94,
  'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9a, 'ø': 0x9b,
  '£': 0x9c, 'Ø': 0x9d, '×': 0x9e, 'ƒ': 0x9f,
  'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5,
  'ª': 0xa6, 'º': 0xa7, '¿': 0xa8, '®': 0xa9, '¬': 0xaa, '½': 0xab, '¼': 0xac,
  '¡': 0xad, '«': 0xae, '»': 0xaf, '€': 0xd5,
};

const encodeCp858 = (text: string): Uint8Array => {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) out.push(code);
    else if (CP858[ch] != null) out.push(CP858[ch]);
    else out.push(0x3f); // '?'
  }
  return new Uint8Array(out);
};

const concat = (...arrs: (Uint8Array | number[])[]) => {
  const parts = arrs.map(a => a instanceof Uint8Array ? a : new Uint8Array(a));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

// ───────────────────────────────────────────────────────────────────────────
// ESC/POS — Recibo 80 mm
// ───────────────────────────────────────────────────────────────────────────

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

// Comandos básicos
const RESET     = [ESC, 0x40];
const CP_858    = [ESC, 0x74, 19];      // page code 19 = CP858
const ALIGN_L   = [ESC, 0x61, 0];
const ALIGN_C   = [ESC, 0x61, 1];
const BOLD_ON   = [ESC, 0x45, 1];
const BOLD_OFF  = [ESC, 0x45, 0];
const SIZE_NORM = [GS,  0x21, 0x00];
const SIZE_DBLH = [GS,  0x21, 0x01];
const SIZE_DBL  = [GS,  0x21, 0x11];
const CUT       = [GS,  0x56, 0x42, 0x00];
const FEED_3    = [ESC, 0x64, 3];

const COP = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const padR = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);
const padL = (s: string, n: number) => (' '.repeat(n) + s).slice(-n);

// 80 mm → 48 columnas en fuente A
const COLS = 48;
const line = (left: string, right: string) =>
  padR(left, COLS - right.length - 1) + ' ' + padL(right, right.length);
const sep = (ch = '-') => ch.repeat(COLS);

export interface ReceiptItem { descripcion: string; cantidad?: number; precio: number; }
export interface UsbReceiptData {
  numero: string;
  fecha?: Date;
  paciente?: string;
  documento?: string;
  vendedor?: string;
  items: ReceiptItem[];
  subtotal?: number;
  descuento?: number;
  total: number;
  abonado?: number;
  saldo?: number;
  notas?: string;
  empresa?: { nombre: string; nit: string; direccion: string; telefono: string };
}

const DEFAULT_COMPANY = {
  nombre: 'Cristal Iris',
  nit: 'NIT 900.123.456-7',
  direccion: 'Cra. 7 # 23-45, Bogota',
  telefono: 'Tel. (601) 555 55 55',
};

export const printReceiptUSB = async (data: UsbReceiptData, forcePicker = false) => {
  const co = data.empresa ?? DEFAULT_COMPANY;
  const fecha = (data.fecha ?? new Date()).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const sub = data.subtotal ?? data.items.reduce((s, i) => s + i.precio * (i.cantidad || 1), 0);

  const text = (s: string) => concat(encodeCp858(s), [LF]);

  const buffer = concat(
    RESET, CP_858,
    ALIGN_C, SIZE_DBL, BOLD_ON, text(co.nombre), BOLD_OFF, SIZE_NORM,
    text(co.nit), text(co.direccion), text(co.telefono),
    text(sep()),
    SIZE_DBLH, BOLD_ON, text(data.numero), BOLD_OFF, SIZE_NORM,
    text(fecha),
    ALIGN_L, text(sep()),
    data.paciente ? text('Paciente: ' + data.paciente) : new Uint8Array(),
    data.documento ? text('Doc:      ' + data.documento) : new Uint8Array(),
    data.vendedor ? text('Atendio:  ' + data.vendedor) : new Uint8Array(),
    text(sep()),
    BOLD_ON, text(padR('Cant Descripcion', COLS - 12) + padL('Valor', 12)), BOLD_OFF,
    ...data.items.flatMap(i => {
      const qty = i.cantidad || 1;
      const total = COP(i.precio * qty);
      const head = padR(`${qty}  `, 5) + padR(i.descripcion, COLS - 5 - total.length - 1) + ' ' + total;
      return [text(head)];
    }),
    text(sep()),
    text(line('Subtotal', COP(sub))),
    data.descuento ? text(line('Descuento', '-' + COP(data.descuento))) : new Uint8Array(),
    BOLD_ON, SIZE_DBLH, text(line('TOTAL', COP(data.total))), SIZE_NORM, BOLD_OFF,
    data.abonado != null ? text(line('Abonado', COP(data.abonado))) : new Uint8Array(),
    data.saldo != null ? concat(BOLD_ON, text(line('Saldo', COP(data.saldo))), BOLD_OFF) : new Uint8Array(),
    data.notas ? concat(text(sep()), text(data.notas)) : new Uint8Array(),
    text(sep()),
    ALIGN_C, text('Gracias por su compra'), text('Conserve este recibo'),
    FEED_3, CUT,
  );

  await send(buffer, forcePicker);
};

// ───────────────────────────────────────────────────────────────────────────
// TSPL — Etiqueta 60 × 40 mm con QR
// ───────────────────────────────────────────────────────────────────────────

export interface UsbLabelData {
  numero: string;
  qrPayload: string;        // UUID o URL — lo que se codifica en el QR
  paciente?: string;
  descripcion?: string;
  laboratorio?: string;
  numeroMontura?: string;
}

/**
 * Genera comandos TSPL/TSC para etiqueta 60×40 mm.
 * Unidad: 1 mm = 8 dots (203 dpi). Etiqueta = 480×320 dots.
 */
export const printLabelUSB = async (data: UsbLabelData, forcePicker = false) => {
  // Truncar a anchos seguros
  const trunc = (s: string | undefined, n: number) => (s ?? '').slice(0, n);

  const lines = [
    'SIZE 60 mm, 40 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'DENSITY 10',
    'CLS',
    // QR (módulo 5, corrección M) → ~32 mm @ 203 dpi
    `QRCODE 12,24,M,5,A,0,"${data.qrPayload.replace(/"/g, '\\"')}"`,
    // Texto a la derecha del QR (x ≈ 280 dots ≈ 35 mm)
    `TEXT 280,24,"3",0,1,1,"${trunc(data.numero, 12)}"`,
    data.paciente
      ? `TEXT 280,70,"2",0,1,1,"${trunc(data.paciente, 18)}"`
      : '',
    data.descripcion
      ? `TEXT 280,108,"1",0,1,1,"${trunc(data.descripcion, 24)}"`
      : '',
    data.numeroMontura
      ? `TEXT 280,140,"1",0,1,1,"M:${trunc(data.numeroMontura, 18)}"`
      : '',
    data.laboratorio
      ? `TEXT 280,260,"1",0,1,1,"${trunc(data.laboratorio, 24)}"`
      : '',
    'PRINT 1,1',
    '',
  ].filter(Boolean).join('\r\n');

  await send(encodeCp858(lines), forcePicker);
};
