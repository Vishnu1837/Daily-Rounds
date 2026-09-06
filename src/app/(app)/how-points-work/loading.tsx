import { PageLoading } from '@/components/ui/page-loading';
import { Skeleton, SkeletonCard } from '@/components/ui/feedback';
import { SITE } from '@/lib/site';

/**
 * Prerendered and delivered by the prefetch, so the heading is on screen before the ledger
 * read even starts. Keep the eyebrow, title and description identical to the page's own
 * `PageHeader` — the seam between them is where the prerender ends.
 */
export default function HowXPWorksLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageLoading
        eyebrow="Your XP, explained"
        title="How XP works"
        description={`${SITE.name} pays you for the process, not the result. Every point below was earned by doing something — not by being right.`}
      >
        <Skeleton className="rounded-card h-52 w-full" />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </PageLoading>
    </div>
  );
}
