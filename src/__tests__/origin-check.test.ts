import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { verifyRequestOrigin } from '@/lib/origin-check';

const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

// Minimal request shape — a plain Headers object avoids the fetch spec's
// forbidden-header filtering that a real Request constructor may apply to
// Origin/Host in some runtimes.
function makeRequest(headers: Record<string, string> = {}): Pick<Request, 'headers'> {
  return { headers: new Headers(headers) };
}

describe('verifyRequestOrigin', () => {
  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  afterAll(() => {
    if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
  });

  it('allows requests without an Origin header (curl, server-to-server, cron)', () => {
    expect(verifyRequestOrigin(makeRequest({ host: 'app.example.com' }))).toBe(true);
    expect(verifyRequestOrigin(makeRequest())).toBe(true);
  });

  it('allows an Origin whose host matches the host header', () => {
    const request = makeRequest({
      origin: 'https://app.example.com',
      host: 'app.example.com',
    });
    expect(verifyRequestOrigin(request)).toBe(true);
  });

  it('prefers x-forwarded-host over host (proxy pattern)', () => {
    const behindProxy = makeRequest({
      origin: 'https://app.example.com',
      'x-forwarded-host': 'app.example.com',
      host: 'internal-lb.local',
    });
    expect(verifyRequestOrigin(behindProxy)).toBe(true);

    // When x-forwarded-host is present, the raw host header is not trusted.
    const mismatchedForward = makeRequest({
      origin: 'https://internal-lb.local',
      'x-forwarded-host': 'app.example.com',
      host: 'internal-lb.local',
    });
    expect(verifyRequestOrigin(mismatchedForward)).toBe(false);
  });

  it('allows an Origin matching the NEXTAUTH_URL host as fallback', () => {
    process.env.NEXTAUTH_URL = 'https://prism.example.com';
    const request = makeRequest({
      origin: 'https://prism.example.com',
      host: 'deployment-alias.vercel.app',
    });
    expect(verifyRequestOrigin(request)).toBe(true);
  });

  it('matches NEXTAUTH_URL host including a non-default port', () => {
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    expect(verifyRequestOrigin(makeRequest({ origin: 'http://localhost:3000' }))).toBe(true);
    expect(verifyRequestOrigin(makeRequest({ origin: 'http://localhost:4000' }))).toBe(false);
  });

  it('rejects a foreign origin', () => {
    process.env.NEXTAUTH_URL = 'https://app.example.com';
    const request = makeRequest({
      origin: 'https://evil.example',
      host: 'app.example.com',
    });
    expect(verifyRequestOrigin(request)).toBe(false);
  });

  it('rejects a foreign origin even when NEXTAUTH_URL is unset', () => {
    const request = makeRequest({
      origin: 'https://evil.example',
      host: 'app.example.com',
    });
    expect(verifyRequestOrigin(request)).toBe(false);
  });

  it('rejects a malformed or "null" Origin', () => {
    expect(verifyRequestOrigin(makeRequest({ origin: 'null', host: 'app.example.com' }))).toBe(
      false
    );
    expect(
      verifyRequestOrigin(makeRequest({ origin: 'not a url', host: 'app.example.com' }))
    ).toBe(false);
  });

  it('does not throw when NEXTAUTH_URL is unparseable', () => {
    process.env.NEXTAUTH_URL = '::not-a-url::';
    const request = makeRequest({ origin: 'https://evil.example', host: 'app.example.com' });
    expect(verifyRequestOrigin(request)).toBe(false);
  });
});
