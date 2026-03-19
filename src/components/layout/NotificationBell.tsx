import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Bell, AlertTriangle, Clock, Check, Factory } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';

interface NotifItem {
  id: string;
  type: 'alerta_produccion' | 'delayed' | 'low_stock';
  title: string;
  detail: string;
  leida: boolean;
  created_at: string;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // DB notifications (alertas de producción)
  const { data: dbNotifs = [] } = useQuery({
    queryKey: ['db-notificaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('leida', false)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []).map((n: any) => ({
        id: n.id,
        type: n.tipo as NotifItem['type'],
        title: n.titulo,
        detail: n.detalle || '',
        leida: n.leida,
        created_at: n.created_at,
      }));
    },
    refetchInterval: 60000,
  });

  // Realtime subscription for new notifications
  useEffect(() => {
    const channel = supabase
      .channel('notificaciones-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, () => {
        queryClient.invalidateQueries({ queryKey: ['db-notificaciones'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Live-computed alerts (stock bajo)
  const { data: liveAlerts = [] } = useQuery({
    queryKey: ['notifications-live-alerts'],
    queryFn: async () => {
      const all: NotifItem[] = [];
      const { data: inv } = await supabase
        .from('inventario')
        .select('id, marca, modelo, cantidad_disponible, stock_minimo')
        .eq('estado', 'activo');
      (inv || []).forEach((i: any) => {
        if (i.cantidad_disponible <= i.stock_minimo) {
          all.push({
            id: `stock-${i.id}`,
            type: 'low_stock',
            title: `${i.marca || ''} ${i.modelo || ''}`.trim() || 'Ítem sin nombre',
            detail: `Stock: ${i.cantidad_disponible} (mín: ${i.stock_minimo})`,
            leida: false,
            created_at: new Date().toISOString(),
          });
        }
      });
      return all;
    },
    refetchInterval: 120000,
  });

  const allAlerts = [...dbNotifs, ...liveAlerts];

  const markAsRead = async (id: string) => {
    if (id.startsWith('stock-')) return;
    await supabase.from('notificaciones').update({ leida: true }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['db-notificaciones'] });
  };

  const markAllRead = async () => {
    const dbIds = dbNotifs.filter(n => !n.leida).map(n => n.id);
    if (dbIds.length > 0) {
      await supabase.from('notificaciones').update({ leida: true }).in('id', dbIds);
      queryClient.invalidateQueries({ queryKey: ['db-notificaciones'] });
    }
  };

  const handleClick = (alert: NotifItem) => {
    markAsRead(alert.id);
    setOpen(false);
    if (alert.type === 'low_stock') navigate('/inventario');
    else navigate('/ordenes');
  };

  const iconForType = (type: NotifItem['type']) => {
    switch (type) {
      case 'alerta_produccion': return <Factory className="h-4 w-4 text-destructive mt-0.5 shrink-0" />;
      case 'delayed': return <Clock className="h-4 w-4 text-destructive mt-0.5 shrink-0" />;
      case 'low_stock': return <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />;
    }
  };

  const labelForType = (type: NotifItem['type']) => {
    switch (type) {
      case 'alerta_produccion': return 'Lab retrasado';
      case 'delayed': return 'Demorado';
      case 'low_stock': return 'Stock bajo';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {allAlerts.length > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
              {allAlerts.length > 99 ? '99+' : allAlerts.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Alertas</p>
            <p className="text-xs text-muted-foreground">{allAlerts.length} alerta(s) activa(s)</p>
          </div>
          {dbNotifs.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              <Check className="h-3 w-3 mr-1" />Marcar leídas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[350px]">
          {allAlerts.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Sin alertas activas ✓</p>
          ) : (
            allAlerts.slice(0, 30).map((a) => (
              <button
                key={`${a.type}-${a.id}`}
                onClick={() => handleClick(a)}
                className="flex items-start gap-3 w-full px-4 py-3 hover:bg-muted transition-colors text-left border-b last:border-b-0"
              >
                {iconForType(a.type)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{a.detail}</p>
                </div>
                <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">
                  {labelForType(a.type)}
                </Badge>
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
