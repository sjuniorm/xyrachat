'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import Image from 'next/image';
import {
  Users,
  Bot,
  Zap,
  BarChart3,
  UsersRound,
  Plug,
  Settings,
  LogOut,
  Inbox,
  Menu,
  X,
} from 'lucide-react';

const navigation = [
  { name: 'Inbox', href: '/inbox', icon: Inbox },
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Chatbot', href: '/chatbot', icon: Bot },
  { name: 'Automations', href: '/automation', icon: Zap },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Teams', href: '/teams', icon: UsersRound },
  { name: 'Integrations', href: '/integrations', icon: Plug },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  // Close sidebar on route change (mobile) — skip initial mount
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isOpen) onToggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden animate-fade-in"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-surface-200 bg-white transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-surface-200 px-4">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="XyraChat" width={32} height={32} className="rounded-lg" />
            <span className="text-sm font-semibold text-surface-900">XyraChat</span>
          </div>
          <button
            onClick={onToggle}
            className="rounded-md p-1 text-surface-400 hover:bg-surface-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-surface-500 hover:bg-surface-100 hover:text-surface-700'
                )}
              >
                <item.icon className={cn('h-4 w-4', isActive ? 'text-brand-600' : 'text-surface-400')} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-surface-200 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-surface-800">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-2xs text-surface-400">{user?.role}</p>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// Mobile header bar with hamburger
export function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <div className="flex h-12 items-center gap-3 border-b border-surface-200 bg-white px-4 lg:hidden">
      <button
        onClick={onMenuClick}
        className="rounded-md p-1.5 text-surface-500 hover:bg-surface-100 transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2">
        <Image src="/logo.png" alt="XyraChat" width={28} height={28} className="rounded-lg" />
        <span className="text-sm font-semibold text-surface-900">XyraChat</span>
      </div>
    </div>
  );
}
