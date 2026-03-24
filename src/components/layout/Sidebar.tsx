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

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/goals', label: 'Goal Stack', icon: Target },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/reviews', label: 'Reviews', icon: ClipboardCheck },
  { href: '/powerdown', label: 'Power Down', icon: Moon },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/processes', label: 'Processes', icon: ListChecks },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center justify-between px-6 border-b border-gray-800">
        <Link href="/" onClick={onClose}>
          <h1 className="text-lg font-bold text-white">
            <span className="text-indigo-400">Pr</span>ism
          </h1>
        </Link>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="mt-4 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 mb-1 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — always visible at lg+ */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-800 bg-gray-950 hidden lg:block">
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
          className={`absolute left-0 top-0 h-screen w-64 border-r border-gray-800 bg-gray-950 transition-transform duration-300 ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  );
}
