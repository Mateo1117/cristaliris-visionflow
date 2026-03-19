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
import { Plus, Search, FileText, Eye } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function ClinicalRecords() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPaciente, setSelectedPaciente] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: historias = [], isLoading } = useQuery({
    queryKey: ['historias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historias_clinicas')
        .select('*, pacientes(nombres, apellidos, numero_documento)')
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
        .select('id, nombres, apellidos, numero_documento, tipo_documento')
        .order('nombres');
      if (error) throw error;
      return data;
    },
  });

  const createHistoria = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { error } = await supabase.from('historias_clinicas').insert({
        paciente_id: formData.paciente_id,
        anamnesis: formData.anamnesis,
        antecedentes: formData.antecedentes,
        agudeza_visual_od: formData.agudeza_visual_od,
        agudeza_visual_oi: formData.agudeza_visual_oi,
        refraccion_od: formData.refraccion_od,
        refraccion_oi: formData.refraccion_oi,
        formula_od_esfera: formData.formula_od_esfera ? parseFloat(formData.formula_od_esfera) : null,
        formula_od_cilindro: formData.formula_od_cilindro ? parseFloat(formData.formula_od_cilindro) : null,
        formula_od_eje: formData.formula_od_eje ? parseInt(formData.formula_od_eje) : null,
        formula_od_adicion: formData.formula_od_adicion ? parseFloat(formData.formula_od_adicion) : null,
        formula_oi_esfera: formData.formula_oi_esfera ? parseFloat(formData.formula_oi_esfera) : null,
        formula_oi_cilindro: formData.formula_oi_cilindro ? parseFloat(formData.formula_oi_cilindro) : null,
        formula_oi_eje: formData.formula_oi_eje ? parseInt(formData.formula_oi_eje) : null,
        formula_oi_adicion: formData.formula_oi_adicion ? parseFloat(formData.formula_oi_adicion) : null,
        distancia_pupilar: formData.distancia_pupilar ? parseFloat(formData.distancia_pupilar) : null,
        altura_pupilar_od: formData.altura_pupilar_od ? parseFloat(formData.altura_pupilar_od) : null,
        altura_pupilar_oi: formData.altura_pupilar_oi ? parseFloat(formData.altura_pupilar_oi) : null,
        diagnostico: formData.diagnostico,
        codigo_cie10: formData.codigo_cie10,
        plan_manejo: formData.plan_manejo,
        observaciones: formData.observaciones,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historias'] });
      setShowForm(false);
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay historias clínicas{search ? ' que coincidan' : ''}</TableCell></TableRow>
            ) : filtered.map((h: any) => (
              <TableRow key={h.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="text-sm">{new Date(h.fecha_consulta).toLocaleDateString('es-CO')}</TableCell>
                <TableCell className="font-medium">{h.pacientes?.nombres} {h.pacientes?.apellidos}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[200px]">{h.diagnostico || '—'}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{h.formula_od_esfera ?? '—'}/{h.formula_od_cilindro ?? '—'}/{h.formula_od_eje ?? '—'}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{h.formula_oi_esfera ?? '—'}/{h.formula_oi_cilindro ?? '—'}/{h.formula_oi_eje ?? '—'}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{h.codigo_cie10 || '—'}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
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
                <div className="space-y-2">
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
                  <Label>Motivo de Consulta / Anamnesis</Label>
                  <Textarea name="anamnesis" placeholder="Describa el motivo de consulta..." rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Antecedentes (personales, familiares, oculares)</Label>
                  <Textarea name="antecedentes" placeholder="Antecedentes relevantes..." rows={3} />
                </div>
              </TabsContent>

              <TabsContent value="agudeza" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Ojo Derecho (OD)</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1"><Label className="text-xs">Agudeza Visual</Label><Input name="agudeza_visual_od" placeholder="20/20" /></div>
                      <div className="space-y-1"><Label className="text-xs">Refracción</Label><Input name="refraccion_od" placeholder="Refracción objetiva/subjetiva" /></div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Ojo Izquierdo (OI)</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1"><Label className="text-xs">Agudeza Visual</Label><Input name="agudeza_visual_oi" placeholder="20/20" /></div>
                      <div className="space-y-1"><Label className="text-xs">Refracción</Label><Input name="refraccion_oi" placeholder="Refracción objetiva/subjetiva" /></div>
                    </CardContent>
                  </Card>
                </div>
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
              </TabsContent>

              <TabsContent value="diagnostico" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Diagnóstico</Label>
                    <Textarea name="diagnostico" placeholder="Diagnóstico clínico..." rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>Código CIE-10</Label>
                    <Input name="codigo_cie10" placeholder="Ej: H52.1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Plan de Manejo</Label>
                  <Textarea name="plan_manejo" placeholder="Plan de manejo y recomendaciones..." rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Observaciones</Label>
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
