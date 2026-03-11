import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Package } from 'lucide-react';

export default function Inventory() {
  return (
    <AppLayout>
      <PageHeader title="Inventario" description="Gestión de monturas, lentes e insumos por sede" />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Módulo de Inventario</h3>
          <p className="text-sm text-center max-w-md">Inventario multi-sede, alertas de stock mínimo, transferencias entre sedes y descuento automático al entregar productos. Disponible en la siguiente fase.</p>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
