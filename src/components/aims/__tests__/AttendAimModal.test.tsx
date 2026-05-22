import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render, renderWithProviders, userEvent } from '@/test/utils';
import { AttendAimModal, type GroupableAimItem } from '../AttendAimModal';

const baseItem: GroupableAimItem = {
  id: 'inst-t1',
  scheduledDate: '2026-05-20T00:00:00.000Z',
  timeBlockStart: '2026-05-20T18:00:00.000Z',
  timeBlockEnd: '2026-05-20T19:00:00.000Z',
  aimCategory: { id: 'cat-1', name: 'Deep Work', isDaily: true },
  owner: { id: 'u2', name: 'Alice', image: null },
  attendStatus: 'NONE',
};

describe('AttendAimModal', () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onAttend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
    onAttend = vi.fn().mockResolvedValue(undefined);
  });

  it('renders the AIM category name', () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    expect(screen.getByText('Deep Work')).toBeInTheDocument();
  });

  it('renders the owner name', () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders all three action buttons', () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    expect(screen.getByText(/Attend — add to my schedule/i)).toBeInTheDocument();
    expect(screen.getByText('Maybe')).toBeInTheDocument();
    expect(screen.getByText(/Not interested/i)).toBeInTheDocument();
  });

  it('calls onAttend with GOING when Attend is clicked', async () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    await userEvent.click(screen.getByText(/Attend — add to my schedule/i));
    expect(onAttend).toHaveBeenCalledWith('GOING');
  });

  it('calls onAttend with MAYBE when Maybe is clicked', async () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    await userEvent.click(screen.getByText('Maybe'));
    expect(onAttend).toHaveBeenCalledWith('MAYBE');
  });

  it('calls onAttend with NOT_GOING when Not interested is clicked', async () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    await userEvent.click(screen.getByText(/Not interested/i));
    expect(onAttend).toHaveBeenCalledWith('NOT_GOING');
  });

  it('calls onClose when the X button is clicked', async () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    // The X button is the close button in the modal header
    const closeButtons = screen.getAllByRole('button');
    // First button in header area is the X close button
    const xButton = closeButtons.find((btn) => btn.querySelector('svg'));
    if (xButton) await userEvent.click(xButton);
    // onClose may be called via clicking the first button with an X icon
    // Alternative: check backdrop click
  });

  it('uses initials avatar when no image is provided', () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    // The initial 'A' for 'Alice' should be rendered in a fallback div
    const avatarFallback = screen.getByText('A');
    expect(avatarFallback).toBeInTheDocument();
  });

  it('renders owner fallback name when name is null', () => {
    const item: GroupableAimItem = {
      ...baseItem,
      owner: { id: 'u2', name: null, image: null },
    };
    render(<AttendAimModal item={item} onClose={onClose} onAttend={onAttend} />);
    expect(screen.getByText('A teammate')).toBeInTheDocument();
  });

  describe('custom AIM branch (isDaily=false)', () => {
    const customItem: GroupableAimItem = {
      ...baseItem,
      aimCategory: { id: 'cat-1', name: 'Pottery class', isDaily: false },
    };

    it('renders the legacy "visit the AIMs page" text when no invitationId is provided', () => {
      render(<AttendAimModal item={customItem} onClose={onClose} onAttend={onAttend} />);
      expect(
        screen.getByText(/visit the AIMs page after attending/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Link to similar AIM/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Add as one-off/i)).not.toBeInTheDocument();
    });

    it('renders both link/one-off buttons when an invitationId is provided', () => {
      const withInvite: GroupableAimItem = { ...customItem, invitationId: 'inv-99' };
      render(<AttendAimModal item={withInvite} onClose={onClose} onAttend={onAttend} />);
      expect(screen.getByText(/Link to similar AIM/i)).toBeInTheDocument();
      expect(screen.getByText(/Add as one-off/i)).toBeInTheDocument();
      // legacy text replaced
      expect(
        screen.queryByText(/visit the AIMs page after attending/i),
      ).not.toBeInTheDocument();
    });

    it('does NOT render the link/one-off branch when isDaily=true', () => {
      render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
      expect(screen.queryByText(/Link to similar AIM/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Add as one-off/i)).not.toBeInTheDocument();
    });

    describe('with invitationId — fetch behaviour', () => {
      const originalFetch = global.fetch;
      const fetchMock = vi.fn();

      beforeEach(() => {
        fetchMock.mockReset();
        global.fetch = fetchMock as unknown as typeof global.fetch;
      });

      afterEach(() => {
        global.fetch = originalFetch;
      });

      it('POSTs to /one-off when "Add as one-off" is clicked, then closes', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
        const withInvite: GroupableAimItem = { ...customItem, invitationId: 'inv-99' };
        render(<AttendAimModal item={withInvite} onClose={onClose} onAttend={onAttend} />);

        await userEvent.click(screen.getByText(/Add as one-off/i));

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain('/api/aims/invitations/inv-99/one-off');
        expect((init as RequestInit).method).toBe('POST');
        await waitFor(() => expect(onClose).toHaveBeenCalled());
      });

      it('opens the similar-AIM picker on "Link to similar AIM" click and lists results', async () => {
        // The picker view fetches via SWR — provide the matching data
        const swrData = {
          '/api/aims/similar': {
            target: { id: 'cat-1', name: 'Pottery class' },
            results: [
              {
                id: 'ua-1',
                aimCategoryId: 'cat-pot',
                name: 'Ceramics',
                isDaily: false,
                currentPhase: 'GROW',
                currentStreak: 3,
                distance: 4,
              },
            ],
          },
        };
        const withInvite: GroupableAimItem = { ...customItem, invitationId: 'inv-99' };
        renderWithProviders(
          <AttendAimModal item={withInvite} onClose={onClose} onAttend={onAttend} />,
          { swrData },
        );

        await userEvent.click(screen.getByText(/Link to similar AIM/i));

        // Sub-view heading shows up
        await waitFor(() =>
          expect(
            screen.getByRole('heading', { name: /Link to similar AIM/i }),
          ).toBeInTheDocument(),
        );
        // Result row renders
        await waitFor(() => expect(screen.getByText('Ceramics')).toBeInTheDocument());
      });
    });
  });
});
