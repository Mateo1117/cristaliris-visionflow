import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KanbanBoard } from '@/components/orders/KanbanBoard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Orders() {
  const [showForm, setShowForm] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState('');
  const queryClient = useQueryClient();

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

  const createOrden = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      // Create order
      const { data: orden, error: oe } = await supabase.from('ordenes').insert({
        paciente_id: formData.paciente_id,
        modalidad_pago: formData.modalidad_pago || 'contado',
        total_final: parseFloat(formData.total_final) || 0,
        saldo_pendiente: parseFloat(formData.total_final) || 0,
      }).select('id').single();
      if (oe) throw oe;

      // Create product
      const { error: pe } = await supabase.from('orden_productos').insert({
        orden_id: orden.id,
        tipo_producto: formData.tipo_producto,
        descripcion: formData.descripcion,
        laboratorio_id: formData.laboratorio_id || null,
        precio_venta: parseFloat(formData.precio_venta) || 0,
      });
      if (pe) throw pe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      setShowForm(false);
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
    data.total_final = data.precio_venta;
    createOrden.mutate(data);
  };

  return (
    <AppLayout>
      <PageHeader title="Órdenes" description="Seguimiento de producción y entregas">
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Orden</Button>
      </PageHeader>
      <KanbanBoard />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
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
                <Select name="tipo_producto" defaultValue="lente">
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
            <div className="space-y-2"><Label>Descripción *</Label><Input name="descripcion" required placeholder="Progresivo Varilux X" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Precio Venta</Label><Input name="precio_venta" type="number" step="100" defaultValue="0" /></div>
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
