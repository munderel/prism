import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Race-safe admin bootstrap. Replaces the unauth credential-path auto-admin
// that used to live in src/lib/auth.ts (Critical #2 + H#8). The advisory
// lock serializes concurrent calls so two invocations never both create an
// admin. The function is idempotent: if an admin already exists, or if the
// caller's email already has a non-admin user, it adapts rather than failing
// so re-running the script during a deployment is safe.

export type BootstrapResult =
  | { status: 'created'; email: string }
  | { status: 'promoted'; email: string }
  | { status: 'already-exists'; email: string };

export function validateBootstrapPassword(password: string): string | null {
  if (password.length < 12) return 'must be at least 12 characters';
  if (!/[a-z]/.test(password)) return 'must contain a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'must contain an uppercase letter';
  if (!/\d/.test(password)) return 'must contain a digit';
  if (!/[^\w\s]/.test(password)) return 'must contain a special character';
  return null;
}

export async function bootstrapAdmin(
  prisma: PrismaClient,
  input: { email: string; password: string },
): Promise<BootstrapResult> {
  const email = input.email.trim().toLowerCase();
  const passwordError = validateBootstrapPassword(input.password);
  if (passwordError) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD ${passwordError}`);
  }
  const hash = await bcrypt.hash(input.password, 10);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bootstrap-admin')::bigint)`;

    const existingAdmin = await tx.user.findFirst({
      where: { isAdmin: true },
      select: { id: true, email: true },
    });
    if (existingAdmin) {
      return { status: 'already-exists', email: existingAdmin.email };
    }

    const existingUser = await tx.user.findUnique({ where: { email } });
    if (existingUser) {
      // Promote rather than fail — recovers from a prior partial run.
      const promoted = await tx.user.update({
        where: { id: existingUser.id },
        data: { isAdmin: true, passwordHash: hash },
        select: { id: true, email: true },
      });
      return { status: 'promoted', email: promoted.email };
    }

    const created = await tx.user.create({
      data: {
        email,
        name: email.split('@')[0],
        passwordHash: hash,
        isAdmin: true,
      },
      select: { id: true, email: true },
    });
    return { status: 'created', email: created.email };
  });
}
