import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render, userEvent, createMockFetch } from '@/test/utils';
import { GoalLinkManager } from '../GoalLinkManager';

function setup(overrides: Record<string, any> = {}) {
  const defaultRoutes: Record<string, any> = {
    '/api/goals/company-1': {
      id: 'company-1',
      title: 'Company Goal',
      companyGoalLinks: [
        {
          id: 'link-1',
          weight: 1.0,
          individualGoal: {
            id: 'goal-1',
            title: 'Individual Goal A',
            stack: { owner: { name: 'Alice' } },
          },
        },
      ],
    },
    '/api/stacks': [
      { id: 'stack-p1', name: 'Personal Stack', isCompany: false, owner: { name: 'Alice' } },
    ],
    '/api/goals?stackId=stack-p1': [
      { id: 'goal-2', title: 'Individual Goal B' },
    ],
    '/api/goals/company-1/link': { ok: true },
    ...overrides,
  };
  global.fetch = createMockFetch(defaultRoutes);
}

describe('GoalLinkManager', () => {
  const onUpdate = vi.fn();

  beforeEach(() => {
    onUpdate.mockReset();
  });

  it('shows loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    render(<GoalLinkManager companyGoalId="company-1" onUpdate={onUpdate} />);
    expect(screen.getByText('Loading links...')).toBeInTheDocument();
  });

  it('renders existing links after loading', async () => {
    setup();
    render(<GoalLinkManager companyGoalId="company-1" onUpdate={onUpdate} />);

    await waitFor(() => {
      expect(screen.getByText('Individual Goal A')).toBeInTheDocument();
    });
    expect(screen.getByText(/by Alice/)).toBeInTheDocument();
    expect(screen.getByText(/(weight: 1)/)).toBeInTheDocument();
  });

  it('renders select with available personal goals', async () => {
    setup();
    render(<GoalLinkManager companyGoalId="company-1" onUpdate={onUpdate} />);

    await waitFor(() => {
      expect(screen.getByText('Linked Individual Goals')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    // The available goal option
    await waitFor(() => {
      expect(screen.getByText(/Individual Goal B/)).toBeInTheDocument();
    });
  });

  it('adds a link when a goal is selected and add button clicked', async () => {
    setup();
    const user = userEvent.setup();
    render(<GoalLinkManager companyGoalId="company-1" onUpdate={onUpdate} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Wait for available goals to load
    await waitFor(() => {
      expect(screen.getByText(/Individual Goal B/)).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole('combobox'), 'goal-2');

    // Click the add button (the Plus button with indigo-600 bg)
    const addButton = screen.getAllByRole('button').find(
      (btn) => btn.className.includes('bg-indigo-600')
    )!;
    await user.click(addButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/goals/company-1/link'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('removes a link when delete button is clicked', async () => {
    setup();
    const user = userEvent.setup();
    render(<GoalLinkManager companyGoalId="company-1" onUpdate={onUpdate} />);

    await waitFor(() => {
      expect(screen.getByText('Individual Goal A')).toBeInTheDocument();
    });

    // There's a delete button (Trash2 icon) next to each link
    const deleteButtons = screen.getAllByRole('button');
    // The last button in the link row is the delete button
    const deleteBtn = deleteButtons.find((btn) =>
      btn.closest('[class*="justify-between"]')
    );
    if (deleteBtn) {
      await user.click(deleteBtn);
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/goals/company-1/link?linkId=link-1'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    }
  });
});
