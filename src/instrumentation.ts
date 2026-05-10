import { validateEnv } from '@/lib/env-check';

export function register() {
  validateEnv();
}
