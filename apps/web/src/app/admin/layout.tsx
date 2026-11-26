'use client';

import type { Role } from '@jobs/shared';
import {
  BarChart3,
  FilePlus2,
  History,
  LayoutDashboard,
  Link2,
  ListChecks,
  Lock,
  Menu,
  ScrollText,
  Settings2,
  Tags,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo, ThemeToggle } from '@/components/layout/header';
import { LinkButton } from '@/components/ui/button';
import { EmptyState, Spinner } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';
import { cn, initials } from '@/lib/utils';

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; role: Role; section: string }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, role: 'EDITOR', section: 'Overview' },
  { href: '/admin/submit', label: 'Submit job URL', icon: Link2, role: 'EDITOR', section: 'Content' },
  { href: '/admin/jobs', label: 'Manage jobs', icon: ListChecks, role: 'EDITOR', section: 'Content' },
  { href: '/admin/jobs/new', label: 'Create job', icon: FilePlus2, role: 'EDITOR', section: 'Content' },
  { href: '/admin/tags', label: 'Tags', icon: Tags, role: 'EDITOR', section: 'Content' },
  { href: '/admin/users', label: 'Users', icon: Users, role: 'ADMIN', section: 'Administration' },
  { href: '/admin/settings', label: 'LLM & settings', icon: Settings2, role: 'ADMIN', section: 'Administration' },
  { href: '/admin/logs', label: 'Extraction logs', icon: ScrollText, role: 'ADMIN', section: 'Administration' },
  { href: '/admin/history', label: 'Publishing history', icon: History, role: 'ADMIN', section: 'Administration' },
];

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  if (href === '/admin/jobs') return pathname === '/admin/jobs' || (pathname.startsWith('/admin/jobs/') && !pathname.startsWith('/admin/jobs/new'));
  return pathname.startsWith(href);
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, can } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (!user || !can('EDITOR')) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title={user ? 'You do not have access to the admin area' : 'Sign in required'}
          description={user ? 'Ask an administrator to grant you a Content Editor role.' : 'Sign in with an editor or administrator account to continue.'}
          action={user ? <LinkButton href="/">Back to jobs</LinkButton> : <LinkButton href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</LinkButton>}
        />
      </div>
    );
  }

  const items = NAV.filter((n) => can(n.role));
  const sections = [...new Set(items.map((i) => i.section))];

  const nav = (
    <nav className="flex flex-col gap-6">
      {sections.map((s) => (
        <div key={s}>
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-subtle uppercase">{s}</p>
          <div className="flex flex-col gap-0.5">
            {items
              .filter((i) => i.section === s)
              .map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive(pathname, i.href) ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  <i.icon className="h-[18px] w-[18px]" />
                  {i.label}
                </Link>
              ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr] lg:bg-[linear-gradient(to_right,var(--surface)_259px,var(--line)_259px,var(--line)_260px,transparent_260px)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <Logo className="px-2" />
        <div className="mt-8 flex-1 overflow-y-auto">{nav}</div>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-line p-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand to-accent text-xs font-bold text-white">{initials(user.name)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
            <p className="truncate text-xs text-subtle">{user.role.replace('_', ' ').toLowerCase()}</p>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Toggle navigation">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Logo />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {open && <div className="border-b border-line bg-surface px-4 py-4 lg:hidden">{nav}</div>}
        <div className="hidden items-center justify-end gap-2 border-b border-line bg-surface/60 px-8 py-2.5 lg:flex">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg">
            <BarChart3 className="h-3.5 w-3.5" /> View public site
          </Link>
        </div>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
