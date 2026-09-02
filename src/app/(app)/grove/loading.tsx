import { PageLoading } from '@/components/ui/page-loading';
import { Skeleton, SkeletonStatGrid } from '@/components/ui/feedback';

export default function GroveLoading() {
  return (
    <PageLoading
      eyebrow="The grove"
      title="What your focus actually grew"
      description="One Pomodoro round, sat all the way through, is one tree. Walk out on a round and the stump stays."
    >
      <SkeletonStatGrid count={3} />
      <Skeleton className="rounded-card h-80 w-full" />
    </PageLoading>
  );
}
