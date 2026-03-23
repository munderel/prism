import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, createMockFetch, userEvent } from '@/test/utils';
import { createComment } from '@/test/fixtures';
import { TaskComments } from '../TaskComments';

describe('TaskComments', () => {
  const taskId = 'task-1';

  beforeEach(() => {
    global.fetch = createMockFetch({
      '/api/tasks/task-1/comments': [],
    }) as any;
  });

  it('shows "No comments yet." when there are no comments', async () => {
    renderWithProviders(<TaskComments taskId={taskId} />);
    await waitFor(() => {
      expect(screen.getByText('No comments yet.')).toBeInTheDocument();
    });
  });

  it('renders comments when they exist', async () => {
    const comments = [
      createComment({ id: 'c-1', content: 'Looks good!', author: { id: 'user-1', name: 'Alice', email: 'a@test.com', image: null } }),
      createComment({ id: 'c-2', content: 'Nice work', author: { id: 'user-2', name: 'Bob', email: 'b@test.com', image: null } }),
    ];
    global.fetch = createMockFetch({
      '/api/tasks/task-1/comments': comments,
    }) as any;

    renderWithProviders(<TaskComments taskId={taskId} />);
    await waitFor(() => {
      expect(screen.getByText('Looks good!')).toBeInTheDocument();
      expect(screen.getByText('Nice work')).toBeInTheDocument();
    });
  });

  it('shows comment input with placeholder', async () => {
    renderWithProviders(<TaskComments taskId={taskId} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Add a comment/)).toBeInTheDocument();
    });
  });

  it('sends comment on Enter key', async () => {
    const user = userEvent.setup();
    let postCalled = false;
    global.fetch = createMockFetch({
      '/api/tasks/task-1/comments': (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          postCalled = true;
          return { id: 'c-new' };
        }
        return [];
      },
    }) as any;

    renderWithProviders(<TaskComments taskId={taskId} />);
    const input = await screen.findByPlaceholderText(/Add a comment/);
    await user.type(input, 'Hello team{Enter}');

    await waitFor(() => {
      expect(postCalled).toBe(true);
    });
  });

  it('does not send comment on Shift+Enter', async () => {
    const user = userEvent.setup();
    global.fetch = createMockFetch({
      '/api/tasks/task-1/comments': [],
    }) as any;

    renderWithProviders(<TaskComments taskId={taskId} />);
    const input = await screen.findByPlaceholderText(/Add a comment/);
    await user.type(input, 'Partial message{Shift>}{Enter}{/Shift}');

    // The input should still contain text (not cleared by send)
    expect(input).toHaveValue('Partial message');
  });

  it('triggers @mention search when typing @', async () => {
    const user = userEvent.setup();
    let searchCalled = false;
    global.fetch = createMockFetch({
      '/api/tasks/task-1/comments': [],
      '/api/users/search': () => {
        searchCalled = true;
        return [{ id: 'u-2', name: 'Jane Doe', email: 'jane@test.com', image: null }];
      },
    }) as any;

    renderWithProviders(<TaskComments taskId={taskId} />);
    const input = await screen.findByPlaceholderText(/Add a comment/);
    await user.type(input, '@jane');

    await waitFor(() => {
      expect(searchCalled).toBe(true);
    }, { timeout: 3000 });
  });

  it('shows mention results dropdown', async () => {
    const user = userEvent.setup();
    global.fetch = createMockFetch({
      '/api/tasks/task-1/comments': [],
      '/api/users/search': [{ id: 'u-2', name: 'Jane Doe', email: 'jane@test.com', image: null }],
    }) as any;

    renderWithProviders(<TaskComments taskId={taskId} />);
    const input = await screen.findByPlaceholderText(/Add a comment/);
    await user.type(input, '@jane');

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows delete button on own comments', async () => {
    const comments = [
      createComment({ id: 'c-1', content: 'My comment', authorId: 'user-1' }),
    ];
    global.fetch = createMockFetch({
      '/api/tasks/task-1/comments': comments,
    }) as any;

    renderWithProviders(<TaskComments taskId={taskId} />);
    await waitFor(() => {
      expect(screen.getByText('My comment')).toBeInTheDocument();
    });
    // The delete button exists (though it may be visually hidden via opacity)
    const deleteButtons = document.querySelectorAll('button');
    const trashButton = Array.from(deleteButtons).find(btn =>
      btn.querySelector('.lucide-trash-2') || btn.classList.contains('group-hover:opacity-100')
    );
    expect(trashButton).toBeDefined();
  });

  it('shows "Comments" heading', async () => {
    renderWithProviders(<TaskComments taskId={taskId} />);
    expect(screen.getByText('Comments')).toBeInTheDocument();
  });
});
