'use client';

import { hasRole } from '@jobs/shared';
import { BriefcaseBusiness, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Logo } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/primitives';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = mode === 'login' ? await login(email, password) : await register(name, email, password);
      toast.success(mode === 'login' ? `Welcome back, ${user.name.split(' ')[0]}` : 'Account created');
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      router.push(safeNext ?? (hasRole(user.role, 'EDITOR') ? '/admin' : '/'));
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand via-accent to-brand-strong p-12 text-white lg:flex lg:flex-col">
        <div className="grid-fade absolute inset-0 opacity-30" aria-hidden />
        <Link href="/" className="relative flex items-center gap-2.5 text-lg font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 backdrop-blur">
            <BriefcaseBusiness className="h-[18px] w-[18px]" />
          </span>
          DailyJobUpdates
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl leading-tight font-extrabold">Every opening, checked by a human before it reaches you.</h2>
          <ul className="mt-8 space-y-3 text-white/90">
            {['Save jobs and come back any time', 'Filter by skills, experience and work mode', 'Original apply links — no middlemen'].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Logo className="lg:hidden" />
          <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-fg lg:mt-0">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {mode === 'login' ? 'Welcome back! Sign in to see your saved jobs.' : 'Save jobs and get back to them from any device.'}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {mode === 'register' && (
              <Field label="Full name" htmlFor="name">
                <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password" hint={mode === 'register' ? 'At least 8 characters with a letter and a number.' : undefined}>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-subtle hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert">{error}</p>}
            <Button type="submit" className="w-full" size="lg" loading={busy}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {mode === 'login' ? (
              <>
                New here?{' '}
                <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand hover:underline">
                  Create an account
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
