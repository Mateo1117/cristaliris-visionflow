import type { OrdenProducto } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, ShieldCheck, RotateCcw } from 'lucide-react';

function getTimeColor(dias: number, esperado: number) {
  const ratio = dias / esperado;
  if (ratio >= 1) return 'text-destructive';
  if (ratio >= 0.8) return 'text-warning';
  return 'text-success';
}

export function KanbanCard({ item, onClick }: { item: OrdenProducto; onClick: () => void }) {
  const timeColor = getTimeColor(item.dias_en_estado, item.tiempo_esperado_dias);
  const excedido = item.dias_en_estado >= item.tiempo_esperado_dias;

  return (
    <Card className={`cursor-pointer hover:shadow-md transition-shadow ${excedido ? 'border-destructive/50 bg-destructive/5' : ''}`} onClick={onClick}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-1">
          <p className="text-sm font-medium leading-tight">{item.paciente_nombre}</p>
          <div className="flex gap-1">
            {item.es_garantia && <ShieldCheck className="h-3.5 w-3.5 text-warning" />}
            {item.es_reproceso && <RotateCcw className="h-3.5 w-3.5 text-destructive" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{item.descripcion}</p>
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-[10px] h-5">{item.laboratorio_nombre}</Badge>
          <div className={`flex items-center gap-1 text-[10px] font-medium ${timeColor}`}>
            {excedido && <AlertTriangle className="h-3 w-3" />}
            <Clock className="h-3 w-3" />
            <span>{item.dias_en_estado}d / {item.tiempo_esperado_dias}d</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
