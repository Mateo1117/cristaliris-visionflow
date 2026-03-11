# Memory: index.md
Updated: now

Design system: dark sidebar (220 25% 12%), primary blue (210 80% 45%), secondary teal (170 55% 42%), accent purple (260 60% 55%). Fonts: Space Grotesk (headings) + Inter (body). Success/warning/info tokens added. Colombian locale (COP, DD/MM/AAAA, Spanish).

Architecture: AppLayout wraps all pages with SidebarProvider + AppSidebar + Header. Types in src/types/index.ts. Header includes GlobalSearch (⌘K) and NotificationBell (delayed products + low stock alerts).

Backend: Lovable Cloud (Supabase) with 19 tables: sedes, user_roles, profiles, empresas, pacientes, citas, historias_clinicas, laboratorios, ordenes, orden_productos, estados_producto, abonos, inventario, garantias, caja_diaria, festivos, log_auditoria, cotizaciones, movimientos_inventario. RLS on all tables. Roles via app_role enum + has_role() SECURITY DEFINER function.

Modules connected to DB: Pacientes (CRUD), Historia Clínica (full form), Órdenes (Kanban + Lista con filtros/export), Inventario (CRUD + QR + movimientos), Cartera (abonos + caja), Garantías (CRUD), Cotizaciones (CRUD + conversión a orden), Control Calidad, Escáner QR (órdenes + inventario con trazabilidad).

Dashboard: KPIs + charts (ventas mensuales, utilidad vs ventas por mes, utilidad por laboratorio, citas asistencia, productos por estado).

Utilities: CSV export (src/lib/export-csv.ts), Global search, Notification alerts.

Seeds: 2 sedes (Norte, Sur), 5 laboratorios.
