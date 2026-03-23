import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, createMockFetch, userEvent } from '@/test/utils';
import { createGoal } from '@/test/fixtures';
import { GoalStackTree } from '../GoalStackTree';

// Mock @dnd-kit to render children without drag behavior
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div>{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  DragOverlay: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  verticalListSortingStrategy: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

describe('GoalStackTree', () => {
  const stackId = 'stack-1';

  it('shows loading state when no SWR data is provided', () => {
    renderWithProviders(
      <GoalStackTree stackId={stackId} isCompanyStack={false} isAdmin={false} />,
      { swrData: {} },
    );
    expect(screen.getByText('Loading goals...')).toBeInTheDocument();
  });

  it('shows empty state when no goals exist', async () => {
    renderWithProviders(
      <GoalStackTree stackId={stackId} isCompanyStack={false} isAdmin={false} />,
      { swrData: { '/api/goals': [] } },
    );
    await waitFor(() => {
      expect(screen.getByText(/No goals yet/)).toBeInTheDocument();
    });
    expect(screen.getByText('Create Your First Goal')).toBeInTheDocument();
  });

  it('renders goal cards when data is present', async () => {
    const goals = [
      createGoal({ id: 'g-1', title: 'Ship v1', level: 'HIGH_HARD', parentId: null }),
      createGoal({ id: 'g-2', title: 'Quarterly Plan', level: 'STRATEGIC', parentId: 'g-1' }),
    ];
    renderWithProviders(
      <GoalStackTree stackId={stackId} isCompanyStack={false} isAdmin={false} />,
      { swrData: { '/api/goals': goals } },
    );
    await waitFor(() => {
      expect(screen.getByText('Ship v1')).toBeInTheDocument();
    });
    expect(screen.getByText('Quarterly Plan')).toBeInTheDocument();
  });

  it('shows "+ New Root Goal" button', async () => {
    renderWithProviders(
      <GoalStackTree stackId={stackId} isCompanyStack={false} isAdmin={false} />,
      { swrData: { '/api/goals': [] } },
    );
    await waitFor(() => {
      expect(screen.getByText('+ New Root Goal')).toBeInTheDocument();
    });
  });

  it('opens GoalEditor when "+ New Root Goal" is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GoalStackTree stackId={stackId} isCompanyStack={false} isAdmin={false} />,
      { swrData: { '/api/goals': [] } },
    );
    await waitFor(() => {
      expect(screen.getByText('+ New Root Goal')).toBeInTheDocument();
    });
    await user.click(screen.getByText('+ New Root Goal'));
    await waitFor(() => {
      expect(screen.getByText('New Goal')).toBeInTheDocument();
    });
  });

  it('opens GoalEditor when edit button is clicked', async () => {
    const user = userEvent.setup();
    const goals = [createGoal({ id: 'g-1', title: 'My Goal', level: 'HIGH_HARD', parentId: null })];
    renderWithProviders(
      <GoalStackTree stackId={stackId} isCompanyStack={false} isAdmin={false} />,
      { swrData: { '/api/goals': goals } },
    );
    await waitFor(() => {
      expect(screen.getByText('My Goal')).toBeInTheDocument();
    });
    const editBtn = screen.getByTitle('Edit goal');
    await user.click(editBtn);
    await waitFor(() => {
      expect(screen.getByText('Edit Goal')).toBeInTheDocument();
    });
  });

  it('calls confirm and DELETE when delete button is clicked', async () => {
    const user = userEvent.setup();
    window.confirm = vi.fn(() => true);
    global.fetch = createMockFetch({}) as any;

    const goals = [createGoal({ id: 'g-1', title: 'My Goal', level: 'HIGH_HARD', parentId: null })];
    renderWithProviders(
      <GoalStackTree stackId={stackId} isCompanyStack={false} isAdmin={false} />,
      { swrData: { '/api/goals': goals } },
    );
    await waitFor(() => {
      expect(screen.getByText('My Goal')).toBeInTheDocument();
    });
    const deleteBtn = screen.getByTitle('Delete goal');
    await user.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith('Delete this goal and all its children?');
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/goals/g-1', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  it('does not delete when confirm is cancelled', async () => {
    const user = userEvent.setup();
    window.confirm = vi.fn(() => false);
    global.fetch = createMockFetch({}) as any;

    const goals = [createGoal({ id: 'g-1', title: 'My Goal', level: 'HIGH_HARD', parentId: null })];
    renderWithProviders(
      <GoalStackTree stackId={stackId} isCompanyStack={false} isAdmin={false} />,
      { swrData: { '/api/goals': goals } },
    );
    await waitFor(() => {
      expect(screen.getByText('My Goal')).toBeInTheDocument();
    });
    const deleteBtn = screen.getByTitle('Delete goal');
    await user.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalledWith('/api/goals/g-1', expect.objectContaining({ method: 'DELETE' }));
  });
});
