import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import base from './vite.config';
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// Separate test server only. These aliases never enter normal dev/build output.
export default mergeConfig(base, defineConfig({
  mode: 'form-contract',
  optimizeDeps: { entries: ['e2e/finance-forms/index.html'] },
  resolve: { alias: [
    { find: /.*lib\/supabase$/, replacement: local('./e2e/finance-forms/supabase.ts') },
    { find: /^\.\/supabase$/, replacement: local('./e2e/finance-forms/supabase.ts') },
    { find: /.*context\/AppContext$/, replacement: local('./e2e/finance-forms/app-context.ts') },
    { find: /.*lib\/apiClient$/, replacement: local('./e2e/finance-forms/client.ts') },
    { find: /^\.\/client$/, replacement: local('./e2e/finance-forms/client.ts') },
  ] },
  server: { host: '127.0.0.1', port: 5174 },
}));
