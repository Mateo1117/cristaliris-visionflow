/**
 * Venta directa desde Por facturar: paciente (o registro rápido), canal,
 * fórmula externa opcional y foto de la fórmula; luego orden o cotización.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Camera, ClipboardList, FileText, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PacienteSelector } from '@/components/patients/PacienteSelector';
import { CANALES_VENTA, FORMULA_VACIA, prepararVentaDirecta, type FormulaExterna, type OjoExterno } from '@/lib/ventaDirecta';

interface Props { open: boolean; onOpenChange: (o: boolean) => void }

const CAMPOS_OJO: Array<[keyof OjoExterno, string, string]> = [
  ['esfera', 'Esfera', '-1.25'], ['cilindro', 'Cilindro', '-0.50'], ['eje', 'Eje', '90'], ['adicion', 'Adición', '+2.00'],
];

export function VentaDirectaDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const archivo = useRef<HTMLInputElement>(null);
  const [pacienteId, setPacienteId] = useState('');
  const [canal, setCanal] = useState('whatsapp');
  const [formula, setFormula] = useState<FormulaExterna>(FORMULA_VACIA);
  const [fotos, setFotos] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    setPacienteId(''); setCanal('whatsapp'); setFormula(FORMULA_VACIA); setFotos([]);
  }, [open]);

  const vistas = useMemo(() => fotos.map((f) => ({ f, url: URL.createObjectURL(f) })), [fotos]);
  useEffect(() => () => vistas.forEach((v) => URL.revokeObjectURL(v.url)), [vistas]);

  const ojo = (lado: 'od' | 'oi', campo: keyof OjoExterno, v: string) =>
    setFormula((f) => ({ ...f, [lado]: { ...f[lado], [campo]: v } }));

  const continuar = (destino: '/ordenes' | '/cotizaciones') => {
    prepararVentaDirecta({ pacienteId, canal, formula, fotos });
    onOpenChange(false);
    navigate(`${destino}?directa=1`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Venta directa (sin consulta)</DialogTitle>
          <DialogDescription>Para pacientes que compran a distancia o traen una fórmula de otro especialista.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Paciente *</Label>
            <PacienteSelector value={pacienteId} onChange={setPacienteId} permitirCrear autoFocus />
          </div>

          <div className="space-y-2">
            <Label>Canal</Label>
            <ToggleGroup type="single" variant="outline" value={canal} onValueChange={(v) => v && setCanal(v)} className="flex-wrap justify-start">
              {CANALES_VENTA.map((c) => <ToggleGroupItem key={c.valor} value={c.valor} className="px-3 text-xs">{c.etiqueta}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium">Fórmula externa <span className="text-xs text-muted-foreground font-normal">(opcional)</span></p>
            <div className="grid grid-cols-[36px_repeat(4,1fr)] gap-2 items-center text-xs">
              <span />
              {CAMPOS_OJO.map(([, l]) => <span key={l} className="text-muted-foreground">{l}</span>)}
              {(['od', 'oi'] as const).map((lado) => (
                <Fragment key={lado}>
                  <span className="font-semibold uppercase">{lado}</span>
                  {CAMPOS_OJO.map(([campo, , ph]) => (
                    <Input key={`${lado}-${campo}`} className="h-8 text-xs" inputMode="decimal" placeholder={ph}
                      value={formula[lado][campo]} onChange={(e) => ojo(lado, campo, e.target.value)} aria-label={`${lado.toUpperCase()} ${campo}`} />
                  ))}
                </Fragment>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">DP</Label><Input className="h-8" inputMode="decimal" value={formula.dp} onChange={(e) => setFormula({ ...formula, dp: e.target.value })} placeholder="62" /></div>
              <div className="space-y-1"><Label className="text-xs">Tipo de lente</Label><Input className="h-8" value={formula.tipo_lente} onChange={(e) => setFormula({ ...formula, tipo_lente: e.target.value })} placeholder="Monofocal, progresivo…" /></div>
              <div className="space-y-1"><Label className="text-xs">Emitida por</Label><Input className="h-8" value={formula.emitida_por} onChange={(e) => setFormula({ ...formula, emitida_por: e.target.value })} placeholder="Dr. / óptica" /></div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea rows={2} value={formula.notas} onChange={(e) => setFormula({ ...formula, notas: e.target.value })} placeholder="Ej: entregar a domicilio, pago por transferencia…" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {vistas.map(({ f, url }) => (
                <div key={url} className="relative">
                  <img src={url} alt={`Fórmula ${f.name}`} className="h-16 w-16 rounded-md object-cover border" />
                  <button type="button" aria-label="Quitar foto" className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive text-destructive-foreground p-0.5"
                    onClick={() => setFotos(fotos.filter((x) => x !== f))}><X className="h-3 w-3" /></button>
                </div>
              ))}
              <input ref={archivo} type="file" accept="image/*,application/pdf" multiple className="hidden"
                onChange={(e) => { const n = Array.from(e.target.files ?? []); if (n.length) setFotos([...fotos, ...n]); e.target.value = ''; }} />
              <Button type="button" variant="outline" size="sm" onClick={() => archivo.current?.click()}>
                <Camera className="h-4 w-4 mr-1" />{fotos.length ? 'Agregar otra' : 'Foto de la fórmula'}
              </Button>
              <span className="text-xs text-muted-foreground">Se guarda con la orden.</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="outline" disabled={!pacienteId} onClick={() => continuar('/cotizaciones')}>
            <FileText className="h-4 w-4 mr-1" />Cotizar
          </Button>
          <Button disabled={!pacienteId} onClick={() => continuar('/ordenes')}>
            <ClipboardList className="h-4 w-4 mr-1" />Generar orden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
