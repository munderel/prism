// TOKEN_ENCRYPTION_KEY rotation + plaintext-token backfill. Walks every user
// with a googleRefreshToken and rewrites it under the NEW key:
//   - encrypted values (iv:authTag:ciphertext) already decryptable with the
//     NEW key are skipped (idempotent — safe to re-run);
//   - encrypted values are decrypted with the OLD key and re-encrypted with
//     the NEW key;
//   - plaintext values (no ":") are encrypted with the NEW key — so running
//     with OLD == NEW is the plaintext backfill;
//   - values that decrypt with neither key (or have an unrecognized shape)
//     are reported per user id and left untouched (those users must re-link
//     Google).
//
// Usage (from prism/):
//   DATABASE_URL=... OLD_TOKEN_ENCRYPTION_KEY=<old 64-hex> \
//     TOKEN_ENCRYPTION_KEY=<new 64-hex> \
//     npm run rotate-token-key -- --dry-run
//
// Drop --dry-run to write. Full rotation runbook: DEPLOYMENT.md
// ("Rotating TOKEN_ENCRYPTION_KEY").

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { decryptTokenWithKey, encryptTokenWithKey } from '../src/lib/crypto';

interface CliArgs {
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else {
      console.error(`[rotate-token-key] Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[rotate-token-key] Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

function requireKeyHex(name: string): string {
  const v = requireEnv(name);
  if (v.length !== 64 || !/^[0-9a-fA-F]+$/.test(v)) {
    console.error(`[rotate-token-key] ${name} must be a 64-char hex string (32 bytes)`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const args = parseArgs(process.argv);
  const oldKey = requireKeyHex('OLD_TOKEN_ENCRYPTION_KEY');
  const newKey = requireKeyHex('TOKEN_ENCRYPTION_KEY');
  const connectionString = requireEnv('DATABASE_URL');

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log(
    `[rotate-token-key] starting ${args.dryRun ? '(dry-run — no writes)' : '(WRITE)'}` +
    `${oldKey === newKey ? ' [OLD == NEW: plaintext backfill only]' : ''}`,
  );

  let rotated = 0;
  let backfilled = 0;
  let alreadyCurrent = 0;
  const failures: Array<{ userId: string; reason: string }> = [];

  try {
    const users = await prisma.user.findMany({
      where: { googleRefreshToken: { not: null } },
      select: { id: true, googleRefreshToken: true },
    });
    console.log(`[rotate-token-key] users with a googleRefreshToken: ${users.length}`);

    for (const user of users) {
      const stored = user.googleRefreshToken!;
      try {
        const isEncryptedShape = stored.split(':').length === 3;
        let newValue: string;

        if (isEncryptedShape) {
          // Already on the new key? Skip — makes re-runs idempotent.
          if (decryptTokenWithKey(stored, newKey) !== null) {
            alreadyCurrent++;
            continue;
          }
          const plaintext = decryptTokenWithKey(stored, oldKey);
          if (plaintext === null) {
            failures.push({ userId: user.id, reason: 'encrypted token decrypts with neither key' });
            continue;
          }
          newValue = encryptTokenWithKey(plaintext, newKey);
          rotated++;
        } else if (!stored.includes(':')) {
          // Pre-migration plaintext token — backfill under the new key.
          newValue = encryptTokenWithKey(stored, newKey);
          backfilled++;
        } else {
          failures.push({ userId: user.id, reason: 'unrecognized token shape (colons but not iv:authTag:ciphertext)' });
          continue;
        }

        if (!args.dryRun) {
          await prisma.user.update({
            where: { id: user.id },
            data: { googleRefreshToken: newValue },
          });
        }
      } catch (err) {
        failures.push({
          userId: user.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `[rotate-token-key] done${args.dryRun ? ' (dry-run — nothing written)' : ''}: ` +
    `rotated=${rotated} plaintextBackfilled=${backfilled} alreadyCurrent=${alreadyCurrent} failed=${failures.length}`,
  );
  for (const f of failures) {
    console.error(`  FAILED user=${f.userId}: ${f.reason} — user must re-link Google after rotation`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[rotate-token-key] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
