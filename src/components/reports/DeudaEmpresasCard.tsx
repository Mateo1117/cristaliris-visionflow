import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface OrdenNomina {
  orden_id: string;
  paciente_nombre: string;
  documento: string;
  total_final: number;
  saldo_pendiente: number;
  fecha: string;
}

interface DeudaEmpresa {
  empresa_id: string;
  razon_social: string;
  nit: string;
  total_deuda: number;
  ordenes: OrdenNomina[];
}

export function DeudaEmpresasCard() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: deudas = [], isLoading } = useQuery({
    queryKey: ['deuda-empresas-nomina'],
    queryFn: async () => {
      // Get orders with modalidad_pago = 'nomina' that have pending balance
      // Use empresa_id from ordenes first, fallback to paciente's empresa
      const { data: ordenes, error } = await supabase
        .from('ordenes')
        .select('id, total_final, saldo_pendiente, created_at, empresa_id, empresas(id, razon_social, nit), paciente_id, pacientes(nombres, apellidos, numero_documento, empresa_id, empresas(id, razon_social, nit))')
        .eq('modalidad_pago', 'nomina')
        .gt('saldo_pendiente', 0);
      if (error) throw error;

      const empresaMap = new Map<string, DeudaEmpresa>();
      (ordenes || []).forEach((o: any) => {
        // Priority: empresa from orden, then from paciente
        const empresa = o.empresas || o.pacientes?.empresas;
        if (!empresa) return;

        const existing = empresaMap.get(empresa.id) || {
          empresa_id: empresa.id,
          razon_social: empresa.razon_social,
          nit: empresa.nit,
          total_deuda: 0,
          ordenes: [],
        };

        existing.total_deuda += o.saldo_pendiente || 0;
        existing.ordenes.push({
          orden_id: o.id,
          paciente_nombre: `${o.pacientes?.nombres || ''} ${o.pacientes?.apellidos || ''}`.trim(),
          documento: o.pacientes?.numero_documento || '',
          total_final: o.total_final || 0,
          saldo_pendiente: o.saldo_pendiente || 0,
          fecha: o.created_at,
        });
        empresaMap.set(empresa.id, existing);
      });

      return Array.from(empresaMap.values()).sort((a, b) => b.total_deuda - a.total_deuda);
    },
  });

  const totalDeuda = deudas.reduce((s, d) => s + d.total_deuda, 0);
  const totalOrdenes = deudas.reduce((s, d) => s + d.ordenes.length, 0);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Deuda por Empresa (Descuento de Nómina)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Cargando...</p>
        ) : deudas.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">No hay deudas de nómina pendientes</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
                <span className="text-xs text-muted-foreground">Total Cartera Nómina</span>
                <p className="text-lg font-bold text-destructive">${totalDeuda.toLocaleString('es-CO')}</p>
              </div>
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3">
                <span className="text-xs text-muted-foreground">Empresas</span>
                <p className="text-lg font-bold">{deudas.length}</p>
              </div>
              <div className="rounded-lg bg-warning/10 border border-warning/30 p-3">
                <span className="text-xs text-muted-foreground">Órdenes Pendientes</span>
                <p className="text-lg font-bold">{totalOrdenes}</p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">NIT</TableHead>
                  <TableHead className="text-right">Órdenes</TableHead>
                  <TableHead className="text-right">Deuda Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deudas.map((d) => (
                  <>
                    <TableRow
                      key={d.empresa_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggle(d.empresa_id)}
                    >
                      <TableCell className="pr-0">
                        {expanded.has(d.empresa_id) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{d.razon_social}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{d.nit}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-[10px]">{d.ordenes.length}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-destructive">
                        ${d.total_deuda.toLocaleString('es-CO')}
                      </TableCell>
                    </TableRow>
                    {expanded.has(d.empresa_id) && d.ordenes.map((o) => (
                      <TableRow key={o.orden_id} className="bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell className="text-sm pl-6">
                          {o.paciente_nombre}
                          <span className="text-muted-foreground ml-2 text-xs">({o.documento})</span>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(o.fecha).toLocaleDateString('es-CO')}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          Total: ${o.total_final.toLocaleString('es-CO')}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-destructive">
                          ${o.saldo_pendiente.toLocaleString('es-CO')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
