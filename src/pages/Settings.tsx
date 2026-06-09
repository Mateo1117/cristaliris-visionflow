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
  fetchPrintSettings,
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

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña: Configuración de tamaños de impresión (auto-ajuste)
// ─────────────────────────────────────────────────────────────────────────────

const PRESETS: Array<{ label: string; widthMm: number; heightMm: number; orientation: Orientation; target: 'receipt' | 'label' | 'both' }> = [
  { label: 'Ticket 30×50 (térmico)',    widthMm: 30, heightMm: 50, orientation: 'portrait',  target: 'receipt' },
  { label: 'Ticket 58×80 (térmico)',    widthMm: 58, heightMm: 80, orientation: 'portrait',  target: 'receipt' },
  { label: 'Ticket 80×120 (térmico)',   widthMm: 80, heightMm: 120, orientation: 'portrait', target: 'receipt' },
  { label: 'Etiqueta 60×40 (QR lateral)', widthMm: 60, heightMm: 40, orientation: 'landscape', target: 'label' },
  { label: 'Etiqueta 40×30 (mini)',     widthMm: 40, heightMm: 30, orientation: 'landscape', target: 'label' },
  { label: 'Etiqueta 50×50 (cuadrada)', widthMm: 50, heightMm: 50, orientation: 'portrait',  target: 'label' },
  { label: 'Etiqueta 100×50 (ancha)',   widthMm: 100, heightMm: 50, orientation: 'landscape', target: 'label' },
];

function PrintSettingsTab() {
  const [settings, setSettings] = useState<PrintSettings>(() => loadPrintSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Carga inicial desde la BD (rehidrata caché) y refresca el estado.
  useEffect(() => {
    let mounted = true;
    fetchPrintSettings()
      .then(s => { if (mounted) setSettings(s); })
      .catch(() => {/* mantiene caché */})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const update = (key: 'receipt' | 'label', field: 'widthMm' | 'heightMm' | 'orientation', value: any) => {
    setSettings(prev => ({ ...prev, [key]: { ...prev[key], [field]: field === 'orientation' ? value : Number(value) || 0 } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePrintSettings(settings);
      toast.success('Parámetros de impresión guardados');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar en la base de datos');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await savePrintSettings(DEFAULT_PRINT_SETTINGS);
      resetPrintSettings();
      setSettings(DEFAULT_PRINT_SETTINGS);
      toast.success('Valores restaurados a los predeterminados');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo restaurar');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (p: typeof PRESETS[number]) => {
    setSettings(prev => {
      if (p.target === 'receipt') return { ...prev, receipt: { widthMm: p.widthMm, heightMm: p.heightMm, orientation: p.orientation } };
      if (p.target === 'label')   return { ...prev, label:   { widthMm: p.widthMm, heightMm: p.heightMm, orientation: p.orientation } };
      return prev;
    });
  };

  const testReceipt = async () => {
    try { await savePrintSettings(settings); } catch {/* sigue con caché */}
    printThermalReceipt({
      numero: 'PRUEBA-0001',
      fecha: new Date(),
      paciente: 'Paciente de prueba',
      items: [
        { descripcion: 'Lente progresivo', cantidad: 1, precio: 350000 },
        { descripcion: 'Montura Ray-Ban', cantidad: 1, precio: 280000 },
      ],
      total: 630000,
      abonado: 300000,
      saldo: 330000,
    });
  };

  const testLabel = async () => {
    try { await savePrintSettings(settings); } catch {/* sigue con caché */}
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/><rect x="10" y="10" width="80" height="80" fill="#000"/><rect x="25" y="25" width="50" height="50" fill="#fff"/><rect x="40" y="40" width="20" height="20" fill="#000"/></svg>`;
    await printThermalLabel({
      numero: 'ORD-0001',
      qrSvg: svg,
      paciente: 'Paciente Prueba',
      descripcion: 'Lente progresivo AR',
      laboratorio: 'Lab Óptico',
      numeroMontura: 'M-123',
    });
  };


  const SizeCard = ({
    title,
    description,
    sizeKey,
    onTest,
  }: {
    title: string;
    description: string;
    sizeKey: 'receipt' | 'label';
    onTest: () => void;
  }) => {
    const s = settings[sizeKey];
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ancho (mm)</Label>
              <Input type="number" min={20} max={210} value={s.widthMm}
                onChange={(e) => update(sizeKey, 'widthMm', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Alto (mm)</Label>
              <Input type="number" min={20} max={297} value={s.heightMm}
                onChange={(e) => update(sizeKey, 'heightMm', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Orientación</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={s.orientation}
                onChange={(e) => update(sizeKey, 'orientation', e.target.value as Orientation)}
              >
                <option value="portrait">Vertical</option>
                <option value="landscape">Horizontal</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.filter(p => p.target === sizeKey).map(p => (
              <Button key={p.label} type="button" size="sm" variant="outline" onClick={() => applyPreset(p)}>
                {p.label}
              </Button>
            ))}
          </div>

          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              Vista PDF: {s.widthMm} × {s.heightMm} mm ({s.orientation === 'portrait' ? 'vertical' : 'horizontal'})
            </span>
            <Button type="button" size="sm" onClick={onTest}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir prueba
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Define el tamaño exacto del medio (en milímetros). El contenido (fuentes,
          paddings y QR) se <strong>auto-ajusta</strong> a las dimensiones elegidas.
          En el diálogo de impresión selecciona la impresora térmica con
          <span className="px-1 font-medium">Escala = 100%</span> y
          <span className="px-1 font-medium">Márgenes = Ninguno</span>.
        </CardContent>
      </Card>

      <SizeCard
        title="Ticket / Recibo"
        description="Tamaño del ticket de venta impreso desde la orden."
        sizeKey="receipt"
        onTest={testReceipt}
      />

      <SizeCard
        title="Etiqueta con QR"
        description="Tamaño de la etiqueta con código QR para trazabilidad."
        sizeKey="label"
        onTest={testLabel}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1" /> Restaurar predeterminados
        </Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-1" /> Guardar parámetros
        </Button>
      </div>
    </div>
  );
}
