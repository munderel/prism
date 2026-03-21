'use client';

import { SessionProvider } from 'next-auth/react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Sidebar />
      <div className="lg:ml-64">
        <TopBar />
        <main className="p-6">{children}</main>
      </div>
    </SessionProvider>
  );
}
