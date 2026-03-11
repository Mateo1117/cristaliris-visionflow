import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet } from 'lucide-react';

export default function Billing() {
  return (
    <AppLayout>
      <PageHeader title="Cartera" description="Control financiero, abonos y caja diaria" />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Wallet className="h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Módulo Financiero</h3>
          <p className="text-sm text-center max-w-md">Cartera por empresa, abonos parciales, caja diaria, cálculo automático de descuentos, recargos financieros y utilidad por producto. Disponible en la siguiente fase.</p>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
