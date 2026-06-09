import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Building2, Beaker, Printer, RotateCcw, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  loadPrintSettings,
  savePrintSettings,
  resetPrintSettings,
  DEFAULT_PRINT_SETTINGS,
  type PrintSettings,
  type Orientation,
} from '@/lib/printing/printSettings';
import { printThermalLabel, printThermalReceipt } from '@/lib/printing/thermal';

export default function SettingsPage() {
  const [showSedeForm, setShowSedeForm] = useState(false);
  const [showLabForm, setShowLabForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sedes').select('*').order('nombre');
      if (error) throw error;
      return data;
    },
  });

  const { data: labs = [] } = useQuery({
    queryKey: ['labs-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('laboratorios').select('*').order('nombre');
      if (error) throw error;
      return data;
    },
  });

  const createSede = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { error } = await supabase.from('sedes').insert({
        nombre: formData.nombre,
        direccion: formData.direccion || null,
        telefono: formData.telefono || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sedes-config'] });
      setShowSedeForm(false);
      toast.success('Sede creada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createLab = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { error } = await supabase.from('laboratorios').insert({
        nombre: formData.nombre,
        contacto: formData.contacto || null,
        telefono: formData.telefono || null,
        email: formData.email || null,
        tiempo_promedio_entrega: parseInt(formData.tiempo_promedio_entrega) || 3,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labs-config'] });
      setShowLabForm(false);
      toast.success('Laboratorio creado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmitForm = (mutate: any, close: () => void) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    fd.forEach((v, k) => { data[k] = v; });
    mutate(data);
  };

  return (
    <AppLayout>
      <PageHeader title="Configuración" description="Configuración del sistema, sedes y laboratorios" />

      <Tabs defaultValue="sedes">
        <TabsList className="mb-4">
          <TabsTrigger value="sedes">Sedes</TabsTrigger>
          <TabsTrigger value="laboratorios">Laboratorios</TabsTrigger>
          <TabsTrigger value="impresion"><Printer className="h-4 w-4 mr-1" />Impresión</TabsTrigger>
        </TabsList>

        <TabsContent value="impresion">
          <PrintSettingsTab />
        </TabsContent>

        <TabsContent value="sedes">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setShowSedeForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Sede</Button>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sedes.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{s.nombre}</TableCell>
                    <TableCell className="text-sm">{s.direccion || '—'}</TableCell>
                    <TableCell className="text-sm">{s.telefono || '—'}</TableCell>
                    <TableCell><Badge variant={s.estado_activa ? 'default' : 'secondary'}>{s.estado_activa ? 'Activa' : 'Inactiva'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="laboratorios">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setShowLabForm(true)}><Plus className="h-4 w-4 mr-1" />Nuevo Laboratorio</Button>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Tiempo Entrega</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {labs.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium flex items-center gap-2"><Beaker className="h-4 w-4 text-muted-foreground" />{l.nombre}</TableCell>
                    <TableCell className="text-sm">{l.contacto || '—'}</TableCell>
                    <TableCell className="text-sm">{l.telefono || '—'}</TableCell>
                    <TableCell className="text-sm">{l.tiempo_promedio_entrega} días</TableCell>
                    <TableCell><Badge variant={l.estado_activo ? 'default' : 'secondary'}>{l.estado_activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sede Form */}
      <Dialog open={showSedeForm} onOpenChange={setShowSedeForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva Sede</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitForm(createSede.mutate, () => setShowSedeForm(false))} className="space-y-4">
            <div className="space-y-2"><Label>Nombre *</Label><Input name="nombre" required placeholder="Sede Centro" /></div>
            <div className="space-y-2"><Label>Dirección</Label><Input name="direccion" placeholder="Cra 7 #45-67" /></div>
            <div className="space-y-2"><Label>Teléfono</Label><Input name="telefono" placeholder="601-1234567" /></div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowSedeForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createSede.isPending}>{createSede.isPending ? 'Guardando...' : 'Crear Sede'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lab Form */}
      <Dialog open={showLabForm} onOpenChange={setShowLabForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo Laboratorio</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitForm(createLab.mutate, () => setShowLabForm(false))} className="space-y-4">
            <div className="space-y-2"><Label>Nombre *</Label><Input name="nombre" required placeholder="Lab Óptico" /></div>
            <div className="space-y-2"><Label>Contacto</Label><Input name="contacto" placeholder="Nombre del contacto" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Teléfono</Label><Input name="telefono" placeholder="601-..." /></div>
              <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" placeholder="lab@email.com" /></div>
            </div>
            <div className="space-y-2"><Label>Tiempo Promedio Entrega (días)</Label><Input name="tiempo_promedio_entrega" type="number" defaultValue="3" /></div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowLabForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createLab.isPending}>{createLab.isPending ? 'Guardando...' : 'Crear Laboratorio'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
