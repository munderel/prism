import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render, createMockFetch } from '@/test/utils';
import { StreakCounter } from '../StreakCounter';

// Mock framer-motion so motion.div/span render as plain elements
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { animate, transition, whileHover, whileTap, initial, exit, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
    span: ({ children, ...props }: any) => {
      const { animate, transition, whileHover, whileTap, initial, exit, ...rest } = props;
      return <span {...rest}>{children}</span>;
    },
  },
}));

describe('StreakCounter', () => {
  it('shows 0 day streak when no streak data exists', async () => {
    global.fetch = createMockFetch({ '/api/streaks': [] });
    render(<StreakCounter />);

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });

  it('shows correct streak count from API', async () => {
    global.fetch = createMockFetch({
      '/api/streaks': [
        { streakType: 'daily_completion', currentCount: 7 },
      ],
    });
    render(<StreakCounter />);

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });

  it('applies at-risk styling when atRisk prop is true', async () => {
    global.fetch = createMockFetch({
      '/api/streaks': [
        { streakType: 'daily_completion', currentCount: 3 },
      ],
    });
    const { container } = render(<StreakCounter atRisk={true} />);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
    // The outer div should have orange border styling
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('border-orange-600');
  });

  it('filters by streakType prop', async () => {
    global.fetch = createMockFetch({
      '/api/streaks': [
        { streakType: 'daily_completion', currentCount: 3 },
        { streakType: 'weekly_review', currentCount: 12 },
      ],
    });
    render(<StreakCounter streakType="weekly_review" />);

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });
  });
});
