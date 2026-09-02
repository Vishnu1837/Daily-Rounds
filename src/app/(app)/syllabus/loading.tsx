import { PageLoading } from '@/components/ui/page-loading';
import { Skeleton } from '@/components/ui/feedback';

export default function SyllabusLoading() {
  return (
    <PageLoading
      eyebrow="The whole course"
      title="Syllabus"
      description="All 19 MBBS subjects — the map your roadmap is cut from."
    >
      <Skeleton className="rounded-field h-10 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="rounded-card h-32 w-full" />
        ))}
      </div>
    </PageLoading>
  );
}
