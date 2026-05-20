import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockFetch } from '@/test/utils';
import { WorkBlockEditor } from '../WorkBlockEditor';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const now = new Date('2026-05-20T10:00:00');
const later = new Date('2026-05-20T11:30:00');

function makeWorkBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wb-1',
    start: now.toISOString(),
    end: later.toISOString(),
    mainObjective: 'Finish the spec',
    completionStatus: 'PENDING',
    actualMinutes: null,
    notes: null,
    clearGoals: [
      { id: 'cg-1', text: 'Draft outline', isComplete: false, sortOrder: 0 },
      { id: 'cg-2', text: 'Write intro', isComplete: true, sortOrder: 1 },
    ],
    task: {
      id: 't-1',
      title: 'Build onboarding flow',
      taskType: 'IMPROVE',
      estimatedMinutes: 120,
      goal: { id: 'g-1', title: 'Q2 Onboarding Initiative' },
    },
    ...overrides,
  };
}

describe('WorkBlockEditor — fullPage mode', () => {
  beforeEach(() => {
    global.fetch = createMockFetch({ '/api/work-blocks/wb-1': makeWorkBlock() });
  });

  it('renders without dialog/modal ARIA role (fullPage is an inline form)', () => {
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the Edit Work Block heading', () => {
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);
    expect(screen.getByText('Edit Work Block')).toBeInTheDocument();
  });

  it('pre-populates mainObjective from workBlock', () => {
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);
    expect(screen.getByDisplayValue('Finish the spec')).toBeInTheDocument();
  });

  it('shows the linked task as a link with its title', () => {
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);
    const link = screen.getByRole('link', { name: /Build onboarding flow/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/tasks/t-1/edit');
  });

  it('shows the linked goal title as read-only text', () => {
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);
    expect(screen.getByText('Q2 Onboarding Initiative')).toBeInTheDocument();
  });

  it('renders existing clear goals with checkboxes', () => {
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);
    expect(screen.getByDisplayValue('Draft outline')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Write intro')).toBeInTheDocument();
  });

  it('shows the estimated minutes hint', () => {
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);
    expect(screen.getByText(/Estimated: 120m/)).toBeInTheDocument();
  });

  it('shows completion status select with correct initial value', () => {
    renderWithProviders(
      <WorkBlockEditor workBlock={makeWorkBlock({ completionStatus: 'COMPLETED' })} fullPage />
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('COMPLETED');
  });

  it('shows no linked-task message when task is null', () => {
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock({ task: null })} fullPage />);
    expect(screen.getByText('No linked task')).toBeInTheDocument();
  });

  it('allows adding a new clear goal row', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);
    const addBtn = screen.getByRole('button', { name: /Add clear goal/i });
    await user.click(addBtn);
    // There should now be 3 rows — original 2 + 1 new empty
    const inputs = screen.getAllByPlaceholderText('A concrete win for this block');
    expect(inputs).toHaveLength(3);
  });

  it('issues PATCH with the right body on save', async () => {
    const mockFetch = createMockFetch({ '/api/work-blocks/wb-1': makeWorkBlock() });
    global.fetch = mockFetch;
    const user = userEvent.setup();
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);

    const saveBtn = screen.getByRole('button', { name: /Save block/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-blocks/wb-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    const callArgs = mockFetch.mock.calls.find(
      (call: [string, RequestInit]) => call[0] === '/api/work-blocks/wb-1'
    )!;
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.mainObjective).toBe('Finish the spec');
    expect(body.completionStatus).toBe('PENDING');
    expect(Array.isArray(body.clearGoals)).toBe(true);
  });

  it('calls onSave after a successful PATCH', async () => {
    global.fetch = createMockFetch({ '/api/work-blocks/wb-1': makeWorkBlock() });
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkBlockEditor workBlock={makeWorkBlock()} fullPage onSave={onSave} />
    );

    await user.click(screen.getByRole('button', { name: /Save block/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });

  it('shows validation error when mainObjective is cleared', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkBlockEditor workBlock={makeWorkBlock()} fullPage />);

    const objInput = screen.getByDisplayValue('Finish the spec');
    await user.clear(objInput);
    // Save button should be disabled when objective is empty (no need to click)
    expect(screen.getByRole('button', { name: /Save block/i })).toBeDisabled();
  });
});

describe('WorkBlockEditor — with no task', () => {
  it('renders gracefully with null task', () => {
    renderWithProviders(
      <WorkBlockEditor workBlock={makeWorkBlock({ task: null, clearGoals: [] })} fullPage />
    );
    expect(screen.getByText('No linked task')).toBeInTheDocument();
    expect(screen.queryByText('Q2 Onboarding Initiative')).not.toBeInTheDocument();
  });
});
