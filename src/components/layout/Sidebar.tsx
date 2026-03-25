'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { X, Sun, Moon as MoonIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Target,
  CheckSquare,
  Lightbulb,
  Calendar,
  ClipboardCheck,
  Moon,
  Trophy,
  BarChart3,
  ListChecks,
  Settings,
} from 'lucide-react';
import { StreakCounter } from '@/components/dopamine/StreakCounter';
import { useEffect, useState } from 'react';

const navSections = [
  {
    label: 'Work',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/goals', label: 'Goal Stack', icon: Target },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/ideas', label: 'Ideas', icon: Lightbulb },
    ],
  },
  {
    label: 'Rituals',
    items: [
      { href: '/calendar', label: 'Calendar', icon: Calendar },
      { href: '/reviews', label: 'Reviews', icon: ClipboardCheck },
      { href: '/powerdown', label: 'Power Down', icon: Moon },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/processes', label: 'Processes', icon: ListChecks },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex h-16 items-center justify-between px-6 border-b border-[var(--border-color)]">
        <Link href="/" onClick={onClose}>
          <h1 className="text-lg font-bold font-display prism-text">
            Prism
          </h1>
        </Link>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="mt-4 px-3 flex-1">
        {navSections.map((section, idx) => (
          <div key={section.label} className={idx > 0 ? 'mt-6' : ''}>
            <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              {section.label}
            </span>
            <div className="mt-2">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 mb-0.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'nav-active-indicator bg-[var(--hover-bg)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <item.icon className={`h-5 w-5 ${isActive ? 'text-prism-indigo' : ''}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-4 pb-4 border-t border-[var(--border-color)] pt-4 space-y-3">
        <StreakCounter />
        {mounted && (
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <MoonIcon className="h-4 w-4" />
            )}
            {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — always visible at lg+ */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-[var(--border-color)] bg-[var(--surface)] backdrop-blur-xl hidden lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar — slide-in drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        {/* Drawer */}
        <aside
          className={`absolute left-0 top-0 h-screen w-64 border-r border-[var(--border-color)] bg-[var(--surface)] backdrop-blur-xl transition-transform duration-300 ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  );
}
