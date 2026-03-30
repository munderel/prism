import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockFetch } from '@/test/utils';
import { ReviewChecklist } from '../ReviewChecklist';

function makeReview(overrides: Record<string, any> = {}) {
  return {
    id: 'review-1',
    type: 'WEEKLY',
    checklistState: {},
    notes: '',
    completedAt: null,
    template: {
      checklistItems: [
        { title: 'Review goals', description: 'Check goal progress' },
        { title: 'Plan next week', description: 'Set priorities' },
        { title: 'Update progress' },
      ],
      processSteps: [
        { title: 'Reflect on the week', description: 'Think about wins and losses' },
        { title: 'Set new targets' },
      ],
    },
    ...overrides,
  };
}

function setup(review: any = makeReview()) {
  global.fetch = createMockFetch({
    '/api/reviews/': review,
  });
}

describe('ReviewChecklist', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    onComplete.mockReset();
  });

  it('shows loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    renderWithProviders(<ReviewChecklist reviewId="review-1" onComplete={onComplete} />);
    expect(screen.getByText('Loading review...')).toBeInTheDocument();
  });

  it('shows "Review not found" when fetch fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve(null) })
    );
    renderWithProviders(<ReviewChecklist reviewId="review-1" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText('Review not found.')).toBeInTheDocument();
    });
  });

  it('renders checklist items after loading', async () => {
    setup();
    renderWithProviders(<ReviewChecklist reviewId="review-1" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText('Review goals')).toBeInTheDocument();
    });
    expect(screen.getByText('Plan next week')).toBeInTheDocument();
    expect(screen.getByText('Update progress')).toBeInTheDocument();
  });

  it('renders process guide steps', async () => {
    setup();
    renderWithProviders(<ReviewChecklist reviewId="review-1" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText('Process Guide')).toBeInTheDocument();
    });
    expect(screen.getByText('Reflect on the week')).toBeInTheDocument();
    expect(screen.getByText('Set new targets')).toBeInTheDocument();
  });

  it('complete button is disabled when not all items completed', async () => {
    setup();
    renderWithProviders(<ReviewChecklist reviewId="review-1" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText(/0\/3 items completed/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /items completed/ })).toBeDisabled();
  });

  it('toggles checklist item on click and sends PATCH', async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(<ReviewChecklist reviewId="review-1" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText('Review goals')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Review goals'));

    await waitFor(() => {
      expect(screen.getByText(/1\/3 items completed/)).toBeInTheDocument();
    });
    // Verify PATCH was called
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/reviews/review-1'),
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('enables complete button and calls onComplete when all items completed', async () => {
    const review = makeReview({
      checklistState: {
        'Review goals': true,
        'Plan next week': true,
        'Update progress': true,
      },
    });
    setup(review);
    const user = userEvent.setup();
    renderWithProviders(<ReviewChecklist reviewId="review-1" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Complete Review/ })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /Complete Review/ }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('renders notes textarea with existing notes', async () => {
    setup(makeReview({ notes: 'My weekly notes' }));
    renderWithProviders(<ReviewChecklist reviewId="review-1" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Reflections/)).toHaveValue('My weekly notes');
    });
  });
});
