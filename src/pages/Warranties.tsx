import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export default function Warranties() {
  return (
    <AppLayout>
      <PageHeader title="Garantías" description="Protocolo de adaptación y gestión de garantías" />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ShieldCheck className="h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Módulo de Garantías</h3>
          <p className="text-sm text-center max-w-md">Periodo de adaptación de 7 días, subcódigos secuenciales G1-G2-G3, flujo de estados independiente y alertas automáticas. Disponible en la siguiente fase.</p>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
