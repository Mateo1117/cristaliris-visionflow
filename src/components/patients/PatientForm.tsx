import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PatientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, any>) => void;
  isPending?: boolean;
}

export function PatientForm({ open, onOpenChange, onSubmit, isPending }: PatientFormProps) {
  const [tipoDoc, setTipoDoc] = useState('CC');
  const [genero, setGenero] = useState('');
  const [modalidad, setModalidad] = useState('contado');
  const [empresaId, setEmpresaId] = useState('ninguna');

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-activas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, razon_social')
        .eq('estado_activa', true)
        .order('razon_social');
      if (error) throw error;
      return data;
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    fd.forEach((v, k) => { data[k] = v; });
    data.tipo_documento = tipoDoc;
    data.genero = genero || null;
    data.modalidad_pago = modalidad;
    data.empresa_id = empresaId !== 'ninguna' ? empresaId : null;
    if (empresaId !== 'ninguna') {
      data.modalidad_pago = 'nomina';
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo Paciente</DialogTitle></DialogHeader>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>Tipo Documento</Label>
            <Select value={tipoDoc} onValueChange={setTipoDoc}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                <SelectItem value="PA">Pasaporte</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Número de Documento</Label><Input name="numero_documento" placeholder="Ingrese número" required /></div>
          <div className="space-y-2"><Label>Nombres</Label><Input name="nombres" placeholder="Nombres" required /></div>
          <div className="space-y-2"><Label>Apellidos</Label><Input name="apellidos" placeholder="Apellidos" required /></div>
          <div className="space-y-2"><Label>Fecha de Nacimiento</Label><Input name="fecha_nacimiento" type="date" /></div>
          <div className="space-y-2">
            <Label>Género</Label>
            <Select value={genero} onValueChange={setGenero}>
              <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="F">Femenino</SelectItem>
                <SelectItem value="O">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Teléfono</Label><Input name="telefono" placeholder="3XX XXX XXXX" /></div>
          <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" placeholder="email@ejemplo.com" /></div>
          <div className="space-y-2 md:col-span-2"><Label>Dirección</Label><Input name="direccion" placeholder="Dirección completa" /></div>
          <div className="space-y-2"><Label>Ciudad</Label><Input name="ciudad" placeholder="Ciudad" defaultValue="Bogotá" /></div>
          <div className="space-y-2"><Label>Departamento</Label><Input name="departamento" placeholder="Departamento" defaultValue="Cundinamarca" /></div>
          
          <div className="space-y-2">
            <Label>Empresa (convenio)</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger><SelectValue placeholder="Sin empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Sin empresa / Particular</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.razon_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Modalidad de Pago</Label>
            <Select value={empresaId !== 'ninguna' ? 'nomina' : modalidad} onValueChange={setModalidad} disabled={empresaId !== 'ninguna'}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contado">Contado</SelectItem>
                <SelectItem value="nomina">Descuento por Nómina</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Referido por</Label>
            <Input name="referido_por" placeholder="Nombre de quien refiere al paciente (opcional)" />
          </div>

          <div className="md:col-span-2 flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Guardando...' : 'Guardar Paciente'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
