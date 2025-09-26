export default function SkeletonCard() {
    return (
      <div className="rounded-xl p-2 ring-1 ring-white/10">
        <div className="w-full aspect-square rounded-lg bg-white/10 animate-pulse" />
        <div className="mt-2 h-3 rounded bg-white/10 animate-pulse" />
      </div>
    );
  }
  