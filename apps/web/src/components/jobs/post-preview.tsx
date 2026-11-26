'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Renders a generated LinkedIn-style post as plain text (never as HTML) with a copy button. */
export function PostPreview({ post, className, compact }: { post: string; className?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(post);
    setCopied(true);
    toast.success('Post copied to clipboard');
    setTimeout(() => setCopied(false), 1800);
  };
  const [headline, ...rest] = post.split('\n');
  return (
    <div className={cn('relative rounded-2xl border border-line bg-surface-2/60', className)}>
      <div className="absolute top-3 right-3">
        <Button variant="secondary" size="xs" onClick={copy} icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className={cn('overflow-x-auto p-5 pr-24 text-sm leading-relaxed', compact && 'max-h-[28rem] overflow-y-auto')}>
        <p className="font-bold text-fg">{headline}</p>
        <div className="mt-2 whitespace-pre-wrap text-fg/90">
          {rest.join('\n').split(/(#[A-Za-z0-9]+)/g).map((part, i) =>
            part.startsWith('#') ? (
              <span key={i} className="font-semibold text-brand">
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
