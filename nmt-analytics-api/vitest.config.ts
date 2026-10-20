import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    include: ['src/tests/**/*.test.ts'],
    env: {
      // Unit tests must never fall back to an external database host.
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.anon',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.service',
    },
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/routes/**'],
    },
  },
})
