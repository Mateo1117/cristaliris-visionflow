/**
 * Guardado de pacientes, compartido por el módulo Pacientes y el registro
 * rápido desde la agenda (paciente que llega sin estar registrado).
 */
import { supabase } from '@/integrations/supabase/client';
import { esFueraDeBogota, normalizarCiudad } from './patientUtils';

export async function construirPayloadPaciente(f: Record<string, any>) {
  let empleadoId = f.empleado_titular_id || null;
  // Auto-crear empleado si modalidad nómina, hay empresa y titular nuevo
  if (f.modalidad_pago === 'nomina' && f.empresa_id && !empleadoId && f.empleado_titular_cedula) {
    const { data: existing } = await supabase
      .from('empleados_nomina')
      .select('id')
      .eq('empresa_id', f.empresa_id)
      .eq('cedula', f.empleado_titular_cedula)
      .maybeSingle();
    if (existing) {
      empleadoId = existing.id;
    } else {
      const { data: nuevo, error: errEmp } = await supabase
        .from('empleados_nomina')
        .insert({
          empresa_id: f.empresa_id,
          nombre: f.empleado_titular_nombre,
          cedula: f.empleado_titular_cedula,
          celular: f.empleado_titular_celular || null,
        })
        .select('id')
        .single();
      if (errEmp) throw errEmp;
      empleadoId = nuevo.id;
    }
  }
  // La ciudad se normaliza UNA vez y el indicador se deriva de ese valor: así
  // no puede guardarse "Bogotá" marcada a la vez como fuera de Bogotá.
  const ciudad = normalizarCiudad(f.ciudad);
  return {
    tipo_documento: f.tipo_documento,
    numero_documento: f.numero_documento,
    nombres: f.nombres,
    apellidos: f.apellidos,
    fecha_nacimiento: f.fecha_nacimiento || null,
    genero: f.genero || null,
    telefono: f.telefono,
    email: f.email,
    direccion: f.direccion,
    ciudad,
    departamento: f.departamento || 'Cundinamarca',
    modalidad_pago: f.modalidad_pago || 'contado',
    es_fuera_bogota: esFueraDeBogota(ciudad),
    empresa_id: f.empresa_id || null,
    referido_por: f.referido_por || null,
    ocupacion: f.ocupacion || null,
    empleado_titular_id: empleadoId,
    empleado_titular_nombre: f.empleado_titular_nombre || null,
    empleado_titular_cedula: f.empleado_titular_cedula || null,
    empleado_titular_celular: f.empleado_titular_celular || null,
  };
}

/** Crea el paciente y devuelve su id. */
export async function crearPaciente(f: Record<string, any>): Promise<string> {
  const payload = await construirPayloadPaciente(f);
  const { data, error } = await supabase.from('pacientes').insert(payload as any).select('id').single();
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe un paciente con ese documento. Búsquelo por número de documento.');
    throw error;
  }
  return data.id;
}
