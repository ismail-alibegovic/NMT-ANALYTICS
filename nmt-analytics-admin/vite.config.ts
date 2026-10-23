import { assertPublicSupabaseKey } from "./src/lib/publicSupabaseKey";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'public-supabase-key-boundary',
      config(_config, { command, mode }) {
        if (command === 'build') {
          const env = loadEnv(mode, process.cwd(), 'VITE_');
          assertPublicSupabaseKey(env.VITE_SUPABASE_ANON_KEY);
        }
      },
    },
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-charts': ['apexcharts', 'react-apexcharts'],
          'vendor-calendar': ['@fullcalendar/core', '@fullcalendar/react', '@fullcalendar/daygrid', '@fullcalendar/timegrid', '@fullcalendar/interaction', '@fullcalendar/list'],
          'vendor-data': ['papaparse'],
        },
      },
    },
  },
});
