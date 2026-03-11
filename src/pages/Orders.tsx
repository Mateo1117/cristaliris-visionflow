import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KanbanBoard } from '@/components/orders/KanbanBoard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Package, Calculator } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Orders() {
  const [showForm, setShowForm] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState('');
  const [selectedMontura, setSelectedMontura] = useState('');
  const [tipoProducto, setTipoProducto] = useState('lente');
  const queryClient = useQueryClient();

  // Cost state for live utility calculation
  const [precioVenta, setPrecioVenta] = useState(0);
  const [costoLaboratorio, setCostoLaboratorio] = useState(0);
  const [costoMontura, setCostoMontura] = useState(0);
  const [costoLente, setCostoLente] = useState(0);
  const [costoInsumos, setCostoInsumos] = useState(0);
  const [comisionFinanciera, setComisionFinanciera] = useState(0);

  const utilidad = useMemo(() =>
    precioVenta - costoLaboratorio - costoMontura - costoLente - costoInsumos - comisionFinanciera
  , [precioVenta, costoLaboratorio, costoMontura, costoLente, costoInsumos, comisionFinanciera]);

  const { data: pacientes = [] } = useQuery({
    queryKey: ['pacientes-ordenes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pacientes').select('id, nombres, apellidos, numero_documento, modalidad_pago').order('nombres');
      if (error) throw error;
      return data;
    },
  });

  const { data: labs = [] } = useQuery({
    queryKey: ['laboratorios-ordenes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('laboratorios').select('id, nombre').eq('estado_activo', true);
      if (error) throw error;
      return data;
    },
  });

  const { data: monturas = [] } = useQuery({
    queryKey: ['inventario-monturas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventario')
        .select('id, codigo_referencia, marca, modelo, descripcion, precio_venta, costo_unitario, cantidad_disponible, sedes(nombre)')
        .in('tipo', ['montura', 'lente', 'insumo', 'accesorio'])
        .gt('cantidad_disponible', 0)
        .eq('estado', 'activo')
        .order('marca');
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => {
    setSelectedPaciente(''); setSelectedMontura(''); setTipoProducto('lente');
    setPrecioVenta(0); setCostoLaboratorio(0); setCostoMontura(0);
    setCostoLente(0); setCostoInsumos(0); setComisionFinanciera(0);
  };

  const createOrden = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const calculatedUtilidad = (parseFloat(formData.precio_venta) || 0)
        - (parseFloat(formData.costo_laboratorio) || 0)
        - (parseFloat(formData.costo_montura) || 0)
        - (parseFloat(formData.costo_lente) || 0)
        - (parseFloat(formData.costo_insumos) || 0)
        - (parseFloat(formData.comision_financiera) || 0);

      const { data: orden, error: oe } = await supabase.from('ordenes').insert({
        paciente_id: formData.paciente_id,
        modalidad_pago: formData.modalidad_pago || 'contado',
        total_final: parseFloat(formData.precio_venta) || 0,
        saldo_pendiente: parseFloat(formData.precio_venta) || 0,
      }).select('id').single();
      if (oe) throw oe;

      const { error: pe } = await supabase.from('orden_productos').insert({
        orden_id: orden.id,
        tipo_producto: formData.tipo_producto,
        descripcion: formData.descripcion,
        laboratorio_id: formData.laboratorio_id || null,
        precio_venta: parseFloat(formData.precio_venta) || 0,
        montura_id: formData.montura_id || null,
        costo_montura: parseFloat(formData.costo_montura) || 0,
        costo_laboratorio: parseFloat(formData.costo_laboratorio) || 0,
        costo_lente: parseFloat(formData.costo_lente) || 0,
        costo_insumos: parseFloat(formData.costo_insumos) || 0,
        comision_financiera: parseFloat(formData.comision_financiera) || 0,
        utilidad_calculada: calculatedUtilidad,
      });
      if (pe) throw pe;

      if (formData.montura_id) {
        const inv = monturas.find((m: any) => m.id === formData.montura_id);
        if (inv) {
          await supabase.from('inventario')
            .update({ cantidad_disponible: Math.max(0, inv.cantidad_disponible - 1) })
            .eq('id', formData.montura_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-monturas'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setShowForm(false);
      resetForm();
      toast.success('Orden creada exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPaciente) { toast.error('Seleccione un paciente'); return; }
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = { paciente_id: selectedPaciente };
    fd.forEach((v, k) => { data[k] = v; });
    data.tipo_producto = tipoProducto;
    data.montura_id = selectedMontura || null;
    data.precio_venta = precioVenta;
    data.costo_laboratorio = costoLaboratorio;
    data.costo_montura = costoMontura;
    data.costo_lente = costoLente;
    data.costo_insumos = costoInsumos;
    data.comision_financiera = comisionFinanciera;
    createOrden.mutate(data);
  };

  // When selecting an inventory item, auto-fill costo_montura
  const handleMonturaChange = (val: string) => {
    setSelectedMontura(val === 'none' ? '' : val);
    if (val && val !== 'none') {
      const inv = monturas.find((m: any) => m.id === val);
      if (inv) setCostoMontura(inv.costo_unitario || inv.precio_venta || 0);
    } else {
      setCostoMontura(0);
    }
  };

  const selectedInvItem = monturas.find((m: any) => m.id === selectedMontura);

  return (
    <AppLayout>
      <PageHeader title="Órdenes" description="Seguimiento de producción y entregas">
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Orden</Button>
      </PageHeader>
      <KanbanBoard />

      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Orden</DialogTitle></DialogHeader>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo Producto *</Label>
                <Select value={tipoProducto} onValueChange={setTipoProducto}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lente">Lente</SelectItem>
                    <SelectItem value="montura">Montura</SelectItem>
                    <SelectItem value="insumo">Insumo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Laboratorio</Label>
                <Select name="laboratorio_id">
                  <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    {labs.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Inventory item selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />Ítem de Inventario (opcional)</Label>
              <Select value={selectedMontura} onValueChange={handleMonturaChange}>
                <SelectTrigger><SelectValue placeholder="Vincular ítem del inventario" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vincular</SelectItem>
                  {monturas.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.codigo_referencia ? `[${m.codigo_referencia}] ` : ''}{m.marca || ''} {m.modelo || ''} — Stock: {m.cantidad_disponible}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedInvItem && (
                <div className="bg-muted/50 rounded-md p-2 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{selectedInvItem.marca} {selectedInvItem.modelo}</span>
                    <Badge variant="outline" className="text-[10px]">Stock: {selectedInvItem.cantidad_disponible}</Badge>
                  </div>
                  <p className="text-muted-foreground">{selectedInvItem.descripcion}</p>
                  <p>Precio: <span className="font-medium">${selectedInvItem.precio_venta?.toLocaleString('es-CO')}</span></p>
                </div>
              )}
            </div>

            <div className="space-y-2"><Label>Descripción *</Label><Input name="descripcion" required placeholder="Progresivo Varilux X" /></div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Modalidad Pago</Label>
                <Select name="modalidad_pago" defaultValue="contado">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contado">Contado</SelectItem>
                    <SelectItem value="nomina">Nómina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Cost breakdown */}
            <div className="space-y-3">
              <Label className="flex items-center gap-1 text-sm font-semibold"><Calculator className="h-4 w-4 text-primary" />Desglose de Costos</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Precio Final (Venta)</Label>
                  <Input type="number" step="100" value={precioVenta || ''} onChange={(e) => setPrecioVenta(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Costo Laboratorio</Label>
                  <Input type="number" step="100" value={costoLaboratorio || ''} onChange={(e) => setCostoLaboratorio(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Costo Montura</Label>
                  <Input type="number" step="100" value={costoMontura || ''} onChange={(e) => setCostoMontura(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Costo Lente</Label>
                  <Input type="number" step="100" value={costoLente || ''} onChange={(e) => setCostoLente(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Costo Insumos</Label>
                  <Input type="number" step="100" value={costoInsumos || ''} onChange={(e) => setCostoInsumos(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Comisión Financiera</Label>
                  <Input type="number" step="100" value={comisionFinanciera || ''} onChange={(e) => setComisionFinanciera(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
              </div>

              {/* Utility preview */}
              <div className={`rounded-lg p-3 flex items-center justify-between ${utilidad >= 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-destructive/10 border border-destructive/30'}`}>
                <span className="text-sm font-medium">Utilidad Calculada</span>
                <span className={`text-lg font-bold ${utilidad >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  ${utilidad.toLocaleString('es-CO')}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createOrden.isPending}>{createOrden.isPending ? 'Creando...' : 'Crear Orden'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
