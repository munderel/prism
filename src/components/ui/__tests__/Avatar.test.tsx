import '@/test/mocks';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Avatar } from '../Avatar';

describe('Avatar', () => {
  describe('image present', () => {
    it('renders an <img> with the provided URL', () => {
      render(<Avatar user={{ name: 'Alice Doe', image: 'https://example.com/alice.jpg' }} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg');
    });

    it('sets alt and title from name', () => {
      render(<Avatar user={{ name: 'Alice Doe', image: 'https://example.com/alice.jpg' }} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'Alice Doe');
      expect(img).toHaveAttribute('title', 'Alice Doe');
    });

    it('falls back to "User" for alt/title when name is null', () => {
      render(<Avatar user={{ name: null, image: 'https://example.com/anon.jpg' }} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'User');
    });
  });

  describe('initials fallback', () => {
    it('shows two initials for a full name', () => {
      render(<Avatar user={{ name: 'Alice Doe', image: null }} />);
      expect(screen.getByText('AD')).toBeInTheDocument();
    });

    it('shows one initial for a single-word name', () => {
      render(<Avatar user={{ name: 'Alice', image: null }} />);
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('uses first and last word initials for names with more than two words', () => {
      render(<Avatar user={{ name: 'Alice Marie Doe', image: null }} />);
      expect(screen.getByText('AD')).toBeInTheDocument();
    });

    it('renders "?" when name is null', () => {
      render(<Avatar user={{ name: null, image: null }} />);
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('renders "?" when name is empty string', () => {
      render(<Avatar user={{ name: '', image: null }} />);
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('renders "?" when name is whitespace only', () => {
      render(<Avatar user={{ name: '   ', image: null }} />);
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('uppercases initials', () => {
      render(<Avatar user={{ name: 'alice doe', image: null }} />);
      expect(screen.getByText('AD')).toBeInTheDocument();
    });

    it('sets title to the name', () => {
      render(<Avatar user={{ name: 'Alice Doe', image: null }} />);
      const el = screen.getByTitle('Alice Doe');
      expect(el).toBeInTheDocument();
    });

    it('sets title to "User" when name is null', () => {
      render(<Avatar user={{ name: null, image: null }} />);
      const el = screen.getByTitle('User');
      expect(el).toBeInTheDocument();
    });
  });

  describe('size prop', () => {
    it('applies "sm" preset as 20px', () => {
      render(<Avatar user={{ name: 'A', image: null }} size="sm" />);
      const el = screen.getByTitle('A');
      expect(el).toHaveStyle({ width: '20px', height: '20px' });
    });

    it('applies "md" preset as 32px (default)', () => {
      render(<Avatar user={{ name: 'A', image: null }} />);
      const el = screen.getByTitle('A');
      expect(el).toHaveStyle({ width: '32px', height: '32px' });
    });

    it('applies "lg" preset as 40px', () => {
      render(<Avatar user={{ name: 'A', image: null }} size="lg" />);
      const el = screen.getByTitle('A');
      expect(el).toHaveStyle({ width: '40px', height: '40px' });
    });

    it('applies a numeric size in px', () => {
      render(<Avatar user={{ name: 'A', image: null }} size={24} />);
      const el = screen.getByTitle('A');
      expect(el).toHaveStyle({ width: '24px', height: '24px' });
    });
  });

  describe('className prop', () => {
    it('passes className to the rendered element', () => {
      render(<Avatar user={{ name: 'A', image: null }} className="my-custom-class" />);
      const el = screen.getByTitle('A');
      expect(el).toHaveClass('my-custom-class');
    });
  });
});
