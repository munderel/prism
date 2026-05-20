import React from 'react';
import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '@/test/utils';
import { createStack } from '@/test/fixtures';
import GoalsPage from '../page';

// Mock useToast
vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock dynamic import of GoalStackTree
vi.mock('@/components/goals/GoalStackTree', () => ({
  GoalStackTree: (props: any) => (
    <div
      data-testid="goal-stack-tree"
      data-stack-id={props.stackId}
      data-mine-filter={String(props.mineFilter ?? '')}
    />
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
      expect(screen.queryAllByText('Goal Stack').length).toBeGreaterThan(0);
    });
  });
});

describe('GoalsPage — Mine / All filter (company stack)', () => {
  const companyStack = createStack({ id: 'co-stack', name: 'Company Goals', isCompany: true, visibility: 'company', _count: { goals: 2 } });
  const personalStack = createStack({ id: 'pe-stack', name: 'Personal', isCompany: false, visibility: 'private', _count: { goals: 1 } });

  it('shows the Mine/All toggle when a company stack is selected', async () => {
    renderWithProviders(<GoalsPage />, { swrData: { '/api/stacks': [companyStack] } });

    await waitFor(() => {
      expect(screen.getByText('Company Goals')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Mine$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^All$/i })).toBeInTheDocument();
  });

  it('defaults to "Mine" mode (mineFilter=true) for company stacks', async () => {
    renderWithProviders(<GoalsPage />, { swrData: { '/api/stacks': [companyStack] } });

    await waitFor(() => {
      expect(screen.getByTestId('goal-stack-tree')).toBeInTheDocument();
    });
    expect(screen.getByTestId('goal-stack-tree')).toHaveAttribute('data-mine-filter', 'true');
  });

  it('switches to All mode when "All" is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoalsPage />, { swrData: { '/api/stacks': [companyStack] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^All$/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^All$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('goal-stack-tree')).toHaveAttribute('data-mine-filter', 'false');
    });
  });

  it('switches back to Mine mode when "Mine" is clicked after All', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoalsPage />, { swrData: { '/api/stacks': [companyStack] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^All$/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^All$/i }));
    await user.click(screen.getByRole('button', { name: /^Mine$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('goal-stack-tree')).toHaveAttribute('data-mine-filter', 'true');
    });
  });

  it('does not show the Mine/All toggle for a personal stack', async () => {
    renderWithProviders(<GoalsPage />, { swrData: { '/api/stacks': [personalStack] } });

    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Mine$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^All$/i })).not.toBeInTheDocument();
  });
});
