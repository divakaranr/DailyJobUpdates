'use client';

import { useState } from 'react';
import { cn, hueOf, initials } from '@/lib/utils';

export function CompanyLogo({ name, logoUrl, size = 48, className }: { name: string; logoUrl?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const hue = hueOf(name);
  const style = { width: size, height: size };
  if (logoUrl && !failed) {
    return (
      <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white p-1.5', className)} style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary third-party hosts */}
        <img src={logoUrl} alt={`${name} logo`} referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-xl font-bold text-white shadow-inner', className)}
      style={{
        ...style,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
