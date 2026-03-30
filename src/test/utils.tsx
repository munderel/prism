import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { LazyMotion, domAnimation } from 'framer-motion';
import { ToastProvider } from '@/components/ui/ToastProvider';

// Import mocks to ensure they're registered
import './mocks';

interface ProviderOptions {
  swrData?: Record<string, any>;
}

function createProviders(options: ProviderOptions = {}) {
  const { swrData = {} } = options;

  const fetcher = (url: string) => {
    for (const [pattern, data] of Object.entries(swrData)) {
      if (url.includes(pattern)) {
        return typeof data === 'function' ? data(url) : data;
      }
    }
    return [];
  };

  return function AllProviders({ children }: { children: React.ReactNode }) {
    return (
      <ToastProvider>
        <SWRConfig value={{ fetcher, dedupingInterval: 0, provider: () => new Map() }}>
          <LazyMotion features={domAnimation} strict>
            {children}
          </LazyMotion>
        </SWRConfig>
      </ToastProvider>
    );
  };
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { swrData, ...renderOptions } = options;
  return render(ui, {
    wrapper: createProviders({ swrData }),
    ...renderOptions,
  });
}

export function createMockFetch(routes: Record<string, any>) {
  return vi.fn((url: string, init?: RequestInit) => {
    for (const [pattern, response] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        const data = typeof response === 'function' ? response(url, init) : response;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
          text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
        });
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
}

export function createMockFetchError(pattern: string, error: any, otherRoutes: Record<string, any> = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes(pattern)) {
      return Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve(error),
      });
    }
    return createMockFetch(otherRoutes)(url, init);
  });
}

export { render } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
