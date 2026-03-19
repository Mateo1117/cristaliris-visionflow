import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Building2 } from 'lucide-react';

interface DeudaEmpresa {
  empresa_id: string;
  razon_social: string;
  nit: string;
  total_ordenes: number;
  total_deuda: number;
  ordenes_count: number;
}

export function DeudaEmpresasCard() {
  const { data: deudas = [], isLoading } = useQuery({
    queryKey: ['deuda-empresas-nomina'],
    queryFn: async () => {
      // Get all orders with modalidad_pago = 'nomina' that have pending balance
      const { data: ordenes, error } = await supabase
        .from('ordenes')
        .select('id, total_final, saldo_pendiente, empresa_id, pacientes(empresa_id, nombres, apellidos, empresas(id, razon_social, nit))')
        .eq('modalidad_pago', 'nomina')
        .gt('saldo_pendiente', 0);
      if (error) throw error;

      const empresaMap = new Map<string, DeudaEmpresa>();
      (ordenes || []).forEach((o: any) => {
        const empresa = o.pacientes?.empresas;
        if (!empresa) return;
        const existing = empresaMap.get(empresa.id) || {
          empresa_id: empresa.id,
          razon_social: empresa.razon_social,
          nit: empresa.nit,
          total_ordenes: 0,
          total_deuda: 0,
          ordenes_count: 0,
        };
        existing.total_ordenes += o.total_final || 0;
        existing.total_deuda += o.saldo_pendiente || 0;
        existing.ordenes_count += 1;
        empresaMap.set(empresa.id, existing);
      });

      return Array.from(empresaMap.values()).sort((a, b) => b.total_deuda - a.total_deuda);
    },
  });

  const totalDeuda = deudas.reduce((s, d) => s + d.total_deuda, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Deuda por Empresa (Nómina)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Cargando...</p>
        ) : deudas.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">No hay deudas de nómina pendientes</p>
        ) : (
          <>
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">Total Cartera Nómina</span>
              <span className="text-lg font-bold text-destructive">${totalDeuda.toLocaleString('es-CO')}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">NIT</TableHead>
                  <TableHead className="text-right">Órdenes</TableHead>
                  <TableHead className="text-right">Deuda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deudas.map((d) => (
                  <TableRow key={d.empresa_id}>
                    <TableCell className="font-medium">{d.razon_social}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{d.nit}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="text-[10px]">{d.ordenes_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-destructive">
                      ${d.total_deuda.toLocaleString('es-CO')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
