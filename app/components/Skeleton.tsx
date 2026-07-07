export function SkeletonCard() {
  return (
    <div className="p-6 border bg-snow border-fog rounded-card animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="w-1/3 h-3 rounded bg-fog" />
        <div className="w-8 h-8 bg-fog rounded-xl" />
      </div>
      <div className="w-1/2 h-8 mb-2 rounded bg-fog" />
      <div className="w-1/4 h-3 rounded bg-fog" />
    </div>
  )
}

export function SkeletonList({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 border bg-snow border-fog rounded-input animate-pulse">
          <div className="flex-shrink-0 w-10 h-10 bg-fog rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="w-1/2 h-3 rounded bg-fog" />
            <div className="w-1/3 h-2 rounded bg-fog" />
          </div>
          <div className="w-20 h-4 rounded bg-fog" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonStats({ cols = 3 }: { cols?: number }) {
  return (
    <div className={`grid grid-cols-${cols} gap-4`}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="p-6 border bg-snow border-fog rounded-card animate-pulse">
          <div className="w-2/3 h-3 mb-4 rounded bg-fog" />
          <div className="w-1/2 h-8 mb-2 rounded bg-fog" />
          <div className="w-1/3 h-2 rounded bg-fog" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="p-6 border bg-snow border-fog rounded-card animate-pulse">
      <div className="w-1/3 h-4 mb-2 rounded bg-fog" />
      <div className="w-1/4 h-3 mb-6 rounded bg-fog" />
      <div className="flex items-end h-48 gap-3">
        {[60, 85, 45, 90, 55, 75, 40].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-lg bg-fog"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export function SkeletonGrupoFecha() {
  return (
    <div className="space-y-6 animate-pulse">
      {[3, 2, 4].map((count, gi) => (
        <div key={gi}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-24 h-3 rounded bg-fog" />
            <div className="w-16 h-3 rounded bg-fog" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4 border bg-snow border-fog rounded-input">
                <div className="flex-shrink-0 w-10 h-10 bg-fog rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="w-1/2 h-3 rounded bg-fog" />
                  <div className="w-1/3 h-2 rounded bg-fog" />
                </div>
                <div className="w-20 h-4 rounded bg-fog" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}