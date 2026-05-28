/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, createMockFetch, userEvent } from '@/test/utils';
import { createTask } from '@/test/fixtures';
import { TaskEditor } from '../TaskEditor';

// Mock SWR mutate so we can verify it gets called
vi.mock('swr', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, mutate: vi.fn() };
});

import { mutate } from 'swr';

const mockMutate = vi.mocked(mutate);

function buildTask(items: Array<{ id: string; text: string; isDone: boolean; position: number }> = []) {
  return createTask({
    id: 'task-42',
    title: 'My Task',
    deliverableItems: items,
    assigneeId: null,
    assignee: null,
  });
}

/**
 * Build a routes map for createMockFetch. Overrides are placed FIRST so that
 * more-specific patterns beat the generic fallbacks — createMockFetch stops at
 * the first url.includes(pattern) match and iterates in insertion order.
 */
function baseRoutes(overrides: Record<string, any> = {}) {
  return {
    ...overrides,
    '/api/users': [],
    // Generic task route last — longest pattern wins when overrides are set first
    '/api/tasks/task-42': { id: 'task-42' },
  };
}

describe('TaskEditor — Deliverable Items section', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    onSave.mockReset();
    onClose.mockReset();
    mockMutate.mockReset();
  });

  it('shows Deliverable Items section in create mode', () => {
    global.fetch = createMockFetch(baseRoutes()) as any;
    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Deliverable Items')).toBeInTheDocument();
    expect(screen.getByText('Add item')).toBeInTheDocument();
  });

  it('buffers items locally in create mode and flushes them in POST /api/tasks', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.startsWith('/api/users')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.startsWith('/api/stacks')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.startsWith('/api/goals')) return new Response(JSON.stringify([]), { status: 200 });
      if (url === '/api/tasks' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'task-new' }), { status: 201 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchSpy as any;

    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);

    // Switch to REACT to avoid the goal-selection requirement
    await user.click(screen.getByRole('button', { name: 'React' }));

    // Buffer two deliverables locally
    await user.click(screen.getByText('Add item'));
    await user.type(screen.getByPlaceholderText('Deliverable item text…'), 'First');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await user.click(screen.getByText('Add item'));
    await user.type(screen.getByPlaceholderText('Deliverable item text…'), 'Second');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // No deliverables-endpoint call yet (still in create mode)
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/deliverables'),
      expect.anything(),
    );

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    // Fill required fields and submit
    await user.type(screen.getByPlaceholderText('What needs to be done?'), 'My new task');
    await user.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/tasks',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const createCall = fetchSpy.mock.calls.find(
      ([url, opts]) => url === '/api/tasks' && (opts as RequestInit | undefined)?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    const body = JSON.parse((createCall![1] as RequestInit).body as string);
    expect(body.deliverableItems).toEqual([{ text: 'First' }, { text: 'Second' }]);
  });

  it('removes a buffered item locally in create mode without calling the API', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.startsWith('/api/users')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.startsWith('/api/goals')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.startsWith('/api/stacks')) return new Response(JSON.stringify([]), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchSpy as any;

    renderWithProviders(<TaskEditor onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText('Add item'));
    await user.type(screen.getByPlaceholderText('Deliverable item text…'), 'Temp');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Temp')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Delete item'));

    expect(screen.queryByText('Temp')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/deliverables'),
      expect.anything(),
    );
  });

  it('shows Deliverable Items section in edit mode', () => {
    global.fetch = createMockFetch(baseRoutes()) as any;
    renderWithProviders(<TaskEditor task={buildTask()} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Deliverable Items')).toBeInTheDocument();
  });

  it('renders existing items with checkboxes', () => {
    global.fetch = createMockFetch(baseRoutes()) as any;
    const task = buildTask([
      { id: 'di-1', text: 'Write tests', isDone: false, position: 0 },
      { id: 'di-2', text: 'Deploy', isDone: true, position: 1 },
    ]);
    renderWithProviders(<TaskEditor task={task} onSave={onSave} onClose={onClose} />);

    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });

  it('renders Add item button', () => {
    global.fetch = createMockFetch(baseRoutes()) as any;
    renderWithProviders(<TaskEditor task={buildTask()} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Add item')).toBeInTheDocument();
  });

  it('shows input row when "Add item" is clicked', async () => {
    const user = userEvent.setup();
    global.fetch = createMockFetch(baseRoutes()) as any;
    renderWithProviders(<TaskEditor task={buildTask()} onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText('Add item'));
    expect(screen.getByPlaceholderText('Deliverable item text…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    // Two Cancel buttons: deliverables inline + main form footer
    expect(screen.getAllByRole('button', { name: 'Cancel' }).length).toBeGreaterThanOrEqual(1);
  });

  it('cancels adding item when Cancel is clicked', async () => {
    const user = userEvent.setup();
    global.fetch = createMockFetch(baseRoutes()) as any;
    renderWithProviders(<TaskEditor task={buildTask()} onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText('Add item'));
    // There are multiple Cancel buttons (deliverables inline + main form footer).
    // The deliverables inline Cancel comes first in the DOM (section is above footer).
    const cancelBtns = screen.getAllByRole('button', { name: 'Cancel' });
    await user.click(cancelBtns[0]);

    expect(screen.queryByPlaceholderText('Deliverable item text…')).not.toBeInTheDocument();
    expect(screen.getByText('Add item')).toBeInTheDocument();
  });

  it('POSTs to deliverables endpoint when Add button clicked', async () => {
    const user = userEvent.setup();
    const newItem = { id: 'di-new', text: 'Write docs', isDone: false, position: 0 };
    // More specific pattern must come first so it matches before '/api/tasks/task-42'
    global.fetch = createMockFetch(baseRoutes({
      '/api/tasks/task-42/deliverables': newItem,
    })) as any;

    renderWithProviders(<TaskEditor task={buildTask()} onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText('Add item'));
    await user.type(screen.getByPlaceholderText('Deliverable item text…'), 'Write docs');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tasks/task-42/deliverables',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // Item appears in the list
    await waitFor(() => {
      expect(screen.getByText('Write docs')).toBeInTheDocument();
    });
  });

  it('PATCHes deliverable endpoint on checkbox toggle', async () => {
    const user = userEvent.setup();
    const item = { id: 'di-1', text: 'Write tests', isDone: false, position: 0 };
    global.fetch = createMockFetch(baseRoutes({
      '/api/deliverables/di-1': { ...item, isDone: true },
    })) as any;

    renderWithProviders(<TaskEditor task={buildTask([item])} onSave={onSave} onClose={onClose} />);

    const checkbox = screen.getByLabelText('Mark done');
    await user.click(checkbox);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/deliverables/di-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isDone: true }),
        }),
      );
    });
  });

  it('DELETEs deliverable endpoint when X is clicked', async () => {
    const user = userEvent.setup();
    const item = { id: 'di-1', text: 'Write tests', isDone: false, position: 0 };
    global.fetch = createMockFetch(baseRoutes({
      '/api/deliverables/di-1': null,
    })) as any;

    renderWithProviders(<TaskEditor task={buildTask([item])} onSave={onSave} onClose={onClose} />);

    // Hover the item row to reveal the delete button, then click it
    const deleteBtn = screen.getByLabelText('Delete item');
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/deliverables/di-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    // Item removed from the list
    await waitFor(() => {
      expect(screen.queryByText('Write tests')).not.toBeInTheDocument();
    });
  });

  it('calls mutate after adding an item', async () => {
    const user = userEvent.setup();
    const newItem = { id: 'di-new', text: 'New item', isDone: false, position: 0 };
    global.fetch = createMockFetch(baseRoutes({
      '/api/tasks/task-42/deliverables': newItem,
    })) as any;

    renderWithProviders(<TaskEditor task={buildTask()} onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText('Add item'));
    await user.type(screen.getByPlaceholderText('Deliverable item text…'), 'New item');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled();
    });
  });

  it('surfaces an error when add fails', async () => {
    const user = userEvent.setup();
    // 500 response on POST → handler should setError instead of failing silently.
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.startsWith('/api/users')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.startsWith('/api/goals')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes('/deliverables') && opts?.method === 'POST') {
        return new Response('boom', { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as any;

    renderWithProviders(<TaskEditor task={buildTask()} onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText('Add item'));
    await user.type(screen.getByPlaceholderText('Deliverable item text…'), 'Will fail');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to add deliverable item')).toBeInTheDocument();
    });
  });
});
