import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { GoalProgressBar } from '../GoalProgressBar';

describe('GoalProgressBar', () => {
  it('renders gradient bar for progress=10', () => {
    const { container } = renderWithProviders(<GoalProgressBar progress={10} />);
    const bar = container.querySelector('.bg-gradient-to-r');
    expect(bar).toBeInTheDocument();
  });

  it('renders gradient bar for progress=40', () => {
    const { container } = renderWithProviders(<GoalProgressBar progress={40} />);
    const bar = container.querySelector('.bg-gradient-to-r');
    expect(bar).toBeInTheDocument();
  });

  it('renders gradient bar for progress=60', () => {
    const { container } = renderWithProviders(<GoalProgressBar progress={60} />);
    const bar = container.querySelector('.bg-gradient-to-r');
    expect(bar).toBeInTheDocument();
  });

  it('renders gradient bar for progress=90', () => {
    const { container } = renderWithProviders(<GoalProgressBar progress={90} />);
    const bar = container.querySelector('.bg-gradient-to-r');
    expect(bar).toBeInTheDocument();
  });

  it('shows label when showLabel=true', () => {
    renderWithProviders(<GoalProgressBar progress={50} showLabel />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('does not show label when showLabel=false', () => {
    renderWithProviders(<GoalProgressBar progress={50} />);
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });
});
