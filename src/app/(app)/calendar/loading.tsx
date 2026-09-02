import { PageLoading } from '@/components/ui/page-loading';
import { Skeleton } from '@/components/ui/feedback';

export default function CalendarLoading() {
  return (
    <PageLoading
      eyebrow="Your record, day by day"
      title="Calendar"
      description="Tap any day to see what was planned and what actually happened."
    >
      {/* A month grid: seven weekday headings over six rows of days. */}
      <div className="surface shadow-soft p-4" aria-hidden>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={`h${i}`} className="mx-auto h-2.5 w-6" />
          ))}
          {Array.from({ length: 42 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      </div>
    </PageLoading>
  );
}
