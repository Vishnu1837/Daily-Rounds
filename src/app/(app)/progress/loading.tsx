import { PageLoading } from '@/components/ui/page-loading';
import { Skeleton, SkeletonCard, SkeletonStatGrid } from '@/components/ui/feedback';

export default function ProgressLoading() {
  return (
    <PageLoading
      eyebrow="Your record"
      title="Progress"
      description="Everything here is measured over active study days only — weekends and holidays never count against you."
    >
      <SkeletonStatGrid />
      <Skeleton className="rounded-card h-64 w-full" />
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </PageLoading>
  );
}
