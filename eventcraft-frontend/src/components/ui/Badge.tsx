import React from 'react'

type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'yellow'
  | 'gray'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-350',
  primary: 'bg-orange-100 text-primary dark:bg-orange-950/40 dark:text-primary-400',
  success: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  yellow: 'bg-yellow-100 text-yellow-850 dark:bg-yellow-950/40 dark:text-yellow-400',
  gray: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400',
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
