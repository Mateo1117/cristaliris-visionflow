import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function Reports() {
  return (
    <AppLayout>
      <PageHeader title="Reportes" description="Reportes operativos y gerenciales" />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Módulo de Reportes</h3>
          <p className="text-sm text-center max-w-md">Reportes de producción, cartera, inventario, garantías, caja diaria y auditoría. Exportables a Excel y PDF. Disponible en la siguiente fase.</p>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
