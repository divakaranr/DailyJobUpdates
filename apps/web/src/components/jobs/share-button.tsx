'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function ShareButton({ title }: { title: string }) {
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <Button variant="ghost" size="icon" onClick={share} aria-label="Share job">
      <Share2 className="h-[18px] w-[18px]" />
    </Button>
  );
}
