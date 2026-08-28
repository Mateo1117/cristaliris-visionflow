import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pacienteSchema, valoresIniciales, type PacienteFormValues } from './patientSchema';

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
  const isEditing = !!initialData;

  const form = useForm<PacienteFormValues>({
    resolver: zodResolver(pacienteSchema),
    defaultValues: valoresIniciales(initialData),
    mode: 'onBlur',
  });

  const empresaId = form.watch('empresa_id');
  const empleadoId = form.watch('empleado_titular_id');
  const modalidad = form.watch('modalidad_pago');
  const esNomina = empresaId !== 'ninguna';

  // Al abrir el diálogo (o cambiar el paciente en edición) se recarga el estado.
  useEffect(() => {
    form.reset(valoresIniciales(initialData));
  }, [initialData, open]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Al escoger un titular ya registrado se copian sus datos al formulario.
  useEffect(() => {
    if (!empleadoId || empleadoId === 'nuevo') return;
    const emp = empleados.find((e: any) => e.id === empleadoId);
    if (!emp) return;
    form.setValue('empleado_titular_nombre', emp.nombre || '', { shouldValidate: true });
    form.setValue('empleado_titular_cedula', emp.cedula || '', { shouldValidate: true });
    form.setValue('empleado_titular_celular', emp.celular || '', { shouldValidate: true });
  }, [empleadoId, empleados]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = (v: PacienteFormValues) => {
    const conConvenio = v.empresa_id !== 'ninguna';
    onSubmit({
      ...(initialData?.id ? { id: initialData.id } : {}),
      tipo_documento: v.tipo_documento,
      numero_documento: v.numero_documento,
      nombres: v.nombres,
      apellidos: v.apellidos,
      fecha_nacimiento: v.fecha_nacimiento || null,
      genero: v.genero || null,
      telefono: v.telefono,
      email: v.email,
      direccion: v.direccion,
      ciudad: v.ciudad,
      departamento: v.departamento,
      ocupacion: v.ocupacion || null,
      referido_por: v.referido_por || null,
      empresa_id: conConvenio ? v.empresa_id : null,
      modalidad_pago: conConvenio ? 'nomina' : v.modalidad_pago,
      empleado_titular_id: conConvenio && v.empleado_titular_id !== 'nuevo' ? v.empleado_titular_id : null,
      empleado_titular_nombre: conConvenio ? v.empleado_titular_nombre || null : null,
      empleado_titular_cedula: conConvenio ? v.empleado_titular_cedula || null : null,
      empleado_titular_celular: conConvenio ? v.empleado_titular_celular || null : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing ? 'Editar Paciente' : 'Nuevo Paciente'}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={form.handleSubmit(enviar)} noValidate>
            <FormField
              control={form.control}
              name="tipo_documento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo Documento</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                      <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                      <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                      <SelectItem value="PA">Pasaporte</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="numero_documento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Documento</FormLabel>
                  <FormControl><Input placeholder="Ingrese número" inputMode="numeric" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nombres"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombres</FormLabel>
                  <FormControl><Input placeholder="Nombres" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="apellidos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apellidos</FormLabel>
                  <FormControl><Input placeholder="Apellidos" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fecha_nacimiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Nacimiento</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="genero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Género</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Femenino</SelectItem>
                      <SelectItem value="O">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="telefono"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl><Input placeholder="3XX XXX XXXX" inputMode="tel" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="email@ejemplo.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ocupacion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ocupación</FormLabel>
                  <FormControl><Input placeholder="Ej: Ingeniero, Docente" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="direccion"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Dirección</FormLabel>
                  <FormControl><Input placeholder="Dirección completa" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ciudad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad</FormLabel>
                  <FormControl><Input placeholder="Ciudad" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="departamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Departamento</FormLabel>
                  <FormControl><Input placeholder="Departamento" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="empresa_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa (convenio)</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue('empleado_titular_id', 'nuevo');
                    }}
                  >
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Sin empresa" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ninguna">Sin empresa / Particular</SelectItem>
                      {empresas.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.razon_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="modalidad_pago"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modalidad de Pago</FormLabel>
                  <Select value={esNomina ? 'nomina' : modalidad} onValueChange={field.onChange} disabled={esNomina}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MODALIDADES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {esNomina && (
              <>
                <div className="md:col-span-2"><Separator /></div>
                <div className="md:col-span-2">
                  <h3 className="text-sm font-semibold">Empleado Titular (Nómina)</h3>
                  <p className="text-xs text-muted-foreground">Persona empleada de la empresa que autoriza el descuento por nómina.</p>
                </div>

                <FormField
                  control={form.control}
                  name="empleado_titular_id"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Empleado registrado</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="nuevo">+ Nuevo titular (digitar manualmente)</SelectItem>
                          {empleados.map((e: any) => (
                            <SelectItem key={e.id} value={e.id}>{e.nombre} — CC {e.cedula}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="empleado_titular_nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre titular</FormLabel>
                      <FormControl><Input placeholder="Nombre completo" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="empleado_titular_cedula"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cédula titular</FormLabel>
                      <FormControl><Input placeholder="Número de cédula" inputMode="numeric" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="empleado_titular_celular"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Celular titular</FormLabel>
                      <FormControl><Input placeholder="3XX XXX XXXX" inputMode="tel" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="referido_por"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Referido por</FormLabel>
                  <FormControl><Input placeholder="Nombre de quien refiere al paciente (opcional)" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="md:col-span-2 flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Guardando...' : isEditing ? 'Actualizar Paciente' : 'Guardar Paciente'}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
