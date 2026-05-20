import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockFetch } from '@/test/utils';
import { MeetingEditor } from '../MeetingEditor';
import type { MeetingEditorMeeting } from '@/types/meeting';

function existing(overrides: Partial<MeetingEditorMeeting> = {}): MeetingEditorMeeting {
  return {
    id: 'm-1',
    title: 'Team Sync',
    description: 'Weekly sync',
    cadence: 'WEEKLY',
    dayOfWeek: 3,
    occurDate: null,
    timeStart: '10:00',
    timeEnd: '10:30',
    attendeeIds: [],
    meetLink: null,
    ...overrides,
  };
}

describe('MeetingEditor', () => {
  beforeEach(() => {
    global.fetch = createMockFetch({});
  });

  it('populates form from meeting prop on mount (read-once contract)', () => {
    renderWithProviders(
      <MeetingEditor meeting={existing()} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByDisplayValue('Team Sync')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Weekly sync')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10:30')).toBeInTheDocument();
    expect(screen.getByText('Edit Meeting')).toBeInTheDocument();
    expect(screen.getByText('Update Meeting')).toBeInTheDocument();
  });

  it('renders "New Meeting" form when no meeting prop is given', () => {
    renderWithProviders(<MeetingEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('New Meeting')).toBeInTheDocument();
    expect(screen.getByText('Create Meeting')).toBeInTheDocument();
  });

  it('hides the Meet-link checkbox when editing (PATCH does not honor it)', () => {
    renderWithProviders(
      <MeetingEditor meeting={existing()} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByLabelText(/Create Google Meet link/i)).not.toBeInTheDocument();
  });

  it('shows the Meet-link checkbox in create mode', () => {
    renderWithProviders(<MeetingEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/Create Google Meet link/i)).toBeInTheDocument();
  });

  it('PATCHes the meeting on submit and forwards warnings to onSaved', async () => {
    const onSaved = vi.fn();
    const saved = {
      id: 'm-1',
      title: 'Renamed',
      description: 'Weekly sync',
      cadence: 'WEEKLY',
      dayOfWeek: 3,
      occurDate: null,
      timeStart: '10:00',
      timeEnd: '10:30',
      attendeeIds: ['u-2'],
      meetLink: null,
      calendarEventId: 'gcal-1',
      syncedAt: null,
      syncError: null,
      createdBy: { id: 'u-1', name: null, email: 'a@b.test' },
      warnings: [
        'Invites sent. Attendees without Google Calendar may need to subscribe to this calendar to see the event.',
      ],
    };
    global.fetch = createMockFetch({ '/api/meetings/m-1': saved });

    const user = userEvent.setup();
    renderWithProviders(
      <MeetingEditor
        meeting={existing({ attendeeIds: ['u-1'] })}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );

    const titleInput = screen.getByDisplayValue('Team Sync');
    await user.clear(titleInput);
    await user.type(titleInput, 'Renamed');
    await user.click(screen.getByRole('button', { name: /Update Meeting/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/meetings/m-1',
      expect.objectContaining({ method: 'PATCH' }),
    );

    const [savedArg, warningsArg] = onSaved.mock.calls[0];
    expect(savedArg.id).toBe('m-1');
    expect(savedArg.title).toBe('Renamed');
    expect(warningsArg).toEqual([
      'Invites sent. Attendees without Google Calendar may need to subscribe to this calendar to see the event.',
    ]);
  });

  it('POSTs to /api/meetings on submit when no meeting prop is provided', async () => {
    const onSaved = vi.fn();
    global.fetch = createMockFetch({
      '/api/meetings': {
        id: 'new-1',
        title: 'Brand New',
        description: null,
        cadence: 'ONE_TIME',
        dayOfWeek: null,
        occurDate: null,
        timeStart: '09:00',
        timeEnd: '10:00',
        attendeeIds: [],
        meetLink: null,
        calendarEventId: null,
        syncedAt: null,
        syncError: null,
        createdBy: { id: 'u-1', name: null, email: 'a@b.test' },
        warnings: [],
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<MeetingEditor onSaved={onSaved} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Weekly Team Standup/), 'Brand New');
    await user.click(screen.getByRole('button', { name: /Create Meeting/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/meetings',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces server error via toast when save fails', async () => {
    const onSaved = vi.fn();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Title is required' }),
      } as Response),
    ) as unknown as typeof fetch;

    const user = userEvent.setup();
    renderWithProviders(
      <MeetingEditor meeting={existing()} onSaved={onSaved} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /Update Meeting/i }));

    await waitFor(() => expect(screen.getByText('Title is required')).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <MeetingEditor meeting={existing()} onSaved={vi.fn()} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders attendee advisory when attendees are present', () => {
    renderWithProviders(
      <MeetingEditor
        meeting={existing({ attendeeIds: ['u-1'] })}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /Attendees without Google Calendar may need to subscribe to this calendar/i,
      ),
    ).toBeInTheDocument();
  });

  it('does not render attendee advisory when no attendees are selected', () => {
    renderWithProviders(
      <MeetingEditor meeting={existing({ attendeeIds: [] })} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(
      screen.queryByText(
        /Attendees without Google Calendar may need to subscribe to this calendar/i,
      ),
    ).not.toBeInTheDocument();
  });

  it('extracts occurDate via UTC components (no viewer-timezone shift)', () => {
    // UTC midnight; in any westward viewer TZ, the string-prefix slice and the
    // helper agree on '2026-04-05'. Defends against future regressions that
    // re-introduce naked `new Date(string)` on the occurDate input value.
    renderWithProviders(
      <MeetingEditor
        meeting={existing({
          cadence: 'ONE_TIME',
          dayOfWeek: null,
          occurDate: '2026-04-05T00:00:00.000Z',
        })}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('2026-04-05')).toBeInTheDocument();
  });
});
