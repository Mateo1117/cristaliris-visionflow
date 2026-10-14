/**
 * Lectura, validación y guardado del bloque "Datos del paciente" de la
 * historia clínica (componente en DatosPacienteHC.tsx).
 */
import { supabase } from '@/integrations/supabase/client';
import { errorFechaNacimiento } from './patientSchema';

export interface PacienteComplementario {
  id: string;
  fecha_nacimiento?: string | null;
  direccion?: string | null;
  ocupacion?: string | null;
  referido_por?: string | null;
}

const CAMPOS = ['fecha_nacimiento', 'direccion', 'ocupacion', 'referido_por'] as const;
type CampoPaciente = (typeof CAMPOS)[number];
/** Prefijo de los inputs, para no chocar con columnas de la historia (p. ej. `ocupacion`). */
export const PREFIJO_PACIENTE = 'pac_';
const P = PREFIJO_PACIENTE;

/** Lee los datos del bloque desde el FormData ya convertido a objeto. */
export function leerDatosPaciente(formData: Record<string, any>): Partial<Record<CampoPaciente, string>> {
  const salida: Partial<Record<CampoPaciente, string>> = {};
  for (const c of CAMPOS) {
    const v = formData[`${P}${c}`];
    if (typeof v === 'string') salida[c] = v.trim();
  }
  return salida;
}

/** Valida los datos del bloque; devuelve el mensaje de error o null. */
export function validarDatosPaciente(formData: Record<string, any>): string | null {
  return errorFechaNacimiento(leerDatosPaciente(formData).fecha_nacimiento ?? '');
}

/**
 * Actualiza en `pacientes` solo los campos que cambiaron. Un campo vaciado no
 * borra el dato existente: la consulta completa información, no la quita.
 */
export async function actualizarDatosPaciente(paciente: PacienteComplementario, formData: Record<string, any>) {
  const datos = leerDatosPaciente(formData);
  const cambios: Partial<Record<CampoPaciente, string>> = {};
  for (const c of CAMPOS) {
    const nuevo = datos[c];
    if (nuevo && nuevo !== (paciente[c] ?? '')) cambios[c] = nuevo;
  }
  if (Object.keys(cambios).length === 0) return false;
  const { error } = await supabase.from('pacientes').update(cambios).eq('id', paciente.id);
  if (error) throw error;
  return true;
}
