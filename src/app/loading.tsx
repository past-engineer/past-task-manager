export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
      <p className="text-xs tracking-widest text-neutral-400">LOADING</p>
    </div>
  );
}
