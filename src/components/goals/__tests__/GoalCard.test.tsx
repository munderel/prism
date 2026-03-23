import { vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '@/test/utils';
import { createGoal } from '@/test/fixtures';
import { GoalCard } from '../GoalCard';

const defaultProps = () => ({
  depth: 0,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onAddChild: vi.fn(),
});

describe('GoalCard', () => {
  it('renders goal title', () => {
    const goal = createGoal({ title: 'Ship v2' });
    renderWithProviders(<GoalCard goal={goal} {...defaultProps()} />);
    expect(screen.getByText('Ship v2')).toBeInTheDocument();
  });

  it('renders correct level badge label (STRATEGIC → Yearly)', () => {
    const goal = createGoal({ level: 'STRATEGIC' });
    renderWithProviders(<GoalCard goal={goal} {...defaultProps()} />);
    expect(screen.getByText('Yearly')).toBeInTheDocument();
  });

  it('renders HHG badge for HIGH_HARD level', () => {
    const goal = createGoal({ level: 'HIGH_HARD' });
    renderWithProviders(<GoalCard goal={goal} {...defaultProps()} />);
    expect(screen.getByText('HHG')).toBeInTheDocument();
  });

  it('shows "5-10 Year Goal" italic text for HIGH_HARD', () => {
    const goal = createGoal({ level: 'HIGH_HARD' });
    renderWithProviders(<GoalCard goal={goal} {...defaultProps()} />);
    const el = screen.getByText('5-10 Year Goal');
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass('italic');
  });

  it('does NOT show "5-10 Year Goal" for non-HIGH_HARD', () => {
    const goal = createGoal({ level: 'STRATEGIC' });
    renderWithProviders(<GoalCard goal={goal} {...defaultProps()} />);
    expect(screen.queryByText('5-10 Year Goal')).not.toBeInTheDocument();
  });

  it('shows add-child button for WEEKLY level', () => {
    const goal = createGoal({ level: 'WEEKLY' });
    renderWithProviders(<GoalCard goal={goal} {...defaultProps()} />);
    expect(screen.getByTitle('Add child goal')).toBeInTheDocument();
  });

  it('hides add-child button for DAILY level', () => {
    const goal = createGoal({ level: 'DAILY' });
    renderWithProviders(<GoalCard goal={goal} {...defaultProps()} />);
    expect(screen.queryByTitle('Add child goal')).not.toBeInTheDocument();
  });

  it('edit button calls onEdit with goal', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    const goal = createGoal();
    renderWithProviders(<GoalCard goal={goal} {...props} />);
    await user.click(screen.getByTitle('Edit goal'));
    expect(props.onEdit).toHaveBeenCalledWith(goal);
  });

  it('delete button calls onDelete with goal.id', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    const goal = createGoal({ id: 'goal-99' });
    renderWithProviders(<GoalCard goal={goal} {...props} />);
    await user.click(screen.getByTitle('Delete goal'));
    expect(props.onDelete).toHaveBeenCalledWith('goal-99');
  });

  it('add-child button calls onAddChild with goal', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    const goal = createGoal({ level: 'WEEKLY' });
    renderWithProviders(<GoalCard goal={goal} {...props} />);
    await user.click(screen.getByTitle('Add child goal'));
    expect(props.onAddChild).toHaveBeenCalledWith(goal);
  });

  it('shows Link icon when companyGoalLinks has entries', () => {
    const goal = createGoal({ companyGoalLinks: [{ id: 'link-1' }] });
    const { container } = renderWithProviders(<GoalCard goal={goal} {...defaultProps()} />);
    // lucide Link renders as an svg; the mock renders it as an element with the class
    // We check for the svg element from the Link icon (lucide icons render as svg)
    const linkIcon = container.querySelector('.text-indigo-400');
    expect(linkIcon).toBeInTheDocument();
  });

  it('does NOT show Link icon when companyGoalLinks is empty', () => {
    const goal = createGoal({ companyGoalLinks: [] });
    const { container } = renderWithProviders(<GoalCard goal={goal} {...defaultProps()} />);
    // The only text-indigo-400 element would be the Link icon
    const linkIcons = container.querySelectorAll('.h-3.w-3.text-indigo-400');
    expect(linkIcons.length).toBe(0);
  });

  it('applies depth-based padding (depth=2 → paddingLeft: 48px)', () => {
    const goal = createGoal();
    const { container } = renderWithProviders(
      <GoalCard goal={goal} {...defaultProps()} depth={2} />,
    );
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.style.paddingLeft).toBe('48px');
  });
});
