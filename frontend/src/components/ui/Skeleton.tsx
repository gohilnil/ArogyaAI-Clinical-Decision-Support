// Loading placeholders. A pulse where real content will land reads as "loading";
// the word "Loading…" in the middle of an otherwise empty card reads as "broken"
// when the fetch is slow, which is the state it is meant to cover.

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-slate-100 ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
