# Memory: index.md
Updated: now

Design system: dark sidebar (220 25% 12%), primary blue (210 80% 45%), secondary teal (170 55% 42%), accent purple (260 60% 55%). Fonts: Space Grotesk (headings) + Inter (body). Success/warning/info tokens added. Colombian locale (COP, DD/MM/AAAA, Spanish).

Architecture: AppLayout wraps all pages with SidebarProvider + AppSidebar + Header. Types in src/types/index.ts.

Backend: Lovable Cloud (Supabase) with 19 tables: sedes, user_roles, profiles, empresas, pacientes, citas, historias_clinicas, laboratorios, ordenes, orden_productos, estados_producto, abonos, inventario, garantias, caja_diaria, festivos, log_auditoria, cotizaciones, notificaciones. RLS on all tables. Roles via app_role enum + has_role() SECURITY DEFINER function.

Modules connected to DB: Pacientes (CRUD), Historia Clínica (full form with formula OD/OI, firma optómetra).
Modules with real data: Dashboard (KPIs + recharts + alertas producción + deuda nómina), Agenda (day view), Órdenes (Kanban 10-column), Cartera (abonos, caja, deuda nómina), Inventario (CRUD + asignar a orden).

Lab production alerts: Edge function `check-lab-alerts` runs hourly via pg_cron. Rules: progresivos/tallas/sol=3d, terminados=1d, monturas 3P/terminados=2d. Writes to `notificaciones` table. NotificationBell uses realtime subscription.

Seeds: 2 sedes (Norte, Sur), 5 laboratorios.
