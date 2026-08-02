import clsx from 'clsx'

/**
 * Skeletons shown by each route's loading.tsx while its data streams in.
 * They mirror the real layout closely enough that nothing jumps when the
 * content lands — that stillness is most of what makes an app feel fast.
 */

export function Skeleton({
  className,
  rounded = 'rounded-lg',
}: {
  className?: string
  rounded?: string
}) {
  return (
    <div
      className={clsx('animate-pulse bg-ink/8', rounded, className)}
      aria-hidden="true"
    />
  )
}

export function SkeletonText({ w = 'w-24', className }: { w?: string; className?: string }) {
  return <Skeleton className={clsx('h-3', w, className)} rounded="rounded-full" />
}

export function SkeletonHeader() {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <SkeletonText w="w-56" />
      </div>
      <Skeleton className="h-10 w-32" rounded="rounded-full" />
    </div>
  )
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[18px] border border-ink/8 bg-paper/86 p-4 shadow-soft">
          <SkeletonText w="w-16" />
          <Skeleton className="mt-2.5 h-6 w-24" />
          <SkeletonText w="w-12" className="mt-2" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={clsx('ob-card p-5 sm:p-6', className)}>
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 flex-shrink-0" rounded="rounded-xl" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkeletonText w="w-2/5" />
              <SkeletonText w="w-1/4" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="ob-card p-4 sm:p-5">
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-11 flex-1 sm:max-w-xs" rounded="rounded-xl" />
        <Skeleton className="h-10 w-52" rounded="rounded-xl" />
      </div>
      <div className="flex flex-col gap-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-ink/6 py-3.5 last:border-0">
            <Skeleton className="h-9 w-9 flex-shrink-0" rounded="rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkeletonText w="w-1/3" />
              <SkeletonText w="w-1/5" />
            </div>
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-16" rounded="rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonGrid({ items = 6, cols = 2 }: { items?: number; cols?: number }) {
  return (
    <div
      className={clsx(
        'grid gap-3.5',
        cols === 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'lg:grid-cols-2',
      )}
    >
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="ob-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 flex-shrink-0" rounded="rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <SkeletonText w="w-1/2" />
              <SkeletonText w="w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-2.5 w-full" rounded="rounded-full" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-10 flex-1" rounded="rounded-full" />
            <Skeleton className="h-10 w-10" rounded="rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Calendar: month grid on one side, the day's timeline on the other. */
export function SkeletonCalendar() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="ob-card order-2 p-5 sm:p-6 lg:order-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-36" />
            <SkeletonText w="w-28" />
          </div>
          <Skeleton className="h-7 w-20" rounded="rounded-full" />
        </div>
        <div className="mt-5 flex flex-col">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3" style={{ height: 40 }}>
              <SkeletonText w="w-12" />
              <div className="h-px flex-1 bg-ink/7" />
            </div>
          ))}
        </div>
      </div>

      <div className="order-1 flex flex-col gap-4 lg:order-2">
        <div className="ob-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-32" rounded="rounded-lg" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full" rounded="rounded-xl" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 w-full" rounded="rounded-[18px]" />
          <Skeleton className="h-20 w-full" rounded="rounded-[18px]" />
        </div>
      </div>
    </div>
  )
}

/** The default shape: header, stat row, list. */
export function PageSkeleton({
  stats = 4,
  variant = 'rows',
}: {
  stats?: number
  variant?: 'rows' | 'grid' | 'grid3' | 'calendar' | 'cards'
}) {
  return (
    <>
      <SkeletonHeader />
      {stats > 0 && variant !== 'calendar' && <SkeletonStats count={stats} />}
      {variant === 'rows' && <SkeletonRows />}
      {variant === 'grid' && <SkeletonGrid />}
      {variant === 'grid3' && <SkeletonGrid items={6} cols={3} />}
      {variant === 'calendar' && <SkeletonCalendar />}
      {variant === 'cards' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
    </>
  )
}
