import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Search, Eye, Printer } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hoyColombia, toFechaColombia } from '@/lib/businessDays';
import { calcularEdad } from '@/components/patients/patientUtils';
import { printHtmlDocument } from '@/lib/printing/thermal';
import { toast } from 'sonner';

/**
 * Escapa un valor antes de interpolarlo en el HTML de impresión.
 *
 * Los datos clínicos (nombre, diagnóstico, observaciones…) los escribe el
 * usuario y se inyectan en un documento generado con `document.write`: sin
 * escapar, un `<script>` guardado en cualquier campo se ejecutaría al imprimir.
 */
const escapeHtml = (valor: unknown): string => {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Edad en años sobre la fecha civil COLOMBIANA (UTC-5).
 *
 * `new Date('yyyy-MM-dd')` interpreta la cadena como medianoche UTC, que en
 * Bogotá es el día anterior: la edad cambiaba un día antes del cumpleaños.
 */
// La edad se calcula en un único sitio (`patientUtils`) para que la historia
// clínica y la ficha del paciente no puedan mostrar edades distintas.

/** Fecha legible en horario colombiano (evita el corrimiento de un día por UTC). */
const formatFechaCO = (fecha?: string | null) => {
  if (!fecha) return '—';
  try {
    const [a, m, d] = toFechaColombia(fecha).split('-');
    return `${d}/${m}/${a}`;
  } catch {
    return '—';
  }
};

const imprimirFormula = (h: any) => {
  const p = h.pacientes || {};
  const edad = calcularEdad(p.fecha_nacimiento);
  /** Texto escapado; `—` cuando el campo viene vacío. */
  const esc = (valor: unknown, vacio = '—') => {
    if (valor === null || valor === undefined || valor === '') return vacio;
    return escapeHtml(valor);
  };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fórmula Óptica</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:780px;margin:auto;}
  h1{margin:0 0 4px;font-size:22px;color:#1e40af;}
  h2{font-size:14px;margin:18px 0 6px;color:#1e40af;border-bottom:1px solid #cbd5e1;padding-bottom:4px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1e40af;padding-bottom:10px;margin-bottom:14px;}
  .meta{font-size:12px;color:#475569;line-height:1.5;}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px;}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:center;}
  th{background:#f1f5f9;font-weight:600;}
  td.label{background:#f8fafc;font-weight:600;text-align:left;width:80px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px;}
  .box{border:1px solid #cbd5e1;padding:8px 10px;border-radius:4px;}
  .box strong{display:block;font-size:11px;color:#64748b;text-transform:uppercase;margin-bottom:2px;}
  .firma{margin-top:40px;border-top:1px solid #111;width:240px;padding-top:4px;font-size:12px;text-align:center;}
</style></head><body>
<div class="header">
  <div>
    <h1>Fórmula Óptica</h1>
    <div class="meta">Cristal Iris — Óptica<br/>Fecha: ${escapeHtml(formatFechaCO(h.fecha_consulta))}</div>
  </div>
</div>

<h2>Datos del Paciente</h2>
<div class="grid">
  <div class="box"><strong>Nombre</strong>${esc(p.nombres, '')} ${esc(p.apellidos, '')}</div>
  <div class="box"><strong>Documento</strong>${esc(p.tipo_documento, '')} ${esc(p.numero_documento, '')}</div>
  <div class="box"><strong>Edad</strong>${esc(edad)} años</div>
  <div class="box"><strong>Ocupación</strong>${esc(h.ocupacion)}</div>
  <div class="box"><strong>Teléfono</strong>${esc(p.telefono)}</div>
  <div class="box"><strong>Email</strong>${esc(p.email)}</div>
</div>

<h2>Fórmula Final</h2>
<table>
  <thead><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th></tr></thead>
  <tbody>
    <tr><td class="label">OD</td><td>${esc(h.formula_od_esfera)}</td><td>${esc(h.formula_od_cilindro)}</td><td>${esc(h.formula_od_eje)}°</td><td>${esc(h.formula_od_adicion)}</td></tr>
    <tr><td class="label">OI</td><td>${esc(h.formula_oi_esfera)}</td><td>${esc(h.formula_oi_cilindro)}</td><td>${esc(h.formula_oi_eje)}°</td><td>${esc(h.formula_oi_adicion)}</td></tr>
  </tbody>
</table>
<div class="grid" style="margin-top:8px;">
  <div class="box"><strong>DP Total</strong>${esc(h.distancia_pupilar)} mm</div>
  <div class="box"><strong>DP OD / OI</strong>${esc(h.distancia_pupilar_od)} / ${esc(h.distancia_pupilar_oi)} mm</div>
  <div class="box"><strong>Altura Pupilar OD / OI</strong>${esc(h.altura_pupilar_od)} / ${esc(h.altura_pupilar_oi)} mm</div>
  <div class="box"><strong>Distancia al Vértice</strong>${esc(h.distancia_vertice)} mm</div>
</div>

<h2>Especificaciones del Lente</h2>
<div class="grid">
  <div class="box"><strong>Tipo de Lente</strong>${esc(h.formula_tipo_lente)}</div>
  <div class="box"><strong>Filtros</strong>${esc(h.formula_filtros)}</div>
  <div class="box"><strong>Forma de Uso</strong>${esc(h.formula_forma_uso)}</div>
  <div class="box"><strong>Control</strong>${esc(h.formula_control)}</div>
</div>
${h.formula_observaciones ? `<div class="box" style="margin-top:10px;"><strong>Observaciones</strong>${escapeHtml(h.formula_observaciones)}</div>` : ''}

${h.diagnostico ? `<h2>Diagnóstico</h2><div class="box">${escapeHtml(h.diagnostico)}${h.codigo_cie10 ? ` <em style="color:#64748b;">(CIE-10: ${escapeHtml(h.codigo_cie10)})</em>` : ''}</div>` : ''}

<div class="firma">Firma Optómetra</div>
</body></html>`;
  // Impresión desde un iframe oculto: `window.open` lo bloquean los navegadores
  // por defecto y la impresión fallaba en silencio.
  printHtmlDocument(html, `Fórmula ${p.numero_documento || ''}`.trim());
};

export default function ClinicalRecords() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPaciente, setSelectedPaciente] = useState<string | null>(null);
  const [viewRecord, setViewRecord] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: historias = [], isLoading } = useQuery({
    queryKey: ['historias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historias_clinicas')
        .select('*, pacientes(nombres, apellidos, numero_documento, tipo_documento, telefono, email, fecha_nacimiento, ocupacion)')
        .order('fecha_consulta', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pacientes = [] } = useQuery({
    queryKey: ['pacientes-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nombres, apellidos, numero_documento, tipo_documento, fecha_nacimiento, ocupacion')
        .order('nombres');
      if (error) throw error;
      return data;
    },
  });

  const pacienteSeleccionado = pacientes.find((p: any) => p.id === selectedPaciente);
  const edadSeleccionado = calcularEdad(pacienteSeleccionado?.fecha_nacimiento);

  const num = (v: any) => (v !== undefined && v !== '' && v !== null ? parseFloat(v) : null);
  const int = (v: any) => (v !== undefined && v !== '' && v !== null ? parseInt(v) : null);

  const createHistoria = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const payload: any = {
        paciente_id: formData.paciente_id,
        anamnesis: formData.anamnesis,
        antecedentes: formData.antecedentes,
        ocupacion: formData.ocupacion,
        agudeza_visual_od: formData.agudeza_visual_od,
        agudeza_visual_oi: formData.agudeza_visual_oi,
        av_sin_correccion_od: formData.av_sin_correccion_od,
        av_sin_correccion_oi: formData.av_sin_correccion_oi,
        refraccion_od: formData.refraccion_od,
        refraccion_oi: formData.refraccion_oi,
        lensometria_od_esfera: num(formData.lensometria_od_esfera),
        lensometria_od_cilindro: num(formData.lensometria_od_cilindro),
        lensometria_od_eje: int(formData.lensometria_od_eje),
        lensometria_od_adicion: num(formData.lensometria_od_adicion),
        lensometria_oi_esfera: num(formData.lensometria_oi_esfera),
        lensometria_oi_cilindro: num(formData.lensometria_oi_cilindro),
        lensometria_oi_eje: int(formData.lensometria_oi_eje),
        lensometria_oi_adicion: num(formData.lensometria_oi_adicion),
        keratometria_od: formData.keratometria_od,
        keratometria_oi: formData.keratometria_oi,
        formula_od_esfera: num(formData.formula_od_esfera),
        formula_od_cilindro: num(formData.formula_od_cilindro),
        formula_od_eje: int(formData.formula_od_eje),
        formula_od_adicion: num(formData.formula_od_adicion),
        formula_oi_esfera: num(formData.formula_oi_esfera),
        formula_oi_cilindro: num(formData.formula_oi_cilindro),
        formula_oi_eje: int(formData.formula_oi_eje),
        formula_oi_adicion: num(formData.formula_oi_adicion),
        distancia_pupilar: num(formData.distancia_pupilar),
        distancia_pupilar_od: num(formData.distancia_pupilar_od),
        distancia_pupilar_oi: num(formData.distancia_pupilar_oi),
        altura_pupilar_od: num(formData.altura_pupilar_od),
        altura_pupilar_oi: num(formData.altura_pupilar_oi),
        distancia_vertice: num(formData.distancia_vertice),
        formula_tipo_lente: formData.formula_tipo_lente,
        formula_filtros: formData.formula_filtros,
        formula_forma_uso: formData.formula_forma_uso,
        formula_observaciones: formData.formula_observaciones,
        formula_control: formData.formula_control,
        diagnostico: formData.diagnostico,
        codigo_cie10: formData.codigo_cie10,
        observaciones: formData.observaciones,
      };
      const { error } = await supabase.from('historias_clinicas').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historias'] });
      setShowForm(false);
      setSelectedPaciente(null);
      toast.success('Historia clínica creada exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    fd.forEach((v, k) => { data[k] = v; });
    if (!selectedPaciente) { toast.error('Seleccione un paciente'); return; }
    data.paciente_id = selectedPaciente;
    createHistoria.mutate(data);
  };

  const filtered = historias.filter((h: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const p = h.pacientes;
    return (p?.nombres?.toLowerCase().includes(q) || p?.apellidos?.toLowerCase().includes(q) || p?.numero_documento?.includes(q));
  });

  return (
    <AppLayout>
      <PageHeader title="Historia Clínica" description="Gestión de historias clínicas y fórmulas ópticas">
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Historia</Button>
      </PageHeader>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por paciente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead className="hidden md:table-cell">Diagnóstico</TableHead>
              <TableHead className="hidden lg:table-cell">OD Esf/Cil/Eje</TableHead>
              <TableHead className="hidden lg:table-cell">OI Esf/Cil/Eje</TableHead>
              <TableHead>CIE-10</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay historias clínicas{search ? ' que coincidan' : ''}</TableCell></TableRow>
            ) : filtered.map((h: any) => (
              <TableRow key={h.id} className="hover:bg-muted/50">
                <TableCell className="text-sm cursor-pointer" onClick={() => setViewRecord(h)}>{formatFechaCO(h.fecha_consulta)}</TableCell>
                <TableCell className="font-medium cursor-pointer" onClick={() => setViewRecord(h)}>{h.pacientes?.nombres} {h.pacientes?.apellidos}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[200px]">{h.diagnostico || '—'}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{h.formula_od_esfera ?? '—'}/{h.formula_od_cilindro ?? '—'}/{h.formula_od_eje ?? '—'}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{h.formula_oi_esfera ?? '—'}/{h.formula_oi_cilindro ?? '—'}/{h.formula_oi_eje ?? '—'}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{h.codigo_cie10 || '—'}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); imprimirFormula(h); }}>
                    <Printer className="h-3 w-3 mr-1" />Fórmula
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* View Record Dialog */}
      <Dialog open={!!viewRecord} onOpenChange={(o) => { if (!o) setViewRecord(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-8">
              <span className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" />Historia Clínica</span>
              {viewRecord && (
                <Button size="sm" variant="outline" onClick={() => imprimirFormula(viewRecord)}>
                  <Printer className="h-4 w-4 mr-1" />Imprimir Fórmula
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewRecord && (
            <div className="space-y-5">
              <div className="rounded-lg bg-muted/50 p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-lg">{viewRecord.pacientes?.nombres} {viewRecord.pacientes?.apellidos}</p>
                  <Badge variant="outline">{formatFechaCO(viewRecord.fecha_consulta)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{viewRecord.pacientes?.tipo_documento} {viewRecord.pacientes?.numero_documento}</p>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-1">
                  {viewRecord.pacientes?.fecha_nacimiento && <span>Edad: {calcularEdad(viewRecord.pacientes.fecha_nacimiento)} años</span>}
                  {viewRecord.ocupacion && <span>Ocupación: {viewRecord.ocupacion}</span>}
                  {viewRecord.pacientes?.telefono && <span>Tel: {viewRecord.pacientes.telefono}</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Anamnesis</p>
                  <p className="text-sm">{viewRecord.anamnesis || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Antecedentes</p>
                  <p className="text-sm">{viewRecord.antecedentes || '—'}</p>
                </div>
              </div>

              <Separator />

              {/* Lensometría */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Lensometría</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card><CardContent className="pt-3 text-sm">
                    <p className="font-medium mb-1">OD</p>
                    Esf {viewRecord.lensometria_od_esfera ?? '—'} / Cil {viewRecord.lensometria_od_cilindro ?? '—'} / Eje {viewRecord.lensometria_od_eje ?? '—'}° / Add {viewRecord.lensometria_od_adicion ?? '—'}
                  </CardContent></Card>
                  <Card><CardContent className="pt-3 text-sm">
                    <p className="font-medium mb-1">OI</p>
                    Esf {viewRecord.lensometria_oi_esfera ?? '—'} / Cil {viewRecord.lensometria_oi_cilindro ?? '—'} / Eje {viewRecord.lensometria_oi_eje ?? '—'}° / Add {viewRecord.lensometria_oi_adicion ?? '—'}
                  </CardContent></Card>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground text-xs">Keratometría OD:</span> {viewRecord.keratometria_od || '—'}</div>
                <div><span className="text-muted-foreground text-xs">Keratometría OI:</span> {viewRecord.keratometria_oi || '—'}</div>
                <div><span className="text-muted-foreground text-xs">AV sin corr. OD:</span> {viewRecord.av_sin_correccion_od || '—'}</div>
                <div><span className="text-muted-foreground text-xs">AV sin corr. OI:</span> {viewRecord.av_sin_correccion_oi || '—'}</div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Fórmula OD</CardTitle></CardHeader>
                  <CardContent className="text-sm grid grid-cols-2 gap-1">
                    <div>Esf: <b>{viewRecord.formula_od_esfera ?? '—'}</b></div>
                    <div>Cil: <b>{viewRecord.formula_od_cilindro ?? '—'}</b></div>
                    <div>Eje: <b>{viewRecord.formula_od_eje ?? '—'}°</b></div>
                    <div>Add: <b>{viewRecord.formula_od_adicion ?? '—'}</b></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Fórmula OI</CardTitle></CardHeader>
                  <CardContent className="text-sm grid grid-cols-2 gap-1">
                    <div>Esf: <b>{viewRecord.formula_oi_esfera ?? '—'}</b></div>
                    <div>Cil: <b>{viewRecord.formula_oi_cilindro ?? '—'}</b></div>
                    <div>Eje: <b>{viewRecord.formula_oi_eje ?? '—'}°</b></div>
                    <div>Add: <b>{viewRecord.formula_oi_adicion ?? '—'}</b></div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><span className="text-muted-foreground text-xs">Tipo lente:</span> {viewRecord.formula_tipo_lente || '—'}</div>
                <div><span className="text-muted-foreground text-xs">Filtros:</span> {viewRecord.formula_filtros || '—'}</div>
                <div><span className="text-muted-foreground text-xs">Forma de uso:</span> {viewRecord.formula_forma_uso || '—'}</div>
                <div><span className="text-muted-foreground text-xs">Control:</span> {viewRecord.formula_control || '—'}</div>
              </div>
              {viewRecord.formula_observaciones && (
                <div className="text-sm"><span className="text-muted-foreground text-xs">Obs. fórmula:</span> {viewRecord.formula_observaciones}</div>
              )}

              <Separator />

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Diagnóstico</p>
                <p className="text-sm">{viewRecord.diagnostico || '—'}</p>
                {viewRecord.codigo_cie10 && <Badge variant="secondary" className="mt-1 text-[10px]">CIE-10: {viewRecord.codigo_cie10}</Badge>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) setSelectedPaciente(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Historia Clínica</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="mb-4 w-full justify-start">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="agudeza">Agudeza Visual</TabsTrigger>
                <TabsTrigger value="formula">Fórmula Óptica</TabsTrigger>
                <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Paciente *</Label>
                    <Select onValueChange={setSelectedPaciente}>
                      <SelectTrigger><SelectValue placeholder="Seleccione paciente" /></SelectTrigger>
                      <SelectContent>
                        {pacientes.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.tipo_documento} {p.numero_documento} — {p.nombres} {p.apellidos}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Edad</Label>
                    <Input value={edadSeleccionado != null ? `${edadSeleccionado} años` : ''} placeholder="—" disabled />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Ocupación</Label>
                  <Input name="ocupacion" defaultValue={pacienteSeleccionado?.ocupacion || ''} placeholder="Ej: Contador, estudiante..." />
                </div>
                <div className="space-y-2">
                  <Label>Motivo de Consulta / Anamnesis</Label>
                  <Textarea name="anamnesis" placeholder="Describa el motivo de consulta..." rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Antecedentes (personales, familiares, oculares)</Label>
                  <Textarea name="antecedentes" placeholder="Antecedentes relevantes..." rows={3} />
                </div>
              </TabsContent>

              <TabsContent value="agudeza" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">AV sin Corrección</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">OD</Label><Input name="av_sin_correccion_od" placeholder="20/40" /></div>
                    <div className="space-y-1"><Label className="text-xs">OI</Label><Input name="av_sin_correccion_oi" placeholder="20/40" /></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Lensometría (lente actual)</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">OD</p>
                      <div className="grid grid-cols-4 gap-2">
                        <Input name="lensometria_od_esfera" type="number" step="0.25" placeholder="Esfera" />
                        <Input name="lensometria_od_cilindro" type="number" step="0.25" placeholder="Cilindro" />
                        <Input name="lensometria_od_eje" type="number" min="0" max="180" placeholder="Eje" />
                        <Input name="lensometria_od_adicion" type="number" step="0.25" placeholder="Adición" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">OI</p>
                      <div className="grid grid-cols-4 gap-2">
                        <Input name="lensometria_oi_esfera" type="number" step="0.25" placeholder="Esfera" />
                        <Input name="lensometria_oi_cilindro" type="number" step="0.25" placeholder="Cilindro" />
                        <Input name="lensometria_oi_eje" type="number" min="0" max="180" placeholder="Eje" />
                        <Input name="lensometria_oi_adicion" type="number" step="0.25" placeholder="Adición" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Keratometría</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">OD</Label><Input name="keratometria_od" placeholder="Ej: 43.50 / 44.00 @ 90°" /></div>
                    <div className="space-y-1"><Label className="text-xs">OI</Label><Input name="keratometria_oi" placeholder="Ej: 43.50 / 44.00 @ 90°" /></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Refracción / AV con corrección</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">OD — Refracción</Label><Input name="refraccion_od" placeholder="Refracción objetiva/subjetiva" /></div>
                    <div className="space-y-1"><Label className="text-xs">OI — Refracción</Label><Input name="refraccion_oi" placeholder="Refracción objetiva/subjetiva" /></div>
                    <div className="space-y-1"><Label className="text-xs">AV OD</Label><Input name="agudeza_visual_od" placeholder="20/20" /></div>
                    <div className="space-y-1"><Label className="text-xs">AV OI</Label><Input name="agudeza_visual_oi" placeholder="20/20" /></div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="formula" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" />OD — Ojo Derecho</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-xs">Esfera</Label><Input name="formula_od_esfera" type="number" step="0.25" placeholder="0.00" /></div>
                        <div className="space-y-1"><Label className="text-xs">Cilindro</Label><Input name="formula_od_cilindro" type="number" step="0.25" placeholder="0.00" /></div>
                        <div className="space-y-1"><Label className="text-xs">Eje (°)</Label><Input name="formula_od_eje" type="number" min="0" max="180" placeholder="0" /></div>
                        <div className="space-y-1"><Label className="text-xs">Adición</Label><Input name="formula_od_adicion" type="number" step="0.25" placeholder="0.00" /></div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" />OI — Ojo Izquierdo</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-xs">Esfera</Label><Input name="formula_oi_esfera" type="number" step="0.25" placeholder="0.00" /></div>
                        <div className="space-y-1"><Label className="text-xs">Cilindro</Label><Input name="formula_oi_cilindro" type="number" step="0.25" placeholder="0.00" /></div>
                        <div className="space-y-1"><Label className="text-xs">Eje (°)</Label><Input name="formula_oi_eje" type="number" min="0" max="180" placeholder="0" /></div>
                        <div className="space-y-1"><Label className="text-xs">Adición</Label><Input name="formula_oi_adicion" type="number" step="0.25" placeholder="0.00" /></div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Distancia Pupilar Total (mm)</Label><Input name="distancia_pupilar" type="number" step="0.5" placeholder="63.0" /></div>
                      <div className="space-y-1"><Label className="text-xs">DP Ojo Derecho (mm)</Label><Input name="distancia_pupilar_od" type="number" step="0.5" placeholder="31.5" /></div>
                      <div className="space-y-1"><Label className="text-xs">DP Ojo Izquierdo (mm)</Label><Input name="distancia_pupilar_oi" type="number" step="0.5" placeholder="31.5" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                      <div className="space-y-1"><Label className="text-xs">Altura Pupilar OD (mm)</Label><Input name="altura_pupilar_od" type="number" step="0.5" placeholder="0.0" /></div>
                      <div className="space-y-1"><Label className="text-xs">Altura Pupilar OI (mm)</Label><Input name="altura_pupilar_oi" type="number" step="0.5" placeholder="0.0" /></div>
                      <div className="space-y-1"><Label className="text-xs">Distancia al Vértice (mm)</Label><Input name="distancia_vertice" type="number" step="0.5" placeholder="12.0" /></div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Especificaciones del Lente</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Tipo de Lente</Label><Input name="formula_tipo_lente" placeholder="Ej: Progresivo Super HD" /></div>
                      <div className="space-y-1"><Label className="text-xs">Filtros</Label><Input name="formula_filtros" placeholder="Ej: Antirreflejo, Blue, Fotocromático" /></div>
                      <div className="space-y-1"><Label className="text-xs">Forma de Uso</Label><Input name="formula_forma_uso" placeholder="Ej: Permanente, lectura, computador" /></div>
                      <div className="space-y-1"><Label className="text-xs">Control</Label><Input name="formula_control" placeholder="Ej: 1 año" /></div>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Observaciones</Label><Textarea name="formula_observaciones" rows={2} placeholder="Observaciones específicas del lente..." /></div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="diagnostico" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Diagnóstico</Label>
                    <Textarea name="diagnostico" placeholder="Diagnóstico clínico..." rows={4} />
                  </div>
                  <div className="space-y-2">
                    <Label>Código CIE-10</Label>
                    <Input name="codigo_cie10" placeholder="Ej: H52.1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observaciones generales</Label>
                  <Textarea name="observaciones" placeholder="Observaciones adicionales..." rows={2} />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-6 border-t mt-6">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createHistoria.isPending}>
                {createHistoria.isPending ? 'Guardando...' : 'Guardar Historia Clínica'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
