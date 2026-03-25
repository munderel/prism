import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { StreakCounter } from '../StreakCounter';

// Mock framer-motion so m.div/span render as plain elements
vi.mock('framer-motion', () => ({
  m: {
    div: ({ children, ...props }: any) => {
      const { animate, transition, whileHover, whileTap, initial, exit, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
    span: ({ children, ...props }: any) => {
      const { animate, transition, whileHover, whileTap, initial, exit, ...rest } = props;
      return <span {...rest}>{children}</span>;
    },
  },
  LazyMotion: ({ children }: any) => <>{children}</>,
  domAnimation: {},
}));

describe('StreakCounter', () => {
  it('shows 0 day streak when no streak data exists', async () => {
    renderWithProviders(<StreakCounter />, { swrData: { '/api/streaks': [] } });

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });

  it('shows correct streak count from API', async () => {
    renderWithProviders(<StreakCounter />, {
      swrData: {
        '/api/streaks': [
          { streakType: 'daily_completion', currentCount: 7 },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });

  it('applies at-risk styling when atRisk prop is true', async () => {
    const { container } = renderWithProviders(<StreakCounter atRisk={true} />, {
      swrData: {
        '/api/streaks': [
          { streakType: 'daily_completion', currentCount: 3 },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('border-orange-600');
  });

  it('filters by streakType prop', async () => {
    renderWithProviders(<StreakCounter streakType="weekly_review" />, {
      swrData: {
        '/api/streaks': [
          { streakType: 'daily_completion', currentCount: 3 },
          { streakType: 'weekly_review', currentCount: 12 },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });
  });
});
