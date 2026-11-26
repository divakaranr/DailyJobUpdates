'use client';

import { ROLE_LABELS } from '@jobs/shared';
import { Bookmark, BriefcaseBusiness, LayoutDashboard, Link2, LogOut, Menu, Moon, Search, Sun, User, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, LinkButton } from '@/components/ui/button';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown';
import { useAuth } from '@/lib/auth';
import { cn, initials } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2.5 font-bold tracking-tight text-fg', className)}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent text-white shadow-md shadow-brand/30">
        <BriefcaseBusiness className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </span>
      <span className="text-[17px] leading-none">
        Daily<span className="text-brand">Job</span>Updates
      </span>
    </Link>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </Button>
  );
}

const NAV = [
  { href: '/', label: 'Jobs', icon: BriefcaseBusiness },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/saved', label: 'Saved', icon: Bookmark },
];

export function Header() {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const onLogout = async () => {
    await logout();
    toast.success('Signed out');
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {n.label}
              </Link>
            );
          })}
          {can('EDITOR') && (
            <Link
              href="/admin"
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith('/admin') ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {can('EDITOR') && (
            <LinkButton href="/admin/submit" variant="gradient" size="sm" className="hidden sm:inline-flex" icon={<Link2 className="h-4 w-4" />}>
              Submit job URL
            </LinkButton>
          )}
          <ThemeToggle />
          {user ? (
            <Dropdown
              trigger={
                <button className="ml-1 flex items-center gap-2 rounded-full p-0.5 pr-1 hover:bg-surface-2" aria-label="Account menu">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand to-accent text-xs font-bold text-white">
                    {initials(user.name)}
                  </span>
                </button>
              }
            >
              <DropdownLabel>
                <span className="block text-sm font-semibold text-fg">{user.name}</span>
                <span className="block text-xs text-subtle">
                  {user.email} · {ROLE_LABELS[user.role]}
                </span>
              </DropdownLabel>
              <DropdownSeparator />
              <DropdownItem icon={<Bookmark />} onSelect={() => router.push('/saved')}>
                Saved jobs
              </DropdownItem>
              {can('EDITOR') && (
                <DropdownItem icon={<LayoutDashboard />} onSelect={() => router.push('/admin')}>
                  Admin dashboard
                </DropdownItem>
              )}
              <DropdownSeparator />
              <DropdownItem icon={<LogOut />} onSelect={onLogout}>
                Sign out
              </DropdownItem>
            </Dropdown>
          ) : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <LinkButton href="/login" variant="ghost" size="sm">
                Sign in
              </LinkButton>
              <LinkButton href="/register" variant="primary" size="sm">
                Join free
              </LinkButton>
            </div>
          )}
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-surface px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fg hover:bg-surface-2">
                <n.icon className="h-4 w-4 text-muted" /> {n.label}
              </Link>
            ))}
            {can('EDITOR') && (
              <>
                <Link href="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fg hover:bg-surface-2">
                  <LayoutDashboard className="h-4 w-4 text-muted" /> Admin
                </Link>
                <Link href="/admin/submit" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand hover:bg-surface-2">
                  <Link2 className="h-4 w-4" /> Submit job URL
                </Link>
              </>
            )}
            {!user && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <LinkButton href="/login" variant="secondary" icon={<User className="h-4 w-4" />}>
                  Sign in
                </LinkButton>
                <LinkButton href="/register">Join free</LinkButton>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
