import '@/test/mocks';
import { render, screen } from '@testing-library/react';
import { ProgressRing } from '../ProgressRing';

describe('ProgressRing', () => {
  it('renders SVG element', () => {
    const { container } = render(<ProgressRing progress={50} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders two circle elements', () => {
    const { container } = render(<ProgressRing progress={50} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
  });

  it('displays correct percentage text (progress=73 → "73%")', () => {
    render(<ProgressRing progress={73} />);
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('displays 0% for progress=0', () => {
    render(<ProgressRing progress={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
