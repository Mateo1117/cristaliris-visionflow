import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // El paquete iba en un único archivo de ~2,3 MB: la primera carga bajaba
    // todo (gráficas, PDF, lector de QR) aunque no se usara. Se separan las
    // librerías pesadas para que cada pantalla traiga sólo lo suyo.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          charts: ["recharts"],
          pdf: ["jspdf"],
          qr: ["qrcode", "qrcode.react", "html5-qrcode", "react-barcode"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
}));
