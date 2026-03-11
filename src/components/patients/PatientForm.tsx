import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PatientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatientForm({ open, onOpenChange }: PatientFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Paciente</DialogTitle>
        </DialogHeader>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); onOpenChange(false); }}>
          <div className="space-y-2">
            <Label>Tipo Documento</Label>
            <Select defaultValue="CC">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                <SelectItem value="PA">Pasaporte</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Número de Documento</Label>
            <Input placeholder="Ingrese número" />
          </div>
          <div className="space-y-2">
            <Label>Nombres</Label>
            <Input placeholder="Nombres" />
          </div>
          <div className="space-y-2">
            <Label>Apellidos</Label>
            <Input placeholder="Apellidos" />
          </div>
          <div className="space-y-2">
            <Label>Fecha de Nacimiento</Label>
            <Input type="date" />
          </div>
          <div className="space-y-2">
            <Label>Género</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="F">Femenino</SelectItem>
                <SelectItem value="O">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Teléfono</Label>
            <Input placeholder="3XX XXX XXXX" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" placeholder="email@ejemplo.com" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Dirección</Label>
            <Input placeholder="Dirección completa" />
          </div>
          <div className="space-y-2">
            <Label>Ciudad</Label>
            <Input placeholder="Ciudad" defaultValue="Bogotá" />
          </div>
          <div className="space-y-2">
            <Label>Departamento</Label>
            <Input placeholder="Departamento" defaultValue="Cundinamarca" />
          </div>
          <div className="space-y-2">
            <Label>Modalidad de Pago</Label>
            <Select defaultValue="contado">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contado">Contado</SelectItem>
                <SelectItem value="nomina">Descuento por Nómina</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sede</Label>
            <Select defaultValue="norte">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="norte">Sede Norte</SelectItem>
                <SelectItem value="sur">Sede Sur</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Guardar Paciente</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
