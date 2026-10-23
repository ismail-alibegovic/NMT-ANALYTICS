import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    include: ['src/tests/**/*.test.ts'],
    env: {
      // Tests must never import dev/production credentials or flags from a local
      // .env file — module import order makes NODE_ENV-based guards unreliable.
      NODE_ENV: 'test',
      DEV_BYPASS_AUTH: 'false',
      DEV_AUTO_BOOTSTRAP: 'false',
      // Canonical aliases win in application config, so pin them too.
      TRAVLINE_SUPABASE_URL: 'http://127.0.0.1:54321',
      TRAVLINE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.anon',
      TRAVLINE_SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.service',
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
