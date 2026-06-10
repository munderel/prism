import { APIRequestContext, request as playwrightRequest, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_PATH = path.join(__dirname, '..', 'auth', 'storageState.json');

export interface ApiClient {
  ctx: APIRequestContext;
  get<T = unknown>(url: string): Promise<T>;
  del(url: string): Promise<number>;
  post<T = unknown>(url: string, body?: unknown): Promise<T>;
  patch<T = unknown>(url: string, body?: unknown): Promise<T>;
}

function baseURL(): string {
  // Default to localhost, never production — this client runs destructive
  // mutations. Set E2E_BASE_URL explicitly to target a deployed environment.
  return process.env.E2E_BASE_URL ?? 'http://localhost:3000';
}

export async function createApiClient(browserContext?: BrowserContext): Promise<ApiClient> {
  let ctx: APIRequestContext;
  if (browserContext) {
    ctx = browserContext.request;
  } else {
    if (!fs.existsSync(STORAGE_PATH)) {
      throw new Error(`storageState not found at ${STORAGE_PATH}. Run e2e:setup first.`);
    }
    ctx = await playwrightRequest.newContext({
      baseURL: baseURL(),
      storageState: STORAGE_PATH,
    });
  }

  return {
    ctx,
    async get<T>(url: string): Promise<T> {
      const r = await ctx.get(url);
      if (!r.ok()) throw new Error(`GET ${url} -> ${r.status()} ${await r.text()}`);
      return (await r.json()) as T;
    },
    async del(url: string): Promise<number> {
      const r = await ctx.delete(url);
      return r.status();
    },
    async post<T>(url: string, body?: unknown): Promise<T> {
      const r = await ctx.post(url, { data: body ?? {} });
      if (!r.ok()) throw new Error(`POST ${url} -> ${r.status()} ${await r.text()}`);
      return (await r.json()) as T;
    },
    async patch<T>(url: string, body?: unknown): Promise<T> {
      const r = await ctx.patch(url, { data: body ?? {} });
      if (!r.ok()) throw new Error(`PATCH ${url} -> ${r.status()} ${await r.text()}`);
      return (await r.json()) as T;
    },
  };
}
