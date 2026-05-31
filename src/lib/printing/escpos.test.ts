/// <reference types="w3c-web-usb" />
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ───────────────────────────────────────────────────────────────────────────
// Mock helpers: fabricamos un USBDevice + navigator.usb antes de cargar
// el módulo bajo prueba (que usa navigator.usb a través de closures).
// ───────────────────────────────────────────────────────────────────────────

type Transfer = { ep: number; data: Uint8Array };

interface MockOpts {
  vendorId?: number;
  productId?: number;
  noOutEndpoint?: boolean;
  claimFails?: boolean;
  transferFails?: boolean;            // simula desconexión durante envío
  transferFailsAfter?: number;        // falla tras N bytes
}

const makeDevice = (opts: MockOpts = {}) => {
  const transfers: Transfer[] = [];
  let sentBytes = 0;

  const endpoints = opts.noOutEndpoint
    ? [{ direction: 'in', type: 'bulk', endpointNumber: 0x81 }]
    : [{ direction: 'out', type: 'bulk', endpointNumber: 0x03 }];

  const device: any = {
    vendorId: opts.vendorId ?? 0x0483,
    productId: opts.productId ?? 0x5743,
    opened: false,
    configuration: null,
    configurations: [{
      configurationValue: 1,
      interfaces: [{
        interfaceNumber: 0,
        alternates: [{ endpoints }],
      }],
    }],
    open: vi.fn(async () => { device.opened = true; }),
    selectConfiguration: vi.fn(async () => {
      device.configuration = device.configurations[0];
    }),
    claimInterface: vi.fn(async () => {
      if (opts.claimFails) throw new Error('Interface in use');
    }),
    transferOut: vi.fn(async (ep: number, data: Uint8Array) => {
      if (opts.transferFails) throw new Error('The device was disconnected.');
      if (opts.transferFailsAfter != null && sentBytes >= opts.transferFailsAfter) {
        throw new Error('The device was disconnected.');
      }
      sentBytes += data.length;
      transfers.push({ ep, data });
      return { bytesWritten: data.length, status: 'ok' };
    }),
    close: vi.fn(async () => { device.opened = false; }),
  };

  return { device, transfers };
};

const installNavigatorUsb = (devices: any[], requestPicked?: any) => {
  const usb = {
    requestDevice: vi.fn(async () => {
      if (!requestPicked) {
        const err: any = new Error('No device selected');
        err.name = 'NotFoundError';
        throw err;
      }
      return requestPicked;
    }),
    getDevices: vi.fn(async () => devices),
  };
  Object.defineProperty(global.navigator, 'usb', {
    value: usb, configurable: true, writable: true,
  });
  return usb;
};

const removeNavigatorUsb = () => {
  // @ts-ignore
  delete (global.navigator as any).usb;
};

const concatTransfers = (ts: Transfer[]) => {
  const total = ts.reduce((s, t) => s + t.data.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const t of ts) { out.set(t.data, i); i += t.data.length; }
  return out;
};

const bytesToString = (b: Uint8Array) =>
  Array.from(b).map(x => String.fromCharCode(x)).join('');

// localStorage mínimo en jsdom — limpiamos entre tests
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  removeNavigatorUsb();
});

// ───────────────────────────────────────────────────────────────────────────
// 1. Conexión WebUSB
// ───────────────────────────────────────────────────────────────────────────

describe('WebUSB connection', () => {
  it('lanza error claro si el navegador no soporta WebUSB', async () => {
    removeNavigatorUsb();
    const { pickUsbPrinter } = await import('./escpos');
    await expect(pickUsbPrinter()).rejects.toThrow(/WebUSB/i);
  });

  it('pickUsbPrinter recuerda VID/PID en localStorage', async () => {
    const { device } = makeDevice({ vendorId: 0x0483, productId: 0x5743 });
    installNavigatorUsb([], device);
    const { pickUsbPrinter } = await import('./escpos');
    const d = await pickUsbPrinter();
    expect(d.vendorId).toBe(0x0483);
    const stored = JSON.parse(localStorage.getItem('thermal-usb-printer') || '{}');
    expect(stored).toEqual({ vendorId: 0x0483, productId: 0x5743 });
  });

  it('isUsbPrinterConnected detecta dispositivo ya autorizado', async () => {
    const { device } = makeDevice();
    installNavigatorUsb([device]);
    const { isUsbPrinterConnected } = await import('./escpos');
    await expect(isUsbPrinterConnected()).resolves.toBe(true);
  });

  it('isUsbPrinterConnected devuelve false sin dispositivos', async () => {
    installNavigatorUsb([]);
    const { isUsbPrinterConnected } = await import('./escpos');
    await expect(isUsbPrinterConnected()).resolves.toBe(false);
  });

  it('falla con mensaje útil si no hay endpoint OUT bulk', async () => {
    const { device } = makeDevice({ noOutEndpoint: true });
    installNavigatorUsb([device]);
    const { printReceiptUSB } = await import('./escpos');
    await expect(
      printReceiptUSB({ numero: 'ORD-1', items: [{ descripcion: 'X', precio: 1000 }], total: 1000 })
    ).rejects.toThrow(/endpoint USB/i);
  });

  it('falla con mensaje útil cuando claimInterface es rechazado', async () => {
    const { device } = makeDevice({ claimFails: true });
    installNavigatorUsb([device]);
    const { printReceiptUSB } = await import('./escpos');
    await expect(
      printReceiptUSB({ numero: 'ORD-1', items: [{ descripcion: 'X', precio: 1000 }], total: 1000 })
    ).rejects.toThrow(/reclamar la interfaz|Zadig|WinUSB/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. ESC/POS — recibo
// ───────────────────────────────────────────────────────────────────────────

describe('ESC/POS receipt', () => {
  it('envía init, codepage, contenido y corte', async () => {
    const { device, transfers } = makeDevice();
    installNavigatorUsb([device]);
    const { printReceiptUSB } = await import('./escpos');

    await printReceiptUSB({
      numero: 'ORD-00042',
      paciente: 'Juan Pérez Ñandú',
      items: [
        { descripcion: 'Lente progresivo', cantidad: 1, precio: 350000 },
        { descripcion: 'Montura titanio',  cantidad: 1, precio: 280000 },
      ],
      subtotal: 630000,
      descuento: 50000,
      total: 580000,
      abonado: 300000,
      saldo: 280000,
    });

    const all = concatTransfers(transfers);
    const text = bytesToString(all);

    // ESC @ (init)
    expect(all[0]).toBe(0x1b);
    expect(all[1]).toBe(0x40);
    // ESC t 19 (CP858)
    expect(text).toMatch(/\x1bt\x13/);
    // Contenido legible
    expect(text).toContain('ORD-00042');
    expect(text).toContain('TOTAL');
    expect(text).toContain('Abonado');
    expect(text).toContain('Saldo');
    // GS V B 0 (corte parcial)
    expect(text).toMatch(/\x1dVB\x00/);
    // ñ/é codificados en CP858 (no como '?')
    expect(all).toContain(0xa4); // ñ
    expect(all).toContain(0x82); // é
  });

  it('lleva el número de orden y los totales correctamente', async () => {
    const { device, transfers } = makeDevice();
    installNavigatorUsb([device]);
    const { printReceiptUSB } = await import('./escpos');

    await printReceiptUSB({
      numero: 'COT-00007',
      items: [{ descripcion: 'Examen', precio: 80000 }],
      total: 80000,
    });

    const text = bytesToString(concatTransfers(transfers));
    expect(text).toContain('COT-00007');
    expect(text).toContain('$80.000');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. TSPL — etiqueta con QR
// ───────────────────────────────────────────────────────────────────────────

describe('TSPL label with QR', () => {
  it('genera comandos TSPL con SIZE, QRCODE(UUID) y PRINT', async () => {
    const { device, transfers } = makeDevice();
    installNavigatorUsb([device]);
    const { printLabelUSB } = await import('./escpos');

    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    await printLabelUSB({
      numero: 'ORD-00042',
      qrPayload: uuid,
      paciente: 'Juan Pérez',
      descripcion: 'Progresivo OD/OI',
      laboratorio: 'Lab Cristal',
      numeroMontura: 'M-128',
    });

    const text = bytesToString(concatTransfers(transfers));
    expect(text).toContain('SIZE 60 mm, 40 mm');
    expect(text).toContain('GAP 2 mm, 0 mm');
    expect(text).toContain('CLS');
    expect(text).toContain(`QRCODE 12,24,M,5,A,0,"${uuid}"`);
    expect(text).toContain('ORD-00042');
    expect(text).toContain('Lab Cristal');
    expect(text).toContain('M:M-128');
    expect(text).toContain('PRINT 1,1');
  });

  it('escapa comillas dobles dentro del payload del QR', async () => {
    const { device, transfers } = makeDevice();
    installNavigatorUsb([device]);
    const { printLabelUSB } = await import('./escpos');

    await printLabelUSB({ numero: 'X', qrPayload: 'foo"bar' });
    const text = bytesToString(concatTransfers(transfers));
    expect(text).toContain('"foo\\"bar"');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Manejo de errores — desconexión mid-print
// ───────────────────────────────────────────────────────────────────────────

describe('Disconnection handling', () => {
  it('propaga el error cuando transferOut falla (impresora desconectada)', async () => {
    const { device } = makeDevice({ transferFails: true });
    installNavigatorUsb([device]);
    const { printReceiptUSB } = await import('./escpos');

    await expect(
      printReceiptUSB({
        numero: 'ORD-1', items: [{ descripcion: 'X', precio: 1000 }], total: 1000,
      })
    ).rejects.toThrow(/disconnected/i);
  });

  it('propaga el error si se desconecta durante una etiqueta', async () => {
    const { device } = makeDevice({ transferFails: true });
    installNavigatorUsb([device]);
    const { printLabelUSB } = await import('./escpos');

    await expect(
      printLabelUSB({ numero: 'ORD-1', qrPayload: 'uuid-x' })
    ).rejects.toThrow(/disconnected/i);
  });

  it('reabre conexión y reutiliza el endpoint en envíos consecutivos', async () => {
    const { device, transfers } = makeDevice();
    installNavigatorUsb([device]);
    const { printReceiptUSB, printLabelUSB } = await import('./escpos');

    await printReceiptUSB({
      numero: 'ORD-1', items: [{ descripcion: 'X', precio: 1000 }], total: 1000,
    });
    await printLabelUSB({ numero: 'ORD-1', qrPayload: 'uuid-x' });

    // open + claim ejecutados una sola vez (caché interna)
    expect(device.open).toHaveBeenCalledTimes(1);
    expect(device.claimInterface).toHaveBeenCalledTimes(1);
    // todos los chunks salieron por el mismo endpoint
    const eps = new Set(transfers.map(t => t.ep));
    expect(eps.size).toBe(1);
    expect([...eps][0]).toBe(0x03);
  });
});
