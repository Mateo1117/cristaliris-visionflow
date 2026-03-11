import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Eye, Clock, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function QualityControl() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [observaciones, setObservaciones] = useState('');

  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['qc-productos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orden_productos')
        .select('*, laboratorios(nombre, tiempo_promedio_entrega), ordenes(pacientes(nombres, apellidos, numero_documento))')
        .in('estado_actual', ['recibido_optica', 'control_calidad'])
        .order('updated_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const updateState = useMutation({
    mutationFn: async ({ id, newState, oldState, obs }: { id: string; newState: string; oldState: string; obs: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: e1 } = await supabase.from('orden_productos')
        .update({ estado_actual: newState as any, observaciones: obs || null, fecha_control_calidad: new Date().toISOString() })
        .eq('id', id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from('estados_producto').insert({
        orden_producto_id: id,
        estado_anterior: oldState as any,
        estado_nuevo: newState as any,
        metodo: 'control_calidad',
        justificacion: obs || null,
        usuario_id: user?.id || null,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-productos'] });
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      setSelected(null);
      setObservaciones('');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleApprove = () => {
    if (!selected) return;
    updateState.mutate({
      id: selected.id,
      newState: 'listo_entrega',
      oldState: selected.estado_actual,
      obs: observaciones,
    });
    toast.success('Producto aprobado — listo para entrega');
  };

  const handleReject = () => {
    if (!selected) return;
    if (!observaciones.trim()) { toast.error('Debe ingresar observaciones para rechazar'); return; }
    updateState.mutate({
      id: selected.id,
      newState: 'pedido_creado',
      oldState: selected.estado_actual,
      obs: `RECHAZADO: ${observaciones}`,
    });
    toast.error('Producto rechazado — devuelto a pedido creado');
  };

  const pendientes = productos.filter((p: any) => p.estado_actual === 'recibido_optica');
  const enRevision = productos.filter((p: any) => p.estado_actual === 'control_calidad');

  return (
    <AppLayout>
      <PageHeader title="Control de Calidad" description="Revisión y aprobación de productos recibidos" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{pendientes.length}</p>
              <p className="text-xs text-muted-foreground">Pendientes de revisión</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Eye className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{enRevision.length}</p>
              <p className="text-xs text-muted-foreground">En control de calidad</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{productos.filter((p: any) => {
                const dias = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000);
                return dias > (p.laboratorios?.tiempo_promedio_entrega || 3);
              }).length}</p>
              <p className="text-xs text-muted-foreground">Con retraso</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">Cargando...</p>
      ) : productos.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No hay productos pendientes de control de calidad</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {productos.map((p: any) => {
            const paciente = p.ordenes?.pacientes;
            const dias = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000);
            const excedido = dias > (p.laboratorios?.tiempo_promedio_entrega || 3);

            return (
              <Card key={p.id} className={`cursor-pointer hover:shadow-md transition-shadow ${excedido ? 'border-destructive/50' : ''}`}
                onClick={() => { setSelected(p); setObservaciones(''); }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{paciente?.nombres} {paciente?.apellidos}</CardTitle>
                    <Badge variant={p.estado_actual === 'control_calidad' ? 'default' : 'secondary'}>
                      {p.estado_actual === 'control_calidad' ? 'En revisión' : 'Recibido'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-xs text-muted-foreground">{p.descripcion}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span>Lab: {p.laboratorios?.nombre || 'N/A'}</span>
                    <span className={excedido ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                      {dias}d en estado
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revisión de Calidad</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Paciente:</span> {selected.ordenes?.pacientes?.nombres} {selected.ordenes?.pacientes?.apellidos}</div>
                <div><span className="text-muted-foreground">Documento:</span> {selected.ordenes?.pacientes?.numero_documento}</div>
                <div><span className="text-muted-foreground">Producto:</span> {selected.descripcion}</div>
                <div><span className="text-muted-foreground">Tipo:</span> {selected.tipo_producto}</div>
                <div><span className="text-muted-foreground">Laboratorio:</span> {selected.laboratorios?.nombre}</div>
                {selected.es_garantia && <Badge variant="outline" className="text-yellow-600">Garantía</Badge>}
                {selected.es_reproceso && <Badge variant="outline" className="text-red-600">Reproceso</Badge>}
              </div>

              {selected.estado_actual === 'recibido_optica' && (
                <Button className="w-full" onClick={() => {
                  updateState.mutate({ id: selected.id, newState: 'control_calidad', oldState: selected.estado_actual, obs: '' });
                  toast.success('Producto pasado a control de calidad');
                }} disabled={updateState.isPending}>
                  <Eye className="h-4 w-4 mr-1" />Iniciar Revisión
                </Button>
              )}

              {selected.estado_actual === 'control_calidad' && (
                <>
                  <div className="space-y-2">
                    <Label>Observaciones del optómetra</Label>
                    <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Ej: Lente con graduación correcta, acabado en buen estado..." rows={3} />
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" variant="destructive" onClick={handleReject} disabled={updateState.isPending}>
                      <XCircle className="h-4 w-4 mr-1" />Rechazar
                    </Button>
                    <Button className="flex-1" onClick={handleApprove} disabled={updateState.isPending}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />Aprobar
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
