'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SWRConfig } from 'swr';
import { swrFetcher } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: false, keepPreviousData: true }}>
        <AuthProvider>
          {children}
          <Toaster richColors closeButton position="bottom-right" toastOptions={{ className: 'font-sans' }} />
        </AuthProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
