import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// El resto de pantallas se carga bajo demanda: así la primera visita no baja
// las gráficas, el generador de PDF ni el lector de QR si no se van a usar.
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Patients = lazy(() => import("./pages/Patients"));
const Agenda = lazy(() => import("./pages/Agenda"));
const Orders = lazy(() => import("./pages/Orders"));
const ClinicalRecords = lazy(() => import("./pages/ClinicalRecords"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Billing = lazy(() => import("./pages/Billing"));
const Warranties = lazy(() => import("./pages/Warranties"));
const Reports = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const ScanQR = lazy(() => import("./pages/ScanQR"));
const UsersPage = lazy(() => import("./pages/Users"));
const QualityControl = lazy(() => import("./pages/QualityControl"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const Cotizaciones = lazy(() => import("./pages/Cotizaciones"));

import type { AppRole } from "./types";

const queryClient = new QueryClient();

function CargandoPantalla() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Cargando...</div>
    </div>
  );
}

// Matriz de acceso por ruta (debe mantenerse alineada con ACCESO_MODULO en usePermissions).
const ROLES_HISTORIAS: AppRole[] = ['admin', 'optometra', 'asesor_comercial'];
const ROLES_CARTERA: AppRole[] = ['admin', 'contador', 'asesor_comercial'];
const ROLES_REPORTES: AppRole[] = ['admin', 'contador'];
const ROLES_ADMIN: AppRole[] = ['admin'];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<CargandoPantalla />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/pacientes" element={<ProtectedRoute><Patients /></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
          <Route path="/ordenes" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
          <Route path="/historias" element={<ProtectedRoute roles={ROLES_HISTORIAS}><ClinicalRecords /></ProtectedRoute>} />
          <Route path="/historia-clinica" element={<Navigate to="/historias" replace />} />
          <Route path="/inventario" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
          <Route path="/cartera" element={<ProtectedRoute roles={ROLES_CARTERA}><Billing /></ProtectedRoute>} />
          <Route path="/cotizaciones" element={<ProtectedRoute><Cotizaciones /></ProtectedRoute>} />
          <Route path="/garantias" element={<ProtectedRoute><Warranties /></ProtectedRoute>} />
          <Route path="/reportes" element={<ProtectedRoute roles={ROLES_REPORTES}><Reports /></ProtectedRoute>} />
          <Route path="/configuracion" element={<ProtectedRoute roles={ROLES_ADMIN}><SettingsPage /></ProtectedRoute>} />
          <Route path="/scan" element={<ProtectedRoute><ScanQR /></ProtectedRoute>} />
          <Route path="/usuarios" element={<ProtectedRoute roles={ROLES_ADMIN}><UsersPage /></ProtectedRoute>} />
          <Route path="/control-calidad" element={<ProtectedRoute><QualityControl /></ProtectedRoute>} />
          <Route path="/api-docs" element={<ProtectedRoute roles={ROLES_ADMIN}><ApiDocs /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
