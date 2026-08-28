import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Clock, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DIAS_ADAPTACION, adaptacionCumplida, diasRestantesAdaptacion } from '@/lib/businessDays';
import { toast } from 'sonner';

const estadoColor: Record<string, string> = {
  solicitada: 'bg-warning/10 text-warning',
  en_proceso: 'bg-info/10 text-info',
  aprobada: 'bg-success/10 text-success',
  rechazada: 'bg-destructive/10 text-destructive',
  entregada: 'bg-muted text-muted-foreground',
};

/**
 * ÚNICA fuente de verdad del subcódigo de garantía (README, Módulo 5.2).
 *
 * Formato: `G{ciclo}-{8 primeros caracteres del id del producto}`, p. ej.
 * `G2-3F9A1C0B`. El control de calidad ya NO genera garantías (un rechazo antes
 * de entregar es un reproceso interno), así que este generador vive solo aquí.
 */
function generarSubcodigoGarantia(ordenProductoId: string, ciclo: number): string {
  return `G${ciclo}-${ordenProductoId.slice(0, 8).toUpperCase()}`;
}

export default function Warranties() {
  const [search, setSearch] = useState('');
  const [origen, setOrigen] = useState<'todas' | 'calidad' | 'cliente'>('todas');
  const [showForm, setShowForm] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState('');
  const [selectedLab, setSelectedLab] = useState('');
  const queryClient = useQueryClient();

  const { data: garantias = [], isLoading } = useQuery({
    queryKey: ['garantias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('garantias')
        .select('*, laboratorios(nombre), orden_productos(descripcion, ordenes(pacientes(nombres, apellidos)))')
        .order('fecha_solicitud', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  /**
   * Productos que pueden pedir garantía: SOLO los ya ENTREGADOS.
   * La garantía aplica DESPUÉS de la entrega (README, Módulo 3.2). Antes de
   * entregar, un error se gestiona como reproceso interno desde Control de Calidad.
   *
   * `fecha_entrega_real` es la referencia del protocolo de adaptación. Como en
   * datos históricos puede estar vacía, se usa como respaldo la fecha del cambio
   * de estado a 'entregado' registrado en `estados_producto`.
   */
  const { data: productos = [] } = useQuery({
    queryKey: ['orden-productos-garantia'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orden_productos')
        .select('id, descripcion, tipo_producto, orden_id, fecha_entrega_real, ciclo_garantia, ordenes(pacientes(nombres, apellidos))')
        .eq('estado_actual', 'entregado')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const lista = data ?? [];
      const sinFecha = lista.filter((p: any) => !p.fecha_entrega_real).map((p: any) => p.id);
      const respaldo: Record<string, string> = {};

      if (sinFecha.length > 0) {
        const { data: cambios, error: errCambios } = await supabase
          .from('estados_producto')
          .select('orden_producto_id, fecha_cambio')
          .in('orden_producto_id', sinFecha)
          .eq('estado_nuevo', 'entregado')
          .order('fecha_cambio', { ascending: false });
        if (errCambios) throw errCambios;
        // El primero de cada producto es el cambio a 'entregado' más reciente.
        (cambios ?? []).forEach((c: any) => {
          if (!respaldo[c.orden_producto_id]) respaldo[c.orden_producto_id] = c.fecha_cambio;
        });
      }

      return lista.map((p: any) => ({
        ...p,
        fecha_entrega_efectiva: p.fecha_entrega_real || respaldo[p.id] || null,
      }));
    },
  });

  const { data: labs = [] } = useQuery({
    queryKey: ['laboratorios-garantia'],
    queryFn: async () => {
      const { data, error } = await supabase.from('laboratorios').select('id, nombre').eq('estado_activo', true);
      if (error) throw error;
      return data;
    },
  });

  const createGarantia = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { data: { user } } = await supabase.auth.getUser();

      // El ciclo se deriva de las garantías ya registradas para el producto.
      const { count, error: errCount } = await supabase
        .from('garantias')
        .select('id', { count: 'exact', head: true })
        .eq('orden_producto_id', formData.orden_producto_id);
      if (errCount) throw errCount;

      const ciclo = (count || 0) + 1;
      const subcodigo = generarSubcodigoGarantia(formData.orden_producto_id, ciclo);

      const { error } = await supabase.from('garantias').insert({
        orden_producto_id: formData.orden_producto_id,
        laboratorio_id: formData.laboratorio_id || null,
        motivo: formData.motivo,
        observaciones: formData.observaciones || null,
        ciclo,
        subcodigo,
        envio_asumido_por: formData.envio_asumido_por || null,
        guia_envio: formData.guia_envio || null,
      });
      if (error) throw error;

      // La garantía recorre de nuevo el flujo de estados, marcada como garantía.
      const { error: errProducto } = await supabase.from('orden_productos').update({
        estado_actual: 'pedido_creado' as any,
        es_garantia: true,
        ciclo_garantia: ciclo,
        garantia_codigo: subcodigo,
      }).eq('id', formData.orden_producto_id);
      if (errProducto) throw errProducto;

      // Registra el reinicio del ciclo en la trazabilidad de estados.
      const { error: errEstado } = await supabase.from('estados_producto').insert({
        orden_producto_id: formData.orden_producto_id,
        estado_anterior: 'entregado' as any,
        estado_nuevo: 'pedido_creado' as any,
        metodo: 'garantia',
        justificacion: `Garantía ${subcodigo}: ${formData.motivo}`,
        usuario_id: user?.id || null,
      });
      if (errEstado) throw errEstado;

      // Módulo 5.2: más de una garantía ⇒ alerta automática al administrador.
      if (ciclo > 1) {
        const { error: errNotif } = await supabase.from('notificaciones').insert({
          tipo: 'garantia_reincidente',
          titulo: `Producto con ${ciclo} garantías (${subcodigo})`,
          detalle: `Este producto ya tiene más de una garantía. Motivo actual: ${formData.motivo}`,
          orden_producto_id: formData.orden_producto_id,
        });
        // La notificación no debe impedir la creación de la garantía.
        if (errNotif) toast.error('Garantía creada, pero no se pudo notificar al administrador');
      }

      return { subcodigo, ciclo };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['garantias'] });
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      queryClient.invalidateQueries({ queryKey: ['orden-productos-garantia'] });
      queryClient.invalidateQueries({ queryKey: ['db-notificaciones'] });
      setShowForm(false);
      setSelectedProducto('');
      setSelectedLab('');
      toast.success(`Garantía ${res.subcodigo} creada exitosamente`);
    },
    onError: (e: any) => toast.error(e.message || 'No se pudo crear la garantía'),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProducto) { toast.error('Seleccione un producto'); return; }
    if (!fechaEntregaSeleccionada) {
      toast.error('El producto no tiene fecha de entrega registrada: no se puede validar el periodo de adaptación');
      return;
    }
    if (!adaptacionOk) {
      toast.error(`Protocolo de adaptación: faltan ${diasRestantes} día(s) para poder solicitar la garantía`);
      return;
    }
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = { orden_producto_id: selectedProducto };
    fd.forEach((v, k) => { data[k] = v; });
    data.laboratorio_id = selectedLab || null;
    createGarantia.mutate(data);
  };

  const filtered = garantias.filter((g: any) => {
    if (origen === 'calidad' && !g.observaciones?.toLowerCase().includes('rechazado en control de calidad')) return false;
    if (origen === 'cliente' && g.observaciones?.toLowerCase().includes('rechazado en control de calidad')) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const paciente = g.orden_productos?.ordenes?.pacientes;
    return (
      g.subcodigo?.toLowerCase().includes(q) ||
      g.motivo?.toLowerCase().includes(q) ||
      paciente?.nombres?.toLowerCase().includes(q) ||
      paciente?.apellidos?.toLowerCase().includes(q)
    );
  });

  const countCalidad = garantias.filter((g: any) => g.observaciones?.toLowerCase().includes('rechazado en control de calidad')).length;
  const countCliente = garantias.length - countCalidad;

  const selectedProd: any = productos.find((p: any) => p.id === selectedProducto);

  // Protocolo de adaptación (Módulo 5.1): 7 días calendario desde la entrega.
  const fechaEntregaSeleccionada: string | null = selectedProd?.fecha_entrega_efectiva || null;
  const diasRestantes = diasRestantesAdaptacion(fechaEntregaSeleccionada);
  const adaptacionOk = adaptacionCumplida(fechaEntregaSeleccionada);
  const puedeSolicitar = !!selectedProd && !!fechaEntregaSeleccionada && adaptacionOk;

  return (
    <AppLayout>
      <PageHeader title="Garantías" description="Protocolo de adaptación y gestión de garantías">
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Garantía</Button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por subcódigo, paciente o motivo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Tabs value={origen} onValueChange={(v) => setOrigen(v as any)}>
          <TabsList>
            <TabsTrigger value="todas">Todas ({garantias.length})</TabsTrigger>
            <TabsTrigger value="calidad">Rechazo Calidad — histórico ({countCalidad})</TabsTrigger>
            <TabsTrigger value="cliente">Solicitud Cliente ({countCliente})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subcódigo</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="hidden md:table-cell">Motivo</TableHead>
              <TableHead>Ciclo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden md:table-cell">Laboratorio</TableHead>
              <TableHead className="hidden lg:table-cell">Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No hay garantías{search ? ' que coincidan' : ''}</TableCell></TableRow>
            ) : filtered.map((g: any) => {
              const paciente = g.orden_productos?.ordenes?.pacientes;
              return (
                <TableRow key={g.id}>
                  <TableCell className="font-mono font-medium">{g.subcodigo}</TableCell>
                  <TableCell className="font-medium">{paciente?.nombres} {paciente?.apellidos}</TableCell>
                  <TableCell className="text-sm">{g.orden_productos?.descripcion || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[200px]">{g.motivo}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">G{g.ciclo}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${g.observaciones?.toLowerCase().includes('rechazado en control de calidad') ? 'border-destructive/30 text-destructive' : 'border-primary/30 text-primary'}`}>
                      {g.observaciones?.toLowerCase().includes('rechazado en control de calidad') ? 'Calidad' : 'Cliente'}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge className={`text-[10px] ${estadoColor[g.estado] || ''}`}>{g.estado}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{g.laboratorios?.nombre || '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{new Date(g.fecha_solicitud).toLocaleDateString('es-CO')}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create Warranty Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setSelectedProducto(''); setSelectedLab(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Garantía</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Producto de Orden * <span className="text-muted-foreground font-normal">(solo productos entregados)</span></Label>
              <Select value={selectedProducto} onValueChange={setSelectedProducto}>
                <SelectTrigger><SelectValue placeholder="Seleccione producto" /></SelectTrigger>
                <SelectContent>
                  {productos.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">No hay productos entregados</div>
                  ) : productos.map((p: any) => {
                    const pac = p.ordenes?.pacientes;
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {pac?.nombres} {pac?.apellidos} — {p.descripcion}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedProd && (
                <div className="bg-muted/50 rounded-md p-2 text-xs space-y-1">
                  <p><span className="text-muted-foreground">Paciente:</span> <strong>{selectedProd.ordenes?.pacientes?.nombres} {selectedProd.ordenes?.pacientes?.apellidos}</strong></p>
                  <p><span className="text-muted-foreground">Producto:</span> {selectedProd.descripcion}</p>
                  <p><span className="text-muted-foreground">Tipo:</span> <Badge variant="outline" className="text-[10px]">{selectedProd.tipo_producto}</Badge></p>
                  <p>
                    <span className="text-muted-foreground">Entregado:</span>{' '}
                    {fechaEntregaSeleccionada ? new Date(fechaEntregaSeleccionada).toLocaleDateString('es-CO') : '—'}
                    {selectedProd.fecha_entrega_real ? '' : fechaEntregaSeleccionada ? ' (según historial de estados)' : ''}
                  </p>
                  {(selectedProd.ciclo_garantia || 0) >= 1 && (
                    <p className="text-warning flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      Este producto ya tiene {selectedProd.ciclo_garantia} garantía(s) previa(s)
                    </p>
                  )}
                </div>
              )}

              {/* Protocolo de adaptación: 7 días calendario desde la entrega */}
              {selectedProd && !fechaEntregaSeleccionada && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                  Sin fecha de entrega registrada. No se puede validar el periodo de adaptación de {DIAS_ADAPTACION} días.
                </div>
              )}
              {selectedProd && fechaEntregaSeleccionada && !adaptacionOk && (
                <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs flex items-center gap-2">
                  <Clock className="h-4 w-4 text-warning shrink-0" />
                  <span>
                    <strong>Faltan {diasRestantes} día(s) para fin de adaptación.</strong>{' '}
                    No se puede solicitar garantía antes de {DIAS_ADAPTACION} días calendario desde la entrega.
                  </span>
                </div>
              )}
              {selectedProd && puedeSolicitar && (
                <div className="rounded-md border border-success/30 bg-success/10 p-2 text-xs">
                  Periodo de adaptación cumplido — puede solicitar la garantía.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Motivo de la Garantía *</Label>
              <Textarea name="motivo" required placeholder="Describe el motivo de la garantía..." rows={3} />
            </div>

            <div className="space-y-2">
              <Label>Laboratorio</Label>
              <Select value={selectedLab} onValueChange={setSelectedLab}>
                <SelectTrigger><SelectValue placeholder="Seleccione laboratorio" /></SelectTrigger>
                <SelectContent>
                  {labs.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Envío asumido por</Label>
                <Select name="envio_asumido_por">
                  <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="optica">Óptica</SelectItem>
                    <SelectItem value="laboratorio">Laboratorio</SelectItem>
                    <SelectItem value="paciente">Paciente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Guía de Envío</Label>
                <Input name="guia_envio" placeholder="No. guía" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea name="observaciones" placeholder="Observaciones adicionales..." rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createGarantia.isPending || !puedeSolicitar}>
                {createGarantia.isPending ? 'Creando...' : 'Solicitar Garantía'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
