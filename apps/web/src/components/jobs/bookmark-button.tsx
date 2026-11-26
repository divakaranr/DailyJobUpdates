'use client';

import { Bookmark } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function BookmarkButton({
  jobId,
  initial,
  onChange,
  withLabel,
}: {
  jobId: string;
  initial?: boolean;
  onChange?: (saved: boolean) => void;
  withLabel?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [saved, setSaved] = useState(!!initial);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!user) {
      toast.info('Sign in to save jobs');
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const next = !saved;
    setSaved(next);
    setBusy(true);
    try {
      await api(`/jobs/${jobId}/bookmark`, { method: next ? 'POST' : 'DELETE' });
      onChange?.(next);
      toast.success(next ? 'Saved to your list' : 'Removed from saved jobs');
    } catch (err) {
      setSaved(!next);
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant={withLabel ? 'secondary' : 'ghost'}
      size={withLabel ? 'md' : 'icon'}
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved jobs' : 'Save job'}
      className={cn(saved && 'text-brand')}
    >
      <Bookmark className={cn('h-[18px] w-[18px]', saved && 'fill-current')} />
      {withLabel && (saved ? 'Saved' : 'Save')}
    </Button>
  );
}
