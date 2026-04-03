'use client';

function ShimmerLine({ className }: { className: string }) {
  return (
    <div
      className={`progress-shimmer rounded ${className}`}
      style={{ backgroundColor: 'var(--shimmer-color, rgba(0,0,0,0.06))' }}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-3">
        <ShimmerLine className="h-4 w-4 rounded" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <ShimmerLine className="h-4 w-40" />
            <ShimmerLine className="h-4 w-14 rounded-full" />
          </div>
          <div className="flex gap-3">
            <ShimmerLine className="h-3 w-20" />
            <ShimmerLine className="h-3 w-24" />
            <ShimmerLine className="h-3 w-14" />
          </div>
        </div>
        <ShimmerLine className="h-7 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export function ProcessSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <div key={i} className="glass-panel overflow-hidden">
          {/* Function header skeleton */}
          <div className="flex items-center gap-3 p-4">
            <ShimmerLine className="h-4 w-4 rounded" />
            <ShimmerLine className="h-5 w-36" />
            <div className="ml-auto">
              <ShimmerLine className="h-4 w-20" />
            </div>
          </div>
          {/* Process cards skeleton */}
          <div className="border-t border-[var(--border-color)] p-4 space-y-2">
            {Array.from({ length: i === 1 ? 3 : 2 }, (_, j) => (
              <SkeletonCard key={j} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
