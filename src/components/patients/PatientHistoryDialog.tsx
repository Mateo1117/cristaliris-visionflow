import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Eye } from 'lucide-react';

interface PatientHistoryDialogProps {
  pacienteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatientHistoryDialog({ pacienteId, open, onOpenChange }: PatientHistoryDialogProps) {
  const { data: historias = [], isLoading } = useQuery({
    queryKey: ['historias-paciente', pacienteId],
    queryFn: async () => {
      if (!pacienteId) return [];
      const { data, error } = await supabase
        .from('historias_clinicas')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('fecha_consulta', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!pacienteId && open,
  });

  const { data: paciente } = useQuery({
    queryKey: ['paciente-nombre', pacienteId],
    queryFn: async () => {
      if (!pacienteId) return null;
      const { data, error } = await supabase
        .from('pacientes')
        .select('nombres, apellidos, numero_documento')
        .eq('id', pacienteId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!pacienteId && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Historia Clínica — {paciente ? `${paciente.nombres} ${paciente.apellidos}` : 'Cargando...'}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Cargando historias...</p>
        ) : historias.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Este paciente no tiene historias clínicas registradas</p>
        ) : (
          <div className="space-y-4">
            {historias.map((h: any) => (
              <Card key={h.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{new Date(h.fecha_consulta).toLocaleDateString('es-CO')}</Badge>
                      {h.codigo_cie10 && <Badge variant="secondary" className="text-[10px]">CIE-10: {h.codigo_cie10}</Badge>}
                    </div>
                  </div>

                  {h.diagnostico && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Diagnóstico</p>
                      <p className="text-sm">{h.diagnostico}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        <Eye className="h-3 w-3 inline mr-1" />OD — Ojo Derecho
                      </p>
                      <div className="text-sm space-y-0.5">
                        <p>Esf: {h.formula_od_esfera ?? '—'} / Cil: {h.formula_od_cilindro ?? '—'} / Eje: {h.formula_od_eje ?? '—'}°</p>
                        <p>Adición: {h.formula_od_adicion ?? '—'}</p>
                        <p>AV: {h.agudeza_visual_od || '—'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        <Eye className="h-3 w-3 inline mr-1" />OI — Ojo Izquierdo
                      </p>
                      <div className="text-sm space-y-0.5">
                        <p>Esf: {h.formula_oi_esfera ?? '—'} / Cil: {h.formula_oi_cilindro ?? '—'} / Eje: {h.formula_oi_eje ?? '—'}°</p>
                        <p>Adición: {h.formula_oi_adicion ?? '—'}</p>
                        <p>AV: {h.agudeza_visual_oi || '—'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div><span className="text-muted-foreground text-xs">DP Total:</span> {h.distancia_pupilar ?? '—'} mm</div>
                    <div><span className="text-muted-foreground text-xs">DP OD:</span> {h.distancia_pupilar_od ?? '—'} mm</div>
                    <div><span className="text-muted-foreground text-xs">DP OI:</span> {h.distancia_pupilar_oi ?? '—'} mm</div>
                    <div><span className="text-muted-foreground text-xs">Dist. Vértice:</span> {h.distancia_vertice ?? '—'} mm</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground text-xs">Alt. Pupilar OD:</span> {h.altura_pupilar_od ?? '—'} mm</div>
                    <div><span className="text-muted-foreground text-xs">Alt. Pupilar OI:</span> {h.altura_pupilar_oi ?? '—'} mm</div>
                  </div>

                  {h.plan_manejo && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Plan de Manejo</p>
                      <p className="text-sm">{h.plan_manejo}</p>
                    </div>
                  )}

                  {h.observaciones && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Observaciones</p>
                      <p className="text-sm text-muted-foreground">{h.observaciones}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
