import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { mockPacientes } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';

interface PatientTableProps {
  searchQuery: string;
}

export function PatientTable({ searchQuery }: PatientTableProps) {
  const q = searchQuery.toLowerCase();
  const filtered = mockPacientes.filter((p) =>
    p.numero_documento.includes(q) ||
    `${p.nombres} ${p.apellidos}`.toLowerCase().includes(q) ||
    p.telefono.includes(q)
  );

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="hidden md:table-cell">Teléfono</TableHead>
            <TableHead className="hidden lg:table-cell">Ciudad</TableHead>
            <TableHead className="hidden lg:table-cell">Sede</TableHead>
            <TableHead>Pago</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((p) => (
            <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50">
              <TableCell className="font-medium">{p.tipo_documento} {p.numero_documento}</TableCell>
              <TableCell>{p.nombres} {p.apellidos}</TableCell>
              <TableCell className="hidden md:table-cell">{p.telefono}</TableCell>
              <TableCell className="hidden lg:table-cell">{p.ciudad}</TableCell>
              <TableCell className="hidden lg:table-cell">{p.sede_registro}</TableCell>
              <TableCell>
                <Badge variant={p.modalidad_pago === 'nomina' ? 'secondary' : 'outline'}>
                  {p.modalidad_pago === 'nomina' ? 'Nómina' : 'Contado'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No se encontraron pacientes</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
