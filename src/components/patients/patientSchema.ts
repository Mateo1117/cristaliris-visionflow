/**
 * Validación del formulario de pacientes (zod + react-hook-form).
 *
 * El formulario se enviaba con `FormData` cruda: bastaba con quitar el
 * `required` del HTML para guardar un paciente sin documento, con un email
 * inválido o con una fecha de nacimiento en el futuro. Aquí queda la única
 * definición de qué es un paciente válido.
 *
 * Todos los campos son `string` (nunca `undefined`) para que el tipo de entrada
 * y el de salida del esquema coincidan: react-hook-form trabaja con inputs
 * controlados y los campos vacíos se convierten a `null` al construir el
 * payload, no aquí.
 */

import { z } from 'zod';
import { hoyColombia, toFechaColombia } from '@/lib/businessDays';

export const TIPOS_DOCUMENTO = ['CC', 'CE', 'TI', 'PA'] as const;

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ANIO_MINIMO = 1900;

/**
 * Teléfono colombiano razonable: celular de 10 dígitos que empieza por 3 o
 * fijo de 7-8 dígitos, con indicativo +57 opcional. Se ignoran espacios,
 * guiones y paréntesis.
 */
export function esTelefonoColombiano(valor: string): boolean {
  const digitos = (valor ?? '').replace(/\D/g, '');
  if (!digitos) return false;
  const nacional = digitos.length > 10 && digitos.startsWith('57') ? digitos.slice(2) : digitos;
  return /^3\d{9}$/.test(nacional) || /^[1-8]\d{6,7}$/.test(nacional);
}

/** Fecha de nacimiento válida: formato ISO, año razonable y no futura. */
export function errorFechaNacimiento(valor: string, hoy: string = hoyColombia()): string | null {
  if (!valor) return null;
  if (!RE_FECHA.test(valor)) return 'Use el formato AAAA-MM-DD';
  let fecha: string;
  try {
    fecha = toFechaColombia(valor);
  } catch {
    return 'La fecha de nacimiento no es válida';
  }
  if (Number(fecha.slice(0, 4)) < ANIO_MINIMO) return `El año debe ser posterior a ${ANIO_MINIMO}`;
  if (fecha > hoy) return 'La fecha de nacimiento no puede ser futura';
  return null;
}

const texto = z.string().trim();

export const pacienteSchema = z
  .object({
    tipo_documento: z.enum(TIPOS_DOCUMENTO, { required_error: 'Seleccione el tipo de documento' }),
    numero_documento: texto.min(1, 'El número de documento es obligatorio'),
    nombres: texto.min(2, 'Los nombres son obligatorios'),
    apellidos: texto.min(2, 'Los apellidos son obligatorios'),
    fecha_nacimiento: texto,
    genero: texto,
    telefono: texto,
    email: texto,
    ocupacion: texto,
    direccion: texto,
    ciudad: texto,
    departamento: texto,
    empresa_id: texto,
    modalidad_pago: texto,
    empleado_titular_id: texto,
    empleado_titular_nombre: texto,
    empleado_titular_cedula: texto,
    empleado_titular_celular: texto,
    referido_por: texto,
  })
  .superRefine((v, ctx) => {
    // Documento: numérico salvo pasaporte, que sí admite letras.
    if (v.numero_documento) {
      if (v.tipo_documento === 'PA') {
        if (!/^[A-Za-z0-9]{5,}$/.test(v.numero_documento)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['numero_documento'],
            message: 'El pasaporte debe tener al menos 5 caracteres alfanuméricos',
          });
        }
      } else if (!/^\d{4,15}$/.test(v.numero_documento)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['numero_documento'],
          message: 'El documento debe contener solo números (4 a 15 dígitos)',
        });
      }
    }

    if (v.email && !z.string().email().safeParse(v.email).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'El email no tiene un formato válido' });
    }

    if (v.telefono && !esTelefonoColombiano(v.telefono)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['telefono'],
        message: 'Teléfono inválido. Ej: 3101234567 o 6012345678',
      });
    }

    const errorFecha = errorFechaNacimiento(v.fecha_nacimiento);
    if (errorFecha) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fecha_nacimiento'], message: errorFecha });
    }

    // Con empresa (convenio) el descuento es por nómina: hace falta el titular.
    if (v.empresa_id && v.empresa_id !== 'ninguna') {
      if (!v.empleado_titular_nombre) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['empleado_titular_nombre'],
          message: 'Indique el nombre del empleado titular',
        });
      }
      if (!v.empleado_titular_cedula) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['empleado_titular_cedula'],
          message: 'Indique la cédula del empleado titular',
        });
      } else if (!/^\d{4,15}$/.test(v.empleado_titular_cedula)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['empleado_titular_cedula'],
          message: 'La cédula debe contener solo números',
        });
      }
      if (v.empleado_titular_celular && !esTelefonoColombiano(v.empleado_titular_celular)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['empleado_titular_celular'],
          message: 'Celular inválido. Ej: 3101234567',
        });
      }
    }
  });

export type PacienteFormValues = z.infer<typeof pacienteSchema>;

/** Valores iniciales del formulario (alta nueva o edición). */
export function valoresIniciales(initialData?: Record<string, any> | null): PacienteFormValues {
  return {
    tipo_documento: (initialData?.tipo_documento as PacienteFormValues['tipo_documento']) || 'CC',
    numero_documento: initialData?.numero_documento || '',
    nombres: initialData?.nombres || '',
    apellidos: initialData?.apellidos || '',
    fecha_nacimiento: initialData?.fecha_nacimiento || '',
    genero: initialData?.genero || '',
    telefono: initialData?.telefono || '',
    email: initialData?.email || '',
    ocupacion: initialData?.ocupacion || '',
    direccion: initialData?.direccion || '',
    ciudad: initialData?.ciudad || 'Bogotá',
    departamento: initialData?.departamento || 'Cundinamarca',
    empresa_id: initialData?.empresa_id || 'ninguna',
    modalidad_pago: initialData?.modalidad_pago || 'contado',
    empleado_titular_id: initialData?.empleado_titular_id || 'nuevo',
    empleado_titular_nombre: initialData?.empleado_titular_nombre || '',
    empleado_titular_cedula: initialData?.empleado_titular_cedula || '',
    empleado_titular_celular: initialData?.empleado_titular_celular || '',
    referido_por: initialData?.referido_por || '',
  };
}
