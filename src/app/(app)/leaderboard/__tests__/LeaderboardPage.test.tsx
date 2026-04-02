import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import LeaderboardPage from '../page';

describe('LeaderboardPage', () => {
  it('renders leaderboard entries from SWR data', async () => {
    renderWithProviders(<LeaderboardPage />, {
      swrData: {
        '/api/leaderboard': {
          leaderboard: [
            {
              id: 'user-1',
              name: 'Munder',
              streak: 5,
              tasksCompleted: 12,
              reviewsCompleted: 3,
              aimScore: 20,
              score: 52,
            },
          ],
          publicWins: [],
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Munder')).toBeInTheDocument();
    });
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
  });

  it('shows an empty state when no users are visible on the leaderboard', async () => {
    renderWithProviders(<LeaderboardPage />, {
      swrData: {
        '/api/leaderboard': {
          leaderboard: [],
          publicWins: [],
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('No leaderboard entries yet')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Team members will appear here once leaderboard visibility is enabled in settings/i)
    ).toBeInTheDocument();
  });
});
