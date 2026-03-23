'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-800 bg-gray-950 hidden lg:block">
      <div className="flex h-16 items-center px-6 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">
          <span className="text-indigo-400">Pr</span>ism
        </h1>
      </div>
      <nav className="mt-4 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
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
    </aside>
  );
}
