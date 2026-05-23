/**
 * Builds e2e/auth/storageState.json from a NextAuth session-token cookie value the user copies
 * from their real Chrome's DevTools. Sidesteps Google's automation block on OAuth in Playwright.
 *
 * Usage:
 *   PowerShell:  $env:SESSION_TOKEN="<paste>"; npm run e2e:auth
 *   bash:        SESSION_TOKEN="<paste>" npm run e2e:auth
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as readline from 'readline';

const BASE_URL = (process.env.E2E_BASE_URL ?? 'https://prism.upwhiten.com').replace(/\/$/, '');
const STORAGE_PATH = path.join(__dirname, 'storageState.json');
const COOKIE_NAME = '__Secure-next-auth.session-token';

function host(): string {
  return new URL(BASE_URL).host;
}

async function promptForToken(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(
      `\nPaste the value of the "${COOKIE_NAME}" cookie from prism.upwhiten.com\n` +
        `(DevTools → Application → Cookies → ${BASE_URL}):\n> `,
      (a) => resolve(a)
    );
  });
  rl.close();
  return answer.trim();
}

function validateCookie(token: string): Promise<{ ok: boolean; status: number; body?: string }> {
  return new Promise((resolve) => {
    const url = new URL('/api/stacks', BASE_URL);
    const req = https.request(
      {
        method: 'GET',
        host: url.host,
        path: url.pathname + url.search,
        headers: { Cookie: `${COOKIE_NAME}=${token}` },
      },
      (resp) => {
        let body = '';
        resp.on('data', (c) => (body += c));
        resp.on('end', () =>
          resolve({ ok: (resp.statusCode ?? 0) < 400, status: resp.statusCode ?? 0, body })
        );
      }
    );
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.end();
  });
}

function writeStorageState(token: string): void {
  const nowSec = Math.floor(Date.now() / 1000);
  const state = {
    cookies: [
      {
        name: COOKIE_NAME,
        value: token,
        domain: host(),
        path: '/',
        expires: nowSec + 25 * 86_400, // ~25 days
        httpOnly: true,
        secure: true,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [] as unknown[],
  };
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(state, null, 2));
}

async function main() {
  let token = (process.env.SESSION_TOKEN ?? '').trim();
  if (!token) {
    token = await promptForToken();
  }
  if (!token) {
    console.error(`No session token provided. See e2e/README.md.`);
    process.exit(2);
  }
  if (token.length < 20) {
    console.error(
      `Token looks too short (${token.length} chars). The "${COOKIE_NAME}" value is a long JWT-like string.`
    );
    process.exit(2);
  }

  console.log(`\nValidating cookie against ${BASE_URL}/api/stacks ...`);
  const result = await validateCookie(token);
  if (!result.ok) {
    console.error(
      `\nValidation failed (HTTP ${result.status}). Re-sign in at ${BASE_URL} in your real Chrome,\n` +
        `then copy the "${COOKIE_NAME}" value (not csrf-token, not callback-url) from DevTools.\n`
    );
    process.exit(1);
  }
  console.log(`OK (HTTP ${result.status}).`);

  writeStorageState(token);
  console.log(`\nstorageState saved -> ${STORAGE_PATH}`);
  console.log(`You can now run:  npm run e2e:smoke   /   npm run e2e\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
