import { PageLoading } from '@/components/ui/page-loading';
import { Skeleton, SkeletonCard } from '@/components/ui/feedback';

export default function MaterialsLoading() {
  return (
    <PageLoading
      eyebrow="Library"
      title="Materials"
      description="Curated by your cohort lead and grouped by topic."
    >
      <Skeleton className="rounded-field h-10 w-full" />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
    </PageLoading>
  );
}
