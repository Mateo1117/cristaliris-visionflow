import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { User, Eye, FileText, Plus, Phone, Mail, MapPin, Building2, Calendar } from 'lucide-react';

interface Props {
  paciente: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatientDetailDialog({ paciente, open, onOpenChange }: Props) {
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [viewRecord, setViewRecord] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: historias = [], isLoading } = useQuery({
    queryKey: ['historias-paciente', paciente?.id],
    queryFn: async () => {
      if (!paciente) return [];
      const { data, error } = await supabase
        .from('historias_clinicas')
        .select('*')
        .eq('paciente_id', paciente.id)
        .order('fecha_consulta', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!paciente && open,
  });

  const createHistoria = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { error } = await supabase.from('historias_clinicas').insert({
        paciente_id: paciente.id,
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
        distancia_pupilar_od: formData.distancia_pupilar_od ? parseFloat(formData.distancia_pupilar_od) : null,
        distancia_pupilar_oi: formData.distancia_pupilar_oi ? parseFloat(formData.distancia_pupilar_oi) : null,
        altura_pupilar_od: formData.altura_pupilar_od ? parseFloat(formData.altura_pupilar_od) : null,
        altura_pupilar_oi: formData.altura_pupilar_oi ? parseFloat(formData.altura_pupilar_oi) : null,
        distancia_vertice: formData.distancia_vertice ? parseFloat(formData.distancia_vertice) : null,
        diagnostico: formData.diagnostico,
        codigo_cie10: formData.codigo_cie10,
        plan_manejo: formData.plan_manejo,
        observaciones: formData.observaciones,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historias-paciente', paciente?.id] });
      setShowNewRecord(false);
      toast.success('Historia clínica creada exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmitRecord = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    fd.forEach((v, k) => { data[k] = v; });
    createHistoria.mutate(data);
  };

  if (!paciente) return null;

  const edad = paciente.fecha_nacimiento
    ? Math.floor((Date.now() - new Date(paciente.fecha_nacimiento).getTime()) / (365.25 * 86400000))
    : null;

  return (
    <>
      <Dialog open={open && !showNewRecord && !viewRecord} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {paciente.nombres} {paciente.apellidos}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="datos" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="datos" className="gap-1.5"><User className="h-3.5 w-3.5" />Datos</TabsTrigger>
              <TabsTrigger value="historias" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Historia Clínica ({historias.length})</TabsTrigger>
            </TabsList>

            {/* Patient Data Tab */}
            <TabsContent value="datos" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <InfoField icon={<FileText className="h-3.5 w-3.5" />} label="Documento" value={`${paciente.tipo_documento} ${paciente.numero_documento}`} />
                <InfoField icon={<Calendar className="h-3.5 w-3.5" />} label="Fecha Nacimiento" value={paciente.fecha_nacimiento ? `${new Date(paciente.fecha_nacimiento).toLocaleDateString('es-CO')} (${edad} años)` : '—'} />
                <InfoField label="Género" value={paciente.genero === 'M' ? 'Masculino' : paciente.genero === 'F' ? 'Femenino' : paciente.genero || '—'} />
                <InfoField icon={<Phone className="h-3.5 w-3.5" />} label="Teléfono" value={paciente.telefono || '—'} />
                <InfoField icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={paciente.email || '—'} />
                <InfoField icon={<MapPin className="h-3.5 w-3.5" />} label="Dirección" value={paciente.direccion || '—'} />
                <InfoField label="Ciudad" value={`${paciente.ciudad || '—'}, ${paciente.departamento || '—'}`} />
                <InfoField icon={<Building2 className="h-3.5 w-3.5" />} label="Empresa" value={paciente.empresas?.razon_social || '—'} />
                <InfoField label="Modalidad Pago" value={paciente.modalidad_pago === 'nomina' ? 'Nómina' : paciente.modalidad_pago === 'cuotas' ? 'Cuotas' : 'Contado'} />
                <InfoField label="Sede Registro" value={paciente.sedes?.nombre || '—'} />
                <InfoField label="Referido por" value={paciente.referido_por || '—'} />
                <InfoField label="Registrado" value={new Date(paciente.created_at).toLocaleDateString('es-CO')} />
              </div>
              {paciente.observaciones && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Observaciones</p>
                  <p className="text-sm">{paciente.observaciones}</p>
                </div>
              )}
            </TabsContent>

            {/* Clinical History Tab */}
            <TabsContent value="historias" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {historias.length} consulta{historias.length !== 1 ? 's' : ''} registrada{historias.length !== 1 ? 's' : ''}
                </p>
                <Button size="sm" onClick={() => setShowNewRecord(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Nueva Consulta
                </Button>
              </div>

              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Cargando historias...</p>
              ) : historias.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No hay historias clínicas registradas</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowNewRecord(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Crear primera consulta
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {historias.map((h: any) => (
                    <Card key={h.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewRecord(h)}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{new Date(h.fecha_consulta).toLocaleDateString('es-CO')}</Badge>
                            {h.codigo_cie10 && <Badge variant="secondary" className="text-[10px]">CIE-10: {h.codigo_cie10}</Badge>}
                          </div>
                        </div>
                        {h.diagnostico && <p className="text-sm mb-2">{h.diagnostico}</p>}
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <span><Eye className="h-3 w-3 inline mr-1" />OD: {h.formula_od_esfera ?? '—'}/{h.formula_od_cilindro ?? '—'}/{h.formula_od_eje ?? '—'}° Add:{h.formula_od_adicion ?? '—'}</span>
                          <span><Eye className="h-3 w-3 inline mr-1" />OI: {h.formula_oi_esfera ?? '—'}/{h.formula_oi_cilindro ?? '—'}/{h.formula_oi_eje ?? '—'}° Add:{h.formula_oi_adicion ?? '—'}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* View Record Detail */}
      <Dialog open={!!viewRecord} onOpenChange={(o) => { if (!o) setViewRecord(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Consulta — {viewRecord && new Date(viewRecord.fecha_consulta).toLocaleDateString('es-CO')}
            </DialogTitle>
          </DialogHeader>
          {viewRecord && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Motivo de Consulta / Anamnesis</p>
                  <p className="text-sm">{viewRecord.anamnesis || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Antecedentes</p>
                  <p className="text-sm">{viewRecord.antecedentes || '—'}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" />OD — Ojo Derecho</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div><span className="text-muted-foreground text-xs">AV:</span> {viewRecord.agudeza_visual_od || '—'}</div>
                      <div><span className="text-muted-foreground text-xs">Refracción:</span> {viewRecord.refraccion_od || '—'}</div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div><span className="text-muted-foreground text-xs">Esfera:</span> <span className="font-medium">{viewRecord.formula_od_esfera ?? '—'}</span></div>
                      <div><span className="text-muted-foreground text-xs">Cilindro:</span> <span className="font-medium">{viewRecord.formula_od_cilindro ?? '—'}</span></div>
                      <div><span className="text-muted-foreground text-xs">Eje:</span> <span className="font-medium">{viewRecord.formula_od_eje ?? '—'}°</span></div>
                      <div><span className="text-muted-foreground text-xs">Adición:</span> <span className="font-medium">{viewRecord.formula_od_adicion ?? '—'}</span></div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" />OI — Ojo Izquierdo</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div><span className="text-muted-foreground text-xs">AV:</span> {viewRecord.agudeza_visual_oi || '—'}</div>
                      <div><span className="text-muted-foreground text-xs">Refracción:</span> {viewRecord.refraccion_oi || '—'}</div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div><span className="text-muted-foreground text-xs">Esfera:</span> <span className="font-medium">{viewRecord.formula_oi_esfera ?? '—'}</span></div>
                      <div><span className="text-muted-foreground text-xs">Cilindro:</span> <span className="font-medium">{viewRecord.formula_oi_cilindro ?? '—'}</span></div>
                      <div><span className="text-muted-foreground text-xs">Eje:</span> <span className="font-medium">{viewRecord.formula_oi_eje ?? '—'}°</span></div>
                      <div><span className="text-muted-foreground text-xs">Adición:</span> <span className="font-medium">{viewRecord.formula_oi_adicion ?? '—'}</span></div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Medidas Pupilares</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div><span className="text-muted-foreground text-xs">DP Total:</span> <span className="font-medium">{viewRecord.distancia_pupilar ?? '—'} mm</span></div>
                    <div><span className="text-muted-foreground text-xs">DP OD:</span> <span className="font-medium">{viewRecord.distancia_pupilar_od ?? '—'} mm</span></div>
                    <div><span className="text-muted-foreground text-xs">DP OI:</span> <span className="font-medium">{viewRecord.distancia_pupilar_oi ?? '—'} mm</span></div>
                    <div><span className="text-muted-foreground text-xs">Alt. Pupilar OD:</span> <span className="font-medium">{viewRecord.altura_pupilar_od ?? '—'} mm</span></div>
                    <div><span className="text-muted-foreground text-xs">Alt. Pupilar OI:</span> <span className="font-medium">{viewRecord.altura_pupilar_oi ?? '—'} mm</span></div>
                    <div><span className="text-muted-foreground text-xs">Dist. Vértice:</span> <span className="font-medium">{viewRecord.distancia_vertice ?? '—'} mm</span></div>
                  </div>
                </CardContent>
              </Card>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Diagnóstico</p>
                  <p className="text-sm">{viewRecord.diagnostico || '—'}</p>
                  <Badge variant="secondary" className="mt-1 text-[10px]">CIE-10: {viewRecord.codigo_cie10 || '—'}</Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Plan de Manejo</p>
                  <p className="text-sm">{viewRecord.plan_manejo || '—'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observaciones</p>
                <p className="text-sm text-muted-foreground">{viewRecord.observaciones || '—'}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Record Form */}
      <Dialog open={showNewRecord} onOpenChange={(o) => { if (!o) setShowNewRecord(false); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Consulta — {paciente.nombres} {paciente.apellidos}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitRecord}>
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="mb-4 w-full justify-start">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="agudeza">Agudeza Visual</TabsTrigger>
                <TabsTrigger value="formula">Fórmula Óptica</TabsTrigger>
                <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{paciente.tipo_documento} {paciente.numero_documento} — {paciente.nombres} {paciente.apellidos}</p>
                  {paciente.telefono && <p className="text-xs text-muted-foreground">Tel: {paciente.telefono}</p>}
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
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" />OD</CardTitle></CardHeader>
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
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" />OI</CardTitle></CardHeader>
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
                      <div className="space-y-1"><Label className="text-xs">DP Total (mm)</Label><Input name="distancia_pupilar" type="number" step="0.5" placeholder="63.0" /></div>
                      <div className="space-y-1"><Label className="text-xs">DP OD (mm)</Label><Input name="distancia_pupilar_od" type="number" step="0.5" placeholder="31.5" /></div>
                      <div className="space-y-1"><Label className="text-xs">DP OI (mm)</Label><Input name="distancia_pupilar_oi" type="number" step="0.5" placeholder="31.5" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                      <div className="space-y-1"><Label className="text-xs">Alt. Pupilar OD (mm)</Label><Input name="altura_pupilar_od" type="number" step="0.5" placeholder="0.0" /></div>
                      <div className="space-y-1"><Label className="text-xs">Alt. Pupilar OI (mm)</Label><Input name="altura_pupilar_oi" type="number" step="0.5" placeholder="0.0" /></div>
                      <div className="space-y-1"><Label className="text-xs">Dist. Vértice (mm)</Label><Input name="distancia_vertice" type="number" step="0.5" placeholder="12.0" /></div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="diagnostico" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Diagnóstico</Label><Textarea name="diagnostico" placeholder="Diagnóstico clínico..." rows={3} /></div>
                  <div className="space-y-2"><Label>Código CIE-10</Label><Input name="codigo_cie10" placeholder="Ej: H52.1" /></div>
                </div>
                <div className="space-y-2"><Label>Plan de Manejo</Label><Textarea name="plan_manejo" placeholder="Plan de manejo y recomendaciones..." rows={3} /></div>
                <div className="space-y-2"><Label>Observaciones</Label><Textarea name="observaciones" placeholder="Observaciones adicionales..." rows={2} /></div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-6 border-t mt-6">
              <Button type="button" variant="outline" onClick={() => setShowNewRecord(false)}>Cancelar</Button>
              <Button type="submit" disabled={createHistoria.isPending}>
                {createHistoria.isPending ? 'Guardando...' : 'Guardar Historia Clínica'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfoField({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">{icon}{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
