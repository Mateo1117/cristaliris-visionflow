import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, FileText } from 'lucide-react';

interface PatientTableProps {
  searchQuery: string;
  pacientes: any[];
  isLoading: boolean;
  onEdit?: (paciente: any) => void;
  onViewHistory?: (pacienteId: string) => void;
  onViewDetail?: (paciente: any) => void;
}

export function PatientTable({ searchQuery, pacientes, isLoading, onEdit, onViewHistory, onViewDetail }: PatientTableProps) {
  const q = searchQuery.toLowerCase();
  const filtered = pacientes.filter((p: any) =>
    p.numero_documento?.includes(q) ||
    `${p.nombres} ${p.apellidos}`.toLowerCase().includes(q) ||
    p.telefono?.includes(q) ||
    p.referido_por?.toLowerCase().includes(q)
  );

  if (isLoading) {
    return <Card className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</Card>;
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="hidden md:table-cell">Teléfono</TableHead>
            <TableHead className="hidden lg:table-cell">Empresa</TableHead>
            <TableHead className="hidden lg:table-cell">Referido</TableHead>
            <TableHead className="hidden lg:table-cell">Sede</TableHead>
            <TableHead>Pago</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((p: any) => (
            <TableRow key={p.id} className="hover:bg-muted/50">
              <TableCell className="font-medium">{p.tipo_documento} {p.numero_documento}</TableCell>
              <TableCell>{p.nombres} {p.apellidos}</TableCell>
              <TableCell className="hidden md:table-cell">{p.telefono}</TableCell>
              <TableCell className="hidden lg:table-cell">{p.empresas?.razon_social ?? '—'}</TableCell>
              <TableCell className="hidden lg:table-cell">{p.referido_por ?? '—'}</TableCell>
              <TableCell className="hidden lg:table-cell">{p.sedes?.nombre ?? '—'}</TableCell>
              <TableCell>
                <Badge variant={p.modalidad_pago === 'nomina' ? 'secondary' : 'outline'}>
                  {p.modalidad_pago === 'nomina' ? 'Nómina' : p.modalidad_pago === 'cuotas' ? 'Cuotas' : 'Contado'}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit?.(p)}>
                      <Pencil className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewHistory?.(p.id)}>
                      <FileText className="h-4 w-4 mr-2" />Historia Clínica
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No se encontraron pacientes</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
