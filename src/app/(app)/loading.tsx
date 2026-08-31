import { Skeleton, SkeletonCard, SkeletonStatGrid } from '@/components/ui/feedback';

/**
 * The student shell's loading state.
 *
 * It mirrors the *shape* of the dashboard rather than showing a spinner, so the layout does
 * not jump when the data lands and the wait reads as "nearly there" instead of "something is
 * happening somewhere". The shell itself — rail, header, nav — is already painted by the
 * layout above this, so only the page body needs standing in for.
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
