import { vi } from 'vitest';

// --- next-auth/react ---
let mockSession: any = {
  user: { id: 'user-1', name: 'Test User', email: 'test@example.com', image: null, isAdmin: false },
  expires: '2099-01-01',
};

export function setMockSession(session: any) {
  mockSession = session;
}

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: any) => children,
  useSession: () => ({ data: mockSession, status: mockSession ? 'authenticated' : 'unauthenticated' }),
  signOut: vi.fn(),
}));

// --- next/navigation ---
let mockPathname = '/';

export function setMockPathname(pathname: string) {
  mockPathname = pathname;
}

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// --- next/image ---
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    const { fill, priority, ...rest } = props;
    return <img {...rest} />;
  },
}));

// --- next/link ---
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// --- @fullcalendar/react ---
vi.mock('@fullcalendar/react', () => ({
  __esModule: true,
  default: () => <div data-testid="fullcalendar" />,
}));

// --- @fullcalendar plugins ---
vi.mock('@fullcalendar/daygrid', () => ({ __esModule: true, default: {} }));
vi.mock('@fullcalendar/timegrid', () => ({ __esModule: true, default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ __esModule: true, default: {} }));
vi.mock('@fullcalendar/google-calendar', () => ({ __esModule: true, default: {} }));

// --- driver.js ---
vi.mock('driver.js', () => ({
  driver: () => ({
    drive: vi.fn(),
    destroy: vi.fn(),
    setConfig: vi.fn(),
  }),
}));

// --- canvas-confetti ---
vi.mock('canvas-confetti', () => ({
  __esModule: true,
  default: vi.fn(),
}));
