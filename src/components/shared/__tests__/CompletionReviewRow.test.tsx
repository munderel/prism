import { vi, describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '@/test/utils';
import { CompletionReviewRow } from '../CompletionReviewRow';

const WORK_BLOCK_ITEM = {
  kind: 'workblock' as const,
  id: 'wb-1',
  start: '2026-05-19T09:00:00.000Z',
  end: '2026-05-19T10:30:00.000Z',
  mainObjective: 'Ship component 15',
  task: { id: 'task-1', title: 'Build review UI', estimatedMinutes: 90 },
  completionStatus: 'PENDING' as const,
  actualMinutes: null,
  scheduledMinutes: 90,
};

const AIM_ITEM = {
  kind: 'aim' as const,
  id: 'aim-1',
  scheduledDate: '2026-05-19T00:00:00.000Z',
  timeBlockStart: '2026-05-19T07:00:00.000Z',
  timeBlockEnd: '2026-05-19T08:00:00.000Z',
  status: 'SCHEDULED' as const,
  aimCategory: { id: 'cat-1', name: 'Morning Run' },
  actualMinutes: null,
  targetMinutes: 60,
};

describe('CompletionReviewRow', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockReset();
  });

  it('renders work block title and time', () => {
    renderWithProviders(
      <CompletionReviewRow item={WORK_BLOCK_ITEM} onChange={onChange} />,
    );
    expect(screen.getByText('Build review UI')).toBeInTheDocument();
    expect(screen.getByText('Work Block')).toBeInTheDocument();
    expect(screen.getByText(/90m/)).toBeInTheDocument();
  });

  it('renders AIM category name and tag', () => {
    renderWithProviders(
      <CompletionReviewRow item={AIM_ITEM} onChange={onChange} />,
    );
    expect(screen.getByText('Morning Run')).toBeInTheDocument();
    expect(screen.getByText('AIM')).toBeInTheDocument();
    expect(screen.getByText(/60m target/)).toBeInTheDocument();
  });

  it('shows COMPLETED/PARTIAL/MISSED for work blocks', () => {
    renderWithProviders(
      <CompletionReviewRow item={WORK_BLOCK_ITEM} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Missed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skipped' })).not.toBeInTheDocument();
  });

  it('shows COMPLETED/SKIPPED/MISSED for AIM instances', () => {
    renderWithProviders(
      <CompletionReviewRow item={AIM_ITEM} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skipped' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Missed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partial' })).not.toBeInTheDocument();
  });

  it('calls onChange with COMPLETED and default minutes when clicking Completed on work block', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CompletionReviewRow item={WORK_BLOCK_ITEM} onChange={onChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Completed' }));
    expect(onChange).toHaveBeenCalledWith('COMPLETED', 90);
  });

  it('calls onChange with SKIPPED when clicking Skipped on AIM', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CompletionReviewRow item={AIM_ITEM} onChange={onChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Skipped' }));
    expect(onChange).toHaveBeenCalledWith('SKIPPED', 60);
  });

  it('shows actual-minutes input when status is COMPLETED', () => {
    renderWithProviders(
      <CompletionReviewRow
        item={WORK_BLOCK_ITEM}
        onChange={onChange}
        currentStatus="COMPLETED"
        currentActualMinutes={75}
      />,
    );
    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('75');
  });

  it('does NOT show actual-minutes input when status is MISSED', () => {
    renderWithProviders(
      <CompletionReviewRow
        item={WORK_BLOCK_ITEM}
        onChange={onChange}
        currentStatus="MISSED"
      />,
    );
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('calls onChange when actual-minutes input changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CompletionReviewRow
        item={WORK_BLOCK_ITEM}
        onChange={onChange}
        currentStatus="PARTIAL"
        currentActualMinutes={45}
      />,
    );
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    // Trigger change to verify onChange is called with the status and a number
    await user.tripleClick(input);
    await user.keyboard('60');
    // onChange fires for each character typed; verify it's always called with PARTIAL + a number
    expect(onChange).toHaveBeenCalled();
    const calls = onChange.mock.calls;
    calls.forEach(([status, mins]: [string, number]) => {
      expect(status).toBe('PARTIAL');
      expect(typeof mins).toBe('number');
    });
  });

  it('shows objective sub-title for work blocks', () => {
    renderWithProviders(
      <CompletionReviewRow item={WORK_BLOCK_ITEM} onChange={onChange} />,
    );
    expect(screen.getByText(/Ship component 15/)).toBeInTheDocument();
  });
});
