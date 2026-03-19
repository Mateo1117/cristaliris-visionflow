import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeudaEmpresasCard } from '@/components/reports/DeudaEmpresasCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DollarSign, TrendingUp, CreditCard, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Billing() {
  const [showAbono, setShowAbono] = useState(false);
  const [selectedOrden, setSelectedOrden] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ['ordenes-cartera'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordenes')
        .select('*, pacientes(nombres, apellidos, numero_documento), sedes(nombre)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: abonos = [] } = useQuery({
    queryKey: ['abonos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('abonos')
        .select('*, pacientes(nombres, apellidos), ordenes(id)')
        .order('fecha_abono', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: cajas = [] } = useQuery({
    queryKey: ['caja-diaria'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('caja_diaria')
        .select('*, sedes(nombre)')
        .order('fecha', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const createAbono = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { error } = await supabase.from('abonos').insert({
        orden_id: formData.orden_id,
        paciente_id: formData.paciente_id,
        monto: parseFloat(formData.monto),
        medio_pago: formData.medio_pago,
        referencia_pago: formData.referencia_pago || null,
        observaciones: formData.observaciones || null,
      });
      if (error) throw error;

      // Update saldo_pendiente
      const newSaldo = (selectedOrden?.saldo_pendiente || 0) - parseFloat(formData.monto);
      await supabase.from('ordenes').update({
        saldo_pendiente: Math.max(0, newSaldo),
        estado_pago: newSaldo <= 0 ? 'pagado' : 'parcial',
      }).eq('id', formData.orden_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes-cartera'] });
      queryClient.invalidateQueries({ queryKey: ['abonos'] });
      setShowAbono(false);
      setSelectedOrden(null);
      toast.success('Abono registrado exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleAbonoSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrden) return;
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = { orden_id: selectedOrden.id, paciente_id: selectedOrden.paciente_id };
    fd.forEach((v, k) => { data[k] = v; });
    createAbono.mutate(data);
  };

  const totalPendiente = ordenes.reduce((s: number, o: any) => s + (o.saldo_pendiente || 0), 0);
  const totalVentas = ordenes.reduce((s: number, o: any) => s + (o.total_final || 0), 0);

  const estadoPagoColor: Record<string, string> = {
    pendiente: 'bg-destructive/10 text-destructive',
    parcial: 'bg-warning/10 text-warning',
    pagado: 'bg-success/10 text-success',
  };

  return (
    <AppLayout>
      <PageHeader title="Cartera" description="Control financiero, abonos y caja diaria" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">Total Ventas</p><p className="text-lg font-bold">${totalVentas.toLocaleString('es-CO')}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center"><Wallet className="h-5 w-5 text-warning" /></div>
          <div><p className="text-xs text-muted-foreground">Cartera Pendiente</p><p className="text-lg font-bold">${totalPendiente.toLocaleString('es-CO')}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-success" /></div>
          <div><p className="text-xs text-muted-foreground">Recaudo</p><p className="text-lg font-bold">${(totalVentas - totalPendiente).toLocaleString('es-CO')}</p></div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="cartera">
        <TabsList className="mb-4">
          <TabsTrigger value="cartera">Cartera</TabsTrigger>
          <TabsTrigger value="nomina">Deuda Nómina</TabsTrigger>
          <TabsTrigger value="abonos">Abonos Recientes</TabsTrigger>
          <TabsTrigger value="caja">Caja Diaria</TabsTrigger>
        </TabsList>

        <TabsContent value="cartera">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Modalidad</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : ordenes.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay órdenes registradas</TableCell></TableRow>
                ) : ordenes.map((o: any) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.pacientes?.nombres} {o.pacientes?.apellidos}</TableCell>
                    <TableCell>${(o.total_final || 0).toLocaleString('es-CO')}</TableCell>
                    <TableCell className="font-medium">${(o.saldo_pendiente || 0).toLocaleString('es-CO')}</TableCell>
                    <TableCell><Badge className={`text-[10px] ${estadoPagoColor[o.estado_pago] || ''}`}>{o.estado_pago}</Badge></TableCell>
                    <TableCell className="text-sm">{o.modalidad_pago}</TableCell>
                    <TableCell>
                      {o.estado_pago !== 'pagado' && (
                        <Button size="sm" variant="outline" onClick={() => { setSelectedOrden(o); setShowAbono(true); }}>
                          <CreditCard className="h-3.5 w-3.5 mr-1" />Abonar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="abonos">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Medio de Pago</TableHead>
                  <TableHead>Referencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abonos.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No hay abonos registrados</TableCell></TableRow>
                ) : abonos.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{new Date(a.fecha_abono).toLocaleDateString('es-CO')}</TableCell>
                    <TableCell className="font-medium">{a.pacientes?.nombres} {a.pacientes?.apellidos}</TableCell>
                    <TableCell className="font-medium text-success">${a.monto.toLocaleString('es-CO')}</TableCell>
                    <TableCell className="text-sm">{a.medio_pago}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.referencia_pago || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="caja">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Efectivo</TableHead>
                  <TableHead>Tarjeta</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cajas.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay registros de caja</TableCell></TableRow>
                ) : cajas.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{new Date(c.fecha).toLocaleDateString('es-CO')}</TableCell>
                    <TableCell className="text-sm">{(c as any).sedes?.nombre || '—'}</TableCell>
                    <TableCell>${(c.monto_apertura || 0).toLocaleString('es-CO')}</TableCell>
                    <TableCell>${(c.ingresos_efectivo || 0).toLocaleString('es-CO')}</TableCell>
                    <TableCell>${(c.ingresos_tarjeta || 0).toLocaleString('es-CO')}</TableCell>
                    <TableCell><Badge variant={c.estado === 'abierta' ? 'default' : 'secondary'}>{c.estado}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showAbono} onOpenChange={setShowAbono}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Abono</DialogTitle></DialogHeader>
          {selectedOrden && (
            <div className="text-sm text-muted-foreground mb-2">
              Paciente: <strong>{selectedOrden.pacientes?.nombres} {selectedOrden.pacientes?.apellidos}</strong><br />
              Saldo pendiente: <strong>${(selectedOrden.saldo_pendiente || 0).toLocaleString('es-CO')}</strong>
            </div>
          )}
          <form onSubmit={handleAbonoSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Monto *</Label>
              <Input name="monto" type="number" step="100" required placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Medio de Pago *</Label>
              <Select name="medio_pago" required defaultValue="efectivo">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="nequi">Nequi</SelectItem>
                  <SelectItem value="daviplata">Daviplata</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Referencia de Pago</Label><Input name="referencia_pago" placeholder="No. comprobante" /></div>
            <div className="space-y-2"><Label>Observaciones</Label><Textarea name="observaciones" placeholder="Notas adicionales..." rows={2} /></div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowAbono(false)}>Cancelar</Button>
              <Button type="submit" disabled={createAbono.isPending}>{createAbono.isPending ? 'Guardando...' : 'Registrar Abono'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
