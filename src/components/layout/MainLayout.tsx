'use client';

import { useEffect, useState } from 'react';
import { SessionProvider } from 'next-auth/react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { SWRProvider } from '@/app/(app)/swr-provider';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { FloatingIdeaButton } from './FloatingIdeaButton';
import { CommandPalette } from '../CommandPalette';

const SIDEBAR_COLLAPSED_KEY = 'prism-sidebar-collapsed';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === 'true') setSidebarCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  return (
    <SessionProvider>
      <SWRProvider>
        <LazyMotion features={domAnimation} strict>
          {/* Noise texture overlay */}
          <div className="noise-overlay" />

          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleCollapse}
          />
          <div className={`relative z-10 transition-all duration-200 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
            <TopBar onMenuToggle={() => setSidebarOpen(true)} />
            <main className="p-6">
              <m.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {children}
              </m.div>
            </main>
          </div>
          <FloatingIdeaButton />
          <CommandPalette />
        </LazyMotion>
      </SWRProvider>
    </SessionProvider>
  );
}
