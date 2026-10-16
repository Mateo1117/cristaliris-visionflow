/**
 * Campos para escribir una fórmula (OD/OI: esfera, cilindro, eje, adición,
 * altura; DP y tipo de lente). Se usa en la garantía para mandar a rehacer
 * el lente con la fórmula corregida.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORMULA_VACIA, leerNumero, type Formula, type Ojo } from './formulaOrden';

type Campo = keyof Ojo;
type OjoTexto = Record<Campo, string>;
export interface FormulaTexto { od: OjoTexto; oi: OjoTexto; dp: string; tipo_lente: string }

const txt = (n: number | null | undefined) => (n == null ? '' : String(n));
const ojoTexto = (o: Ojo): OjoTexto => ({ esfera: txt(o.esfera), cilindro: txt(o.cilindro), eje: txt(o.eje), adicion: txt(o.adicion), altura: txt(o.altura) });
const ojoNum = (o: OjoTexto): Ojo => ({ esfera: leerNumero(o.esfera), cilindro: leerNumero(o.cilindro), eje: leerNumero(o.eje), adicion: leerNumero(o.adicion), altura: leerNumero(o.altura) });

export const aTexto = (f: Formula | null | undefined): FormulaTexto => {
  const b = f ?? FORMULA_VACIA;
  return { od: ojoTexto(b.od), oi: ojoTexto(b.oi), dp: txt(b.dp), tipo_lente: b.tipo_lente ?? '' };
};
export const aFormula = (t: FormulaTexto): Formula => ({
  od: ojoNum(t.od), oi: ojoNum(t.oi), dp: leerNumero(t.dp), tipo_lente: t.tipo_lente.trim() || null,
});

const COLS: Array<{ campo: Campo; etiqueta: string; placeholder: string }> = [
  { campo: 'esfera', etiqueta: 'Esfera', placeholder: '-1.25' },
  { campo: 'cilindro', etiqueta: 'Cilindro', placeholder: '-0.50' },
  { campo: 'eje', etiqueta: 'Eje', placeholder: '180' },
  { campo: 'adicion', etiqueta: 'Adición', placeholder: '+2.00' },
  { campo: 'altura', etiqueta: 'Altura', placeholder: '18' },
];

export function FormulaEditor({ valor, onChange }: { valor: FormulaTexto; onChange: (v: FormulaTexto) => void }) {
  const ojo = (lado: 'od' | 'oi', campo: Campo, v: string) => onChange({ ...valor, [lado]: { ...valor[lado], [campo]: v } });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[28px_repeat(5,minmax(0,1fr))] gap-1.5 items-center text-xs">
        <span />
        {COLS.map((c) => <span key={c.campo} className="text-muted-foreground">{c.etiqueta}</span>)}
        {(['od', 'oi'] as const).map((lado) => (
          <div key={lado} className="contents">
            <span className="font-semibold uppercase">{lado}</span>
            {COLS.map((c) => (
              <Input key={c.campo} className="h-8 px-2 font-mono text-xs" inputMode="decimal" placeholder={c.placeholder}
                aria-label={`${lado.toUpperCase()} ${c.etiqueta}`}
                value={valor[lado][c.campo]} onChange={(e) => ojo(lado, c.campo, e.target.value)} />
            ))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[100px_1fr] gap-2">
        <div className="space-y-1">
          <Label className="text-xs">DP (mm)</Label>
          <Input className="h-8 font-mono text-xs" inputMode="decimal" placeholder="62" aria-label="DP"
            value={valor.dp} onChange={(e) => onChange({ ...valor, dp: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Lente / material / filtros</Label>
          <Input className="h-8 text-xs" placeholder="Ej: Monofocal policarbonato AR blue" aria-label="Tipo de lente"
            value={valor.tipo_lente} onChange={(e) => onChange({ ...valor, tipo_lente: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
