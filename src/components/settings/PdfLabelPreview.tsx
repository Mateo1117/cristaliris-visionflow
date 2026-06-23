/**
 * Vista previa "tal cual saldrá impreso" — aplica EXACTAMENTE la misma lógica
 * de rotación que `printThermalLabel` (src/lib/printing/thermal.ts).
 *
 * - `orientation` = orientación FINAL del papel.
 * - `rotateContent` = compensación driver térmico (gira el contenido 90° más
 *   sin cambiar el papel).
 */
import { Card } from '@/components/ui/card';
import {
  type LabelLayout,
  FIELD_LABELS,
  SAMPLE_VALUES,
} from '@/lib/printing/labelLayout';
import type { Orientation } from '@/lib/printing/printSettings';

interface Props {
  widthMm: number;
  heightMm: number;
  orientation: Orientation;
  rotateContent?: boolean;
  layout: LabelLayout;
}

export function PdfLabelPreview({ widthMm, heightMm, orientation, rotateContent, layout }: Props) {
  const dW = Math.max(10, widthMm);
  const dH = Math.max(10, heightMm);

  // ─── Misma lógica que printThermalLabel ────────────────────────────────
  const designIsPortrait = dH >= dW;
  const wantPortrait = orientation !== 'landscape';
  let rot: 0 | 90 | 180 | 270 = designIsPortrait === wantPortrait ? 0 : 90;
  if (rotateContent) rot = ((rot + 90) % 360) as 0 | 90 | 180 | 270;

  const swap = rot === 90 || rot === 270;
  const pageW = swap ? dH : dW;
  const pageH = swap ? dW : dH;

  // Escala visual: limitar el lado mayor a 260px
  const MAX_PX = 260;
  const scale = MAX_PX / Math.max(pageW, pageH);
  const pagePxW = pageW * scale;
  const pagePxH = pageH * scale;

  // px-per-mm dentro del diseño (antes de rotar)
  const pxPerMm = scale;

  const pdfOrientation: 'portrait' | 'landscape' = pageW >= pageH ? 'landscape' : 'portrait';

  return (
    <Card className="p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-medium">Vista previa del PDF</div>
        <div className="text-[10px] text-muted-foreground">
          {pageW} × {pageH} mm · {pdfOrientation === 'portrait' ? 'vertical' : 'horizontal'}
          {rot ? ` · contenido girado ${rot}°` : ''}
        </div>
      </div>

      <div className="flex items-center justify-center bg-muted/30 rounded p-4">
        {/* "Hoja" PDF a escala — bordes del papel */}
        <div
          className="relative bg-white border border-border shadow-md"
          style={{ width: pagePxW, height: pagePxH }}
        >
          {/* Capa de diseño (tamaño original) rotada para calzar en el papel */}
          <div
            className="absolute"
            style={{
              width: dW * pxPerMm,
              height: dH * pxPerMm,
              left: (pagePxW - dW * pxPerMm) / 2,
              top: (pagePxH - dH * pxPerMm) / 2,
              transform: `rotate(${rot}deg)`,
              transformOrigin: 'center center',
            }}
          >
            {layout.elements.map(el => {
              const isQr = el.field === 'qr';
              const w = el.wMm * pxPerMm;
              const h = (isQr ? el.wMm : Math.max(2, el.fontSize * 0.5)) * pxPerMm;
              const label = isQr ? '' : (SAMPLE_VALUES[el.field] || FIELD_LABELS[el.field]);
              return (
                <div
                  key={el.id}
                  className={[
                    'absolute flex items-center overflow-hidden text-black',
                    isQr ? 'bg-black' : '',
                  ].join(' ')}
                  style={{
                    left: el.xMm * pxPerMm,
                    top: el.yMm * pxPerMm,
                    width: w,
                    height: h,
                    fontSize: isQr ? 0 : Math.max(5, el.fontSize * pxPerMm * 0.32),
                    fontWeight: el.bold ? 700 : 400,
                    justifyContent:
                      isQr ? 'center'
                      : el.align === 'center' ? 'center'
                      : el.align === 'right' ? 'flex-end' : 'flex-start',
                    lineHeight: 1,
                  }}
                >
                  {isQr ? (
                    <QrMock />
                  ) : (
                    <span className="truncate whitespace-nowrap px-[1px]">
                      {(el.prefix || '') + label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        Esto refleja exactamente cómo se enviará a la impresora con los ajustes actuales
        (orientación y "Rotar 90°"). Cambia esos parámetros arriba para ver el resultado.
      </p>
    </Card>
  );
}

/** Mock visual de un QR (cuadrícula 5×5) — sólo para previsualización. */
function QrMock() {
  const pattern = [
    [1,1,1,0,1],
    [1,0,1,0,1],
    [1,1,1,0,0],
    [0,0,1,1,1],
    [1,1,0,1,1],
  ];
  return (
    <div className="w-full h-full grid grid-cols-5 grid-rows-5 p-[6%]">
      {pattern.flat().map((v, i) => (
        <div key={i} className={v ? 'bg-white' : 'bg-black'} />
      ))}
    </div>
  );
}
