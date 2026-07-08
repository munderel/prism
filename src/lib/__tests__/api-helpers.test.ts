import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const reportErrorMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../error-reporter', () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

import { withErrorHandler } from '../api-helpers';

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('msg', {
    code,
    clientVersion: 'test',
  });
}

function req() {
  return new Request('http://localhost/api/x');
}

describe('withErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through a successful response', async () => {
    const handler = withErrorHandler(async () => Response.json({ ok: true }));
    const res = await handler(req());
    expect(res.status).toBe(200);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('maps P2025 (record not found) to 404', async () => {
    const handler = withErrorHandler(async () => {
      throw knownError('P2025');
    });
    const res = await handler(req());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Record not found' });
    // Handled Prisma errors are not reported as unhandled failures.
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('maps P2002 (unique constraint) to 409', async () => {
    const handler = withErrorHandler(async () => {
      throw knownError('P2002');
    });
    const res = await handler(req());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'A record with that value already exists' });
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('reports an unhandled error and returns a clean 500', async () => {
    const boom = new Error('kaboom');
    const handler = withErrorHandler(async () => {
      throw boom;
    });
    const res = await handler(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(reportErrorMock).toHaveBeenCalledWith('api', boom);
  });
});
