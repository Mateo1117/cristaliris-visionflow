

# Plan: Sistema Cristaliris — Fase 1: Fundación y Estructura Base

## Resumen

Construir la base del sistema: layout principal con navegación lateral, autenticación, gestión de pacientes, y la estructura de páginas para todos los módulos. Se usará datos mock inicialmente — el backend con Lovable Cloud se conectará en la siguiente fase.

## Alcance de esta fase

1. **Layout y navegación** — Sidebar con todos los módulos, header con info de usuario/sede, responsive
2. **Páginas base** — Dashboard, Pacientes, Agenda, Órdenes (Kanban), Historia Clínica, Inventario, Cartera, Garantías, Reportes, Configuración
3. **Gestión de Pacientes** — CRUD completo con tabla, búsqueda, formulario de registro
4. **Dashboard** — KPIs principales con datos mock y gráficos (recharts)
5. **Agenda de Optómetras** — Vista calendario día/semana/mes
6. **Órdenes y Kanban** — Vista Kanban con columnas de estados y tarjetas

## Estructura de archivos

```text
src/
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx          (sidebar + header + content)
│   │   ├── AppSidebar.tsx         (navegación lateral)
│   │   └── Header.tsx             (sede actual, usuario, notificaciones)
│   ├── patients/
│   │   ├── PatientTable.tsx
│   │   ├── PatientForm.tsx
│   │   └── PatientSearch.tsx
│   ├── dashboard/
│   │   ├── KPICards.tsx
│   │   └── DashboardCharts.tsx
│   ├── agenda/
│   │   └── AgendaCalendar.tsx
│   ├── orders/
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   └── KanbanCard.tsx
│   └── shared/
│       └── PageHeader.tsx
├── pages/
│   ├── Index.tsx                  (redirect to Dashboard)
│   ├── Dashboard.tsx
│   ├── Patients.tsx
│   ├── Agenda.tsx
│   ├── Orders.tsx
│   ├── ClinicalRecords.tsx
│   ├── Inventory.tsx
│   ├── Billing.tsx
│   ├── Warranties.tsx
│   ├── Reports.tsx
│   └── Settings.tsx
├── lib/
│   └── mock-data.ts              (datos de ejemplo)
└── types/
    └── index.ts                   (tipos TypeScript para todas las entidades)
```

## Detalles técnicos

- **Navegación**: React Router con rutas para cada módulo, AppLayout como wrapper
- **Sidebar**: Componente shadcn/ui Sidebar con iconos Lucide, colapsable, indicador de módulo activo
- **Kanban**: 10 columnas de estado con tarjetas draggables, código de color por tiempo (verde/amarillo/rojo)
- **Agenda**: Grid de calendario con slots de 20 min, vista día/semana/mes con tabs
- **Dashboard**: 8 KPI cards + 4 gráficos (recharts: barras, líneas, pastel)
- **Pacientes**: Tabla con búsqueda por documento/nombre/teléfono, formulario completo en dialog
- **Formato colombiano**: Moneda COP, fechas DD/MM/AAAA, español

## Siguiente fase (después de esta)

- Conectar Lovable Cloud (Supabase) para base de datos y autenticación
- Implementar roles y permisos
- Historia clínica digital con PDF
- Escaneo QR
- Cartera y caja diaria

