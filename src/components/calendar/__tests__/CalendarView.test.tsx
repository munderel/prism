import { vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils';
import { CalendarView } from '../CalendarView';

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

  it('renders all four filter toggle buttons', () => {
    render(<CalendarView />);
    expect(screen.getByText('My Tasks')).toBeInTheDocument();
    expect(screen.getByText('Reviews')).toBeInTheDocument();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
  });

  it('all filters are active by default (non-dimmed styling)', () => {
    render(<CalendarView />);
    const tasksButton = screen.getByText('My Tasks').closest('button')!;
    // Active filters have 'text-white' class
    expect(tasksButton.className).toContain('text-white');
  });

  it('toggles filter off on click (gets dimmed styling)', async () => {
    const user = userEvent.setup();
    render(<CalendarView />);

    const tasksButton = screen.getByText('My Tasks').closest('button')!;
    await user.click(tasksButton);

    // After toggling off, should have opacity-50 and text-gray-500
    expect(tasksButton.className).toContain('opacity-50');
  });

  it('toggles filter back on with a second click', async () => {
    const user = userEvent.setup();
    render(<CalendarView />);

    const reviewsButton = screen.getByText('Reviews').closest('button')!;
    await user.click(reviewsButton); // off
    expect(reviewsButton.className).toContain('opacity-50');

    await user.click(reviewsButton); // on again
    expect(reviewsButton.className).toContain('text-white');
  });
});
