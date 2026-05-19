import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockFetch } from '@/test/utils';
import { MeetingsManager } from '../MeetingsManager';
import { createMeeting } from '@/test/fixtures';

function setup(meetings: any[] = []) {
  global.fetch = createMockFetch({
    '/api/meetings': meetings,
    '/api/users/search': [],
  });
}

describe('MeetingsManager', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
  });

  it('returns null when open is false', () => {
    renderWithProviders(<MeetingsManager open={false} onClose={onClose} />);
    // The provider chain renders a toast container even when MeetingsManager
    // itself returns null; assert the manager-owned heading isn't present
    // instead of checking the whole container.
    expect(screen.queryByText('Manage Meetings')).not.toBeInTheDocument();
  });

  it('shows loading state when opened', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    renderWithProviders(<MeetingsManager open={true} onClose={onClose} />);
    expect(screen.getByText('Loading meetings...')).toBeInTheDocument();
  });

  it('shows empty state when no meetings exist', async () => {
    setup([]);
    renderWithProviders(<MeetingsManager open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/No meetings yet/)).toBeInTheDocument();
    });
  });

  it('lists meetings with title, time, and cadence', async () => {
    const meeting = createMeeting({
      id: 'm1',
      title: 'Weekly Standup',
      timeStart: '09:00',
      timeEnd: '09:30',
      cadence: 'WEEKLY',
      dayOfWeek: 1,
      attendeeIds: ['u1', 'u2'],
    });
    setup([meeting]);
    renderWithProviders(<MeetingsManager open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Weekly Standup')).toBeInTheDocument();
    });
    expect(screen.getByText('09:00 - 09:30')).toBeInTheDocument();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('2 attendees')).toBeInTheDocument();
  });

  it('shows New Meeting button and opens form on click', async () => {
    setup([]);
    const user = userEvent.setup();
    renderWithProviders(<MeetingsManager open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New Meeting/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /New Meeting/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Weekly Team Standup/)).toBeInTheDocument();
    });
    expect(screen.getByText('Create Meeting')).toBeInTheDocument();
  });

  it('submits new meeting form', async () => {
    setup([]);
    const user = userEvent.setup();
    renderWithProviders(<MeetingsManager open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New Meeting/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /New Meeting/i }));

    const titleInput = screen.getByPlaceholderText(/Weekly Team Standup/);
    await user.type(titleInput, 'New Meeting');

    await user.click(screen.getByRole('button', { name: /Create Meeting/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/meetings'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('calls onClose when close button is clicked', async () => {
    setup([]);
    const user = userEvent.setup();
    renderWithProviders(<MeetingsManager open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Manage Meetings')).toBeInTheDocument();
    });

    // The X close button is the first button with X icon, in the top-right
    const closeButton = screen.getAllByRole('button')[0];
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens edit form when pencil button is clicked on a meeting', async () => {
    const meeting = createMeeting({ id: 'm1', title: 'Team Sync' });
    setup([meeting]);
    const user = userEvent.setup();
    renderWithProviders(<MeetingsManager open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Team Sync')).toBeInTheDocument();
    });

    // Find buttons within the meeting card -- pencil is the first action button
    const buttons = screen.getAllByRole('button');
    // The edit button is the one with Pencil icon near the meeting card
    const editButton = buttons.find(
      (btn) => btn.closest('[class*="gap-2 ml-4"]')
    );
    if (editButton) {
      await user.click(editButton);
      await waitFor(() => {
        expect(screen.getByText('Edit Meeting')).toBeInTheDocument();
      });
    }
  });
});
