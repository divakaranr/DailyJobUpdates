import { Compass } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={<LinkButton href="/">Go to job feed</LinkButton>}
      />
    </div>
  );
}
