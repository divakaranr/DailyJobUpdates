import { SearchX } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/primitives';

export default function JobNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <EmptyState
        icon={<SearchX className="h-6 w-6" />}
        title="This job isn't available"
        description="It may have been removed, or it hasn't been published yet."
        action={<LinkButton href="/">Browse latest jobs</LinkButton>}
      />
    </div>
  );
}
