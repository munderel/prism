import { vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render, userEvent, createMockFetch } from '@/test/utils';
import { YamlImportExport } from '../YamlImportExport';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('YamlImportExport', () => {
  const onImportComplete = vi.fn();
  const defaultProps = {
    stackId: 'stack-1',
    stackName: 'My Stack',
    onImportComplete,
  };

  beforeEach(() => {
    onImportComplete.mockReset();
  });

  it('renders export and import buttons', () => {
    render(<YamlImportExport {...defaultProps} />);
    expect(screen.getByText('Export YAML')).toBeInTheDocument();
    expect(screen.getByText('Import YAML')).toBeInTheDocument();
  });

  it('exports YAML on click and triggers download', async () => {
    global.fetch = createMockFetch({
      '/api/stacks/stack-1/export': 'goals:\n  - title: Test Goal',
    });
    const user = userEvent.setup();

    // Mock createElement to spy on anchor creation
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: clickSpy });
      }
      return el;
    });

    render(<YamlImportExport {...defaultProps} />);
    await user.click(screen.getByText('Export YAML'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/stacks/stack-1/export'));
    });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('shows preview modal with diff after file selection', async () => {
    global.fetch = createMockFetch({
      '/api/goals/import': {
        diff: {
          added: [{ title: 'New Goal' }],
          deleted: [],
          modified: [{ title: 'Updated Goal', changes: { status: true } }],
        },
      },
    });
    const user = userEvent.setup();
    render(<YamlImportExport {...defaultProps} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['goals:\n  - title: New Goal'], 'test.yaml', { type: 'text/yaml' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('Import Preview')).toBeInTheDocument();
    });
    expect(screen.getByText(/1 new goal/)).toBeInTheDocument();
    expect(screen.getByText(/1 modified goal/)).toBeInTheDocument();
  });

  it('confirms import and calls onImportComplete', async () => {
    let callCount = 0;
    global.fetch = createMockFetch({
      '/api/goals/import': () => {
        callCount++;
        if (callCount === 1) {
          return {
            diff: { added: [{ title: 'New Goal' }], deleted: [], modified: [] },
          };
        }
        return { success: true };
      },
    });
    const user = userEvent.setup();
    render(<YamlImportExport {...defaultProps} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['goals:\n  - title: New Goal'], 'test.yaml', { type: 'text/yaml' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('Import Preview')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Confirm Import/i }));

    await waitFor(() => {
      expect(onImportComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('closes preview modal on Cancel click', async () => {
    global.fetch = createMockFetch({
      '/api/goals/import': {
        diff: { added: [{ title: 'New Goal' }], deleted: [], modified: [] },
      },
    });
    const user = userEvent.setup();
    render(<YamlImportExport {...defaultProps} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['goals:\n  - title: New Goal'], 'test.yaml', { type: 'text/yaml' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('Import Preview')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText('Import Preview')).not.toBeInTheDocument();
    });
  });

  it('shows "No changes detected" when diff is empty', async () => {
    global.fetch = createMockFetch({
      '/api/goals/import': {
        diff: { added: [], deleted: [], modified: [] },
      },
    });
    const user = userEvent.setup();
    render(<YamlImportExport {...defaultProps} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['goals: []'], 'test.yaml', { type: 'text/yaml' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('No changes detected.')).toBeInTheDocument();
    });
  });
});
