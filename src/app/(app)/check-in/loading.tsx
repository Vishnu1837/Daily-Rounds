import { PageLoading } from '@/components/ui/page-loading';
import { Skeleton } from '@/components/ui/feedback';

export default function CheckInLoading() {
  return (
    <PageLoading
      eyebrow="The 45-second ritual"
      title="Daily check-in"
      description="Honest answers are worth more than flattering ones. Nothing here is shown to other students."
    >
      {/* The question cards, then the submit button. */}
      <div className="surface shadow-soft space-y-6 p-5" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="rounded-field h-11 w-full" />
          </div>
        ))}
        <Skeleton className="rounded-field h-11 w-32" />
      </div>
    </PageLoading>
  );
}
