export function RouteSkeleton() {
  return (
    <div className="w-full animate-pulse bg-canvas" aria-busy="true">
      <div className="h-14 border-b border-line" />
      <div className="space-y-4 p-6">
        <div className="h-8 w-2/3 rounded-lg bg-line" />
        <div className="h-12 rounded-xl bg-sunken" />
        <div className="h-12 rounded-xl bg-sunken" />
        <div className="h-12 rounded-xl bg-sunken" />
      </div>
    </div>
  )
}

export default RouteSkeleton
