'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { X, Sun, Moon as MoonIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  LayoutDashboard,
  Target,
  CheckSquare,
  Lightbulb,
  BookOpen,
  Flame,
  Calendar,
  ClipboardCheck,
  Moon,
  Trophy,
  BarChart3,
  ListChecks,
  Settings,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { StreakCounter } from '@/components/dopamine/StreakCounter';
import { useEffect, useState, useMemo } from 'react';
import useSWR from 'swr';

const navSections = [
  {
    label: 'Work',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/goals', label: 'Goal Stack', icon: Target },
      { href: '/training', label: 'Training', icon: BookOpen },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/reactive-tasks/new', label: 'Reactive Tasks', icon: Zap },
      { href: '/ideas', label: 'Ideas', icon: Lightbulb },
    ],
  },
  {
    label: 'Rituals',
    items: [
      { href: '/aims', label: 'Aims', icon: Flame },
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
      { href: '/kpis', label: 'KPI Dashboard', icon: TrendingUp },
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { data: settings } = useSWR('/api/settings?scope=user', {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const hiddenFeatures: string[] = useMemo(() => {
    if (settings && Array.isArray(settings.hiddenFeatures)) return settings.hiddenFeatures;
    return [];
  }, [settings]);

  const filteredNavSections = useMemo(() =>
    navSections.map((section) => ({
      ...section,
      items: section.items.filter((item) => !hiddenFeatures.includes(item.href)),
    })).filter((section) => section.items.length > 0),
    [hiddenFeatures]
  );

  useEffect(() => setMounted(true), []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className={`flex h-16 items-center border-b border-[var(--border-color)] ${collapsed ? 'justify-center px-2' : 'justify-between px-6'}`}>
        {!collapsed && (
          <Link href="/" onClick={onClose}>
            <h1 className="text-lg font-bold font-display prism-text">
              Prism
            </h1>
          </Link>
        )}
        {/* Desktop collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors hidden lg:block"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className={`mt-4 flex-1 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {filteredNavSections.map((section, idx) => (
          <div key={section.label} className={idx > 0 ? 'mt-6' : ''}>
            {!collapsed && (
              <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                {section.label}
              </span>
            )}
            <div className={collapsed ? 'mt-1' : 'mt-2'}>
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center rounded-lg mb-0.5 text-sm font-medium transition-colors ${
                      collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
                    } ${
                      isActive
                        ? 'nav-active-indicator bg-[var(--hover-bg)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <item.icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-prism-indigo' : ''}`} />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className={`pb-4 border-t border-[var(--border-color)] pt-4 space-y-3 ${collapsed ? 'px-1.5' : 'px-4'}`}>
        {!collapsed && <StreakCounter />}
        {mounted && (
          <button
            onClick={toggleTheme}
            title={collapsed ? (resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
            className={`flex items-center w-full rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors ${
              collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2'
            }`}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4 flex-shrink-0" />
            ) : (
              <MoonIcon className="h-4 w-4 flex-shrink-0" />
            )}
            {!collapsed && (resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode')}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — always visible at lg+ */}
      <aside className={`fixed left-0 top-0 z-40 h-screen border-r border-[var(--border-color)] bg-[var(--surface)] backdrop-blur-xl hidden lg:block transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
        {sidebarContent}
      </aside>

      {/* Mobile sidebar — slide-in drawer (always expanded) */}
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
