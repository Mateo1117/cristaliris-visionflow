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
import { Plus, Building2, Beaker, Printer, RotateCcw, Save, ArrowLeftRight, CalendarDays, Pencil, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useState, useEffect, useCallback } from 'react';
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
  type PrintSize,
  type Orientation,
} from '@/lib/printing/printSettings';
import { printThermalLabel, printThermalReceipt } from '@/lib/printing/thermal';
import { FestivosManager } from '@/components/settings/FestivosManager';
import { LabelDesigner } from '@/components/settings/LabelDesigner';
import { PdfLabelPreview } from '@/components/settings/PdfLabelPreview';
import {
  buildDefaultLayout,
  clampLayout,
  reflowLayout,
  scaleLayout,
  type LabelLayout,
} from '@/lib/printing/labelLayout';
import {
  loadLabelCalibration,
  saveLabelCalibration,
  resetLabelCalibration,
  DEFAULT_LABEL_CALIBRATION,
  type LabelCalibration,
} from '@/lib/printing/calibration';

import { NumeracionOrdenes } from '@/components/settings/NumeracionOrdenes';
import { EmpresaDialog, type Empresa } from '@/components/patients/EmpresaDialog';

type Tabla = 'sedes' | 'laboratorios' | 'empresas';

export default function SettingsPage() {
  /** Sede o laboratorio en edición: {} = nuevo, con id = editar, null = cerrado. */
  const [sedeEdit, setSedeEdit] = useState<Record<string, any> | null>(null);
  const [labEdit, setLabEdit] = useState<Record<string, any> | null>(null);
  const [empresaEdit, setEmpresaEdit] = useState<Partial<Empresa> | null>(null);
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

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresas').select('*').order('razon_social');
      if (error) throw error;
      return data;
    },
  });

  const refrescar = (tabla: Tabla) => {
    if (tabla === 'empresas') {
      queryClient.invalidateQueries({ queryKey: ['empresas-admin'] });
      queryClient.invalidateQueries({ queryKey: ['empresas-activas'] });
      return;
    }
    queryClient.invalidateQueries({ queryKey: [tabla === 'sedes' ? 'sedes-config' : 'labs-config'] });
    // Listas de sedes y laboratorios en el resto de la app.
    queryClient.invalidateQueries({ queryKey: ['sedes-activas'] });
    queryClient.invalidateQueries({ queryKey: ['sedes-agenda'] });
    queryClient.invalidateQueries({ queryKey: ['sedes-schedule'] });
  };

  const guardar = useMutation({
    mutationFn: async ({ tabla, id, fila }: { tabla: Tabla; id?: string; fila: Record<string, any> }) => {
      const { error } = id
        ? await supabase.from(tabla).update(fila as any).eq('id', id)
        : await supabase.from(tabla).insert(fila as any);
      if (error) throw error;
    },
    onSuccess: (_, { tabla, id }) => {
      refrescar(tabla);
      if (tabla === 'sedes') setSedeEdit(null); else setLabEdit(null);
      toast.success(`${tabla === 'sedes' ? 'Sede' : 'Laboratorio'} ${id ? 'actualizado' : 'creado'}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cambiarEstado = useMutation({
    mutationFn: async ({ tabla, id, activo }: { tabla: Tabla; id: string; activo: boolean }) => {
      const campo = tabla === 'laboratorios' ? 'estado_activo' : 'estado_activa';
      const { error } = await supabase.from(tabla).update({ [campo]: activo } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { tabla, activo }) => {
      refrescar(tabla);
      toast.success(activo ? 'Activado' : 'Desactivado: ya no aparece para nuevos registros');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async ({ tabla, id }: { tabla: Tabla; id: string; nombre: string }) => {
      const { error } = await supabase.from(tabla).delete().eq('id', id);
      if (error?.code === '23503') throw new Error('Tiene pacientes u órdenes asociados: desactívela con el interruptor en lugar de eliminarla');
      if (error) throw error;
    },
    onSuccess: (_, { tabla, nombre }) => {
      refrescar(tabla);
      toast.success(`"${nombre}" eliminado`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const enviarSede = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    guardar.mutate({
      tabla: 'sedes', id: sedeEdit?.id,
      fila: { nombre: String(fd.get('nombre')).trim(), direccion: (fd.get('direccion') as string) || null, telefono: (fd.get('telefono') as string) || null },
    });
  };

  const enviarLab = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    guardar.mutate({
      tabla: 'laboratorios', id: labEdit?.id,
      fila: {
        nombre: String(fd.get('nombre')).trim(),
        contacto: (fd.get('contacto') as string) || null,
        telefono: (fd.get('telefono') as string) || null,
        email: (fd.get('email') as string) || null,
        tiempo_promedio_entrega: parseInt(fd.get('tiempo_promedio_entrega') as string) || 3,
      },
    });
  };

  const acciones = (tabla: Tabla, fila: any, activo: boolean, editar: () => void) => (
    <div className="flex items-center justify-end gap-1">
      <Switch checked={activo} onCheckedChange={(v) => cambiarEstado.mutate({ tabla, id: fila.id, activo: v })} aria-label={activo ? 'Desactivar' : 'Activar'} />
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={editar} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Eliminar"
        onClick={() => {
          const quedan = tabla === 'sedes'
            ? 'Los pacientes, citas y órdenes que la usaban se conservan sin sede, y se borran las franjas de horario de esa sede.'
            : tabla === 'empresas'
              ? 'Solo se puede eliminar si ningún paciente ni orden la usa.'
              : 'Las órdenes y garantías que lo usaban se conservan sin laboratorio asignado.';
          const nombre = fila.nombre ?? fila.razon_social;
          if (confirm(`¿Eliminar "${nombre}" definitivamente?\n\n${quedan}\n\nSi solo quiere dejar de usarlo, use el interruptor para desactivarlo.`)) {
            eliminar.mutate({ tabla, id: fila.id, nombre });
          }
        }}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <AppLayout>
      <PageHeader title="Configuración" description="Sedes, laboratorios, empresas con convenio, festivos e impresión" />

      <Tabs defaultValue="sedes">
        <TabsList className="mb-4">
          <TabsTrigger value="sedes">Sedes</TabsTrigger>
          <TabsTrigger value="laboratorios">Laboratorios</TabsTrigger>
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="numeracion">Numeración</TabsTrigger>
          <TabsTrigger value="festivos"><CalendarDays className="h-4 w-4 mr-1" />Festivos</TabsTrigger>
          <TabsTrigger value="impresion"><Printer className="h-4 w-4 mr-1" />Impresión</TabsTrigger>
        </TabsList>

        <TabsContent value="numeracion">
          <NumeracionOrdenes />
        </TabsContent>

        <TabsContent value="festivos">
          <FestivosManager />
        </TabsContent>

        <TabsContent value="impresion">
          <PrintSettingsTab />
        </TabsContent>

        <TabsContent value="sedes">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setSedeEdit({})}><Plus className="h-4 w-4 mr-1" />Nueva Sede</Button>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sedes.map((s: any) => (
                  <TableRow key={s.id} className={s.estado_activa ? '' : 'opacity-60'}>
                    <TableCell className="font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{s.nombre}</TableCell>
                    <TableCell className="text-sm">{s.direccion || '—'}</TableCell>
                    <TableCell className="text-sm">{s.telefono || '—'}</TableCell>
                    <TableCell><Badge variant={s.estado_activa ? 'default' : 'secondary'}>{s.estado_activa ? 'Activa' : 'Inactiva'}</Badge></TableCell>
                    <TableCell>{acciones('sedes', s, s.estado_activa, () => setSedeEdit(s))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="laboratorios">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setLabEdit({})}><Plus className="h-4 w-4 mr-1" />Nuevo Laboratorio</Button>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Tiempo Entrega</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {labs.map((l: any) => (
                  <TableRow key={l.id} className={l.estado_activo ? '' : 'opacity-60'}>
                    <TableCell className="font-medium flex items-center gap-2"><Beaker className="h-4 w-4 text-muted-foreground" />{l.nombre}</TableCell>
                    <TableCell className="text-sm">{l.contacto || '—'}</TableCell>
                    <TableCell className="text-sm">{l.telefono || '—'}</TableCell>
                    <TableCell className="text-sm">{l.tiempo_promedio_entrega} días</TableCell>
                    <TableCell><Badge variant={l.estado_activo ? 'default' : 'secondary'}>{l.estado_activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                    <TableCell>{acciones('laboratorios', l, l.estado_activo, () => setLabEdit(l))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="empresas">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm text-muted-foreground">Empresas con convenio de las que vienen los pacientes. El descuento se aplica al crear la orden. También se pueden crear desde el registro del paciente.</p>
            <Button className="shrink-0" onClick={() => setEmpresaEdit({})}><Plus className="h-4 w-4 mr-1" />Nueva empresa</Button>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>NIT</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {empresas.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Aún no hay empresas registradas.</TableCell></TableRow>
                )}
                {empresas.map((e: any) => (
                  <TableRow key={e.id} className={e.estado_activa ? '' : 'opacity-60'}>
                    <TableCell className="font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{e.razon_social}</TableCell>
                    <TableCell className="text-sm">{e.nit}</TableCell>
                    <TableCell className="text-sm">{e.porcentaje_descuento} %</TableCell>
                    <TableCell className="text-sm">{[e.contacto_rrhh, e.telefono].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell><Badge variant={e.estado_activa ? 'default' : 'secondary'}>{e.estado_activa ? 'Activa' : 'Inactiva'}</Badge></TableCell>
                    <TableCell>{acciones('empresas', e, e.estado_activa, () => setEmpresaEdit(e))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <EmpresaDialog empresa={empresaEdit} onOpenChange={(o) => { if (!o) setEmpresaEdit(null); }} />

      {/* Sede: crear / editar */}
      <Dialog open={!!sedeEdit} onOpenChange={(o) => { if (!o) setSedeEdit(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{sedeEdit?.id ? 'Editar sede' : 'Nueva sede'}</DialogTitle></DialogHeader>
          <form key={sedeEdit?.id ?? 'nueva'} onSubmit={enviarSede} className="space-y-4">
            <div className="space-y-2"><Label>Nombre *</Label><Input name="nombre" required defaultValue={sedeEdit?.nombre ?? ''} placeholder="Sede Centro" /></div>
            <div className="space-y-2"><Label>Dirección</Label><Input name="direccion" defaultValue={sedeEdit?.direccion ?? ''} placeholder="Cra 7 #45-67" /></div>
            <div className="space-y-2"><Label>Teléfono</Label><Input name="telefono" defaultValue={sedeEdit?.telefono ?? ''} placeholder="601-1234567" /></div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setSedeEdit(null)}>Cancelar</Button>
              <Button type="submit" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando...' : sedeEdit?.id ? 'Guardar cambios' : 'Crear sede'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Laboratorio: crear / editar */}
      <Dialog open={!!labEdit} onOpenChange={(o) => { if (!o) setLabEdit(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{labEdit?.id ? 'Editar laboratorio' : 'Nuevo laboratorio'}</DialogTitle></DialogHeader>
          <form key={labEdit?.id ?? 'nuevo'} onSubmit={enviarLab} className="space-y-4">
            <div className="space-y-2"><Label>Nombre *</Label><Input name="nombre" required defaultValue={labEdit?.nombre ?? ''} placeholder="Lab Óptico" /></div>
            <div className="space-y-2"><Label>Contacto</Label><Input name="contacto" defaultValue={labEdit?.contacto ?? ''} placeholder="Nombre del contacto" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Teléfono</Label><Input name="telefono" defaultValue={labEdit?.telefono ?? ''} placeholder="601-..." /></div>
              <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" defaultValue={labEdit?.email ?? ''} placeholder="lab@email.com" /></div>
            </div>
            <div className="space-y-2"><Label>Tiempo promedio de entrega (días)</Label><Input name="tiempo_promedio_entrega" type="number" min={0} defaultValue={labEdit?.tiempo_promedio_entrega ?? 3} /></div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setLabEdit(null)}>Cancelar</Button>
              <Button type="submit" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando...' : labEdit?.id ? 'Guardar cambios' : 'Crear laboratorio'}</Button>
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
  { label: 'Etiqueta 50×30 (rollo estándar)', widthMm: 50, heightMm: 30, orientation: 'landscape', target: 'label' },
  { label: 'Etiqueta 60×40 (QR lateral)', widthMm: 60, heightMm: 40, orientation: 'landscape', target: 'label' },
  { label: 'Etiqueta 40×30 (mini)',     widthMm: 40, heightMm: 30, orientation: 'landscape', target: 'label' },
  { label: 'Etiqueta 50×50 (cuadrada)', widthMm: 50, heightMm: 50, orientation: 'portrait',  target: 'label' },
  { label: 'Etiqueta 100×50 (ancha)',   widthMm: 100, heightMm: 50, orientation: 'landscape', target: 'label' },
];

/**
 * Tarjeta de tamaño de medio. Definida FUERA del componente padre: antes vivía
 * dentro y React la recreaba en cada pulsación, lo que hacía que los campos
 * perdieran el foco al escribir.
 */
function SizeCard({
  title, description, size, presets, onUpdate, onSwap, onPreset, onTest,
}: {
  title: string;
  description: string;
  size: PrintSize;
  presets: typeof PRESETS;
  onUpdate: (field: 'widthMm' | 'heightMm' | 'orientation' | 'rotateContent', value: any) => void;
  onSwap: () => void;
  onPreset: (p: typeof PRESETS[number]) => void;
  onTest: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_1fr] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Ancho (mm)</Label>
            <Input type="number" min={10} max={210} step="0.5" value={size.widthMm}
              onChange={(e) => onUpdate('widthMm', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Alto (mm)</Label>
            <Input type="number" min={10} max={297} step="0.5" value={size.heightMm}
              onChange={(e) => onUpdate('heightMm', e.target.value)} />
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onSwap}
            title="Intercambiar ancho y alto" className="mb-0.5">
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <div className="space-y-1.5">
            <Label className="text-xs">Orientación</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={size.orientation}
              onChange={(e) => onUpdate('orientation', e.target.value as Orientation)}
            >
              <option value="portrait">Vertical</option>
              <option value="landscape">Horizontal</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={!!size.rotateContent}
            onChange={(e) => onUpdate('rotateContent', e.target.checked)}
          />
          <span>
            Rotar contenido 90° <span className="text-xs text-muted-foreground">(usar si la impresora saca el contenido de lado)</span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <Button key={p.label} type="button" size="sm" variant="outline" onClick={() => onPreset(p)}>
              {p.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            Página: {size.orientation === 'landscape'
              ? `${Math.max(size.widthMm, size.heightMm)} × ${Math.min(size.widthMm, size.heightMm)}`
              : `${Math.min(size.widthMm, size.heightMm)} × ${Math.max(size.widthMm, size.heightMm)}`} mm
            {' '}({size.orientation === 'portrait' ? 'vertical' : 'horizontal'}){size.rotateContent ? ' · contenido rotado 90°' : ''}
          </span>
          <Button type="button" size="sm" onClick={onTest}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir prueba
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const layoutFits = (layout: LabelLayout | undefined, widthMm: number, heightMm: number): layout is LabelLayout => {
  return !!layout?.elements?.length && layout.elements.every((el) => {
    const h = el.field === 'qr' ? el.wMm : Math.max(2, el.fontSize * 0.5);
    return el.xMm >= 0 && el.yMm >= 0 && el.xMm + el.wMm <= widthMm + 0.5 && el.yMm + h <= heightMm + 0.5;
  });
};

/**
 * Página efectiva según la orientación: horizontal deja el lado largo a lo
 * ancho y vertical a lo alto. Es la MISMA regla que aplica `thermal.ts` al
 * imprimir, de modo que el lienzo del diseñador siempre coincide con el papel.
 */
export const paginaSegunOrientacion = (widthMm: number, heightMm: number, orientation: Orientation) => {
  const largo = Math.max(widthMm, heightMm);
  const corto = Math.min(widthMm, heightMm);
  return orientation === 'landscape'
    ? { pageW: largo, pageH: corto }
    : { pageW: corto, pageH: largo };
};

type Pagina = { pageW: number; pageH: number };

/**
 * Lleva un diseño de una página a otra.
 *
 * Si la etiqueta pasa de horizontal a vertical (o al revés) el diseño se GIRA
 * 90°, que es lo que espera quien lo dibujó; estirarlo dejaría los elementos
 * aplastados y con huecos en la mitad. Si sólo cambia la medida, se reescala
 * de forma uniforme. En ambos casos se encaja dentro del papel.
 */
const adaptarLayout = (layout: LabelLayout, antes: Pagina, ahora: Pagina): LabelLayout => {
  const eraApaisada = antes.pageW >= antes.pageH;
  const esApaisada = ahora.pageW >= ahora.pageH;

  // Al girar la etiqueta se REORGANIZA (el QR cambia de sitio y los textos se
  // vuelven a apilar); si sólo cambia la medida, basta con reescalar.
  const adaptado = eraApaisada !== esApaisada
    ? reflowLayout(layout, ahora.pageW, ahora.pageH)
    : scaleLayout(layout, antes.pageW, antes.pageH, ahora.pageW, ahora.pageH);

  return clampLayout(adaptado, ahora.pageW, ahora.pageH);
};

function PrintSettingsTab() {
  const [settings, setSettings] = useState<PrintSettings>(() => loadPrintSettings());
  const [calibration, setCalibration] = useState<LabelCalibration>(() => loadLabelCalibration());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // WYSIWYG: el diseñador usa la página REAL que se enviará a la impresora,
  // incluida la orientación. Así se puede diseñar en horizontal o en vertical
  // y lo que se ve es exactamente lo que sale impreso.
  const { pageW: labelDesignWidth, pageH: labelDesignHeight } = paginaSegunOrientacion(
    settings.label.widthMm,
    settings.label.heightMm,
    settings.label.orientation,
  );
  const activeLabelLayout = layoutFits(settings.labelLayout, labelDesignWidth, labelDesignHeight)
    ? settings.labelLayout
    : buildDefaultLayout(labelDesignWidth, labelDesignHeight);

  // Carga inicial desde la BD (rehidrata caché) y refresca el estado.
  useEffect(() => {
    let mounted = true;
    fetchPrintSettings()
      .then(s => { if (mounted) setSettings(s); })
      .catch(() => {/* mantiene caché */})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const update = useCallback((
    key: 'receipt' | 'label',
    field: 'widthMm' | 'heightMm' | 'orientation' | 'rotateContent',
    value: any,
  ) => {
    setSettings(prev => {
      const next: PrintSize = {
        ...prev[key],
        [field]: field === 'orientation'
          ? value
          : field === 'rotateContent'
            ? Boolean(value)
            : (Number(value) || 0),
      };

      // Al cambiar la medida O la orientación de la etiqueta, el diseño se
      // reescala a la nueva página en vez de perderse: los elementos conservan
      // su posición relativa y su proporción.
      const cambiaPagina = field === 'widthMm' || field === 'heightMm' || field === 'orientation';
      if (key === 'label' && cambiaPagina && prev.labelLayout) {
        const antes = paginaSegunOrientacion(prev.label.widthMm, prev.label.heightMm, prev.label.orientation);
        const ahora = paginaSegunOrientacion(next.widthMm, next.heightMm, next.orientation);
        if (ahora.pageW > 0 && ahora.pageH > 0 && antes.pageW > 0 && antes.pageH > 0) {
          return {
            ...prev,
            label: next,
            labelLayout: adaptarLayout(prev.labelLayout, antes, ahora),
          };
        }
      }

      return { ...prev, [key]: next };
    });
  }, []);

  /** Intercambia ancho y alto (útil al cambiar entre etiquetas vertical/horizontal). */
  const swapDimensions = useCallback((key: 'receipt' | 'label') => {
    setSettings(prev => {
      const cur = prev[key];
      const swapped: PrintSize = { ...cur, widthMm: cur.heightMm, heightMm: cur.widthMm };
      if (key === 'label' && prev.labelLayout) {
        const antes = paginaSegunOrientacion(cur.widthMm, cur.heightMm, cur.orientation);
        const ahora = paginaSegunOrientacion(swapped.widthMm, swapped.heightMm, swapped.orientation);
        return { ...prev, label: swapped, labelLayout: adaptarLayout(prev.labelLayout, antes, ahora) };
      }
      return { ...prev, [key]: swapped };
    });
  }, []);

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

  const applyPreset = useCallback((p: typeof PRESETS[number]) => {
    setSettings(prev => {
      if (p.target === 'receipt') {
        return {
          ...prev,
          // Se conserva "rotar contenido": es una compensación del driver, no del tamaño.
          receipt: { ...prev.receipt, widthMm: p.widthMm, heightMm: p.heightMm, orientation: p.orientation },
        };
      }
      if (p.target === 'label') {
        const label: PrintSize = {
          ...prev.label,
          widthMm: p.widthMm,
          heightMm: p.heightMm,
          orientation: p.orientation,
        };
        const antes = paginaSegunOrientacion(prev.label.widthMm, prev.label.heightMm, prev.label.orientation);
        const ahora = paginaSegunOrientacion(p.widthMm, p.heightMm, p.orientation);
        const layout = prev.labelLayout
          ? adaptarLayout(prev.labelLayout, antes, ahora)
          : buildDefaultLayout(ahora.pageW, ahora.pageH);
        return { ...prev, label, labelLayout: layout };
      }
      return prev;
    });
  }, []);

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
    // Datos de ejemplo COMPLETOS: si falta alguno, ese campo no se dibuja y
    // parecería que el diseño está incompleto.
    await printThermalLabel({
      numero: 'ORD-0001',
      qrSvg: svg,
      paciente: 'Paciente Prueba',
      descripcion: 'Lente progresivo AR',
      laboratorio: 'Lab Óptico',
      numeroOrdenLab: 'LAB-4821',
      numeroMontura: 'M-123',
      fechaEntrega: new Date(),
      sede: 'Sede Norte',
      formula: 'OD -1.00 -0.50 x90 / OI -1.25 -0.75 x85',
    });
  };


  return (
    <div className="space-y-4">
      {/* Qué se imprime en la óptica y en qué papel */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Qué se imprime y en qué papel</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Documento</TableHead><TableHead>Dónde</TableHead><TableHead>Papel recomendado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {[
                ['Etiqueta del trabajo (QR)', 'Orden → Imprimir', 'Rollo de etiquetas térmicas 50×30 o 60×40 mm (el QR se lee mejor desde 30 mm de alto)'],
                ['Etiqueta de inventario (montura)', 'Inventario → detalle', 'El mismo rollo de etiquetas'],
                ['Recibo para el paciente', 'Orden → Imprimir', 'Papel térmico de 58 u 80 mm de ancho'],
                ['Fórmula óptica', 'Historia clínica → Fórmula', 'Hoja carta en impresora normal'],
                ['Agenda del día', 'Agenda → Lista → Imprimir', 'Hoja carta'],
              ].map(([doc, donde, papel]) => (
                <TableRow key={doc}>
                  <TableCell className="font-medium text-sm">{doc}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{donde}</TableCell>
                  <TableCell className="text-sm">{papel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground px-4 py-3 border-t">
            Etiquetas y recibos usan los tamaños de abajo. La impresora térmica se conecta una sola vez desde la orden (Imprimir → Conectar); si no imprime, use PDF con ese tamaño de papel, escala 100 % y sin márgenes.
          </p>
        </CardContent>
      </Card>

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
        size={settings.receipt}
        presets={PRESETS.filter(p => p.target === 'receipt')}
        onUpdate={(field, value) => update('receipt', field, value)}
        onSwap={() => swapDimensions('receipt')}
        onPreset={applyPreset}
        onTest={testReceipt}
      />

      <SizeCard
        title="Etiqueta con QR"
        description="Tamaño de la etiqueta con código QR para trazabilidad. El diseño se reescala automáticamente al cambiar la medida."
        size={settings.label}
        presets={PRESETS.filter(p => p.target === 'label')}
        onUpdate={(field, value) => update('label', field, value)}
        onSwap={() => swapDimensions('label')}
        onPreset={applyPreset}
        onTest={testLabel}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diseño visual de la etiqueta</CardTitle>
          <p className="text-xs text-muted-foreground">
            Arrastra el QR y los campos a la posición exacta que quieres que salgan impresos.
            Selecciona un elemento para ajustar tamaño, fuente y alineación.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <span className="font-medium">
              Diseñando en {labelDesignWidth} × {labelDesignHeight} mm
              {' '}({settings.label.orientation === 'landscape' ? 'horizontal' : 'vertical'})
            </span>
            <span className="text-muted-foreground">
              Usa «Girar etiqueta 90°» para diseñar en la otra orientación: el diseño gira con ella
              y así se imprimirá.
            </span>
          </div>
          <LabelDesigner
            widthMm={labelDesignWidth}
            heightMm={labelDesignHeight}
            layout={activeLabelLayout}
            onChange={(l: LabelLayout) => setSettings(prev => ({ ...prev, labelLayout: l }))}
            onRotate={() => update(
              'label',
              'orientation',
              settings.label.orientation === 'landscape' ? 'portrait' : 'landscape',
            )}
          />
          <PdfLabelPreview
            widthMm={labelDesignWidth}
            heightMm={labelDesignHeight}
            orientation={settings.label.orientation}
            rotateContent={settings.label.rotateContent}
            layout={activeLabelLayout}
            marginMm={calibration.marginMm}
            offsetXMm={calibration.offsetXMm}
            offsetYMm={calibration.offsetYMm}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calibración por dispositivo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ajusta el margen interior y el desplazamiento X/Y hasta que la etiqueta salga
            centrada perfecta en esta impresora. Estos valores se guardan <strong>solo en este
            dispositivo</strong> (no se sincronizan con otras sedes).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Margen interior (mm)</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                max={10}
                value={calibration.marginMm}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  const next = { ...calibration, marginMm: Math.max(0, Math.min(10, v)) };
                  setCalibration(next); saveLabelCalibration(next);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Desplazamiento X (mm)</Label>
              <Input
                type="number"
                step="0.1"
                min={-40}
                max={40}
                value={calibration.offsetXMm}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  const next = { ...calibration, offsetXMm: Math.max(-40, Math.min(40, v)) };
                  setCalibration(next); saveLabelCalibration(next);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Desplazamiento Y (mm)</Label>
              <Input
                type="number"
                step="0.1"
                min={-20}
                max={20}
                value={calibration.offsetYMm}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  const next = { ...calibration, offsetYMm: Math.max(-20, Math.min(20, v)) };
                  setCalibration(next); saveLabelCalibration(next);
                }}
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Tip: X positivo mueve a la <strong>derecha</strong>, Y positivo mueve hacia <strong>abajo</strong>.
            Aumenta el margen si la impresora recorta el borde; reduce a 0 si pierdes área útil.
          </p>

          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                resetLabelCalibration();
                setCalibration(DEFAULT_LABEL_CALIBRATION);
                toast.success('Calibración restablecida');
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1" /> Restablecer
            </Button>
            <Button type="button" size="sm" onClick={testLabel}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir prueba
            </Button>
          </div>
        </CardContent>
      </Card>






      <div className="flex justify-end items-center gap-2">
        {loading && <span className="text-xs text-muted-foreground mr-auto">Cargando desde la base de datos…</span>}
        <Button variant="outline" onClick={handleReset} disabled={saving || loading}>
          <RotateCcw className="h-4 w-4 mr-1" /> Restaurar predeterminados
        </Button>
        <Button onClick={handleSave} disabled={saving || loading}>
          <Save className="h-4 w-4 mr-1" /> {saving ? 'Guardando…' : 'Guardar parámetros'}
        </Button>
      </div>
    </div>
  );
}
