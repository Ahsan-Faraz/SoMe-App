export default function Loading() {
  return (
    <div className="mx-auto max-w-md animate-pulse" aria-busy="true">
      <div className="h-14 border-b border-neutral-200" />
      <div className="space-y-4 p-6">
        <div className="h-8 w-2/3 rounded-lg bg-neutral-200" />
        <div className="h-12 rounded-xl bg-neutral-100" />
        <div className="h-12 rounded-xl bg-neutral-100" />
        <div className="h-12 rounded-xl bg-neutral-100" />
      </div>
    </div>
  )
}
