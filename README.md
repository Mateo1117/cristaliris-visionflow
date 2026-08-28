# Crystal Iris Flow

PROMPT MAESTRO — Sistema Cristaliris

Plataforma Integral de Gestión para Óptica

CONTEXTO DEL PROYECTO

Eres un ingeniero de software senior fullstack. Tu tarea es construir Sistema Cristaliris, una plataforma web privada (SaaS interno) para la óptica Cristal Iris. El sistema debe cubrir el ciclo completo del negocio: desde el primer contacto del paciente por WhatsApp, pasando por la consulta optométrica, la elaboración y seguimiento de gafas en laboratorio, hasta la entrega final y gestión de cartera.

Stack tecnológico sugerido: React/Next.js + Tailwind CSS + shadcn/ui (frontend), Supabase o PostgreSQL (base de datos), Node.js/Express o Next.js API Routes (backend), autenticación con Supabase Auth o NextAuth, generación de PDF con jsPDF o Puppeteer, lectura de QR con html5-qrcode, almacenamiento de archivos clínicos encriptados.

Principios de diseño:

Interfaz responsive (escritorio + tablet + móvil para escaneo QR en campo).

UX intuitiva tipo dashboard con navegación lateral y vistas Kanban.

Toda acción crítica debe quedar registrada en log de auditoría (usuario, fecha, hora, IP, acción, dato anterior, dato nuevo).

El sistema debe ser multi-sede desde su arquitectura base.

Roles y permisos granulares por módulo y por sede.

ARQUITECTURA DE BASE DE DATOS (Entidades principales)

Diseña el esquema relacional con al menos las siguientes entidades y sus relaciones:

Entidades Core

sedes (id, nombre, dirección, teléfono, estado_activa, configuración)

usuarios (id, nombre, email, rol, sede_asignada[], permisos[], estado_activo, último_acceso)

pacientes (id, tipo_documento, número_documento, nombres, apellidos, fecha_nacimiento, género, teléfono, email, dirección, ciudad, departamento, empresa_id, modalidad_pago, plan_beneficio, sede_registro, fecha_registro, observaciones, es_fuera_bogota)

empresas (id, nit, razón_social, porcentaje_descuento [45% o 50%], contacto_rrhh, email, teléfono, estado_activa)

historias_clinicas (id, paciente_id, optometra_id, fecha_consulta, anamnesis, antecedentes, agudeza_visual_od, agudeza_visual_oi, refracción_od, refracción_oi, formula_od_esfera, formula_od_cilindro, formula_od_eje, formula_od_adicion, formula_oi_esfera, formula_oi_cilindro, formula_oi_eje, formula_oi_adicion, distancia_pupilar, altura_pupilar, diagnóstico, observaciones, archivo_formula_pdf, firma_optometra)

citas (id, paciente_id, optometra_id, sede_id, fecha, hora_inicio, hora_fin, estado [agendada, confirmada, asistió, no_asistió, cancelada], origen [bot, manual, crm], observaciones)

cotizaciones (id, paciente_id, asesor_id, fecha, items[], total_estimado, estado [vigente, convertida, vencida], fecha_vencimiento, orden_id_convertida)

ordenes (id, paciente_id, cotización_id_origen, asesor_id, optometra_id, sede_id, empresa_id, fecha_creación, modalidad_pago [contado, tarjeta, nómina, addi, link_pago], subtotal, descuento_porcentaje, descuento_empresa, recargo_financiero, total_final, saldo_pendiente, estado_pago [pendiente, parcial, pagado], soporte_pago_url, aprobación_nómina_estado, observaciones_generales)

orden_productos (id, orden_id, tipo_producto [lente, montura, insumo], descripción, montura_id, lente_tipo, laboratorio_id, código_qr, estado_actual, costo_laboratorio, costo_montura, costo_lente, costo_insumos, precio_venta, comisión_financiera, utilidad_calculada, numero_orden_laboratorio, fecha_envio_lab, fecha_recepcion_lab, fecha_control_calidad, fecha_listo_entrega, fecha_entrega_real, tipo_lente_tiempo [1_dia, 3_dias], es_reproceso, es_garantía, garantia_codigo, ciclo_garantia, observaciones)

estados_producto (id, orden_producto_id, estado_anterior, estado_nuevo, fecha_cambio, usuario_id, método [qr_scan, manual, admin_retroceso], justificación, ip_registro) — Los estados posibles son: Pedido Creado → Enviado a Laboratorio → Recibido en Laboratorio → En Producción → Producido → En Tránsito → Recibido en Óptica → Control de Calidad → Listo para Entrega → Entregado

abonos (id, orden_id, paciente_id, monto, fecha_abono, medio_pago, referencia_pago, soporte_url, registrado_por, observaciones)

aplicacion_abonos (id, abono_id, orden_id, monto_aplicado, fecha_aplicación, usuario_id)

laboratorios (id, nombre, contacto, teléfono, email, tiempo_promedio_entrega, estado_activo)

inventario (id, sede_id, tipo [montura, lente, insumo], código_referencia, marca, modelo, descripción, cantidad_disponible, stock_mínimo, costo_unitario, precio_venta, ubicación_estante, estado)

transferencias_inventario (id, sede_origen, sede_destino, producto_id, cantidad, fecha, usuario_id, motivo, estado)

garantias (id, orden_producto_id, subcódigo [G1, G2, G3...], ciclo, motivo, fecha_solicitud, fecha_resolución, laboratorio_id, estado, guia_envio, envio_asumido_por, observaciones)

caja_diaria (id, sede_id, usuario_id, fecha, hora_apertura, hora_cierre, monto_apertura, ingresos_efectivo, ingresos_tarjeta, ingresos_transferencia, egresos, monto_cierre, diferencia, estado [abierta, cerrada], observaciones)

festivos (id, fecha, descripción, año)

log_auditoria (id, usuario_id, entidad, entidad_id, acción, datos_anteriores_json, datos_nuevos_json, ip, user_agent, timestamp)

MÓDULO 1: GESTIÓN COMERCIAL Y AGENDA

1.1 Agenda de Optómetras

Calendario interno visual (vista día / semana / mes) por optómetra y por sede.

Intervalos de cita configurables (predeterminado: 20 minutos).

Cada cita muestra: paciente, tipo de consulta, estado (código de color).

Estados de cita: Agendada → Confirmada → Asistió / No Asistió / Cancelada.

Registro obligatorio de asistencia e inasistencia con timestamp.

Integración opcional con Google Calendar (sincronización bidireccional).

El bot de WhatsApp puede crear citas automáticamente vía API.

1.2 CRM y Leads

Integración con CRM externo (recepción de leads vía webhook).

Tabla de leads con: nombre, teléfono, origen (WhatsApp, redes, referido), fecha, estado (nuevo, contactado, citado, convertido, perdido), asesor asignado.

Conversión automática de lead a paciente al crear la primera cita.

Métricas: leads por origen, tasa de conversión, tiempo promedio de cierre.

1.3 Cotizaciones

Crear cotizaciones con múltiples ítems (monturas, lentes, insumos).

Aplicar automáticamente descuento de empresa si el paciente tiene empresa vinculada.

Estados: Vigente → Convertida a Orden / Vencida.

Fecha de vencimiento configurable.

Botón directo "Convertir a Orden" que traslada todos los datos sin re-digitación.

Métricas de tasa de cierre (cotizaciones convertidas / cotizaciones totales).

Exportar cotización a PDF con membrete de la óptica.

MÓDULO 2: GESTIÓN CLÍNICA (HISTORIA CLÍNICA Y FÓRMULAS)

2.1 Historia Clínica Digital

Formulario estructurado por paciente con los siguientes campos obligatorios:

Datos del paciente (prellenados desde la ficha).

Motivo de consulta / anamnesis.

Antecedentes personales y familiares (patológicos, quirúrgicos, oculares).

Agudeza visual (OD y OI, con y sin corrección).

Refracción objetiva y subjetiva.

Fórmula optométrica completa:

OD: Esfera, Cilindro, Eje, Adición, DNP, Altura.

OI: Esfera, Cilindro, Eje, Adición, DNP, Altura.

Distancia pupilar total.

Diagnóstico (texto libre + código CIE-10 sugerido).

Plan de manejo / observaciones.

Firma digital del optómetra.

Histórico de consultas por paciente (timeline visual).

Generación automática de fórmula en PDF con membrete.

Archivos clínicos almacenados con encriptación.

Búsqueda rápida de pacientes por documento, nombre o teléfono.

2.2 Pacientes Fuera de Bogotá

Permitir crear orden sin cita presencial (checkbox "Paciente remoto").

Registrar envío y recepción de montura (guía, transportadora, fecha).

Generar código QR automáticamente para el producto.

Aplicar garantía si se confirma error de fórmula (validación por optómetra).

MÓDULO 3: ÓRDENES Y FLUJO LOGÍSTICO

3.1 Creación de Órdenes

Crear orden vinculada a paciente y opcionalmente a cotización previa.

Cada orden puede contener múltiples productos (ej: gafas de lejos + gafas de cerca + montura de sol).

Cada producto dentro de la orden genera un código QR único que acompaña al producto físicamente.

Campos por producto: tipo de lente, material, tratamiento, montura seleccionada (del inventario o traída por paciente), laboratorio asignado, fórmula asociada.

Validaciones al crear:

No enviar a laboratorio sin soporte de pago registrado O aprobación de nómina vigente.

Si la modalidad es nómina, exigir aprobación de la empresa antes de enviar a producción.

3.2 Flujo de Estados por Producto (Kanban + QR)

Cada producto individual recorre el siguiente flujo de estados. El cambio de estado se realiza principalmente por escaneo de código QR:

Pedido Creado
  → Enviado a Laboratorio (registrar: laboratorio, número orden lab, fecha envío)
    → Recibido en Laboratorio (confirmación del lab o escaneo en recepción)
      → En Producción
        → Producido
          → En Tránsito (hacia la óptica)
            → Recibido en Óptica (escaneo QR al recibir)
              → Control de Calidad (verificación visual + medición)
                → Listo para Entrega
                  → Entregado (escaneo QR al entregar al paciente o al mensajero)


Reglas críticas del flujo:

Si se escanea un QR y el estado no corresponde al paso lógico siguiente, el sistema DEBE:

Mostrar alerta visual clara indicando el estado actual vs. el esperado.

Exigir justificación obligatoria (campo de texto).

Registrar: usuario, fecha/hora, motivo, estado anterior → estado nuevo.

Permitir continuar el proceso (no bloquear).

Solo el rol Administrador puede retroceder estados, con observación obligatoria.

Si se retrocede desde "Control de Calidad" hacia cualquier estado de laboratorio → marcar como reproceso interno y reiniciar el conteo de tiempo de laboratorio.

Diferenciación obligatoria:

Reproceso interno: error detectado antes de entregar al paciente.

Garantía: problema detectado después de la entrega.

3.3 Vista Kanban

Tablero visual tipo Kanban con columnas por cada estado.

Cada tarjeta muestra: paciente, tipo de producto, laboratorio, días en estado actual (en días hábiles), alertas de atraso.

Filtros por: sede, laboratorio, optómetra, asesor, rango de fechas, estado.

Código de color para alertas de tiempo:

Verde: dentro del tiempo esperado.

Amarillo: próximo a vencer (80% del tiempo estimado).

Rojo: excedido.

Drag & drop habilitado SOLO si el usuario tiene permisos.

3.4 Medición de Tiempos de Entrega

Tiempo esperado configurable por tipo de lente:

Lentes de stock / estándar: 1 día hábil.

Lentes especiales / personalizados: 3 días hábiles.

Cálculo de días hábiles: lunes a viernes, excluyendo festivos configurados manualmente en tabla festivos. Sábados NO son hábiles.

KPI automáticos: tiempo promedio real vs. tiempo esperado, por laboratorio y por tipo de lente.

MÓDULO 4: PRODUCCIÓN E INVENTARIO

4.1 Gestión de Laboratorios

Catálogo de laboratorios (nombre, contacto, tiempos promedio, especialidades).

Un producto puede tener múltiples laboratorios asociados (ej: un laboratorio para el lente y otro para el tratamiento).

Número de orden del laboratorio editable en cualquier momento.

KPIs automáticos por laboratorio:

% cumplimiento de tiempo de entrega.

% de garantías generadas.

Volumen de órdenes procesadas.

Ranking comparativo entre laboratorios.

4.2 Inventario Multi-Sede

Inventario separado por sede.

Tipos de inventario: monturas, lentes de stock, insumos (paños, estuches, líquidos, etc.).

Campos por ítem: código, marca, modelo, color, material, cantidad, stock mínimo, costo, precio venta, ubicación.

Descuento automático de inventario cuando un producto pasa al estado "Listo para Entrega" (montura se descuenta del stock de la sede).

Alertas automáticas de bajo stock (cuando cantidad ≤ stock_mínimo).

Transferencia de inventario entre sedes:

Requiere registro del usuario que transfiere, motivo, y confirmación de recepción en sede destino.

Log completo de auditoría por cada transferencia.

MÓDULO 5: GARANTÍAS Y PROTOCOLO DE ADAPTACIÓN

5.1 Protocolo de Adaptación

Periodo obligatorio de 7 días calendario desde fecha_entrega_real.

El sistema NO debe permitir crear una solicitud de garantía antes de cumplirse los 7 días.

Mostrar contador visible al consultar el producto: "Faltan X días para fin de adaptación".

Al cumplirse el periodo, habilitar botón "Solicitar Garantía".

5.2 Gestión de Garantías

Cada garantía genera un subcódigo secuencial: G1, G2, G3, etc., vinculado al producto original.

Cada producto maneja su propio ciclo de garantía de forma independiente.

Si ciclo_garantía > 1 → generar alerta automática al administrador ("Este producto ya tiene más de una garantía").

La garantía recorre el mismo flujo de estados que una orden nueva (Enviado a Lab → ... → Entregado), pero marcada como garantía.

Campos adicionales en garantía: motivo, laboratorio asignado, guía de envío (si aplica), quién asume el envío.

Lentes personalizados NO regresan a inventario, incluso si no son reclamados por el paciente.

Si el paciente es de fuera de Bogotá: registrar guía de envío y campo envío_asumido_por (óptica / paciente / laboratorio).

MÓDULO 6: CARTERA Y CONTROL FINANCIERO

6.1 Lógica Financiera

Descuento automático por empresa:

Si el paciente pertenece a una empresa vinculada, aplicar automáticamente el descuento configurado (45% o 50%).

Ajuste por medio de pago:

Si el medio de pago es tarjeta de crédito, Addi o link de pago → restar 5% al descuento de empresa.

Ejemplo: empresa con 50% descuento + pago con tarjeta = 45% descuento efectivo.

Recargo financiero:

Pagos con tarjeta / Addi → recargo del 9% sobre el valor después de descuento.

Cálculo de utilidad por producto:

Utilidad = Precio Final de Venta           - Costo Laboratorio           - Costo Montura           - Costo Lente           - Costo Insumos           - Comisión Financiera (si aplica)


Utilidad consolidada por empresa, por sede, por periodo.

6.2 Modalidades de Pago

Contado: pago inmediato (efectivo, transferencia, tarjeta, Addi, link).

Descuento por nómina: requiere aprobación de la empresa (campo de estado y soporte adjunto).

Flujo: Solicitud → Aprobada por empresa → Activa → Descontada.

No enviar a laboratorio sin aprobación de nómina registrada.

6.3 Gestión de Cartera

Tabla de abonos independiente (cada pago parcial es un registro).

Tabla de aplicación de abonos por orden (un abono puede aplicarse a una o varias órdenes).

Permitir aplicación parcial de abonos.

Cálculo automático de antigüedad de cartera (0-30, 31-60, 61-90, >90 días).

Reporte de cartera por empleado (para conciliación con empresas que pagan por nómina).

Reporte de cartera por empresa, por sede, por rango de fechas.

Alertas de cartera vencida.

6.4 Caja Diaria

Apertura de caja por usuario/sede con monto inicial.

Registro de todos los ingresos y egresos del día.

Cierre de caja con:

Monto esperado vs. monto real.

Diferencia (sobrante/faltante).

Observaciones obligatorias si hay diferencia.

Histórico de cierres de caja consultable.

6.5 Regla de Entrega

No se permite entregar un producto con saldo pendiente, a menos que el administrador lo autorice explícitamente con justificación registrada.

MÓDULO 7: DASHBOARD Y REPORTES

7.1 Dashboard Gerencial

Vista consolidada y filtrable por sede, por rango de fechas, por optómetra, por asesor.

KPIs principales:

Ventas totales (monto y cantidad de órdenes).

Utilidad total y por producto.

Utilidad por empresa.

Tasa de cierre de cotizaciones.

Tiempo promedio de entrega vs. estimado.

% de cumplimiento por laboratorio.

% de garantías sobre total de productos.

Cartera total y por antigüedad.

Leads vs. conversiones.

Citas agendadas vs. asistidas.

Inasistencias.

Productos en cada estado del Kanban.

Gráficos: barras, líneas de tendencia, pastel para distribución, heatmaps de horarios.

Exportar reportes a Excel y PDF.

7.2 Reportes Operativos

Reporte de producción: productos en proceso por laboratorio, por estado, por sede.

Reporte de cartera por empresa con detalle por empleado.

Reporte de inventario: stock actual, movimientos, transferencias.

Reporte de garantías: motivos más frecuentes, laboratorios con más garantías.

Reporte de caja diaria.

Reporte de auditoría: todos los cambios de estado con usuario y justificación.

MÓDULO 8: SEGURIDAD, ROLES Y AUDITORÍA

8.1 Roles de Usuario

Definir al menos los siguientes roles (configurables por administrador):

Administrador: acceso total, puede retroceder estados, aprobar entregas con saldo, configurar sistema.

Optómetra: crear/editar historias clínicas, ver agenda, generar fórmulas.

Asesor Comercial: crear pacientes, cotizaciones, órdenes, registrar pagos, escanear QR.

Auxiliar Óptica: escanear QR para cambiar estados, gestionar inventario, recibir productos de laboratorio.

Mensajero: escanear QR de entrega, registrar entregas con firma/foto.

Contador/Financiero: consultar reportes financieros, cartera, caja, no puede editar órdenes.

Visualizador: solo lectura de dashboards y reportes.

8.2 Permisos Granulares

Cada rol tiene permisos específicos por módulo y por acción (crear, leer, editar, eliminar).

Restricción por sede: un usuario solo ve datos de sus sedes asignadas (excepto admin global).

8.3 Seguridad

Autenticación segura (email + contraseña o SSO).

Recuperación segura de contraseña (enlace por email con expiración).

Cierre automático de sesión configurable (ej: 30 minutos de inactividad).

Encriptación de archivos clínicos (historias clínicas, fórmulas).

Log de auditoría completo e inmutable.

8.4 Backups

Backup automático diario de base de datos.

Retención mínima de 30 días.

Opción de restauración desde panel de administrador.

MÓDULO 9: BOT DE IA (WhatsApp)

9.1 Funcionalidades del Bot

Detección automática de intención del mensaje del paciente.

Agendar cita: consultar disponibilidad en tiempo real y crear cita.

Consultar estado de pedido: buscar por número de orden o documento del paciente y responder con el estado actual.

Consultar saldo: informar saldo pendiente.

Protocolo de adaptación: responder preguntas sobre el periodo de adaptación de 7 días con guion predefinido.

Solicitud de nómina: generar mensaje estandarizado para que la empresa apruebe el descuento por nómina.

OCR de fórmula: lectura básica de imagen de fórmula médica con validación humana si la confianza es baja.

Escalamiento a humano cuando el bot no puede resolver o cuando el caso es complejo.

Memoria conversacional de 30 días por paciente.

9.2 Integración Técnica

Conectado vía API al sistema interno (lectura de agenda, estados, saldos).

Webhooks para recepción de mensajes desde plataforma de WhatsApp (ej: Chatwoot, API oficial de Meta).

Registro de cada interacción del bot en log independiente.

MÓDULO 10: MULTI-SEDE

10.1 Configuración

Tabla de sedes independiente (nombre, dirección, horarios, configuración local).

Cada usuario asignado a una o múltiples sedes.

Inventario segregado por sede.

Caja diaria por sede.

Órdenes vinculadas a sede de creación.

10.2 Dashboard Consolidado

Vista consolidada de todas las sedes para el administrador.

Filtro rápido por sede individual.

Transferencia de inventario entre sedes con trazabilidad completa.

Reportes comparativos entre sedes.

REQUISITOS NO FUNCIONALES

Rendimiento: carga de páginas < 2 segundos, búsqueda de pacientes < 500ms.

Disponibilidad: 99.5% uptime.

Escalabilidad: arquitectura que soporte crecimiento de sedes y volumen.

Responsive: funcional en desktop, tablet y móvil (especialmente escaneo QR desde celular).

Accesibilidad: cumplimiento básico WCAG 2.1 AA.

Internacionalización: español colombiano como idioma base, formato de moneda COP, formato de fecha DD/MM/AAAA.

ENTREGABLES ESPERADOS

Esquema de base de datos completo (SQL o diagrama ER) con todas las entidades, relaciones, índices y constraints.

API REST documentada con todos los endpoints por módulo.

Frontend funcional con todos los módulos implementados.

Sistema de autenticación y roles completamente funcional.

Módulo de escaneo QR funcional desde navegador móvil.

Generación de PDFs (fórmulas, cotizaciones, reportes).

Dashboard con gráficos interactivos y exportables.

Documentación técnica del sistema.

Manual de usuario básico.

NOTAS DE IMPLEMENTACIÓN

Comenzar por: Base de datos → Auth/Roles → Pacientes → Historia Clínica → Órdenes → Flujo de estados QR → Inventario → Financiero → Dashboard → Bot IA.

Cada módulo debe tener tests unitarios y de integración.

Usar migraciones de base de datos (ej: Prisma Migrate, Supabase Migrations).

Variables de entorno para toda configuración sensible.

Los PDFs generados deben incluir membrete configurable de la óptica.

El código QR debe contener suficiente información para identificar unívocamente el producto (ej: UUID del orden_producto).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cristaliris-visionflow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ccb90bd0-431a-4322-9c78-f102a8fee585).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
