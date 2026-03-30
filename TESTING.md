# Prism — Testing Guide

## Overview

| Aspect | Detail |
|--------|--------|
| Framework | Vitest |
| Environment | jsdom |
| Component Testing | React Testing Library |
| DOM Assertions | `@testing-library/jest-dom` |
| User Interactions | `@testing-library/user-event` |
| Configuration | `vitest.config.ts` |
| Test Setup | `src/test/setup.ts` |
| Current coverage | 285 tests passing across 36 test files |

---

## Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npx vitest

# Verbose output
npx vitest run --reporter=verbose

# Run specific test file
npx vitest run src/__tests__/date-utils.test.ts

# Run tests matching a pattern
npx vitest run --testNamePattern="scheduling"
```

---

## Test Organization

```
src/
├── __tests__/                          # Unit tests for src/lib/ utilities
│   ├── auth-guard.test.ts              # Authorization logic
│   ├── crypto.test.ts                  # Token encryption/decryption
│   ├── derailing.test.ts               # AIM derail detection
│   ├── goal-validation.test.ts         # Goal hierarchy validation
│   ├── invitations.test.ts             # Invitation system
│   ├── mention-parser.test.ts          # @mention parsing
│   ├── process-scheduler.test.ts       # Recurring process scheduling
│   ├── progress.test.ts               # Goal progress cascading
│   ├── recurrence.test.ts             # RRule parsing
│   ├── reports.test.ts                # Report calculations
│   ├── review-dates.test.ts           # Review scheduling logic
│   ├── scheduling-engine.test.ts      # Task scheduling algorithm
│   ├── yaml-handler.test.ts           # YAML parsing
│   └── yaml-size-limit.test.ts        # Size validation
├── app/api/                            # Integration tests for API routes
├── components/
│   ├── calendar/__tests__/            # Calendar component tests
│   ├── dopamine/__tests__/            # Animation component tests
│   ├── goals/__tests__/               # Goal component tests
│   └── tasks/__tests__/               # Task component tests
└── test/                               # Test infrastructure
    ├── setup.ts                        # Global setup (mocks, DOM matchers)
    ├── mocks.tsx                       # Shared mock providers
    ├── fixtures.ts                     # Shared test data
    └── utils.tsx                       # Custom render helpers
```

### Conventions

- **Unit tests** for `src/lib/` utilities go in `src/__tests__/`
- **Component tests** go in `src/components/<feature>/__tests__/`
- **Integration tests** for API routes live alongside the route handlers in `src/app/api/`
- Test files use `.test.ts` or `.test.tsx` extension
- Colocated with the code they test (component tests next to components)

---

## Test Setup

`src/test/setup.ts` provides:

```typescript
import '@testing-library/jest-dom';  // DOM matchers (toBeInTheDocument, etc.)

// Global fetch mock — each test overrides per-endpoint
global.fetch = vi.fn();

// Window methods used by components
window.confirm = vi.fn(() => true);
window.alert = vi.fn();
URL.createObjectURL = vi.fn(() => 'blob:mock');
URL.revokeObjectURL = vi.fn();

// Mocks reset between tests
afterEach(() => vi.restoreAllMocks());
```

---

## Writing Unit Tests

Unit tests target pure functions in `src/lib/`. Pattern:

```typescript
import { describe, it, expect } from 'vitest';
import { getLocalDateString, parseLocalDate } from '@/lib/date-utils';

describe('getLocalDateString', () => {
  it('returns YYYY-MM-DD for a given date', () => {
    const date = new Date(2026, 2, 29); // March 29, 2026
    expect(getLocalDateString(date)).toBe('2026-03-29');
  });

  it('returns today when no argument given', () => {
    const result = getLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseLocalDate', () => {
  it('creates Date at local midnight', () => {
    const date = parseLocalDate('2026-03-29');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // 0-indexed
    expect(date.getDate()).toBe(29);
    expect(date.getHours()).toBe(0);
  });
});
```

### What to test in utilities

- Input/output mapping for pure functions
- Edge cases (empty input, null, boundary values)
- Error handling paths
- Date math (timezone edge cases)

---

## Writing Component Tests

Component tests use React Testing Library. Pattern:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskCard } from '../TaskCard';

// Mock SWR responses
vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: [{ id: '1', title: 'Test Task', status: 'TODO' }],
    mutate: vi.fn(),
  })),
}));

describe('TaskCard', () => {
  it('renders task title', () => {
    render(<TaskCard task={{ id: '1', title: 'Write docs', status: 'TODO' }} />);
    expect(screen.getByText('Write docs')).toBeInTheDocument();
  });

  it('calls onComplete when checkbox clicked', async () => {
    const onComplete = vi.fn();
    render(<TaskCard task={{ id: '1', title: 'Test', status: 'TODO' }} onComplete={onComplete} />);

    await userEvent.click(screen.getByRole('checkbox'));
    expect(onComplete).toHaveBeenCalledWith('1');
  });
});
```

### Test infrastructure

- `src/test/mocks.tsx` — Mock providers (SessionProvider, SWRConfig with test fetcher)
- `src/test/fixtures.ts` — Shared test data (sample users, tasks, goals)
- `src/test/utils.tsx` — Custom render wrapper that includes providers

### What to test in components

- Rendering based on props/state
- User interactions (clicks, form submissions, keyboard)
- Conditional rendering (loading, empty, error states)
- Callback invocations

### What NOT to test

- Styling/CSS classes (visual regression testing is better suited)
- Third-party library internals

---

## Coverage Priorities

| Priority | Area | Why |
|----------|------|-----|
| High | `date-utils.ts` | Timezone bugs are subtle and common |
| High | `scheduling-engine.ts` | Complex algorithm with many edge cases |
| High | `recurrence.ts` | RRule parsing has many formats |
| High | `progress.ts` | Goal progress cascading affects UI accuracy |
| High | `derailing.ts` | Incorrect derail detection frustrates users |
| Medium | Review wizard components | Multi-step flows with validation |
| Medium | Calendar components | Drag-and-drop interactions |
| Medium | `goal-validation.ts` | Hierarchy constraints |
| Low | Simple display components | Low risk, high cost-to-test ratio |
| Low | Layout components | Static structure |

---

## Vitest Configuration

`vitest.config.ts`:

```typescript
{
  plugins: [react()],
  test: {
    environment: 'jsdom',     // Browser-like environment
    globals: true,             // describe/it/expect without imports
    setupFiles: ['./src/test/setup.ts'],
    css: false,                // Skip CSS processing
  },
  resolve: {
    alias: { '@': './src' },   // Match tsconfig path alias
  },
}
```

---

## See Also

- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — Adding tests when building new features
- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture that tests validate
