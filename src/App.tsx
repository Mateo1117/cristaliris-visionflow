import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Agenda from "./pages/Agenda";
import Orders from "./pages/Orders";
import ClinicalRecords from "./pages/ClinicalRecords";
import Inventory from "./pages/Inventory";
import Billing from "./pages/Billing";
import Warranties from "./pages/Warranties";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/Settings";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/pacientes" element={<Patients />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/ordenes" element={<Orders />} />
          <Route path="/historia-clinica" element={<ClinicalRecords />} />
          <Route path="/inventario" element={<Inventory />} />
          <Route path="/cartera" element={<Billing />} />
          <Route path="/garantias" element={<Warranties />} />
          <Route path="/reportes" element={<Reports />} />
          <Route path="/configuracion" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
