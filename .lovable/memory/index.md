Design system: dark sidebar (220 25% 12%), primary blue (210 80% 45%), secondary teal (170 55% 42%), accent purple (260 60% 55%). Fonts: Space Grotesk (headings) + Inter (body). Success/warning/info tokens added. Colombian locale (COP, DD/MM/AAAA, Spanish).

Architecture: AppLayout wraps all pages with SidebarProvider + AppSidebar + Header. Types in src/types/index.ts. ProtectedRoute wraps all pages except /auth. useAuth hook for session management.

Backend: Lovable Cloud (Supabase) with 19 tables: sedes, user_roles, profiles, empresas, pacientes, citas, historias_clinicas, laboratorios, ordenes, orden_productos, estados_producto, abonos, inventario, garantias, caja_diaria, festivos, log_auditoria, cotizaciones, horarios_medicos. RLS on all tables. Roles via app_role enum + has_role() SECURITY DEFINER function. Auto profile creation trigger on signup.

Edge Functions: create-user (admin creates users with roles), api-agenda (public API for WhatsApp bot integration: /disponibilidad, /agendar, /cita, /medicos).

Storage: orden-fotos bucket for order product photos.

All modules connected to DB:
- Auth: Login/Signup with email (src/pages/Auth.tsx)
- Pacientes: CRUD with search
- Historia Clínica: Full form with formula OD/OI
- Agenda: Day view with DB citas, create appointment dialog
- Órdenes: Kanban 10-column with state change, QR generation, photo upload, alert system
- Control Calidad: Optometrist approval/rejection workflow
- Inventario: CRUD with type filter, stock alerts
- Cartera: Orders table, abonos, caja diaria tabs
- Garantías: List from DB with nested joins
- Reportes: Dynamic stats from DB with recharts
- Usuarios: User creation (edge function), role assignment, doctor schedule management
- Escanear QR: Camera-based QR scanner for messenger state updates
- Configuración: Sedes + Laboratorios CRUD

Seeds: 2 sedes (Norte, Sur), 5 laboratorios.
