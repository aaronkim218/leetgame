import * as React from 'react'
import { cn } from '../../lib/utils'

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-muted-foreground/15 animate-pulse rounded-md',
        className,
      )}
      {...props}
    />
  )
}
