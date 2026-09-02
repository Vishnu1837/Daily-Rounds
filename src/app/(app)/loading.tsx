import { Skeleton, SkeletonCard, SkeletonStatGrid } from '@/components/ui/feedback';

/**
 * The fallback loading state, for screens that have not been given one of their own.
 *
 * Every screen a student reaches daily has its own `loading.tsx` next to it, stating the
 * real page title and sketching that page's actual composition. This generic shape covers
 * the rest — the profile, a quiz, a single syllabus subject — where a neutral column is
 * honest enough and a bespoke skeleton would be upkeep for a screen nobody waits on twice.
 *
 * The shell around it — rail, header, nav — is prerendered by the layout, so only the page
 * body needs standing in for.
 */
export default function AppLoading() {
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
