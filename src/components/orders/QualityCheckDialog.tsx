import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (observaciones: string) => void;
  pacienteNombre?: string;
  descripcion?: string;
}

const CHECKLIST_ITEMS = [
  { id: 'filtros', label: 'Filtros verificados', description: 'UV, antirreflejo, fotocromático según fórmula' },
  { id: 'montura', label: 'Montura en buen estado', description: 'Sin rayones, ajuste correcto, tornillos firmes' },
  { id: 'lente_estado', label: 'Estado del lente', description: 'Sin defectos, rayones o burbujas' },
  { id: 'formula', label: 'Fórmula correcta', description: 'Graduación coincide con la receta del optómetra' },
  { id: 'centrado', label: 'Centrado óptico', description: 'Distancia pupilar y altura pupilar correctas' },
];

export function QualityCheckDialog({ open, onOpenChange, onConfirm, pacienteNombre, descripcion }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [observaciones, setObservaciones] = useState('');

  const allChecked = CHECKLIST_ITEMS.every(item => checked[item.id]);
  const checkedCount = CHECKLIST_ITEMS.filter(item => checked[item.id]).length;

  const handleToggle = (id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirm = () => {
    onConfirm(observaciones);
    setChecked({});
    setObservaciones('');
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setChecked({});
      setObservaciones('');
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Control de Calidad
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {pacienteNombre && (
            <div className="text-sm">
              <p className="text-muted-foreground">Paciente: <strong className="text-foreground">{pacienteNombre}</strong></p>
              {descripcion && <p className="text-muted-foreground">Producto: <strong className="text-foreground">{descripcion}</strong></p>}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Badge variant={allChecked ? 'default' : 'outline'} className="text-xs">
              {checkedCount}/{CHECKLIST_ITEMS.length} verificados
            </Badge>
            {!allChecked && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-warning" />
                Complete todas las verificaciones
              </span>
            )}
          </div>

          <div className="space-y-3">
            {CHECKLIST_ITEMS.map(item => (
              <div
                key={item.id}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  checked[item.id] ? 'bg-success/5 border-success/30' : 'hover:bg-muted/50'
                }`}
                onClick={() => handleToggle(item.id)}
              >
                {/*
                  El clic sobre la casilla (y sobre su <Label>) no debe burbujear
                  al contenedor: si lo hace, el ítem se marca y se desmarca en el
                  mismo clic y la verificación nunca cambia. El contenedor sigue
                  siendo clicable en el resto de su superficie.
                */}
                <Checkbox
                  id={item.id}
                  checked={!!checked[item.id]}
                  onCheckedChange={() => handleToggle(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label
                    htmlFor={item.id}
                    className="text-sm font-medium cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Observaciones del optómetra (opcional)</Label>
            <Textarea
              placeholder="Notas adicionales sobre el control de calidad..."
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={!allChecked}>
              <ShieldCheck className="h-4 w-4 mr-1" />
              Aprobar y Avanzar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
