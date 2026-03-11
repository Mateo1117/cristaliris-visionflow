import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Bell, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';

interface Alert {
  id: string;
  type: 'delayed' | 'low_stock';
  title: string;
  detail: string;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: alerts = [] } = useQuery({
    queryKey: ['notifications-alerts'],
    queryFn: async () => {
      const all: Alert[] = [];

      // Delayed products
      const { data: productos } = await supabase
        .from('orden_productos')
        .select('id, descripcion, estado_actual, updated_at, laboratorios(tiempo_promedio_entrega), ordenes(pacientes(nombres, apellidos))')
        .neq('estado_actual', 'entregado');

      (productos || []).forEach((p: any) => {
        const dias = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000);
        const esperado = p.laboratorios?.tiempo_promedio_entrega || 3;
        if (dias > esperado) {
          all.push({
            id: p.id, type: 'delayed',
            title: `${p.ordenes?.pacientes?.nombres || ''} ${p.ordenes?.pacientes?.apellidos || ''}`.trim(),
            detail: `${p.descripcion} — ${dias} días (esperado: ${esperado})`,
          });
        }
      });

      // Low stock
      const { data: inv } = await supabase
        .from('inventario')
        .select('id, marca, modelo, cantidad_disponible, stock_minimo')
        .eq('estado', 'activo');

      (inv || []).forEach((i: any) => {
        if (i.cantidad_disponible <= i.stock_minimo) {
          all.push({
            id: i.id, type: 'low_stock',
            title: `${i.marca || ''} ${i.modelo || ''}`.trim() || 'Ítem sin nombre',
            detail: `Stock: ${i.cantidad_disponible} (mín: ${i.stock_minimo})`,
          });
        }
      });

      return all;
    },
    refetchInterval: 60000,
  });

  const handleClick = (alert: Alert) => {
    setOpen(false);
    if (alert.type === 'delayed') navigate('/ordenes');
    else navigate('/inventario');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {alerts.length > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
              {alerts.length > 99 ? '99+' : alerts.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold">Alertas</p>
          <p className="text-xs text-muted-foreground">{alerts.length} alerta(s) activa(s)</p>
        </div>
        <ScrollArea className="max-h-[300px]">
          {alerts.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Sin alertas activas ✓</p>
          ) : (
            alerts.slice(0, 20).map((a) => (
              <button
                key={`${a.type}-${a.id}`}
                onClick={() => handleClick(a)}
                className="flex items-start gap-3 w-full px-4 py-3 hover:bg-muted transition-colors text-left border-b last:border-b-0"
              >
                {a.type === 'delayed' ? (
                  <Clock className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.detail}</p>
                </div>
                <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">
                  {a.type === 'delayed' ? 'Demorado' : 'Stock bajo'}
                </Badge>
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
