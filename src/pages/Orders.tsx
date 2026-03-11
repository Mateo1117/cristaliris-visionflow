import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KanbanBoard } from '@/components/orders/KanbanBoard';

export default function Orders() {
  return (
    <AppLayout>
      <PageHeader title="Órdenes" description="Seguimiento de producción y entregas" />
      <KanbanBoard />
    </AppLayout>
  );
}
