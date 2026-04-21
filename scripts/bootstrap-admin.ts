// One-shot admin bootstrap for fresh deployments. Reads
// BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD from env and either
// creates the first admin user or promotes an existing one. Idempotent
// and race-safe — see src/lib/bootstrap-admin.ts for the underlying
// transaction.
//
// Run once per deployment:
//   BOOTSTRAP_ADMIN_EMAIL=you@example.com \
//   BOOTSTRAP_ADMIN_PASSWORD='strong-12char-password!' \
//   npm run bootstrap-admin

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { bootstrapAdmin } from '../src/lib/bootstrap-admin';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[bootstrap-admin] Missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const email = requireEnv('BOOTSTRAP_ADMIN_EMAIL');
  const password = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[bootstrap-admin] Missing DATABASE_URL');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await bootstrapAdmin(prisma, { email, password });
    if (result.status === 'already-exists') {
      console.log(`[bootstrap-admin] Admin already exists: ${result.email}. No changes.`);
    } else if (result.status === 'promoted') {
      console.log(`[bootstrap-admin] Existing user promoted to admin: ${result.email}`);
    } else {
      console.log(`[bootstrap-admin] First admin created: ${result.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[bootstrap-admin] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
