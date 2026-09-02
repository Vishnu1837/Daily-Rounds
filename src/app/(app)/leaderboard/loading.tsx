import { PageLoading } from '@/components/ui/page-loading';
import { Skeleton } from '@/components/ui/feedback';

export default function LeaderboardLoading() {
  return (
    <PageLoading
      title="Leaderboard"
      description="Ranked by consistency, not marks. Turning up beats being clever."
    >
      {/* The podium, then the ranked rows. */}
      <Skeleton className="rounded-card h-44 w-full" />
      <div className="surface shadow-soft divide-border divide-y" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
