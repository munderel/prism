'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import {
  LayoutDashboard,
  Target,
  CheckSquare,
  Calendar,
  ClipboardCheck,
  Moon,
  Trophy,
  BarChart3,
  ListChecks,
  Settings,
} from 'lucide-react';
import { StreakCounter } from '@/components/dopamine/StreakCounter';

const navSections = [
  {
    label: 'Work',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/goals', label: 'Goal Stack', icon: Target },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
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

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex h-16 items-center justify-between px-6 border-b border-white/[0.06]">
        <Link href="/" onClick={onClose}>
          <h1 className="text-lg font-bold font-display prism-text">
            Prism
          </h1>
        </Link>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-white/[0.05] hover:text-white transition-colors lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="mt-4 px-3 flex-1">
        {navSections.map((section, idx) => (
          <div key={section.label} className={idx > 0 ? 'mt-6' : ''}>
            <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
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
                        ? 'nav-active-indicator bg-white/[0.04] text-white'
                        : 'text-gray-400 hover:bg-white/[0.03] hover:text-white'
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
      <div className="px-4 pb-4 border-t border-white/[0.06] pt-4">
        <StreakCounter />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — always visible at lg+ */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-white/[0.06] bg-[#08081a]/90 backdrop-blur-xl hidden lg:block">
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
          className={`absolute left-0 top-0 h-screen w-64 border-r border-white/[0.06] bg-[#08081a]/95 backdrop-blur-xl transition-transform duration-300 ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  );
}
