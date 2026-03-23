import '@/test/mocks';
import { setMockSession } from '@/test/mocks';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { signOut } from 'next-auth/react';
import userEvent from '@testing-library/user-event';
import { TopBar } from '../TopBar';

describe('TopBar', () => {
  it('shows the user name when session exists', () => {
    setMockSession({
      user: { id: 'user-1', name: 'John Doe', email: 'john@test.com', image: null, isAdmin: false },
      expires: '2099-01-01',
    });
    render(<TopBar />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('shows user image when provided', () => {
    setMockSession({
      user: { id: 'user-1', name: 'John', email: 'john@test.com', image: 'https://example.com/avatar.png', isAdmin: false },
      expires: '2099-01-01',
    });
    render(<TopBar />);
    // Image has alt="" so it's role="presentation"
    const img = document.querySelector('img[src="https://example.com/avatar.png"]');
    expect(img).toBeInTheDocument();
  });

  it('shows "Sign out" button', () => {
    setMockSession({
      user: { id: 'user-1', name: 'John', email: 'john@test.com', image: null, isAdmin: false },
      expires: '2099-01-01',
    });
    render(<TopBar />);
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('calls signOut when Sign out button is clicked', async () => {
    const user = userEvent.setup();
    setMockSession({
      user: { id: 'user-1', name: 'John', email: 'john@test.com', image: null, isAdmin: false },
      expires: '2099-01-01',
    });
    render(<TopBar />);
    await user.click(screen.getByText('Sign out'));
    expect(signOut).toHaveBeenCalled();
  });
});
