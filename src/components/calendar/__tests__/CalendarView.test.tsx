import React from 'react';
import { vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils';
import { CalendarView } from '../CalendarView';

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark', setTheme: vi.fn() }),
}));

// Mock useToast
vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('CalendarView', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    );
  });

  it('renders FullCalendar mock', () => {
    render(<CalendarView />);
    expect(screen.getByTestId('fullcalendar')).toBeInTheDocument();
  });

  it('renders all six filter toggle buttons', () => {
    render(<CalendarView />);
    expect(screen.getByText('My Tasks')).toBeInTheDocument();
    expect(screen.getByText('Reviews')).toBeInTheDocument();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
    expect(screen.getByText('Aims')).toBeInTheDocument();
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('Power Down')).toBeInTheDocument();
  });

  it('all filters are active by default (non-dimmed styling)', () => {
    render(<CalendarView />);
    const tasksButton = screen.getByText('My Tasks').closest('button')!;
    // Active filters have text-[var(--text-primary)] class
    expect(tasksButton.className).toContain('text-[var(--text-primary)]');
  });

  it('toggles filter off on click (gets dimmed styling)', async () => {
    const user = userEvent.setup();
    render(<CalendarView />);

    const tasksButton = screen.getByText('My Tasks').closest('button')!;
    await user.click(tasksButton);

    // After toggling off, should have opacity-50
    expect(tasksButton.className).toContain('opacity-50');
  });

  it('toggles filter back on with a second click', async () => {
    const user = userEvent.setup();
    render(<CalendarView />);

    const reviewsButton = screen.getByText('Reviews').closest('button')!;
    await user.click(reviewsButton); // off
    expect(reviewsButton.className).toContain('opacity-50');

    await user.click(reviewsButton); // on again
    expect(reviewsButton.className).toContain('text-[var(--text-primary)]');
  });
});
