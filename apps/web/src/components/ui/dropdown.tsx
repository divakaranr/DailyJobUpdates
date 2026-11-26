'use client';

import * as DM from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Dropdown({ trigger, children, align = 'end' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-pop data-[state=open]:animate-[rise_0.15s_ease-out]"
        >
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function DropdownItem({
  children,
  onSelect,
  icon,
  danger,
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-fg data-[highlighted]:bg-surface-2',
      )}
    >
      {icon && <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </DM.Item>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-subtle">{children}</DM.Label>;
}

export const DropdownSeparator = () => <DM.Separator className="my-1 h-px bg-line" />;
