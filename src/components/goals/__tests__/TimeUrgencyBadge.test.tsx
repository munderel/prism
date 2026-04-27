import { render, screen } from '@testing-library/react';
import { TimeUrgencyBadge } from '../TimeUrgencyBadge';

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d.toISOString();
};

describe('TimeUrgencyBadge', () => {
  it('shows "overdue" for past endDate when status is IN_PROGRESS', () => {
    render(<TimeUrgencyBadge endDate={yesterday()} status="IN_PROGRESS" />);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it('renders nothing when goal is COMPLETED, even if endDate is in the past', () => {
    const { container } = render(
      <TimeUrgencyBadge endDate={yesterday()} status="COMPLETED" />,
    );
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when goal is ABANDONED, even if endDate is in the past', () => {
    const { container } = render(
      <TimeUrgencyBadge endDate={yesterday()} status="ABANDONED" />,
    );
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "overdue" when status prop is omitted (back-compat)', () => {
    render(<TimeUrgencyBadge endDate={yesterday()} />);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });
});
