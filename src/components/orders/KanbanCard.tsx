import { useQuery } from '@tanstack/react-query';
import { colorEstadoProducto, etiquetaEstadoProducto, type OrdenProducto } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, ShieldCheck, RotateCcw, Camera, QrCode } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Semáforo de tiempos (README 3.3): verde dentro del tiempo esperado, amarillo
 * al 80% y rojo al alcanzarlo o excederlo. Se mide en días HÁBILES.
 *
 * Si no hay tiempo esperado configurado (0 o inválido) no se puede semaforizar:
 * se muestra en gris en vez de pintar la tarjeta de rojo por una división
 * entre cero.
 */
function getTimeColor(dias: number, esperado: number) {
  if (!Number.isFinite(esperado) || esperado <= 0) return 'text-muted-foreground';
  const ratio = dias / esperado;
  if (ratio >= 1) return 'text-destructive';
  if (ratio >= 0.8) return 'text-warning';
  return 'text-success';
}

export function KanbanCard({ item, onClick }: { item: OrdenProducto; onClick: () => void }) {
  const tieneTiempoEsperado = Number.isFinite(item.tiempo_esperado_dias) && item.tiempo_esperado_dias > 0;
  const timeColor = getTimeColor(item.dias_en_estado, item.tiempo_esperado_dias);
  const excedido = tieneTiempoEsperado && item.dias_en_estado >= item.tiempo_esperado_dias;
  const isPedidoCreado = item.estado_actual === 'pedido_creado';
  // Etiqueta y color del estado actual: cubren los 11 estados del flujo,
  // incluidos "Recibido en Laboratorio" y "En Tránsito".
  const estadoLabel = etiquetaEstadoProducto(item.estado_actual);
  const estadoColor = colorEstadoProducto(item.estado_actual);

  // Check if photos exist for pedido_creado cards
  const { data: fotoCount = 0 } = useQuery({
    queryKey: ['orden-fotos-count', item.id],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('orden-fotos').list(item.id);
      if (error) return 0;
      return data.length;
    },
    enabled: isPedidoCreado,
    staleTime: 30000,
  });

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id: item.id, estado_actual: item.estado_actual }));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Card
      draggable
      onDragStart={handleDragStart}
      className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${excedido ? 'border-destructive/50 bg-destructive/5' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-1">
          <p className="text-sm font-medium leading-tight">{item.paciente_nombre}</p>
          <div className="flex gap-1">
            {item.es_garantia && <ShieldCheck className="h-3.5 w-3.5 text-warning" />}
            {item.es_reproceso && <RotateCcw className="h-3.5 w-3.5 text-destructive" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{item.descripcion}</p>

        {/* Pedido Creado: show photo & QR indicators */}
        {isPedidoCreado && (
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={fotoCount > 0 ? 'default' : 'outline'} className="text-[10px] h-5 gap-1">
              <Camera className="h-3 w-3" />
              {fotoCount > 0 ? `${fotoCount} foto${fotoCount > 1 ? 's' : ''}` : 'Sin foto'}
            </Badge>
            <Badge variant="outline" className="text-[10px] h-5 gap-1">
              <QrCode className="h-3 w-3" />QR
            </Badge>
          </div>
        )}

        <div className="flex items-center justify-between gap-1">
          <Badge
            variant="outline"
            className={`text-[10px] h-5 max-w-[58%] truncate ${estadoColor}`}
            title={`Estado: ${estadoLabel}`}
          >
            {estadoLabel}
          </Badge>
          <Badge variant="outline" className="text-[10px] h-5 max-w-[40%] truncate" title={item.laboratorio_nombre}>
            {item.laboratorio_nombre}
          </Badge>
        </div>

        <div className="flex items-center justify-end mt-1.5">
          <div
            className={`flex items-center gap-1 text-[10px] font-medium ${timeColor}`}
            title={
              tieneTiempoEsperado
                ? `${item.dias_en_estado} de ${item.tiempo_esperado_dias} días hábiles en este estado`
                : `${item.dias_en_estado} días hábiles en este estado (sin tiempo esperado configurado)`
            }
          >
            {excedido && <AlertTriangle className="h-3 w-3" />}
            <Clock className="h-3 w-3" />
            <span>
              {tieneTiempoEsperado
                ? `${item.dias_en_estado} / ${item.tiempo_esperado_dias} d. hábiles`
                : `${item.dias_en_estado} d. hábiles`}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
