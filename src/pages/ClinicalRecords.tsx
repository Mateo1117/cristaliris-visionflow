import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Stethoscope } from 'lucide-react';

export default function ClinicalRecords() {
  return (
    <AppLayout>
      <PageHeader title="Historia Clínica" description="Gestión de historias clínicas y fórmulas ópticas" />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Stethoscope className="h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Módulo de Historia Clínica</h3>
          <p className="text-sm text-center max-w-md">Formulario estructurado con anamnesis, agudeza visual, refracción, fórmula optométrica, diagnóstico CIE-10 y firma digital. Disponible en la siguiente fase.</p>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
