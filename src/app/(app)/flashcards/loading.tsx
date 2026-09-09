import { Skeleton } from '@/components/ui/feedback';
import { PageLoading } from '@/components/ui/page-loading';

/**
 * Mirrors the shape of the shelf rather than showing a spinner, so the page does not jump
 * when the decks land — the same rule the rest of the product's loading states follow.
 */
export default function FlashcardsLoading() {
  return (
    <PageLoading
      eyebrow="Library"
      title="Flashcards"
      description="Answer it in your head, then turn the card over."
    >
      <div className="grid gap-3.5 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="surface shadow-soft space-y-4 p-5" aria-hidden>
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-5 w-2/3" />
            </div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="rounded-pill h-9 w-28" />
            </div>
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
