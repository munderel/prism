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
    // The default 5s timeout is tight for userEvent-heavy interaction tests and
    // flakes under CPU contention (e.g. a parallel build/agent run starves the
    // jsdom event loop and a trivial render times out). 15s removes that flake
    // class without masking genuinely hung tests.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // .claude/ is the harness's working space for git worktrees and other
    // session state. It's gitignored, but vitest's default file discovery
    // scans it anyway — worktree copies have their own node_modules with a
    // mismatched React, blowing up every test there. Excluding stops the
    // pre-push hook from blocking on local-only cruft that CI never sees.
    exclude: ['**/node_modules/**', '**/.git/**', '.claude/**', 'e2e/**'],
    // Pin a non-UTC timezone so date-only regression tests catch local-TZ
    // shifts. CI runs on ubuntu-latest with no TZ override (defaults to UTC),
    // which silently green-lights the getLocalDateString(new Date(<UTC-Z>))
    // bug class. Pinning to America/New_York exercises the shift in CI.
    env: { TZ: 'America/New_York' },
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
        lines: 52,
        statements: 51,
        branches: 44,
        functions: 52,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
