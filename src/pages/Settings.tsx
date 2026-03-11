import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Settings as SettingsIcon } from 'lucide-react';

export default function SettingsPage() {
  return (
    <AppLayout>
      <PageHeader title="Configuración" description="Configuración del sistema, sedes, usuarios y roles" />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <SettingsIcon className="h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Configuración del Sistema</h3>
          <p className="text-sm text-center max-w-md">Gestión de sedes, usuarios, roles y permisos, laboratorios, festivos, configuración de tiempos de entrega y más. Disponible en la siguiente fase.</p>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
