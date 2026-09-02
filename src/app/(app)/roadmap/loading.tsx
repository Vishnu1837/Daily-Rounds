import { PageLoading } from '@/components/ui/page-loading';
import { Skeleton, SkeletonCard } from '@/components/ui/feedback';

export default function RoadmapLoading() {
  return (
    <PageLoading
      eyebrow="Your plan"
      title="Roadmap"
      description="Your own topic plan, built around the subjects you chose."
    >
      {/* The subject chips, then the week-by-week list underneath them. */}
      <div className="flex gap-2">
        <Skeleton className="rounded-pill h-9 w-32" />
        <Skeleton className="rounded-pill h-9 w-32" />
      </div>
      <Skeleton className="rounded-card h-40 w-full" />
      <SkeletonCard lines={5} />
      <SkeletonCard lines={5} />
    </PageLoading>
  );
}
