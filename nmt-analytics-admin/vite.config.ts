import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { execSync } from "node:child_process";

function resolveBuildId(): string {
  if (process.env.TRAVLINE_BUILD_ID) return process.env.TRAVLINE_BUILD_ID;
  try {
    return execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __TRAVLINE_BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  plugins: [
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
