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
import { Separator } from '@/components/ui/separator';
import { Plus, FileText, TrendingUp, ArrowRightCircle, Trash2, PercentCircle, Package } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CotizacionItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  tipo_producto: string;
  inventario_id?: string | null;
  laboratorio_id?: string | null;
  costo_unitario?: number;
}

export default function Cotizaciones() {
  const [showForm, setShowForm] = useState(false);
  const [showConvert, setShowConvert] = useState<any>(null);
  const [selectedPaciente, setSelectedPaciente] = useState('');
  const [items, setItems] = useState<CotizacionItem[]>([
    { descripcion: '', cantidad: 1, precio_unitario: 0, tipo_producto: 'lente' },
  ]);
  const queryClient = useQueryClient();

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cotizaciones')
        .select('*, pacientes(nombres, apellidos, numero_documento, modalidad_pago)')
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

  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario-cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventario')
        .select('id, codigo_referencia, marca, modelo, descripcion, precio_venta, costo_unitario, cantidad_disponible, tipo, sedes(nombre)')
        .gt('cantidad_disponible', 0)
        .eq('estado', 'activo')
        .order('marca');
      if (error) throw error;
      return data;
    },
  });

  const { data: labs = [] } = useQuery({
    queryKey: ['laboratorios-cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('laboratorios').select('id, nombre').eq('estado_activo', true);
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

  const addItem = () => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0, tipo_producto: 'lente' }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof CotizacionItem, value: any) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const handleInventarioChange = (index: number, invId: string) => {
    if (invId === 'none') {
      updateItem(index, 'inventario_id', null);
      return;
    }
    const inv = inventario.find((m: any) => m.id === invId);
    if (inv) {
      const updated = [...items];
      updated[index] = {
        ...updated[index],
        inventario_id: inv.id,
        descripcion: `${inv.marca || ''} ${inv.modelo || ''} ${inv.descripcion || ''}`.trim(),
        precio_unitario: inv.precio_venta || 0,
        costo_unitario: inv.costo_unitario || 0,
        tipo_producto: inv.tipo || 'lente',
      };
      setItems(updated);
    }
  };

  const totalItems = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);

  const resetForm = () => {
    setSelectedPaciente('');
    setItems([{ descripcion: '', cantidad: 1, precio_unitario: 0, tipo_producto: 'lente' }]);
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
      const cotItems = (cotizacion.items || []) as CotizacionItem[];

      // 1. Create ONE unified order
      const { data: orden, error: oe } = await supabase.from('ordenes').insert({
        paciente_id: cotizacion.paciente_id,
        modalidad_pago: cotizacion.pacientes?.modalidad_pago || 'contado',
        total_final: cotizacion.total_estimado || 0,
        saldo_pendiente: cotizacion.total_estimado || 0,
        cotizacion_id: cotizacion.id,
      }).select('id').single();
      if (oe) throw oe;

      // 2. Create ALL productos under this single order
      if (cotItems.length > 0) {
        const productos = cotItems.map((it) => ({
          orden_id: orden.id,
          tipo_producto: it.tipo_producto || 'lente',
          descripcion: it.descripcion || 'Producto de cotización',
          precio_venta: it.cantidad * it.precio_unitario,
          montura_id: it.inventario_id || null,
          laboratorio_id: it.laboratorio_id || null,
          costo_montura: it.inventario_id ? (it.costo_unitario || 0) : 0,
        }));
        const { error: pe } = await supabase.from('orden_productos').insert(productos);
        if (pe) throw pe;
      }

      // 3. Discount inventory ONLY on conversion
      for (const it of cotItems) {
        if (it.inventario_id) {
          const inv = inventario.find((m: any) => m.id === it.inventario_id);
          if (inv) {
            const newQty = Math.max(0, inv.cantidad_disponible - (it.cantidad || 1));
            const { error: ie } = await supabase.from('inventario')
              .update({ cantidad_disponible: newQty })
              .eq('id', it.inventario_id);
            if (ie) throw ie;
          }
        }
      }

      // 4. Mark cotización as converted
      const { error: ue } = await supabase.from('cotizaciones').update({
        estado: 'convertida',
        orden_id_convertida: orden.id,
      }).eq('id', cotizacion.id);
      if (ue) throw ue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Cotización</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Ítems de la Cotización</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Agregar Ítem</Button>
              </div>
              {items.map((item, i) => (
                <Card key={i} className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Ítem {i + 1}</span>
                    <Button type="button" size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => removeItem(i)} disabled={items.length === 1}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo Producto</Label>
                      <Select value={item.tipo_producto} onValueChange={(v) => updateItem(i, 'tipo_producto', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lente">Lente</SelectItem>
                          <SelectItem value="montura">Montura</SelectItem>
                          <SelectItem value="insumo">Insumo</SelectItem>
                          <SelectItem value="accesorio">Accesorio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Laboratorio</Label>
                      <Select value={item.laboratorio_id || 'none'} onValueChange={(v) => updateItem(i, 'laboratorio_id', v === 'none' ? null : v)}>
                        <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin laboratorio</SelectItem>
                          {labs.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Package className="h-3 w-3" />Vincular del Inventario (opcional)</Label>
                    <Select value={item.inventario_id || 'none'} onValueChange={(v) => handleInventarioChange(i, v)}>
                      <SelectTrigger><SelectValue placeholder="Buscar en inventario..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin vincular</SelectItem>
                        {inventario.map((inv: any) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.codigo_referencia ? `[${inv.codigo_referencia}] ` : ''}{inv.marca || ''} {inv.modelo || ''} — Stock: {inv.cantidad_disponible} — ${(inv.precio_venta || 0).toLocaleString('es-CO')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {item.inventario_id && (
                      <p className="text-[10px] text-muted-foreground">
                        📦 Inventario vinculado — El stock se descontará solo si se convierte en orden
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-[1fr_80px_100px] gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Descripción *</Label>
                      <Input placeholder="Lente progresivo Varilux..." value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cant.</Label>
                      <Input type="number" min={1} value={item.cantidad} onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value) || 1)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Precio Unit.</Label>
                      <Input type="number" step="100" value={item.precio_unitario || ''} onChange={e => updateItem(i, 'precio_unitario', parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </div>

                  <div className="text-right text-xs text-muted-foreground">
                    Subtotal: <span className="font-medium text-foreground">${(item.cantidad * item.precio_unitario).toLocaleString('es-CO')}</span>
                  </div>
                </Card>
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
          {showConvert && (() => {
            const cotItems = (showConvert.items || []) as CotizacionItem[];
            const itemsConInv = cotItems.filter(it => it.inventario_id);
            return (
              <div className="space-y-4">
                <div className="text-sm space-y-1">
                  <p>Paciente: <strong>{showConvert.pacientes?.nombres} {showConvert.pacientes?.apellidos}</strong></p>
                  <p>Total estimado: <strong>${(showConvert.total_estimado || 0).toLocaleString('es-CO')}</strong></p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Ítems de la cotización ({cotItems.length})</Label>
                  {cotItems.map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border rounded-md p-2">
                      <div>
                        <p className="font-medium">{it.descripcion}</p>
                        <p className="text-xs text-muted-foreground">
                          {it.tipo_producto} · Cant: {it.cantidad}
                          {it.inventario_id && <span className="ml-1">· 📦 Inventario vinculado</span>}
                        </p>
                      </div>
                      <span className="font-medium">${(it.cantidad * it.precio_unitario).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>

                {itemsConInv.length > 0 && (
                  <div className="bg-info/10 border border-info/30 rounded-lg p-3 text-sm text-info">
                    📦 Se descontará el stock de {itemsConInv.length} ítem(s) vinculados al inventario.
                  </div>
                )}

                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
                  Se creará <strong>una sola orden</strong> con {cotItems.length} producto(s). La cotización cambiará a estado "convertida".
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={() => setShowConvert(null)}>Cancelar</Button>
                  <Button onClick={() => convertirAOrden.mutate(showConvert)} disabled={convertirAOrden.isPending}>
                    {convertirAOrden.isPending ? 'Convirtiendo...' : 'Confirmar Conversión'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
