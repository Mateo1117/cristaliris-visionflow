import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Plus, FileText, TrendingUp, ArrowRightCircle, Trash2, PercentCircle } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CotizacionItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

export default function Cotizaciones() {
  const [showForm, setShowForm] = useState(false);
  const [showConvert, setShowConvert] = useState<any>(null);
  const [selectedPaciente, setSelectedPaciente] = useState('');
  const [items, setItems] = useState<CotizacionItem[]>([{ descripcion: '', cantidad: 1, precio_unitario: 0 }]);
  const queryClient = useQueryClient();

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cotizaciones')
        .select('*, pacientes(nombres, apellidos, numero_documento)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pacientes = [] } = useQuery({
    queryKey: ['pacientes-cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pacientes').select('id, nombres, apellidos, numero_documento').order('nombres');
      if (error) throw error;
      return data;
    },
  });

  // Metrics
  const totalCotizaciones = cotizaciones.length;
  const convertidas = cotizaciones.filter((c: any) => c.estado === 'convertida').length;
  const vigentes = cotizaciones.filter((c: any) => c.estado === 'vigente').length;
  const tasaCierre = totalCotizaciones > 0 ? ((convertidas / totalCotizaciones) * 100).toFixed(1) : '0.0';
  const totalEstimado = cotizaciones.filter((c: any) => c.estado === 'vigente').reduce((s: number, c: any) => s + (c.total_estimado || 0), 0);

  const addItem = () => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof CotizacionItem, value: any) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const totalItems = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);

  const resetForm = () => {
    setSelectedPaciente('');
    setItems([{ descripcion: '', cantidad: 1, precio_unitario: 0 }]);
  };

  const createCotizacion = useMutation({
    mutationFn: async (data: { paciente_id: string; items: CotizacionItem[]; total_estimado: number; fecha_vencimiento?: string }) => {
      const { error } = await supabase.from('cotizaciones').insert({
        paciente_id: data.paciente_id,
        items: data.items as any,
        total_estimado: data.total_estimado,
        fecha_vencimiento: data.fecha_vencimiento || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      setShowForm(false);
      resetForm();
      toast.success('Cotización creada exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const convertirAOrden = useMutation({
    mutationFn: async (cotizacion: any) => {
      // Create orden
      const { data: orden, error: oe } = await supabase.from('ordenes').insert({
        paciente_id: cotizacion.paciente_id,
        modalidad_pago: 'contado',
        total_final: cotizacion.total_estimado || 0,
        saldo_pendiente: cotizacion.total_estimado || 0,
        cotizacion_id: cotizacion.id,
      }).select('id').single();
      if (oe) throw oe;

      // Create orden_productos from items
      const cotItems = (cotizacion.items || []) as CotizacionItem[];
      if (cotItems.length > 0) {
        const productos = cotItems.map((it: CotizacionItem) => ({
          orden_id: orden.id,
          tipo_producto: 'lente',
          descripcion: it.descripcion || 'Producto de cotización',
          precio_venta: it.cantidad * it.precio_unitario,
        }));
        const { error: pe } = await supabase.from('orden_productos').insert(productos);
        if (pe) throw pe;
      }

      // Update cotizacion status
      const { error: ue } = await supabase.from('cotizaciones').update({
        estado: 'convertida',
        orden_id_convertida: orden.id,
      }).eq('id', cotizacion.id);
      if (ue) throw ue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      setShowConvert(null);
      toast.success('Cotización convertida a orden exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPaciente) { toast.error('Seleccione un paciente'); return; }
    if (items.every(it => !it.descripcion)) { toast.error('Agregue al menos un ítem'); return; }
    const fd = new FormData(e.currentTarget);
    createCotizacion.mutate({
      paciente_id: selectedPaciente,
      items: items.filter(it => it.descripcion),
      total_estimado: totalItems,
      fecha_vencimiento: fd.get('fecha_vencimiento') as string || undefined,
    });
  };

  const estadoColor: Record<string, string> = {
    vigente: 'bg-primary/10 text-primary',
    convertida: 'bg-success/10 text-success',
    vencida: 'bg-destructive/10 text-destructive',
    cancelada: 'bg-muted text-muted-foreground',
  };

  return (
    <AppLayout>
      <PageHeader title="Cotizaciones" description="Gestión de cotizaciones y conversión a órdenes">
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Cotización</Button>
      </PageHeader>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="h-5 w-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">Total Cotizaciones</p><p className="text-lg font-bold">{totalCotizaciones}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center"><ArrowRightCircle className="h-5 w-5 text-success" /></div>
          <div><p className="text-xs text-muted-foreground">Convertidas</p><p className="text-lg font-bold">{convertidas}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center"><PercentCircle className="h-5 w-5 text-accent" /></div>
          <div><p className="text-xs text-muted-foreground">Tasa de Cierre</p><p className="text-lg font-bold">{tasaCierre}%</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-warning" /></div>
          <div><p className="text-xs text-muted-foreground">Vigentes (valor)</p><p className="text-lg font-bold">${totalEstimado.toLocaleString('es-CO')}</p></div>
        </CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Ítems</TableHead>
              <TableHead>Total Estimado</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : cotizaciones.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay cotizaciones registradas</TableCell></TableRow>
            ) : cotizaciones.map((c: any) => {
              const citems = (c.items || []) as CotizacionItem[];
              return (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{new Date(c.created_at).toLocaleDateString('es-CO')}</TableCell>
                  <TableCell className="font-medium">{c.pacientes?.nombres} {c.pacientes?.apellidos}</TableCell>
                  <TableCell className="text-sm">{citems.length} ítem(s)</TableCell>
                  <TableCell className="font-medium">${(c.total_estimado || 0).toLocaleString('es-CO')}</TableCell>
                  <TableCell className="text-sm">{c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString('es-CO') : '—'}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${estadoColor[c.estado] || ''}`}>{c.estado}</Badge></TableCell>
                  <TableCell>
                    {c.estado === 'vigente' && (
                      <Button size="sm" variant="outline" onClick={() => setShowConvert(c)}>
                        <ArrowRightCircle className="h-3.5 w-3.5 mr-1" />Convertir
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Cotización</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <Select onValueChange={setSelectedPaciente}>
                <SelectTrigger><SelectValue placeholder="Seleccione paciente" /></SelectTrigger>
                <SelectContent>
                  {pacientes.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.numero_documento} — {p.nombres} {p.apellidos}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fecha Vencimiento</Label>
              <Input name="fecha_vencimiento" type="date" />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Ítems de la Cotización</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Agregar</Button>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_100px_32px] gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Descripción</Label>
                    <Input placeholder="Lente progresivo..." value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cant.</Label>
                    <Input type="number" min={1} value={item.cantidad} onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Precio</Label>
                    <Input type="number" step="100" value={item.precio_unitario || ''} onChange={e => updateItem(i, 'precio_unitario', parseFloat(e.target.value) || 0)} placeholder="0" />
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="text-destructive h-9 w-9" onClick={() => removeItem(i)} disabled={items.length === 1}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="rounded-lg p-3 bg-primary/5 border border-primary/20 flex items-center justify-between">
              <span className="text-sm font-medium">Total Estimado</span>
              <span className="text-lg font-bold text-primary">${totalItems.toLocaleString('es-CO')}</span>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createCotizacion.isPending}>{createCotizacion.isPending ? 'Creando...' : 'Crear Cotización'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Convert to Order Dialog */}
      <Dialog open={!!showConvert} onOpenChange={(o) => { if (!o) setShowConvert(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Convertir a Orden</DialogTitle></DialogHeader>
          {showConvert && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p>Paciente: <strong>{showConvert.pacientes?.nombres} {showConvert.pacientes?.apellidos}</strong></p>
                <p>Total estimado: <strong>${(showConvert.total_estimado || 0).toLocaleString('es-CO')}</strong></p>
                <p>Ítems: <strong>{((showConvert.items || []) as CotizacionItem[]).length}</strong></p>
              </div>
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
                Esta acción creará una orden de compra con los ítems de la cotización. La cotización cambiará a estado "convertida".
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setShowConvert(null)}>Cancelar</Button>
                <Button onClick={() => convertirAOrden.mutate(showConvert)} disabled={convertirAOrden.isPending}>
                  {convertirAOrden.isPending ? 'Convirtiendo...' : 'Confirmar Conversión'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
