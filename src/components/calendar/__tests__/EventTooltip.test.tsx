import { describe, it, expect } from 'vitest';
import { buildTooltipEl } from '../EventTooltip';

describe('buildTooltipEl', () => {
  it('returns an HTMLElement for an event with assignee data', () => {
    const el = buildTooltipEl({
      title: 'Ship Partial 1',
      extendedProps: {
        assignee: { id: 'u1', name: 'Munder Elgummi', image: null },
        goalTitle: 'Worth-Tracking',
      },
    });
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el?.getAttribute('data-prism-event-tooltip')).toBe('true');
  });

  it('includes the assignee name in tooltip text content', () => {
    const el = buildTooltipEl({
      title: 'Ship Partial 1',
      extendedProps: {
        assignee: { id: 'u1', name: 'Munder Elgummi', image: null },
      },
    });
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain('Munder Elgummi');
  });

  it('renders an <img> avatar when the assignee has an image', () => {
    const el = buildTooltipEl({
      title: 'Ship Partial 1',
      extendedProps: {
        assignee: { id: 'u1', name: 'Munder Elgummi', image: 'https://example.com/me.png' },
      },
    });
    expect(el).not.toBeNull();
    const img = el!.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://example.com/me.png');
  });

  it('renders an initials circle when the assignee has no image', () => {
    const el = buildTooltipEl({
      title: 'Ship Partial 1',
      extendedProps: {
        assignee: { id: 'u1', name: 'Munder Elgummi', image: null },
      },
    });
    expect(el).not.toBeNull();
    // No <img> when image is null
    expect(el!.querySelector('img')).toBeNull();
    // Initials span has "ME" for "Munder Elgummi"
    const initialsSpan = el!.querySelector('span[aria-label="Munder Elgummi"]');
    expect(initialsSpan).not.toBeNull();
    expect(initialsSpan!.textContent).toBe('ME');
  });

  it('renders all 3 attendees for a meeting event with 3 attendees', () => {
    const el = buildTooltipEl({
      title: 'Weekly Standup',
      extendedProps: {
        attendees: [
          { id: 'a', name: 'Alice Adams', image: null },
          { id: 'b', name: 'Bob Brown', image: 'https://example.com/b.png' },
          { id: 'c', name: 'Carol Chen', image: null },
        ],
        createdBy: 'Alice Adams',
      },
    });
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain('Alice Adams');
    expect(el!.textContent).toContain('Bob Brown');
    expect(el!.textContent).toContain('Carol Chen');
    // 1 image avatar (Bob), 2 initials circles (Alice, Carol)
    expect(el!.querySelectorAll('img').length).toBe(1);
    expect(el!.querySelector('img')!.getAttribute('src')).toBe('https://example.com/b.png');
    expect(el!.querySelector('span[aria-label="Alice Adams"]')).not.toBeNull();
    expect(el!.querySelector('span[aria-label="Carol Chen"]')).not.toBeNull();
  });

  it('returns null for an event with no assignee, no attendees, and no useful subtitle', () => {
    const el = buildTooltipEl({
      title: 'Lonely event',
      extendedProps: { source: 'google' },
    });
    expect(el).toBeNull();
  });

  it('returns null for an event with empty extendedProps', () => {
    const el = buildTooltipEl({ title: 'Bare', extendedProps: {} });
    expect(el).toBeNull();
  });

  it('renders a subtitle for workblock events with taskTitle even without assignee', () => {
    const el = buildTooltipEl({
      title: 'Deep work block',
      extendedProps: {
        taskTitle: 'Implement Partial 1',
      },
    });
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain('Implement Partial 1');
  });
});
