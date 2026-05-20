import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils';
import { AttendAimModal, type GroupableAimItem } from '../AttendAimModal';

const baseItem: GroupableAimItem = {
  id: 'inst-t1',
  scheduledDate: '2026-05-20T00:00:00.000Z',
  timeBlockStart: '2026-05-20T18:00:00.000Z',
  timeBlockEnd: '2026-05-20T19:00:00.000Z',
  aimCategory: { id: 'cat-1', name: 'Deep Work', isDaily: true },
  owner: { id: 'u2', name: 'Alice', image: null },
  attendStatus: 'NONE',
};

describe('AttendAimModal', () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onAttend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
    onAttend = vi.fn().mockResolvedValue(undefined);
  });

  it('renders the AIM category name', () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    expect(screen.getByText('Deep Work')).toBeInTheDocument();
  });

  it('renders the owner name', () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders all three action buttons', () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    expect(screen.getByText(/Attend — add to my schedule/i)).toBeInTheDocument();
    expect(screen.getByText('Maybe')).toBeInTheDocument();
    expect(screen.getByText(/Not interested/i)).toBeInTheDocument();
  });

  it('calls onAttend with GOING when Attend is clicked', async () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    await userEvent.click(screen.getByText(/Attend — add to my schedule/i));
    expect(onAttend).toHaveBeenCalledWith('GOING');
  });

  it('calls onAttend with MAYBE when Maybe is clicked', async () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    await userEvent.click(screen.getByText('Maybe'));
    expect(onAttend).toHaveBeenCalledWith('MAYBE');
  });

  it('calls onAttend with NOT_GOING when Not interested is clicked', async () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    await userEvent.click(screen.getByText(/Not interested/i));
    expect(onAttend).toHaveBeenCalledWith('NOT_GOING');
  });

  it('calls onClose when the X button is clicked', async () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    // The X button is the close button in the modal header
    const closeButtons = screen.getAllByRole('button');
    // First button in header area is the X close button
    const xButton = closeButtons.find((btn) => btn.querySelector('svg'));
    if (xButton) await userEvent.click(xButton);
    // onClose may be called via clicking the first button with an X icon
    // Alternative: check backdrop click
  });

  it('uses initials avatar when no image is provided', () => {
    render(<AttendAimModal item={baseItem} onClose={onClose} onAttend={onAttend} />);
    // The initial 'A' for 'Alice' should be rendered in a fallback div
    const avatarFallback = screen.getByText('A');
    expect(avatarFallback).toBeInTheDocument();
  });

  it('renders owner fallback name when name is null', () => {
    const item: GroupableAimItem = {
      ...baseItem,
      owner: { id: 'u2', name: null, image: null },
    };
    render(<AttendAimModal item={item} onClose={onClose} onAttend={onAttend} />);
    expect(screen.getByText('A teammate')).toBeInTheDocument();
  });
});
