import '@/test/mocks';
import { render } from '@testing-library/react';
import { CompletionAnimation } from '../CompletionAnimation';

describe('CompletionAnimation', () => {
  it('renders content when show=true', () => {
    const { container } = render(<CompletionAnimation show={true} />);
    const fixedEl = container.querySelector('.fixed');
    expect(fixedEl).toBeInTheDocument();
  });

  it('renders nothing when show=false', () => {
    const { container } = render(<CompletionAnimation show={false} />);
    const fixedEl = container.querySelector('.fixed');
    expect(fixedEl).not.toBeInTheDocument();
  });
});
