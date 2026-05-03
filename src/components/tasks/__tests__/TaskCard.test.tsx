import { vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '@/test/utils';
import { createTask } from '@/test/fixtures';
import { TaskCard } from '../TaskCard';

const defaultProps = () => ({
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onClick: vi.fn(),
});

describe('TaskCard', () => {
  it('renders task title and status badge text', () => {
    const task = createTask({ title: 'My Task', status: 'IN_PROGRESS' });
    renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    expect(screen.getByText('My Task')).toBeInTheDocument();
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
  });

  it('DONE task shows line-through class on title', () => {
    const task = createTask({ status: 'DONE' });
    renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    const title = screen.getByText('Test Task');
    expect(title).toHaveClass('line-through');
  });

  it('DONE task checkbox has green classes', () => {
    const task = createTask({ status: 'DONE' });
    const { container } = renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    const checkbox = container.querySelector('button');
    expect(checkbox).toHaveClass('bg-green-600');
    expect(checkbox).toHaveClass('border-green-600');
  });

  it('TODO task checkbox does not have green classes', () => {
    const task = createTask({ status: 'TODO' });
    const { container } = renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    const checkbox = container.querySelector('button');
    expect(checkbox).not.toHaveClass('bg-green-600');
    expect(checkbox).not.toHaveClass('border-green-600');
  });

  it('checkbox click calls onToggle with the task', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    const task = createTask();
    const { container } = renderWithProviders(<TaskCard task={task} {...props} />);
    const checkbox = container.querySelector('button')!;
    await user.click(checkbox);
    expect(props.onToggle).toHaveBeenCalledWith(task);
  });

  it('checkbox click does NOT call onClick (stopPropagation)', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    const task = createTask();
    const { container } = renderWithProviders(<TaskCard task={task} {...props} />);
    const checkbox = container.querySelector('button')!;
    await user.click(checkbox);
    expect(props.onClick).not.toHaveBeenCalled();
  });

  it('card body click calls onClick', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    const task = createTask();
    renderWithProviders(<TaskCard task={task} {...props} />);
    const title = screen.getByText('Test Task');
    await user.click(title);
    expect(props.onClick).toHaveBeenCalledWith(task);
  });

  it('edit button calls onEdit with the task', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    const task = createTask();
    renderWithProviders(<TaskCard task={task} {...props} />);
    await user.click(screen.getByTitle('Edit task'));
    expect(props.onEdit).toHaveBeenCalledWith(task);
  });

  it('delete button calls onDelete with task.id', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    const task = createTask({ id: 'task-42' });
    renderWithProviders(<TaskCard task={task} {...props} />);
    await user.click(screen.getByTitle('Delete task'));
    expect(props.onDelete).toHaveBeenCalledWith('task-42');
  });

  it('overdue date has text-red-400 class', () => {
    const task = createTask({
      status: 'TODO',
      dueDate: '2020-01-01T00:00:00.000Z',
    });
    renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    // TaskCard formats the date-only YYYY-MM-DD via formatDateOnly (UTC-anchored
    // en-US numeric) so the displayed calendar date is identical in any TZ.
    const dateEl = screen.getByText(
      new Date('2020-01-01T00:00:00.000Z').toLocaleDateString('en-US', {
        year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
      }),
    );
    expect(dateEl).toHaveClass('text-red-400');
  });

  it('non-overdue date has muted class', () => {
    const task = createTask({
      status: 'TODO',
      dueDate: '2099-12-31T00:00:00.000Z',
    });
    renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    const dateEl = screen.getByText(
      new Date('2099-12-31T00:00:00.000Z').toLocaleDateString('en-US', {
        year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
      }),
    );
    expect(dateEl).toHaveClass('text-[var(--text-muted)]');
  });

  it('shows recurring icon when recurrenceRule is set', () => {
    const task = createTask({ recurrenceRule: 'FREQ=DAILY' });
    renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    expect(screen.getByTitle('Recurring')).toBeInTheDocument();
  });

  it('shows goal icon when task.goal exists', () => {
    const task = createTask({ goal: { title: 'My Goal' } });
    renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    expect(screen.getByTitle('My Goal')).toBeInTheDocument();
  });

  it('shows comment count when _count.comments > 0', () => {
    const task = createTask({ _count: { comments: 5 } });
    renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows deliverable text', () => {
    const task = createTask({ deliverable: 'Final report' });
    renderWithProviders(<TaskCard task={task} {...defaultProps()} />);
    expect(screen.getByText(/→ Final report/)).toBeInTheDocument();
  });
});
