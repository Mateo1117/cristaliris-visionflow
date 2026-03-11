import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search } from 'lucide-react';

const estadoColor: Record<string, string> = {
  solicitada: 'bg-warning/10 text-warning',
  en_proceso: 'bg-info/10 text-info',
  aprobada: 'bg-success/10 text-success',
  rechazada: 'bg-destructive/10 text-destructive',
  entregada: 'bg-muted text-muted-foreground',
};

export default function Warranties() {
  const [search, setSearch] = useState('');
  const [origen, setOrigen] = useState<'todas' | 'calidad' | 'cliente'>('todas');

  const { data: garantias = [], isLoading } = useQuery({
    queryKey: ['garantias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('garantias')
        .select('*, laboratorios(nombre), orden_productos(descripcion, ordenes(pacientes(nombres, apellidos)))')
        .order('fecha_solicitud', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = garantias.filter((g: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const paciente = g.orden_productos?.ordenes?.pacientes;
    return (
      g.subcodigo?.toLowerCase().includes(q) ||
      g.motivo?.toLowerCase().includes(q) ||
      paciente?.nombres?.toLowerCase().includes(q) ||
      paciente?.apellidos?.toLowerCase().includes(q)
    );
  });

  return (
    <AppLayout>
      <PageHeader title="Garantías" description="Protocolo de adaptación y gestión de garantías" />

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por subcódigo, paciente o motivo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subcódigo</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="hidden md:table-cell">Motivo</TableHead>
              <TableHead>Ciclo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden md:table-cell">Laboratorio</TableHead>
              <TableHead className="hidden lg:table-cell">Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay garantías{search ? ' que coincidan' : ''}</TableCell></TableRow>
            ) : filtered.map((g: any) => {
              const paciente = g.orden_productos?.ordenes?.pacientes;
              return (
                <TableRow key={g.id}>
                  <TableCell className="font-mono font-medium">{g.subcodigo}</TableCell>
                  <TableCell className="font-medium">{paciente?.nombres} {paciente?.apellidos}</TableCell>
                  <TableCell className="text-sm">{g.orden_productos?.descripcion || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[200px]">{g.motivo}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">G{g.ciclo}</Badge></TableCell>
                  <TableCell><Badge className={`text-[10px] ${estadoColor[g.estado] || ''}`}>{g.estado}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{g.laboratorios?.nombre || '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{new Date(g.fecha_solicitud).toLocaleDateString('es-CO')}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </AppLayout>
  );
}
