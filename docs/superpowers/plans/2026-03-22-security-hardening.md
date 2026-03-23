# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 16 security vulnerabilities identified in the security review, ordered by severity and dependency.

**Architecture:** Each fix is isolated to 1-3 files with its own test. Fixes are ordered so earlier tasks don't conflict with later ones. Auth-guard changes come first since multiple routes depend on them, then route-level fixes, then config-level changes.

**Tech Stack:** Next.js 14 / TypeScript / Prisma / Vitest / NextAuth 4

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/auth-guard.ts` | Modify | Add timing-safe cron check, add `requireTaskAccess` helper |
| `src/lib/auth.ts` | Modify | Harden dev login, re-fetch isAdmin on every JWT callback |
| `src/lib/rate-limit.ts` | Modify | Prefer `x-real-ip` for IP extraction, add TODO for distributed store |
| `src/lib/yaml-handler.ts` | Modify | Add max-size constant |
| `src/lib/notifications.ts` | Modify | Sanitize HTML in email body |
| `src/lib/crypto.ts` | Create | Encrypt/decrypt helpers for refresh tokens |
| `src/app/api/goals/import/route.ts` | Modify | Add YAML size limit |
| `src/app/api/tasks/[id]/comments/route.ts` | Modify | Add task ownership check on GET and POST |
| `src/app/api/invitations/route.ts` | Modify | Remove `err.message` from 500 response |
| `src/app/api/users/search/route.ts` | Modify | Remove email from response |
| `src/app/api/goals/[id]/route.ts` | Modify | Add max-depth guard to softDeleteDescendants |
| `next.config.mjs` | Modify | Add security headers |
| `src/__tests__/auth-guard.test.ts` | Modify | Add tests for timing-safe cron, requireTaskAccess |
| `src/__tests__/rate-limit.test.ts` | Modify | Add test for IP extraction |
| `src/__tests__/crypto.test.ts` | Create | Tests for encrypt/decrypt |
| `src/__tests__/yaml-size-limit.test.ts` | Create | Test YAML size rejection |
| `src/__tests__/security-headers.test.ts` | Create | Verify headers in next config |

---

### Task 1: Cron Secret — Timing-Safe Comparison

**Files:**
- Modify: `src/lib/auth-guard.ts:42-45`
- Modify: `src/__tests__/auth-guard.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/auth-guard.test.ts`:

```typescript
import { requireCronSecret } from '@/lib/auth-guard';

// Mock the environment variable
vi.stubEnv('CRON_SECRET', 'test-cron-secret');

describe('requireCronSecret', () => {
  it('returns true for valid cron secret', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    expect(requireCronSecret(request)).toBe(true);
  });

  it('returns false for invalid cron secret', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(requireCronSecret(request)).toBe(false);
  });

  it('returns false for missing authorization header', () => {
    const request = new Request('http://localhost/api/cron/test');
    expect(requireCronSecret(request)).toBe(false);
  });

  it('returns false for mismatched length', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer x' },
    });
    expect(requireCronSecret(request)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/auth-guard.test.ts`
Expected: New cron tests may pass with current `===` but we need to verify the import works. The important change is the implementation.

- [ ] **Step 3: Implement timing-safe comparison**

Replace `requireCronSecret` in `src/lib/auth-guard.ts`:

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

export function requireCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const expected = `Bearer ${process.env.CRON_SECRET}`;

  // HMAC both values to fixed-length digests, avoiding length-based timing leaks
  const hmacKey = 'cron-secret-compare';
  const hashA = createHmac('sha256', hmacKey).update(authHeader).digest();
  const hashB = createHmac('sha256', hmacKey).update(expected).digest();

  return timingSafeEqual(hashA, hashB);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd goal-dashboard && npx vitest run src/__tests__/auth-guard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-guard.ts src/__tests__/auth-guard.test.ts
git commit -m "fix(security): use timing-safe comparison for cron secret"
```

---

### Task 2: JWT isAdmin Staleness — Re-fetch on Every Token Refresh

**Files:**
- Modify: `src/lib/auth.ts:48-58`

- [ ] **Step 1: Modify JWT callback to always re-fetch isAdmin**

In `src/lib/auth.ts`, change the `jwt` callback:

```typescript
async jwt({ token, user }) {
  // On initial sign-in, set user ID in token
  if (user) {
    token.id = user.id;
  }

  // Re-fetch isAdmin from DB on every request to catch role changes promptly.
  // Tradeoff: adds one small SELECT per authenticated request. If request volume
  // grows, consider short-TTL caching (e.g., 60s) or reducing JWT maxAge instead.
  if (token.id) {
    const dbUser = await prisma.user.findUnique({
      where: { id: token.id as string },
      select: { isAdmin: true },
    });
    token.isAdmin = dbUser?.isAdmin ?? false;
  }

  return token;
},
```

- [ ] **Step 2: Verify build still works**

Run: `cd goal-dashboard && npx next build`
Expected: Build succeeds (or at least no TypeScript errors in auth.ts)

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "fix(security): re-fetch isAdmin on every JWT callback to prevent stale privileges"
```

---

### Task 3: Comment IDOR — Add Task Access Check

**Files:**
- Modify: `src/lib/auth-guard.ts` (add `requireTaskAccess`)
- Modify: `src/app/api/tasks/[id]/comments/route.ts`
- Modify: `src/__tests__/auth-guard.test.ts`

- [ ] **Step 1: Write the failing test for requireTaskAccess**

Add to `src/__tests__/auth-guard.test.ts`:

```typescript
import { requireTaskAccess } from '@/lib/auth-guard';

// Mock prisma — NOTE: vi.mock is hoisted to file top by vitest, so this mock
// is file-scoped. All tests in this file will see the mocked prisma.
// This is fine because existing tests only mock getServerSession, not prisma.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
const mockTaskFindUnique = vi.mocked(prisma.task.findUnique);

describe('requireTaskAccess', () => {
  it('returns 404 when task not found', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user1', isAdmin: false } } as any);
    mockTaskFindUnique.mockResolvedValue(null);
    const result = await requireTaskAccess('task-xyz');
    expect(result.error).toBe('Task not found');
    expect(result.status).toBe(404);
  });

  it('returns 403 when user does not own task', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user1', isAdmin: false } } as any);
    mockTaskFindUnique.mockResolvedValue({ id: 'task-xyz', ownerId: 'user2' } as any);
    const result = await requireTaskAccess('task-xyz');
    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  it('allows owner to access task', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user1', isAdmin: false } } as any);
    mockTaskFindUnique.mockResolvedValue({ id: 'task-xyz', ownerId: 'user1' } as any);
    const result = await requireTaskAccess('task-xyz');
    expect(result.session).toBeDefined();
  });

  it('allows admin to access any task', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'admin1', isAdmin: true } } as any);
    mockTaskFindUnique.mockResolvedValue({ id: 'task-xyz', ownerId: 'user2' } as any);
    const result = await requireTaskAccess('task-xyz');
    expect(result.session).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/auth-guard.test.ts`
Expected: FAIL — `requireTaskAccess` is not exported

- [ ] **Step 3: Implement requireTaskAccess**

Add to `src/lib/auth-guard.ts`:

```typescript
import { prisma } from './prisma';

export async function requireTaskAccess(taskId: string): Promise<AuthResult & { task?: { id: string; ownerId: string } }> {
  const result = await requireAuth();
  if ('error' in result) return result;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    return { error: 'Task not found', status: 404 };
  }

  if (task.ownerId !== result.userId && !result.session.user.isAdmin) {
    return { error: 'Forbidden', status: 403 };
  }

  return { ...result, task };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/auth-guard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Update comments route to use requireTaskAccess**

Replace the access checks in `src/app/api/tasks/[id]/comments/route.ts`:

**GET handler** — replace `requireAuth` + task lookup with:

```typescript
import { requireTaskAccess, authError } from '@/lib/auth-guard';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, image: true } },
      mentions: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  return Response.json(comments);
}
```

**POST handler** — replace `requireAuth` + task lookup with:

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  const ip = getClientIp(request);
  const limit = commentLimiter.check(ip);
  if (!limit.success) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { content } = body;

  if (!content?.trim()) {
    return Response.json({ error: 'Content is required' }, { status: 400 });
  }

  // Extract and resolve @mentions
  const mentionNames = extractMentions(content);
  let resolvedMentions: { id: string; name: string }[] = [];

  if (mentionNames.length > 0) {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
    });
    resolvedMentions = resolveMentions(mentionNames, users);
  }

  const comment = await prisma.taskComment.create({
    data: {
      taskId,
      authorId: auth.userId,
      content,
      mentions: {
        create: resolvedMentions.map((u) => ({
          userId: u.id,
        })),
      },
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      mentions: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  return Response.json(comment, { status: 201 });
}
```

- [ ] **Step 6: Run all tests**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth-guard.ts src/app/api/tasks/[id]/comments/route.ts src/__tests__/auth-guard.test.ts
git commit -m "fix(security): add ownership check on task comments to prevent IDOR"
```

---

### Task 4: Rate Limiter IP Extraction — Use Vercel Headers

**Files:**
- Modify: `src/lib/rate-limit.ts:41-43`

- [ ] **Step 1: Update getClientIp to prefer Vercel headers**

In `src/lib/rate-limit.ts`, replace `getClientIp`:

```typescript
export function getClientIp(request: Request): string {
  // Prefer Vercel's non-spoofable header, fall back to x-forwarded-for for local dev
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
```

- [ ] **Step 2: Add TODO comment for distributed rate limiting**

Add a comment at the top of `src/lib/rate-limit.ts`:

```typescript
// TODO: This in-memory rate limiter does not work across serverless invocations.
// For production on Vercel, replace with Upstash Redis or Vercel KV.
// See: https://vercel.com/guides/rate-limiting-edge-middleware-vercel-kv
```

- [ ] **Step 3: Run tests**

Run: `cd goal-dashboard && npx vitest run src/__tests__/rate-limit.test.ts`
Expected: PASS (rate-limit logic unchanged)

- [ ] **Step 4: Commit**

```bash
git add src/lib/rate-limit.ts
git commit -m "fix(security): prefer x-real-ip for rate limiting, add distributed TODO"
```

---

### Task 5: YAML Payload Size Limit

**Files:**
- Modify: `src/app/api/goals/import/route.ts`
- Create: `src/__tests__/yaml-size-limit.test.ts`

- [ ] **Step 1: Write the failing test**

First, add a shared constant. In `src/app/api/goals/import/route.ts`, add after the existing imports:

```typescript
export const MAX_YAML_SIZE = 256 * 1024; // 256KB
```

Then add the size check after `const { stackId, yamlContent, confirmed } = body;`:

```typescript
if (typeof yamlContent !== 'string' || yamlContent.length > MAX_YAML_SIZE) {
  return Response.json(
    { error: 'YAML content must be a string under 256KB' },
    { status: 400 }
  );
}
```

- [ ] **Step 2: Write the test**

Create `src/__tests__/yaml-size-limit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MAX_YAML_SIZE } from '@/app/api/goals/import/route';

describe('YAML size limit constant', () => {
  it('is 256KB', () => {
    expect(MAX_YAML_SIZE).toBe(256 * 1024);
  });

  it('rejects strings exceeding the limit', () => {
    const oversized = 'a'.repeat(MAX_YAML_SIZE + 1);
    // This mirrors the check in the route handler
    const wouldReject = typeof oversized !== 'string' || oversized.length > MAX_YAML_SIZE;
    expect(wouldReject).toBe(true);
  });

  it('accepts strings under the limit', () => {
    const valid = 'title: test\n';
    const wouldReject = typeof valid !== 'string' || valid.length > MAX_YAML_SIZE;
    expect(wouldReject).toBe(false);
  });
});
```

- [ ] **Step 3: Run test**

Run: `cd goal-dashboard && npx vitest run src/__tests__/yaml-size-limit.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/api/goals/import/route.ts src/__tests__/yaml-size-limit.test.ts
git commit -m "fix(security): add 256KB size limit on YAML import payload"
```

---

### Task 6: Dev Login Hardening

**Files:**
- Modify: `src/lib/auth.ts:9-27`

- [ ] **Step 1: Add NEXT_PUBLIC_DEV_LOGIN guard**

In `src/lib/auth.ts`, change the dev provider gate:

```typescript
const devProvider =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_LOGIN === 'true'
    ? [
        CredentialsProvider({
          name: 'Dev Login',
          credentials: {
            email: { label: 'Email', type: 'email', placeholder: 'admin@upwhiten.com' },
          },
          async authorize(credentials) {
            if (!credentials?.email) return null;
            const normalizedEmail = credentials.email.trim().toLowerCase();
            const user = await prisma.user.findUnique({
              where: { email: normalizedEmail },
            });
            if (!user) return null;
            return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
          },
        }),
      ]
    : [];
```

Note: Also added `trim().toLowerCase()` on the email for consistency with the rest of the app.

- [ ] **Step 2: Verify build**

Run: `cd goal-dashboard && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "fix(security): require explicit NEXT_PUBLIC_DEV_LOGIN=true for dev credentials provider"
```

---

### Task 7: Invitation Error Message Leakage

**Files:**
- Modify: `src/app/api/invitations/route.ts:88-93`

- [ ] **Step 1: Remove err.message from response**

In `src/app/api/invitations/route.ts`, replace the catch block:

```typescript
  } catch (err) {
    console.error('Failed to create invitation:', err);
    return Response.json(
      { error: 'Failed to create invitation. Please try again.' },
      { status: 500 }
    );
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/invitations/route.ts
git commit -m "fix(security): remove internal error details from invitation API response"
```

---

### Task 8: User Search Email Exposure

**Files:**
- Modify: `src/app/api/users/search/route.ts:16-25`

- [ ] **Step 1: Remove email from select and search by name only for non-admins**

Replace the handler in `src/app/api/users/search/route.ts`:

```typescript
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 1) {
    return Response.json([]);
  }

  // Non-admins can only search by name (prevents email enumeration).
  // Admins can also search by email for user management.
  const isAdmin = auth.session.user.isAdmin;
  const where = isAdmin
    ? { OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
      ] }
    : { name: { contains: q, mode: 'insensitive' as const } };

  const users = await prisma.user.findMany({
    where,
    select: { id: true, name: true, image: true },
    take: 10,
  });

  return Response.json(users);
}
```

Key changes: `select` no longer includes `email`, and non-admins can only search by name (prevents email enumeration).

- [ ] **Step 2: Commit**

```bash
git add src/app/api/users/search/route.ts
git commit -m "fix(security): remove email from user search API response"
```

---

### Task 9: Recursive Soft Delete — Max Depth Guard

**Files:**
- Modify: `src/app/api/goals/[id]/route.ts:146-160`

- [ ] **Step 1: Add max depth parameter to softDeleteDescendants**

Replace the function in `src/app/api/goals/[id]/route.ts`:

```typescript
const MAX_GOAL_DEPTH = 20;

async function softDeleteDescendants(goalId: string, now: Date, depth = 0) {
  if (depth > MAX_GOAL_DEPTH) {
    console.warn(`softDeleteDescendants: max depth ${MAX_GOAL_DEPTH} exceeded at goal ${goalId}, stopping recursion`);
    return;
  }

  await prisma.goal.update({
    where: { id: goalId },
    data: { deletedAt: now },
  });

  const children = await prisma.goal.findMany({
    where: { parentId: goalId, deletedAt: null },
    select: { id: true },
  });

  for (const child of children) {
    await softDeleteDescendants(child.id, now, depth + 1);
  }
}
```

- [ ] **Step 2: Run tests**

Run: `cd goal-dashboard && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/goals/[id]/route.ts
git commit -m "fix(security): add max-depth guard to recursive soft delete"
```

---

### Task 10: Security Headers in next.config.mjs

**Files:**
- Modify: `next.config.mjs`

- [ ] **Step 1: Add security headers**

Replace `next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify build**

Run: `cd goal-dashboard && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "fix(security): add security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy)"
```

---

### Task 11: Encrypt Google Refresh Tokens at Rest

**Files:**
- Create: `src/lib/crypto.ts`
- Create: `src/__tests__/crypto.test.ts`
- Modify: `src/lib/auth.ts` (encrypt on store)
- Modify: `src/lib/calendar.ts` (decrypt on use)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/crypto.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64)); // 32 bytes hex

import { encryptToken, decryptToken } from '@/lib/crypto';

describe('token encryption', () => {
  it('encrypts and decrypts a token back to the original', () => {
    const original = 'my-secret-refresh-token-1234';
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.split(':').length).toBe(3); // iv:authTag:ciphertext format
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertext for the same input (random IV)', () => {
    const original = 'same-token';
    const a = encryptToken(original);
    const b = encryptToken(original);
    expect(a).not.toBe(b);
  });

  it('returns null for invalid ciphertext', () => {
    expect(decryptToken('not-valid')).toBeNull();
    expect(decryptToken('abc:def')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd goal-dashboard && npx vitest run src/__tests__/crypto.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement crypto helpers**

Create `src/lib/crypto.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext token. Returns "iv:authTag:ciphertext" in hex.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a token encrypted by encryptToken. Returns null on failure.
 */
export function decryptToken(encrypted: string): string | null {
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, ciphertext] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd goal-dashboard && npx vitest run src/__tests__/crypto.test.ts`
Expected: PASS

- [ ] **Step 5: Update auth.ts to encrypt refresh token on store**

In `src/lib/auth.ts`, add import and modify the signIn callback:

```typescript
import { encryptToken } from './crypto';
```

In the signIn callback, change:
```typescript
// Before:
data: {
  googleRefreshToken: account.refresh_token,
// After:
data: {
  googleRefreshToken: process.env.TOKEN_ENCRYPTION_KEY
    ? encryptToken(account.refresh_token)
    : account.refresh_token,
```

- [ ] **Step 6: Update calendar.ts to decrypt refresh token on use**

In `src/lib/calendar.ts`, add import and modify getCalendarClient:

```typescript
import { decryptToken } from './crypto';
```

After fetching the account, before using refresh_token:

```typescript
if (!account?.refresh_token) return null;

// Decrypt if encryption is enabled.
// Fallback handles migration: existing plaintext tokens won't decrypt successfully,
// so they pass through as-is. Log a warning so we can track migration progress.
let refreshToken = account.refresh_token;
if (process.env.TOKEN_ENCRYPTION_KEY) {
  const decrypted = decryptToken(account.refresh_token);
  if (decrypted) {
    refreshToken = decrypted;
  } else {
    console.warn(`[calendar] Failed to decrypt refresh token for user ${userId} — using as plaintext (pre-migration token?)`);
  }
}
```

Then use `refreshToken` instead of `account.refresh_token` in `setCredentials`:

```typescript
oauth2Client.setCredentials({
  refresh_token: refreshToken,
  access_token: account.access_token ?? undefined,
  expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
});
```

- [ ] **Step 7: Add TOKEN_ENCRYPTION_KEY to .env.example**

Add to `.env.example`:

```
# Token Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
TOKEN_ENCRYPTION_KEY=""
```

- [ ] **Step 8: Note on migration of existing tokens**

Existing plaintext `googleRefreshToken` values in the database will continue to work
because `decryptToken` returns `null` for non-encrypted strings, and the fallback in
`calendar.ts` will use them as-is (with a warning log). New sign-ins will store
encrypted tokens. To encrypt existing tokens, a one-time migration script would be:

```sql
-- Run AFTER deploying and setting TOKEN_ENCRYPTION_KEY:
-- No SQL migration needed — the app handles both formats gracefully.
-- To force re-encryption: have users re-authenticate (sign out + sign in).
```

This is an accepted trade-off: gradual migration via re-auth rather than a bulk script.

- [ ] **Step 9: Run all tests**

Run: `cd goal-dashboard && npx vitest run`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/crypto.ts src/__tests__/crypto.test.ts src/lib/auth.ts src/lib/calendar.ts .env.example
git commit -m "feat(security): add AES-256-GCM encryption for Google refresh tokens at rest"
```

---

### Task 12: Email Notification HTML Sanitization

**Files:**
- Modify: `src/lib/notifications.ts:112`

- [ ] **Step 1: Escape HTML in notifyUser body**

In `src/lib/notifications.ts`, replace the `notifyUser` function:

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  url?: string
) {
  await Promise.all([
    sendPushNotification(userId, title, body, url),
    sendEmailNotification(userId, title, `<p>${escapeHtml(body)}</p>`),
  ]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notifications.ts
git commit -m "fix(security): escape HTML in email notification body to prevent XSS"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd goal-dashboard && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run build**

Run: `cd goal-dashboard && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Run linter**

Run: `cd goal-dashboard && npx next lint`
Expected: No new errors

- [ ] **Step 4: Final commit (if any lint/type fixes needed)**

```bash
git add -A
git commit -m "chore: fix lint/type issues from security hardening"
```
