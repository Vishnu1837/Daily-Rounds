import { Skeleton, SkeletonCard, SkeletonStatGrid } from '@/components/ui/feedback';

/**
 * The dashboard's loading state.
 *
 * Prerendered and shipped with the prefetch, so it is on screen the moment Today is tapped.
 * Unlike the other screens this one keeps a placeholder where the heading goes: the greeting
 * names the student and the title is their current week, and neither can be known ahead of
 * the request. Everything below is the real dashboard composition, at the real proportions,
 * so nothing shifts when the numbers arrive.
 */
export default function TodayLoading() {
  return (
    <div className="space-y-4 lg:space-y-5" aria-busy>
      <span className="sr-only" role="status">
        Loading
      </span>

      <div className="space-y-2 px-1">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-8 w-56" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-7">
          <Skeleton className="rounded-card h-72 w-full" />
        </div>
        <div className="lg:col-span-5">
          <Skeleton className="rounded-card h-72 w-full" />
        </div>
        <div className="lg:col-span-7">
          <SkeletonCard lines={5} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5 lg:gap-5">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </div>
      </div>

      <SkeletonStatGrid />
    </div>
  );
}
