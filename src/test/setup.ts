import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Global fetch mock — each test overrides per-endpoint
global.fetch = vi.fn();

// Window methods used in components
window.confirm = vi.fn(() => true);
window.alert = vi.fn();
URL.createObjectURL = vi.fn(() => 'blob:mock');
URL.revokeObjectURL = vi.fn();

// Reset mocks between tests
afterEach(() => {
  vi.restoreAllMocks();
});
