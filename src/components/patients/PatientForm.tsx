import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PatientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, any>) => void;
  isPending?: boolean;
  initialData?: Record<string, any> | null;
}

const MODALIDADES = [
  { value: 'contado', label: 'Contado' },
  { value: 'nomina', label: 'Descuento por Nómina' },
  { value: 'llave', label: 'Llave' },
  { value: 'tarjeta', label: 'Tarjeta de Crédito' },
  { value: 'addi', label: 'Addi' },
  { value: 'sistecredito', label: 'Sistecrédito' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'datafono', label: 'Datáfono' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cuotas', label: 'Cuotas' },
];

export function PatientForm({ open, onOpenChange, onSubmit, isPending, initialData }: PatientFormProps) {
  const [tipoDoc, setTipoDoc] = useState('CC');
  const [genero, setGenero] = useState('');
  const [modalidad, setModalidad] = useState('contado');
  const [empresaId, setEmpresaId] = useState('ninguna');
  const [empleadoId, setEmpleadoId] = useState('nuevo');
  const [titularNombre, setTitularNombre] = useState('');
  const [titularCedula, setTitularCedula] = useState('');
  const [titularCelular, setTitularCelular] = useState('');

  const isEditing = !!initialData;
  const esNomina = empresaId !== 'ninguna';

  useEffect(() => {
    if (initialData) {
      setTipoDoc(initialData.tipo_documento || 'CC');
      setGenero(initialData.genero || '');
      setModalidad(initialData.modalidad_pago || 'contado');
      setEmpresaId(initialData.empresa_id || 'ninguna');
      setEmpleadoId(initialData.empleado_titular_id || 'nuevo');
      setTitularNombre(initialData.empleado_titular_nombre || '');
      setTitularCedula(initialData.empleado_titular_cedula || '');
      setTitularCelular(initialData.empleado_titular_celular || '');
    } else {
      setTipoDoc('CC');
      setGenero('');
      setModalidad('contado');
      setEmpresaId('ninguna');
      setEmpleadoId('nuevo');
      setTitularNombre('');
      setTitularCedula('');
      setTitularCelular('');
    }
  }, [initialData, open]);

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

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados-empresa', empresaId],
    queryFn: async () => {
      if (empresaId === 'ninguna') return [];
      const { data, error } = await supabase
        .from('empleados_nomina')
        .select('id, nombre, cedula, celular')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    },
    enabled: empresaId !== 'ninguna',
  });

  useEffect(() => {
    if (empleadoId && empleadoId !== 'nuevo') {
      const emp = empleados.find((e: any) => e.id === empleadoId);
      if (emp) {
        setTitularNombre(emp.nombre);
        setTitularCedula(emp.cedula);
        setTitularCelular(emp.celular || '');
      }
    }
  }, [empleadoId, empleados]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    fd.forEach((v, k) => { data[k] = v; });
    data.tipo_documento = tipoDoc;
    data.genero = genero || null;
    data.empresa_id = empresaId !== 'ninguna' ? empresaId : null;
    data.modalidad_pago = esNomina ? 'nomina' : modalidad;
    if (esNomina) {
      data.empleado_titular_id = empleadoId !== 'nuevo' ? empleadoId : null;
      data.empleado_titular_nombre = titularNombre || null;
      data.empleado_titular_cedula = titularCedula || null;
      data.empleado_titular_celular = titularCelular || null;
    } else {
      data.empleado_titular_id = null;
      data.empleado_titular_nombre = null;
      data.empleado_titular_cedula = null;
      data.empleado_titular_celular = null;
    }
    if (initialData?.id) data.id = initialData.id;
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing ? 'Editar Paciente' : 'Nuevo Paciente'}</DialogTitle></DialogHeader>
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
          <div className="space-y-2"><Label>Número de Documento</Label><Input name="numero_documento" placeholder="Ingrese número" required defaultValue={initialData?.numero_documento || ''} /></div>
          <div className="space-y-2"><Label>Nombres</Label><Input name="nombres" placeholder="Nombres" required defaultValue={initialData?.nombres || ''} /></div>
          <div className="space-y-2"><Label>Apellidos</Label><Input name="apellidos" placeholder="Apellidos" required defaultValue={initialData?.apellidos || ''} /></div>
          <div className="space-y-2"><Label>Fecha de Nacimiento</Label><Input name="fecha_nacimiento" type="date" defaultValue={initialData?.fecha_nacimiento || ''} /></div>
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
          <div className="space-y-2"><Label>Teléfono</Label><Input name="telefono" placeholder="3XX XXX XXXX" defaultValue={initialData?.telefono || ''} /></div>
          <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" placeholder="email@ejemplo.com" defaultValue={initialData?.email || ''} /></div>
          <div className="space-y-2"><Label>Ocupación</Label><Input name="ocupacion" placeholder="Ej: Ingeniero, Docente" defaultValue={initialData?.ocupacion || ''} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Dirección</Label><Input name="direccion" placeholder="Dirección completa" defaultValue={initialData?.direccion || ''} /></div>
          <div className="space-y-2"><Label>Ciudad</Label><Input name="ciudad" placeholder="Ciudad" defaultValue={initialData?.ciudad || 'Bogotá'} /></div>
          <div className="space-y-2"><Label>Departamento</Label><Input name="departamento" placeholder="Departamento" defaultValue={initialData?.departamento || 'Cundinamarca'} /></div>

          <div className="space-y-2">
            <Label>Empresa (convenio)</Label>
            <Select value={empresaId} onValueChange={(v) => { setEmpresaId(v); setEmpleadoId('nuevo'); }}>
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
            <Select value={esNomina ? 'nomina' : modalidad} onValueChange={setModalidad} disabled={esNomina}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODALIDADES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {esNomina && (
            <>
              <div className="md:col-span-2"><Separator /></div>
              <div className="md:col-span-2">
                <h3 className="text-sm font-semibold">Empleado Titular (Nómina)</h3>
                <p className="text-xs text-muted-foreground">Persona empleada de la empresa que autoriza el descuento por nómina.</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Empleado registrado</Label>
                <Select value={empleadoId} onValueChange={setEmpleadoId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nuevo">+ Nuevo titular (digitar manualmente)</SelectItem>
                    {empleados.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.nombre} — CC {e.cedula}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Nombre titular</Label><Input value={titularNombre} onChange={(e) => setTitularNombre(e.target.value)} placeholder="Nombre completo" required={esNomina} /></div>
              <div className="space-y-2"><Label>Cédula titular</Label><Input value={titularCedula} onChange={(e) => setTitularCedula(e.target.value)} placeholder="Número de cédula" required={esNomina} /></div>
              <div className="space-y-2 md:col-span-2"><Label>Celular titular</Label><Input value={titularCelular} onChange={(e) => setTitularCelular(e.target.value)} placeholder="3XX XXX XXXX" /></div>
            </>
          )}

          <div className="space-y-2 md:col-span-2">
            <Label>Referido por</Label>
            <Input name="referido_por" placeholder="Nombre de quien refiere al paciente (opcional)" defaultValue={initialData?.referido_por || ''} />
          </div>

          <div className="md:col-span-2 flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Guardando...' : isEditing ? 'Actualizar Paciente' : 'Guardar Paciente'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
