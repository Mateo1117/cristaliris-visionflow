# Memory: index.md
Updated: now

Design system: dark sidebar (220 25% 12%), primary blue (210 80% 45%), secondary teal (170 55% 42%), accent purple (260 60% 55%). Fonts: Space Grotesk (headings) + Inter (body). Success/warning/info tokens added. Colombian locale (COP, DD/MM/AAAA, Spanish).

Architecture: AppLayout wraps all pages with SidebarProvider + AppSidebar + Header. Types in src/types/index.ts.

Backend: Lovable Cloud (Supabase) with 18 tables. RLS on all tables. Roles via app_role enum + has_role() SECURITY DEFINER function.

Historia clínica: DP total + DP OD + DP OI + distancia al vértice + altura pupilar OD/OI fields.
Órdenes: modalidad_pago supports contado/nómina/cuotas. tipo_lente_tiempo field for production alerts.
Alertas producción: progresivo/talla/sol_formula=3d, terminado=1d, montura_3piezas=2d.
Reportes: DeudaEmpresasCard shows cartera by empresa for nómina orders.

Primary user: gerencia@mcmasociados.com has admin role.
