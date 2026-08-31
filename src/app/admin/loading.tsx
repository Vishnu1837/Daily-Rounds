import { Skeleton, SkeletonCard, SkeletonStatGrid } from '@/components/ui/feedback';

/** The admin console's loading state — same principle as the student shell's. */
export default function AdminLoading() {
  return (
    <div className="space-y-5" aria-busy>
      <span className="sr-only" role="status">
        Loading
      </span>

      <div className="space-y-2 px-1">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-52" />
      </div>

      <SkeletonStatGrid />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-7">
          <SkeletonCard lines={6} />
        </div>
        <div className="lg:col-span-5">
          <SkeletonCard lines={6} />
        </div>
      </div>
    </div>
  );
}
