import '@/test/mocks';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Popover, PopoverBody } from '../Popover';

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;

function makeRect(top: number, left: number, width = 100, height = 24): DOMRect {
  return {
    top, left, width, height,
    bottom: top + height,
    right: left + width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockPopoverSize(width: number, height: number) {
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width, height,
    top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect));
}

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: h });
}

beforeEach(() => {
  setViewport(1024, 768);
});

describe('Popover', () => {
  it('positions to the right of anchor when there is room', () => {
    mockPopoverSize(288, 200);
    const anchor = makeRect(100, 100, 80, 24);
    render(
      <Popover open anchorRect={anchor} onClose={() => {}}>
        <PopoverBody>content</PopoverBody>
      </Popover>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.left).toBe('188px'); // 100 + 80 + 8
  });

  it('flips to the left when right side overflows', () => {
    mockPopoverSize(288, 200);
    const anchor = makeRect(100, 900, 80, 24);
    render(
      <Popover open anchorRect={anchor} onClose={() => {}}>
        <PopoverBody>content</PopoverBody>
      </Popover>
    );
    const dialog = screen.getByRole('dialog');
    // right side: 980 + 8 + 288 = 1276 > 1024 - 8, so flip
    // flipped: 900 - 288 - 8 = 604
    expect(dialog.style.left).toBe('604px');
  });

  it('shifts the vertical position into the viewport when the anchor is near the bottom', () => {
    mockPopoverSize(288, 200);
    const anchor = makeRect(700, 100, 80, 24); // anchor.top=700, bottom=724, viewport=768
    render(
      <Popover open anchorRect={anchor} onClose={() => {}}>
        <PopoverBody>content</PopoverBody>
      </Popover>
    );
    const dialog = screen.getByRole('dialog');
    // anchor.top + h = 700 + 200 = 900 > 768 - 8 → use anchor.bottom - h = 724 - 200 = 524
    // 524 is within [8, 768 - 200 - 8 = 560], so top = 524
    expect(dialog.style.top).toBe('524px');
  });

  it('clamps top so the popover never extends below the viewport', () => {
    mockPopoverSize(288, 600);
    const anchor = makeRect(700, 100, 80, 24);
    render(
      <Popover open anchorRect={anchor} onClose={() => {}}>
        <PopoverBody>content</PopoverBody>
      </Popover>
    );
    const dialog = screen.getByRole('dialog');
    const top = parseInt(dialog.style.top, 10);
    const maxHeight = parseInt(dialog.style.maxHeight, 10);
    expect(top + Math.min(600, maxHeight)).toBeLessThanOrEqual(768);
  });

  it('caps maxHeight to viewport - 16px', () => {
    mockPopoverSize(288, 2000);
    const anchor = makeRect(100, 100, 80, 24);
    render(
      <Popover open anchorRect={anchor} onClose={() => {}}>
        <PopoverBody>content</PopoverBody>
      </Popover>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.maxHeight).toBe('752px'); // 768 - 16
  });

  it('closes on Escape keydown', () => {
    mockPopoverSize(288, 200);
    const onClose = vi.fn();
    render(
      <Popover open anchorRect={makeRect(100, 100)} onClose={onClose}>
        <PopoverBody>content</PopoverBody>
      </Popover>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on outside mousedown', () => {
    mockPopoverSize(288, 200);
    const onClose = vi.fn();
    render(
      <div>
        <button data-testid="outside">outside</button>
        <Popover open anchorRect={makeRect(100, 100)} onClose={onClose}>
          <PopoverBody>content</PopoverBody>
        </Popover>
      </div>
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on inside mousedown', () => {
    mockPopoverSize(288, 200);
    const onClose = vi.fn();
    render(
      <Popover open anchorRect={makeRect(100, 100)} onClose={onClose}>
        <PopoverBody>content text</PopoverBody>
      </Popover>
    );
    fireEvent.mouseDown(screen.getByText('content text'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on scroll', () => {
    mockPopoverSize(288, 200);
    const onClose = vi.fn();
    render(
      <Popover open anchorRect={makeRect(100, 100)} onClose={onClose}>
        <PopoverBody>content</PopoverBody>
      </Popover>
    );
    fireEvent.scroll(window);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <Popover open={false} anchorRect={null} onClose={() => {}}>
        <PopoverBody>content</PopoverBody>
      </Popover>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when anchorRect is null', () => {
    const { container } = render(
      <Popover open anchorRect={null} onClose={() => {}}>
        <PopoverBody>content</PopoverBody>
      </Popover>
    );
    expect(container.firstChild).toBeNull();
  });
});
