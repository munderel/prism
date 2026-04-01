'use client';

import { SessionProvider } from 'next-auth/react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
