import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Ratcheted thresholds: set just below current coverage so regressions
    // fail CI without requiring blanket new-test work. Raise as later waves
    // add coverage to specific hotspots.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Narrowed to src/lib — pure-logic modules where coverage numbers are
      // meaningful. API routes and UI components have their own patterns
      // (integration tests, manual QA) that skew coverage% misleadingly.
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/__tests__/**',
        'src/test/**',
        'src/types/**',
        'src/**/*.d.ts',
      ],
      // Ratchet: set just below current measurement so regressions fail CI.
      // Raise as later waves add coverage to hotspots (auth, process-task
      // generator, kpi-aggregation, url-validation).
      thresholds: {
        lines: 43,
        statements: 42,
        branches: 32,
        functions: 40,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
