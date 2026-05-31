
# Estrategia de cambios — Sistema Cristal Iris

He validado los 25+ cambios del documento contra el sistema actual. Los agrupo en **6 fases** ordenadas por dependencia (cada fase desbloquea la siguiente).

---

## Fase 1 — Catálogo de Productos y Empresas (base para todo lo demás)

**Por qué primero**: Cotización, Órdenes y descuentos dependen de tener un catálogo real.

- Crear tabla `productos_catalogo` con los lentes del documento:
  - Monofocales (8 tipos: Super HD, Inteligente, sol, talla, alto índice...)
  - Bifocales (4 tipos)
  - Progresivos (4 tipos)
  - Lentes de contacto (tóricos / esféricos) — sin descuento
- Cada producto tiene: nombre, categoría, precio_full, aplica_descuento (bool)
- Agregar UI en **Configuración → Catálogo de Productos** para CRUD
- Agregar UI en **Configuración → Empresas con Convenio** (ya existe tabla `empresas`, falta gestión)
- Cambiar `porcentaje_descuento` de empresa a soportar 40 / 45 / 50

## Fase 2 — Pacientes (mejoras de creación y edición)

- **Botón "Editar"** en ficha del paciente (también disponible desde historia clínica, cotización, orden)
- Campo **Modalidad de pago** ampliado: Nómina, Llave, Tarjeta crédito, Addi, Sistecrédito, Efectivo, Datafono, Transferencia (multi-selección permitida en orden, no en paciente)
- **Referido por empleado nómina**: si el paciente viene por convenio, anclar nombre + cédula + celular del empleado titular (campos nuevos `empleado_titular_*`)
- Si modalidad = nómina → al crear orden, **obligar a subir aprobación** (archivo) antes de pasar a "Enviado a laboratorio"

## Fase 3 — Historia Clínica (rediseño del formulario)

- Añadir en sección general: **edad** (calculada de fecha_nacimiento), **ocupación**
- Reestructurar sección **Agudeza Visual**:
  - AV Sin corrección (renombrar lo existente)
  - **Lensometría** (cuadro OD/OI igual a fórmula óptica, sin DP/AP)
  - **Keratometría** (cuadro libre OD/OI)
  - Refracción (sin cambios)
- En **Fórmula de optometría** añadir 4 cuadros: tipo de lente, filtros, forma de uso, observaciones, control
- **Botón "Imprimir Fórmula"**: PDF con datos del paciente + fórmula completa (lo que pide el paciente)
- Sección **Diagnóstico**: dejar solo diagnóstico + código CIE

## Fase 4 — Cotizaciones (productos desplegables + descuentos)

- Cambiar columna "descripción" por **dropdown "Producto"** que carga del catálogo (Fase 1)
- Auto-poblar precio_full desde catálogo
- Campo **% Descuento** que toma por defecto el convenio de la empresa del paciente (40/45/50) — editable
- Checkbox **"Montura del paciente"** → descuenta $90.000 del total
- Lentes de contacto: forzar descuento = 0%
- Mantener resto del flujo de cotización existente

## Fase 5 — Órdenes (alineación con cotización + impresión fórmula)

- Espejo de cotización (mismo formulario producto/descuento)
- Añadir campos: **laboratorio** (FK), **# de montura** (reemplaza ítem inventario), **observaciones** (textarea al final)
- **Modalidad de pago múltiple**: dividir abono/saldo entre 2 métodos distintos (ej. abono efectivo + saldo transferencia)
- Quitar desglose de costos; mostrar solo **Total / Abono / Saldo**
- **Botón "Imprimir Fórmula para Laboratorio"**: si es progresivo incluye puente, distancia al vértice, ángulo pantoscópico, DP por ojo, altura pupilar por ojo, medidas montura (vertical, horizontal, efectiva, mecánica)
- **Kanban**: agrupar montura + lente de la misma orden como **un solo item** (hoy son tarjetas separadas)
- Estado "Orden creada": adjuntar foto montura + QR + comprobante pago / aprobación nómina
- **QR con número de orden visible** (hoy es solo UUID — agregar número legible)
- Notificación automática al paciente cuando pase a "Listo para entrega" (ya está la base con WhatsApp/Email manual desde el diálogo; automatizarlo)
- Validar saldo = 0 antes de "Entregado"
- Si progresivo + primera vez → forzar entrega en consultorio (warning ya existe)

## Fase 6 — Reportes y laboratorios

- Lista de laboratorios fija: Bisel terminado, Sol con fórmula, Tallas progresivos, Tallas monofocales, Lentes de contacto (seed)
- Reportes nuevos:
  - **Empresas con más ventas** (ranking por convenio)
  - **Producto/lente más vendido** (del catálogo)
  - **Utilidad por lente** (precio_venta − costo_laboratorio)

---

## Detalles técnicos

```text
Nuevas tablas:
  productos_catalogo (id, nombre, categoria, precio_full, aplica_descuento)
  empleados_nomina   (id, empresa_id, nombre, cedula, celular)
  orden_aprobaciones (id, orden_id, tipo, archivo_url)  -- nómina / comprobante

Tablas modificadas:
  pacientes      → +ocupacion, +empleado_titular_id
  cotizaciones   → ítems pasan a usar producto_id (FK)
  ordenes        → +observaciones, +numero_orden (legible), +montura_propia (bool)
  orden_productos→ +numero_montura, +medidas_progresivo (jsonb)
  historias_clinicas → +lensometria, +keratometria, +tipo_lente, +filtros, +forma_uso, +observaciones_formula, +control

Storage:
  bucket 'aprobaciones-nomina' (privado)
  bucket 'comprobantes-pago' (privado)

Edge functions:
  notify-ready-delivery (trigger al pasar a listo_entrega)
  generate-formula-pdf  (PDF imprimible)
```

---

## Estimación de impacto

| Fase | Tablas nuevas | Migraciones | Componentes UI |
|------|---------------|-------------|----------------|
| 1 | 1 | 2 | 2 |
| 2 | 1 | 2 | 3 |
| 3 | 0 | 1 | 2 |
| 4 | 0 | 1 | 2 |
| 5 | 1 | 2 | 4 |
| 6 | 0 | 1 | 3 |

Total: **~3 tablas nuevas, ~9 migraciones, ~16 componentes**.

---

## Pregunta antes de empezar

Esto es trabajo de varias iteraciones. **¿Cómo prefieres avanzar?**

1. **Aplicar todo de corrido** en este loop (riesgo: respuesta muy larga, puede cortarse).
2. **Fase por fase** — apruebas cada fase antes de la siguiente (recomendado, más seguro).
3. **Solo las fases críticas primero**: Fase 1 + 4 + 5 (catálogo, cotización, órdenes) y dejar Historia/Reportes para después.

Responde con el número de tu preferencia y arranco.
