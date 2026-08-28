import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { diasHabilesEntre, useFestivos } from '@/lib/businessDays';

/**
 * Reglas de tiempo máximo en producción (laboratorio), en días HÁBILES
 * (lunes a viernes, excluyendo festivos de la tabla `festivos`):
 * - Lentes progresivos, tallas, sol con fórmula → 3 días
 * - Lentes terminados → 1 día
 * - Monturas 3 piezas / lentes terminados → 2 días
 */
function getMaxDays(tipoProducto: string, lenteTipo: string | null, tipoLenteTiempo: string | null, descripcion: string): { maxDays: number; categoria: string } {
  const desc = (descripcion || '').toLowerCase();
  const tipo = (lenteTipo || '').toLowerCase();
  const tiempo = (tipoLenteTiempo || '').toLowerCase();
  const prod = (tipoProducto || '').toLowerCase();

  // Monturas 3 piezas en lentes terminados
  if (prod === 'montura' || desc.includes('3 piezas') || desc.includes('tres piezas')) {
    if (desc.includes('terminado') || tiempo.includes('terminado')) {
      return { maxDays: 2, categoria: 'Montura 3 piezas / Terminado' };
    }
  }

  // Lentes terminados
  if (tipo.includes('terminado') || tiempo.includes('terminado') || desc.includes('terminado')) {
    return { maxDays: 1, categoria: 'Lente Terminado' };
  }

  // Progresivos, tallas, sol con fórmula
  if (
    tipo.includes('progresivo') || desc.includes('progresivo') ||
    tipo.includes('talla') || desc.includes('talla') ||
    tipo.includes('sol') || desc.includes('sol con f') || desc.includes('sol formula')
  ) {
    return { maxDays: 3, categoria: 'Progresivo / Talla / Sol Fórmula' };
  }

  // Default: 3 días para cualquier otro tipo
  return { maxDays: 3, categoria: tipoProducto || 'Otro' };
}

interface AlertaProducto {
  id: string;
  orden_id: string;
  descripcion: string;
  paciente_nombre: string;
  laboratorio_nombre: string;
  estado_actual: string;
  dias_en_lab: number;
  max_days: number;
  categoria: string;
  fecha_envio: string;
}

export function AlertasProduccion() {
  const { festivos } = useFestivos();

  const { data: alertas = [], isLoading } = useQuery({
    queryKey: ['alertas-produccion-lab', festivos],
    queryFn: async () => {
      // Products currently in lab states
      const labStates = ['enviado_laboratorio', 'recibido_laboratorio', 'en_produccion', 'producido'] as const;
      const { data, error } = await supabase
        .from('orden_productos')
        .select('id, orden_id, descripcion, tipo_producto, lente_tipo, tipo_lente_tiempo, estado_actual, fecha_envio_lab, created_at, laboratorios(nombre), ordenes(pacientes(nombres, apellidos))')
        .in('estado_actual', [...labStates]);
      if (error) throw error;

      const now = new Date();
      const results: AlertaProducto[] = [];

      (data || []).forEach((p: any) => {
        const fechaRef = p.fecha_envio_lab || p.created_at;
        // Días HÁBILES desde el envío al laboratorio (README 3.4).
        const dias = Math.max(0, diasHabilesEntre(fechaRef, now, festivos));
        const { maxDays, categoria } = getMaxDays(p.tipo_producto, p.lente_tipo, p.tipo_lente_tiempo, p.descripcion);

        if (dias >= maxDays) {
          results.push({
            id: p.id,
            orden_id: p.orden_id,
            descripcion: p.descripcion,
            paciente_nombre: `${p.ordenes?.pacientes?.nombres || ''} ${p.ordenes?.pacientes?.apellidos || ''}`.trim(),
            laboratorio_nombre: p.laboratorios?.nombre || 'Sin lab',
            estado_actual: p.estado_actual.replace(/_/g, ' '),
            dias_en_lab: dias,
            max_days: maxDays,
            categoria,
            fecha_envio: fechaRef,
          });
        }
      });

      return results.sort((a, b) => (b.dias_en_lab - b.max_days) - (a.dias_en_lab - a.max_days));
    },
    refetchInterval: 60000,
  });

  const critical = alertas.filter(a => a.dias_en_lab >= a.max_days * 2);
  const warning = alertas.filter(a => a.dias_en_lab < a.max_days * 2);

  return (
    <Card className={alertas.length > 0 ? 'border-destructive/40' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${alertas.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          Alertas de Producción — Laboratorio
          {alertas.length > 0 && (
            <Badge variant="destructive" className="text-[10px] ml-2">{alertas.length} alerta{alertas.length !== 1 ? 's' : ''}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[120px] w-full" />
        ) : alertas.length === 0 ? (
          <p className="text-center py-6 text-muted-foreground text-sm">✅ Todos los productos dentro de los tiempos esperados</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
                <span className="text-xs text-muted-foreground">Críticos (2x tiempo)</span>
                <p className="text-lg font-bold text-destructive">{critical.length}</p>
              </div>
              <div className="rounded-lg bg-warning/10 border border-warning/30 p-3">
                <span className="text-xs text-muted-foreground">En alerta</span>
                <p className="text-lg font-bold text-warning">{warning.length}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <span className="text-xs text-muted-foreground">Total retrasados</span>
                <p className="text-lg font-bold">{alertas.length}</p>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground mb-2 flex gap-4 flex-wrap">
              <span>⏱ Progresivo/Talla/Sol: 3 días hábiles</span>
              <span>⏱ Terminado: 1 día hábil</span>
              <span>⏱ Montura 3P/Terminado: 2 días hábiles</span>
              <span>Sábados, domingos y festivos no cuentan</span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Laboratorio</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Días háb.</TableHead>
                  <TableHead className="text-right">Máx</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertas.map((a) => {
                  const isCritical = a.dias_en_lab >= a.max_days * 2;
                  return (
                    <TableRow key={a.id} className={isCritical ? 'bg-destructive/5' : 'bg-warning/5'}>
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">{a.descripcion}</TableCell>
                      <TableCell className="text-sm">{a.paciente_nombre}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.laboratorio_nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{a.categoria}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{a.estado_actual}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${isCritical ? 'text-destructive' : 'text-warning'}`}>
                          {a.dias_en_lab}d
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{a.max_days}d</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
