/**
 * Thermal printer integration — Jaltech POS JAL-838L (2-en-1)
 *
 * Estrategia: usar el driver del sistema operativo (Windows/macOS) instalado
 * para la JAL-838L. Generamos HTML con @page del ancho correcto y llamamos
 * a window.print() en una ventana auxiliar. El usuario selecciona la
 * impresora "JAL-838L" en el diálogo nativo (puede marcarse como
 * predeterminada para que se imprima sin diálogo, según el navegador).
 *
 * Formatos soportados:
 *  - Recibo térmico 80 mm (modo recibo)
 *  - Etiqueta 60 × 40 mm con QR (modo etiqueta)
 */

const COMPANY = {
  nombre: 'Cristal Iris',
  nit: 'NIT 900.123.456-7',
  direccion: 'Cra. 7 # 23-45, Bogotá',
  telefono: 'Tel. (601) 555 55 55',
};

const fmtCOP = (n: number) =>
  '$' + Math.round(n || 0).toLocaleString('es-CO');

const fmtFecha = (d?: string | Date) => {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const openPrintWindow = (html: string, title: string) => {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) {
    alert('Permite las ventanas emergentes para imprimir');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${html}`);
  w.document.write(`<script>window.addEventListener('load',()=>{setTimeout(()=>{window.focus();window.print();},150);window.addEventListener('afterprint',()=>window.close());});<\/script>`);
  w.document.write('</body></html>');
  w.document.close();
};

// ───────────────────────────────────────────────────────────────────────────
// RECIBO 80 mm
// ───────────────────────────────────────────────────────────────────────────

export interface ReceiptItem {
  descripcion: string;
  cantidad?: number;
  precio: number;
}

export interface ReceiptData {
  numero: string;                  // ORD-00123 o COT-00045
  fecha?: string | Date;
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
}

export const printThermalReceipt = (data: ReceiptData) => {
  const sub = data.subtotal ?? data.items.reduce((s, i) => s + i.precio * (i.cantidad || 1), 0);
  const html = `
<style>
  /* Ticket 3 × 5 cm (30 × 50 mm) — térmica 203 dpi ≈ 240 × 400 dots */
  @page { size: 30mm 50mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 30mm; height: 50mm;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 6.5pt;     /* ≈ 7 dots de alto, legible en 203 dpi */
    color: #000;
    padding: 1mm 1.2mm;
    line-height: 1.15;
    overflow: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .b      { font-weight: 700; }
  .xs     { font-size: 5.5pt; }
  .sm     { font-size: 6pt; }
  .hr     { border-top: 1px dashed #000; margin: 0.6mm 0; }
  .ellip  { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  table   { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td      { vertical-align: top; padding: 0; font-size: 6pt; }
  .head   { font-size: 8pt; font-weight: 800; letter-spacing: 0.3px; line-height: 1; }
  .num    { font-size: 7.5pt; font-weight: 800; letter-spacing: 0.3px; }
  .tot td { font-size: 8pt; font-weight: 800; padding-top: 0.3mm; }
  .c-q { width: 10%; }
  .c-d { width: 55%; }
  .c-v { width: 35%; }
</style>
</head><body>
  <div class="center head">${COMPANY.nombre}</div>
  <div class="center xs ellip">${COMPANY.nit}</div>
  <div class="hr"></div>
  <div class="center num">${data.numero}</div>
  <div class="center xs">${fmtFecha(data.fecha)}</div>
  ${data.paciente ? `<div class="sm ellip"><span class="b">Pac:</span> ${data.paciente}</div>` : ''}
  <div class="hr"></div>
  <table>
    <tbody>
      ${data.items.map(i => `
        <tr>
          <td class="c-q">${i.cantidad || 1}</td>
          <td class="c-d ellip">${i.descripcion}</td>
          <td class="c-v right">${fmtCOP(i.precio * (i.cantidad || 1))}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="hr"></div>
  <table>
    <tr><td class="sm">Subtotal</td><td class="sm right">${fmtCOP(sub)}</td></tr>
    ${data.descuento ? `<tr><td class="sm">Desc</td><td class="sm right">-${fmtCOP(data.descuento)}</td></tr>` : ''}
    <tr class="tot"><td>TOTAL</td><td class="right">${fmtCOP(data.total)}</td></tr>
    ${data.abonado != null ? `<tr><td class="sm">Abono</td><td class="sm right">${fmtCOP(data.abonado)}</td></tr>` : ''}
    ${data.saldo != null ? `<tr class="b sm"><td>Saldo</td><td class="right">${fmtCOP(data.saldo)}</td></tr>` : ''}
  </table>
  <div class="hr"></div>
  <div class="center xs">¡Gracias!</div>
</body></html>`;
  openPrintWindow(html, data.numero);
};

// ───────────────────────────────────────────────────────────────────────────
// ETIQUETA 60 × 40 mm con QR (modo etiqueta JAL-838L)
// ───────────────────────────────────────────────────────────────────────────

export interface LabelData {
  numero: string;          // ORD-00123
  qrSvg: string;           // outerHTML de un <svg> qrcode.react
  paciente?: string;
  descripcion?: string;
  laboratorio?: string;
  numeroMontura?: string;
}

export const printThermalLabel = (data: LabelData) => {
  const html = `
<style>
  @page { size: 60mm 40mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 60mm; height: 40mm;
    font-family: Arial, sans-serif; color: #000;
    padding: 1.5mm 2mm;
    overflow: hidden;
  }
  .row { display: flex; gap: 2mm; align-items: stretch; height: 100%; }
  .qr { width: 32mm; height: 32mm; flex: none; }
  .qr svg {
    width: 100%; height: 100%; display: block;
    shape-rendering: crispEdges;
    image-rendering: pixelated;
  }
  .qr svg * { shape-rendering: crispEdges; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .num { font-size: 12px; font-weight: 800; letter-spacing: 0.5px; line-height: 1.1; }
  .name { font-size: 9px; font-weight: 700; margin-top: 1mm; line-height: 1.1; overflow: hidden; }
  .desc { font-size: 7.5px; margin-top: 0.5mm; line-height: 1.1; overflow: hidden; }
  .lab { font-size: 7px; margin-top: auto; opacity: 0.85; }
</style>
</head><body>
  <div class="row">
    <div class="qr">${data.qrSvg}</div>
    <div class="info">
      <div class="num">${data.numero}</div>
      ${data.paciente ? `<div class="name">${data.paciente}</div>` : ''}
      ${data.descripcion ? `<div class="desc">${data.descripcion}</div>` : ''}
      ${data.numeroMontura ? `<div class="desc">M:${data.numeroMontura}</div>` : ''}
      ${data.laboratorio ? `<div class="lab">${data.laboratorio}</div>` : ''}
    </div>
  </div>
</body></html>`;
  openPrintWindow(html, `Etiqueta ${data.numero}`);
};
