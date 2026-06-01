import React from 'react'

interface SkeletonProps {
  className?: string
}

/** Single animated gray bar */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 dark:bg-slate-700 rounded ${className}`} />
)

/** A full table-body skeleton — renders `rows` placeholder rows with `cols` columns */
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 5,
}) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <tr key={i} className="border-b border-gray-50 dark:border-slate-800">
        {Array.from({ length: cols }).map((_, j) => (
          <td key={j} className="px-4 py-3">
            <Skeleton className={`h-4 ${j === 0 ? 'w-32' : j === cols - 1 ? 'w-16' : 'w-24'}`} />
            {j === 0 && <Skeleton className="h-3 w-24 mt-1.5" />}
          </td>
        ))}
      </tr>
    ))}
  </>
)

/** A stat card skeleton for the dashboard */
export const StatCardSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-800">
    <div className="flex items-start justify-between">
      <div className="space-y-2 flex-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-12" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
    </div>
  </div>
)

/** A card list item skeleton (for approvals, activity log, etc.) */
export const CardItemSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="border border-gray-100 dark:border-slate-800 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-7 w-16 rounded-lg" />
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
      </div>
    ))}
  </>
)
