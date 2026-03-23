import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockFetch } from '@/test/utils';
import { createStack } from '@/test/fixtures';
import GoalsPage from '../page';

// Mock dynamic import of GoalStackTree
vi.mock('@/components/goals/GoalStackTree', () => ({
  GoalStackTree: (props: any) => (
    <div data-testid="goal-stack-tree" data-stack-id={props.stackId} />
  ),
}));

// Mock YamlImportExport
vi.mock('@/components/goals/YamlImportExport', () => ({
  YamlImportExport: () => <div data-testid="yaml-import-export" />,
}));

const stacks = [
  createStack({ id: 'stack-1', name: 'Q1 Goals', isCompany: true, _count: { goals: 5 } }),
  createStack({ id: 'stack-2', name: 'Personal', isCompany: false, _count: { goals: 3 } }),
];

function renderPage(stackData: any[] = stacks) {
  return renderWithProviders(<GoalsPage />, {
    swrData: {
      '/api/stacks': stackData,
    },
  });
}

describe('GoalsPage', () => {
  it('renders stack tabs from SWR data', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Q1 Goals')).toBeInTheDocument();
    });
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('auto-selects first stack and renders GoalStackTree', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('goal-stack-tree')).toBeInTheDocument();
    });
    expect(screen.getByTestId('goal-stack-tree')).toHaveAttribute('data-stack-id', 'stack-1');
  });

  it('switches stack when another tab is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Personal'));

    await waitFor(() => {
      expect(screen.getByTestId('goal-stack-tree')).toHaveAttribute('data-stack-id', 'stack-2');
    });
  });

  it('shows "+ New Stack" button and opens form on click', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('+ New Stack')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ New Stack'));

    await waitFor(() => {
      expect(screen.getByText('Create New Stack')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Stack name')).toBeInTheDocument();
  });

  it('shows empty state when no stacks exist', async () => {
    renderPage([]);

    await waitFor(() => {
      expect(screen.getByText(/No goal stacks yet/)).toBeInTheDocument();
    });
    expect(screen.getByText('Create Your First Stack')).toBeInTheDocument();
  });

  it('shows goal count in stack tabs', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('(5)')).toBeInTheDocument();
    });
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

  it('renders page title', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Goal Stack')).toBeInTheDocument();
    });
  });
});
